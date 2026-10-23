import { env } from "cloudflare:workers";

const SESSION_COOKIE = "tecnoramos_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
// Cloudflare Workers currently supports PBKDF2 iteration counts up to 100,000.
export const PASSWORD_HASH_ITERATIONS = 100_000;

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "technician";
  status: "active" | "blocked";
  mustChangePassword: boolean;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export async function hashPassword(
  password: string,
  saltBase64?: string,
  iterations = PASSWORD_HASH_ITERATIONS,
) {
  const encoder = new TextEncoder();
  const salt = saltBase64
    ? Uint8Array.from(atob(saltBase64), (char) => char.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(salt),
  };
}

export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const item = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function expiredSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export async function createSession(userId: string) {
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
  return token;
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const result = await env.DB.prepare(
    `SELECT users.id, users.username,
            users.display_name AS displayName,
            users.role,
            users.status,
            users.must_change_password AS mustChangePassword
     FROM sessions
     INNER JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ? AND users.status = 'active'`,
  ).bind(token, Date.now()).first<{
    id: string;
    username: string;
    displayName: string;
    role: "admin" | "technician";
    status: "active" | "blocked";
    mustChangePassword: number;
  }>();
  return result ? { ...result, mustChangePassword: Boolean(result.mustChangePassword) } : null;
}

export async function deleteSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

// Accounts with a temporary password may only change it or sign out
// (handled in /api/auth); every other route goes through this check.
export async function requireUser(request: Request) {
  const user = await currentUser(request);
  if (!user) return { user: null, response: json({ error: "Não autorizado." }, { status: 401 }) };
  if (user.mustChangePassword) {
    return {
      user: null,
      response: json({
        code: "PASSWORD_CHANGE_REQUIRED",
        error: "Troque a senha temporária para continuar.",
      }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export async function requireAdmin(request: Request) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth;
  const user = auth.user;
  if (user.role !== "admin") {
    return { user: null, response: json({ error: "Acesso restrito aos administradores." }, { status: 403 }) };
  }
  return { user, response: null };
}

export function normalizeDisplayName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function normalizeClientName(value: unknown) {
  return normalizeDisplayName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function validPassword(password: string) {
  return password.length >= 8 && password.length <= 128;
}

export function validLoginPassword(password: string) {
  return password.length >= 1 && password.length <= 128;
}

export async function writeAudit(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  await env.DB.prepare(
    `INSERT INTO audit_logs (
      id, actor_user_id, action, entity_type, entity_id, summary, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    actorUserId,
    action,
    entityType,
    entityId,
    summary,
    JSON.stringify(metadata),
    Date.now(),
  ).run();
}

export function mutationAllowed(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function rejectCrossOrigin(request: Request) {
  return mutationAllowed(request)
    ? null
    : json({ error: "Origem da solicitação inválida." }, { status: 403 });
}
