import { env } from "cloudflare:workers";
import {
  hashPassword,
  json,
  normalizeDisplayName,
  normalizeUsername,
  PASSWORD_HASH_ITERATIONS,
  rejectCrossOrigin,
  requireAdmin,
  requireUser,
  validPassword,
  writeAudit,
} from "../_shared";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "technician";
  status: "active" | "blocked";
  mustChangePassword: number;
  createdAt: number;
};

function publicUser(row: UserRow) {
  return {
    ...row,
    displayName: row.displayName || row.username,
    mustChangePassword: Boolean(row.mustChangePassword),
  };
}
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const selectionOnly = new URL(request.url).searchParams.get("scope") === "technicians";
  if (selectionOnly) {
    const result = await env.DB.prepare(
      `SELECT id, username, display_name AS displayName, role, status,
              must_change_password AS mustChangePassword, created_at AS createdAt
       FROM users
       WHERE status = 'active'
       ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE`,
    ).all<UserRow>();
    return json({ users: result.results.map(publicUser) });
  }

  if (user.role !== "admin") {
    return json({ error: "Acesso restrito aos administradores." }, { status: 403 });
  }
  const result = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName, role, status,
            must_change_password AS mustChangePassword, created_at AS createdAt
     FROM users
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
              display_name COLLATE NOCASE, username COLLATE NOCASE`,
  ).all<UserRow>();
  return json({ users: result.results.map(publicUser) });
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json() as {
    username?: string;
    displayName?: string;
    password?: string;
  };
  const username = normalizeUsername(body.username);
  const displayName = normalizeDisplayName(body.displayName) || username;
  const password = String(body.password ?? "");

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return json({ error: "Use de 3 a 32 caracteres no usuário." }, { status: 400 });
  }
  if (!displayName) return json({ error: "Informe o nome do técnico." }, { status: 400 });
  if (!validPassword(password)) {
    return json({ error: "A senha inicial precisa ter entre 8 e 128 caracteres." }, { status: 400 });
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?")
    .bind(username)
    .first();
  if (existing) return json({ error: "Este usuário já existe." }, { status: 409 });

  const id = crypto.randomUUID();
  const passwordData = await hashPassword(password);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (
      id, username, display_name, password_hash, salt, password_iterations,
      role, status, must_change_password, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'technician', 'active', 1, ?, ?)`,
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
  await writeAudit(
    auth.user.id,
    "user.created",
    "user",
    id,
    `${displayName} foi cadastrado como técnico.`,
    { username },
  );

  return json({
    user: {
      id,
      username,
      displayName,
      role: "technician",
      status: "active",
      mustChangePassword: true,
      createdAt: now,
    },
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json() as {
    userId?: string;
    action?: "status" | "role" | "reset-password" | "rename";
    status?: "active" | "blocked";
    role?: "admin" | "technician";
    password?: string;
    displayName?: string;
  };
  const targetId = String(body.userId ?? "");
  const target = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName, role, status
     FROM users WHERE id = ?`,
  ).bind(targetId).first<{
    id: string;
    username: string;
    displayName: string;
    role: "admin" | "technician";
    status: "active" | "blocked";
  }>();
  if (!target) return json({ error: "Usuário não encontrado." }, { status: 404 });

  if (body.action === "status") {
    if (!["active", "blocked"].includes(String(body.status))) {
      return json({ error: "Status inválido." }, { status: 400 });
    }
    if (target.id === auth.user.id && body.status === "blocked") {
      return json({ error: "Você não pode bloquear a própria conta." }, { status: 400 });
    }
    if (target.role === "admin" && body.status === "blocked") {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active'",
      ).first<{ total: number }>();
      if (Number(count?.total ?? 0) <= 1) {
        return json({ error: "O sistema precisa manter ao menos um administrador ativo." }, { status: 400 });
      }
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
        .bind(body.status, Date.now(), target.id),
      ...(body.status === "blocked"
        ? [env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id)]
        : []),
    ]);
    await writeAudit(
      auth.user.id,
      body.status === "blocked" ? "user.blocked" : "user.unblocked",
      "user",
      target.id,
      `${target.displayName || target.username} foi ${body.status === "blocked" ? "bloqueado" : "reativado"}.`,
    );
  } else if (body.action === "role") {
    if (!["admin", "technician"].includes(String(body.role))) {
      return json({ error: "Permissão inválida." }, { status: 400 });
    }
    if (target.id === auth.user.id && body.role === "technician") {
      return json({ error: "Outro administrador deve alterar a sua permissão." }, { status: 400 });
    }
    if (target.role === "admin" && body.role === "technician") {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active'",
      ).first<{ total: number }>();
      if (Number(count?.total ?? 0) <= 1) {
        return json({ error: "O sistema precisa manter ao menos um administrador." }, { status: 400 });
      }
    }
    await env.DB.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?")
      .bind(body.role, Date.now(), target.id)
      .run();
    await writeAudit(
      auth.user.id,
      "user.role_changed",
      "user",
      target.id,
      `${target.displayName || target.username} agora é ${body.role === "admin" ? "administrador" : "técnico"}.`,
    );
  } else if (body.action === "reset-password") {
    const password = String(body.password ?? "");
    if (!validPassword(password)) {
      return json({ error: "A senha temporária precisa ter entre 8 e 128 caracteres." }, { status: 400 });
    }
    const replacement = await hashPassword(password);
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE users
         SET password_hash = ?, salt = ?, password_iterations = ?,
             must_change_password = 1, failed_login_count = 0,
             locked_until = NULL, updated_at = ?
         WHERE id = ?`,
      ).bind(
        replacement.hash,
        replacement.salt,
        PASSWORD_HASH_ITERATIONS,
        Date.now(),
        target.id,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.id),
      env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(target.username),
    ]);
    await writeAudit(
      auth.user.id,
      "user.password_reset",
      "user",
      target.id,
      `A senha de ${target.displayName || target.username} foi redefinida.`,
    );
  } else if (body.action === "rename") {
    const displayName = normalizeDisplayName(body.displayName);
    if (!displayName) return json({ error: "Informe o nome do usuário." }, { status: 400 });
    await env.DB.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?")
      .bind(displayName, Date.now(), target.id)
      .run();
    await writeAudit(
      auth.user.id,
      "user.renamed",
      "user",
      target.id,
      `${target.displayName || target.username} passou a ser exibido como ${displayName}.`,
    );
  } else {
    return json({ error: "Ação inválida." }, { status: 400 });
  }

  return json({ ok: true });
}
