import { env } from "cloudflare:workers";
import {
  createSession,
  currentUser,
  deleteSession,
  expiredSessionCookie,
  hashPassword,
  json,
  normalizeUsername,
  normalizeDisplayName,
  PASSWORD_HASH_ITERATIONS,
  rejectCrossOrigin,
  safeEqual,
  sessionCookie,
  validLoginPassword,
  validPassword,
  writeAudit,
} from "../_shared";

export const dynamic = "force-dynamic";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const USER_ATTEMPT_LIMIT = 5;
// Several technicians may share the same Wi-Fi, so the per-IP limit is much
// more tolerant than the per-account one.
const IP_ATTEMPT_LIMIT = 30;
// Hashing against a fixed salt when the account does not exist keeps the
// response time from revealing which usernames are registered.
const UNKNOWN_USER_SALT = "AAAAAAAAAAAAAAAAAAAAAA==";

// Usernames never contain ":", so IP keys cannot collide with accounts.
function ipAttemptKey(request: Request) {
  return `ip:${request.headers.get("cf-connecting-ip") ?? "local"}`;
}

/**
 * Reserves one login attempt before the password is checked. It is a single
 * statement, so parallel requests cannot slip past the limit.
 */
async function reserveLoginAttempt(key: string, limit: number) {
  const now = Date.now();
  const lockUntil = now + LOGIN_LOCK_MS;
  const nextCount = `CASE
      WHEN locked_until > ?1 THEN failed_count
      WHEN locked_until IS NOT NULL OR updated_at < ?2 THEN 1
      ELSE failed_count + 1
    END`;
  const row = await env.DB.prepare(
    `INSERT INTO login_attempts (username, failed_count, locked_until, updated_at)
     VALUES (?3, 1, NULL, ?1)
     ON CONFLICT(username) DO UPDATE SET
       failed_count = ${nextCount},
       locked_until = CASE
         WHEN locked_until > ?1 THEN locked_until
         WHEN ${nextCount} > ?4 THEN ?5
         ELSE NULL
       END,
       updated_at = CASE WHEN locked_until > ?1 THEN updated_at ELSE ?1 END
     RETURNING locked_until AS lockedUntil`,
  ).bind(now, now - LOGIN_WINDOW_MS, key, limit, lockUntil).first<{ lockedUntil: number | null }>();
  const lockedUntil = row?.lockedUntil ?? null;
  return {
    allowed: !lockedUntil || lockedUntil <= now,
    justLocked: lockedUntil === lockUntil,
  };
}

