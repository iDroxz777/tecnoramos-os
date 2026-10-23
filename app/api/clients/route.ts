import { env } from "cloudflare:workers";
import {
  json,
  normalizeClientName,
  normalizeDisplayName,
  rejectCrossOrigin,
  requireAdmin,
  requireUser,
  writeAudit,
} from "../_shared";

export const dynamic = "force-dynamic";

type ClientRow = {
  id: string;
  name: string;
  status: "active" | "archived";
  createdAt: number;
  updatedAt: number;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "1";
  if (includeArchived && user.role !== "admin") {
    return json({ error: "Acesso restrito aos administradores." }, { status: 403 });
  }

  const result = await env.DB.prepare(
    `SELECT id, name, status, created_at AS createdAt, updated_at AS updatedAt
     FROM clients
     ${includeArchived ? "" : "WHERE status = 'active'"}
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, name COLLATE NOCASE`,
  ).all<ClientRow>();
  return json({ clients: result.results });
}
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json() as { name?: string };
  const name = normalizeDisplayName(body.name);
  const normalized = normalizeClientName(name);
  if (name.length < 2 || name.length > 120) {
    return json({ error: "Informe um nome de estabelecimento válido." }, { status: 400 });
  }
  const existing = await env.DB.prepare(
    "SELECT id, status FROM clients WHERE normalized_name = ?",
  ).bind(normalized).first<{ id: string; status: string }>();
  if (existing) {
    return json({
      error: existing.status === "archived"
        ? "Este cliente está arquivado. Reative-o na administração."
        : "Este cliente já está cadastrado.",
    }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO clients (
      id, name, normalized_name, status, created_at, updated_at, created_by
    ) VALUES (?, ?, ?, 'active', ?, ?, ?)`,
  ).bind(id, name, normalized, now, now, auth.user.id).run();
  await writeAudit(auth.user.id, "client.created", "client", id, `${name} foi cadastrado.`);
  return json({ client: { id, name, status: "active", createdAt: now, updatedAt: now } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json() as {
    clientId?: string;
    action?: "rename" | "status";
    name?: string;
    status?: "active" | "archived";
  };
  const clientId = String(body.clientId ?? "");
  const current = await env.DB.prepare("SELECT id, name, status FROM clients WHERE id = ?")
    .bind(clientId)
    .first<{ id: string; name: string; status: "active" | "archived" }>();
  if (!current) return json({ error: "Cliente não encontrado." }, { status: 404 });

  if (body.action === "rename") {
    const name = normalizeDisplayName(body.name);
    const normalized = normalizeClientName(name);
    if (name.length < 2 || name.length > 120) {
      return json({ error: "Informe um nome de estabelecimento válido." }, { status: 400 });
    }
    const duplicate = await env.DB.prepare(
      "SELECT id FROM clients WHERE normalized_name = ? AND id <> ?",
    ).bind(normalized, clientId).first();
    if (duplicate) return json({ error: "Já existe um cliente com esse nome." }, { status: 409 });
    await env.DB.prepare(
      "UPDATE clients SET name = ?, normalized_name = ?, updated_at = ? WHERE id = ?",
    ).bind(name, normalized, Date.now(), clientId).run();
    await writeAudit(
      auth.user.id,
      "client.renamed",
      "client",
      clientId,
      `${current.name} passou a se chamar ${name}.`,
    );
  } else if (body.action === "status") {
    if (!["active", "archived"].includes(String(body.status))) {
      return json({ error: "Status inválido." }, { status: 400 });
    }
    const archived = body.status === "archived";
    await env.DB.prepare(
      `UPDATE clients
       SET status = ?, updated_at = ?, archived_at = ?, archived_by = ?
       WHERE id = ?`,
    ).bind(
      body.status,
      Date.now(),
      archived ? Date.now() : null,
      archived ? auth.user.id : null,
      clientId,
    ).run();
    await writeAudit(
      auth.user.id,
      archived ? "client.archived" : "client.reactivated",
      "client",
      clientId,
      `${current.name} foi ${archived ? "arquivado" : "reativado"}.`,
    );
  } else {
    return json({ error: "Ação inválida." }, { status: 400 });
  }

  return json({ ok: true });
}
