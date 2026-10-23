import { env } from "cloudflare:workers";
import { json, rejectCrossOrigin, requireUser, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";

// A draft nobody touched for 24 hours expires and is removed.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

async function expireDrafts() {
  await env.DB.prepare("DELETE FROM drafts WHERE updated_at < ?").bind(Date.now() - DRAFT_TTL_MS).run();
}

type DraftInput = {
  id?: string;
  clientRequestId?: string;
  clientId?: string | null;
  clientName?: string;
  data?: unknown;
  step?: number;
  updatedAt?: number;
};

type StoredDraft = {
  id: string;
  clientRequestId: string;
  userId: string;
  clientId: string | null;
  clientName: string;
  dataJson: string;
  step: number;
  status: "draft";
  createdAt: number;
  updatedAt: number;
  ownerDisplayName: string;
  ownerUsername: string;
};

function serializeDraft(draft: StoredDraft) {
  return {
    id: draft.id,
    clientRequestId: draft.clientRequestId,
    userId: draft.userId,
    clientId: draft.clientId,
    clientName: draft.clientName,
    data: JSON.parse(draft.dataJson),
    step: draft.step,
    status: draft.status,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    ownerName: draft.ownerDisplayName || draft.ownerUsername,
  };
}

const draftSelect = `SELECT drafts.id,
                            drafts.client_request_id AS clientRequestId,
                            drafts.user_id AS userId,
                            drafts.client_id AS clientId,
                            drafts.client_name AS clientName,
                            drafts.data_json AS dataJson,
                            drafts.step,
                            drafts.status,
                            drafts.created_at AS createdAt,
                            drafts.updated_at AS updatedAt,
                            users.display_name AS ownerDisplayName,
                            users.username AS ownerUsername
                     FROM drafts
                     INNER JOIN users ON users.id = drafts.user_id`;

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  await expireDrafts();

  const result = await env.DB.prepare(
    `${draftSelect}
     WHERE drafts.status = 'draft'
       AND NOT EXISTS (
         SELECT 1 FROM orders
         WHERE orders.client_id = drafts.client_id
           AND orders.finalized_at >= drafts.created_at
       )
     ORDER BY drafts.updated_at DESC`,
  ).all<StoredDraft>();

  return json({
    drafts: result.results.map(serializeDraft),
  });
}
export async function PUT(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const body = await request.json() as DraftInput;
  const clientRequestId = String(body.clientRequestId ?? "").trim();
  const id = String(body.id ?? "").trim() || crypto.randomUUID();
  const clientId = body.clientId ? String(body.clientId) : null;
  const clientName = String(body.clientName ?? "").trim().slice(0, 120);
  const step = Math.max(1, Math.min(3, Number(body.step ?? 1)));
  const dataJson = JSON.stringify(body.data ?? {});
  if (!clientRequestId || clientRequestId.length > 100) {
    return json({ error: "Identificador do rascunho inválido." }, { status: 400 });
  }
  if (dataJson.length > 500_000) {
    return json({ error: "O rascunho ultrapassou o tamanho permitido." }, { status: 413 });
  }
  await expireDrafts();

  const completed = await env.DB.prepare(
    "SELECT id FROM orders WHERE client_request_id = ? LIMIT 1",
  ).bind(clientRequestId).first<{ id: string }>();
  if (completed) {
    return json({
      code: "ORDER_FINALIZED",
      error: "Esta OS já foi finalizada em outro aparelho.",
    }, { status: 409 });
  }

  if (clientId) {
    const clientDraft = await env.DB.prepare(
      `${draftSelect}
       WHERE drafts.client_id = ?
         AND drafts.client_request_id <> ?
         AND drafts.status = 'draft'
         AND NOT EXISTS (
           SELECT 1 FROM orders
           WHERE orders.client_id = drafts.client_id
             AND orders.finalized_at >= drafts.created_at
         )
       ORDER BY drafts.updated_at DESC
       LIMIT 1`,
    ).bind(clientId, clientRequestId).first<StoredDraft>();
    if (clientDraft) {
      return json({
        code: "CLIENT_BUSY",
        error: `${clientName || "Este cliente"} já possui um atendimento em andamento.`,
        draft: serializeDraft(clientDraft),
      }, { status: 409 });
    }
  }

  const existing = await env.DB.prepare(
    "SELECT id, user_id AS userId, created_at AS createdAt FROM drafts WHERE client_request_id = ?",
  ).bind(clientRequestId).first<{ id: string; userId: string; createdAt: number }>();
  const now = Date.now();
  if (existing) {
    await env.DB.prepare(
      `UPDATE drafts
       SET client_id = ?, client_name = ?, data_json = ?, step = ?,
           status = 'draft', updated_at = ?
       WHERE id = ?`,
    ).bind(clientId, clientName, dataJson, step, now, existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO drafts (
        id, client_request_id, user_id, client_id, client_name,
        data_json, step, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    ).bind(id, clientRequestId, user.id, clientId, clientName, dataJson, step, now, now).run();
    await writeAudit(
      user.id,
      "draft.created",
      "draft",
      id,
      `Atendimento em andamento${clientName ? ` para ${clientName}` : ""}.`,
    );
  }

  const owner = existing && existing.userId !== user.id
    ? await env.DB.prepare("SELECT username, display_name AS displayName FROM users WHERE id = ?")
      .bind(existing.userId)
      .first<{ username: string; displayName: string }>()
    : user;

  return json({
    draft: {
      id: existing?.id ?? id,
      clientRequestId,
      userId: existing?.userId ?? user.id,
      clientId,
      clientName,
      data: body.data ?? {},
      step,
      status: "draft",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ownerName: owner?.displayName || owner?.username || user.displayName || user.username,
    },
  });
}

export async function DELETE(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Rascunho não informado." }, { status: 400 });

  const draft = await env.DB.prepare(
    "SELECT id, user_id AS userId, client_name AS clientName FROM drafts WHERE id = ?",
  ).bind(id).first<{ id: string; userId: string; clientName: string }>();
  if (!draft) return json({ ok: true });
  if (draft.userId !== user.id && user.role !== "admin") {
    return json({ error: "Somente o responsável ou um administrador pode descartar este rascunho." }, { status: 403 });
  }

  await env.DB.prepare("DELETE FROM drafts WHERE id = ?").bind(id).run();
  await writeAudit(
    user.id,
    "draft.discarded",
    "draft",
    id,
    `Rascunho${draft.clientName ? ` de ${draft.clientName}` : ""} descartado.`,
  );
  return json({ ok: true });
}