function tooManyAttempts() {
  return json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, { status: 429 });
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (user) return json({ user, canBootstrap: false });
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
  return json({ user: null, canBootstrap: Number(count?.total ?? 0) === 0 });
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const body = await request.json() as {
    action?: string;
    username?: string;
    password?: string;
    displayName?: string;
  };
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? "");
  const action = body.action;

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return json({ error: "Use de 3 a 32 caracteres: letras, números, ponto, traço ou underline." }, { status: 400 });
  }
  if (action === "register" && !validPassword(password)) {
    return json({ error: "A senha precisa ter entre 8 e 128 caracteres." }, { status: 400 });
  }
  if (action === "login" && !validLoginPassword(password)) {
    return json({ error: "Informe sua senha." }, { status: 400 });
  }

  if (action === "register") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
    if (Number(count?.total ?? 0) !== 0 || !["admin"].includes(username)) {
      return json({ error: "Novas contas devem ser criadas por um administrador." }, { status: 403 });
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return json({ error: "Este usuário já existe." }, { status: 409 });

    const id = crypto.randomUUID();
    const passwordData = await hashPassword(password);
    const now = Date.now();
    const displayName = normalizeDisplayName(body.displayName) || username;
    await env.DB.prepare(
      `INSERT INTO users (
        id, username, display_name, password_hash, salt, password_iterations,
        role, status, must_change_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', 0, ?, ?)`,
    ).bind(
      id,
      username,
      displayName,
      passwordData.hash,
      passwordData.salt,
      PASSWORD_HASH_ITERATIONS,
      now,
      now,
    ).run();
    const token = await createSession(id);
    await writeAudit(id, "user.bootstrap", "user", id, `Conta administradora ${username} criada.`);
    return json(
      {
        user: {
          id,
          username,
          displayName,
          role: "admin",
          status: "active",
          mustChangePassword: false,
        },
      },
      { status: 201, headers: { "set-cookie": sessionCookie(token, request) } },
    );
  }

  if (action === "login") {
    const ipKey = ipAttemptKey(request);
    const ipAttempt = await reserveLoginAttempt(ipKey, IP_ATTEMPT_LIMIT);
    if (!ipAttempt.allowed) {
      if (ipAttempt.justLocked) console.warn(`Login temporarily blocked for ${ipKey}.`);
      return tooManyAttempts();
    }
    const userAttempt = await reserveLoginAttempt(username, USER_ATTEMPT_LIMIT);

    const user = await env.DB.prepare(
      `SELECT id, username, display_name AS displayName, password_hash AS passwordHash,
              salt, password_iterations AS passwordIterations, role, status,
              must_change_password AS mustChangePassword
       FROM users WHERE username = ?`,
    ).bind(username).first<{
      id: string;
      username: string;
      displayName: string;
      passwordHash: string;
      salt: string;
      passwordIterations: number;
      role: "admin" | "technician";
      status: "active" | "blocked";
      mustChangePassword: number;
    }>();

    if (!userAttempt.allowed) {
      if (userAttempt.justLocked && user) {
        await writeAudit(
          user.id,
          "user.login_locked",
          "user",
          user.id,
          `Login de ${user.displayName || user.username} bloqueado por 15 minutos após várias tentativas.`,
        );
      }
      return tooManyAttempts();
    }

    const candidate = await hashPassword(
      password,
      user?.salt ?? UNKNOWN_USER_SALT,
      user?.passwordIterations ?? PASSWORD_HASH_ITERATIONS,
    );
    if (!user || !safeEqual(candidate.hash, user.passwordHash)) {
      return json({ error: "Usuário ou senha inválidos." }, { status: 401 });
    }

    if (user.status !== "active") {
      return json({ error: "Esta conta está bloqueada. Procure um administrador." }, { status: 403 });
    }

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(username),
      // A successful login gives back the attempt it reserved on the shared IP.
      env.DB.prepare(
        `UPDATE login_attempts SET failed_count = MAX(failed_count - 1, 0)
         WHERE username = ? AND (locked_until IS NULL OR locked_until <= ?)`,
      ).bind(ipKey, now),
      env.DB.prepare(
        `DELETE FROM login_attempts
         WHERE updated_at < ? AND (locked_until IS NULL OR locked_until <= ?)`,
      ).bind(now - 24 * 60 * 60 * 1000, now),
    ]);
    if (user.passwordIterations < PASSWORD_HASH_ITERATIONS) {
      const upgraded = await hashPassword(password);
      await env.DB.prepare(
        `UPDATE users
         SET password_hash = ?, salt = ?, password_iterations = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(upgraded.hash, upgraded.salt, PASSWORD_HASH_ITERATIONS, Date.now(), user.id).run();
    }
    const token = await createSession(user.id);
    return json(
      {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName || user.username,
          role: user.role,
          status: user.status,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      },
      { headers: { "set-cookie": sessionCookie(token, request) } },
    );
  }

  return json({ error: "Ação inválida." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const user = await currentUser(request);
  if (!user) return json({ error: "Não autorizado." }, { status: 401 });

  const body = await request.json() as { currentPassword?: string; newPassword?: string };
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  if (!validPassword(newPassword)) {
    return json({ error: "A nova senha precisa ter entre 8 e 128 caracteres." }, { status: 400 });
  }

  const credentials = await env.DB.prepare(
    `SELECT password_hash AS passwordHash, salt, password_iterations AS passwordIterations
     FROM users WHERE id = ?`,
  ).bind(user.id).first<{ passwordHash: string; salt: string; passwordIterations: number }>();
  if (!credentials) return json({ error: "Conta não encontrada." }, { status: 404 });
  const candidate = await hashPassword(currentPassword, credentials.salt, credentials.passwordIterations);
  if (!safeEqual(candidate.hash, credentials.passwordHash)) {
    return json({ error: "A senha atual está incorreta." }, { status: 400 });
  }

  const replacement = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE users
     SET password_hash = ?, salt = ?, password_iterations = ?,
         must_change_password = 0, updated_at = ?
     WHERE id = ?`,
  ).bind(
    replacement.hash,
    replacement.salt,
    PASSWORD_HASH_ITERATIONS,
    Date.now(),
    user.id,
  ).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  const token = await createSession(user.id);
  await writeAudit(user.id, "user.password_changed", "user", user.id, "Senha da conta atualizada.");
  return json(
    { user: { ...user, mustChangePassword: false } },
    { headers: { "set-cookie": sessionCookie(token, request) } },
  );
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  await deleteSession(request);
  return json({ ok: true }, { headers: { "set-cookie": expiredSessionCookie(request) } });
}
