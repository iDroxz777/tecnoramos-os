import { env } from "cloudflare:workers";
import {
  json,
  rejectCrossOrigin,
  requireAdmin,
  requireUser,
  writeAudit,
} from "../_shared";
import { getOrCreateActiveCycle } from "../_cycle";

export const dynamic = "force-dynamic";

type OrderInput = {
  clientId?: string | null;
  clientName?: string;
  clientRequestId?: string;
  equipmentDescription?: string;
  technicianIds?: string[];
  technicians?: string[];
  arrivalTime?: string;
  departureTime?: string;
  signatureDataUrl?: string;
  signedAt?: number | null;
  consentConfirmed?: boolean;
  correctedFromId?: string | null;
  correctionReason?: string | null;
  [key: string]: unknown;
};

type OrderRow = {
  id: string;
  orderNumber: number;
  clientId: string | null;
  clientRequestId: string | null;
  clientName: string;
  equipment: string;
  techniciansJson: string;
  arrivalTime: string;
  departureTime: string;
  dataJson: string;
  status: string;
  createdAt: number;
  finalizedAt: number | null;
  signedAt: number | null;
  revisionNumber: number;
  correctedFromId: string | null;
  correctionReason: string | null;
  deletedAt: number | null;
  deletionReason: string | null;
  completedBy: string;
  completedByDisplayName: string;
  reviewedAt: number | null;
  reviewedByName: string | null;
};

function mapOrder(order: OrderRow) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    clientId: order.clientId,
    clientRequestId: order.clientRequestId ?? order.id,
    clientName: order.clientName,
    equipment: order.equipment,
    technicians: JSON.parse(order.techniciansJson),
    arrivalTime: order.arrivalTime,
    departureTime: order.departureTime,
    data: JSON.parse(order.dataJson),
    status: order.status,
    createdAt: order.createdAt,
    finalizedAt: order.finalizedAt ?? order.createdAt,
    signedAt: order.signedAt,
    revisionNumber: order.revisionNumber,
    correctedFromId: order.correctedFromId,
    correctionReason: order.correctionReason,
    deletedAt: order.deletedAt,
    deletionReason: order.deletionReason,
    completedBy: order.completedBy,
    completedByDisplayName: order.completedByDisplayName || order.completedBy,
    reviewedAt: order.reviewedAt,
    reviewedBy: order.reviewedByName,
  };
}

const orderSelect = `
  SELECT orders.id,
         orders.order_number AS orderNumber,
         orders.client_id AS clientId,
         orders.client_request_id AS clientRequestId,
         orders.client_name AS clientName,
         orders.equipment,
         orders.technicians_json AS techniciansJson,
         orders.arrival_time AS arrivalTime,
         orders.departure_time AS departureTime,
         orders.data_json AS dataJson,
         orders.status,
         orders.created_at AS createdAt,
         orders.finalized_at AS finalizedAt,
         orders.signed_at AS signedAt,
         orders.revision_number AS revisionNumber,
         orders.corrected_from_id AS correctedFromId,
         orders.correction_reason AS correctionReason,
         orders.deleted_at AS deletedAt,
         orders.deletion_reason AS deletionReason,
         users.username AS completedBy,
         users.display_name AS completedByDisplayName,
         order_reviews.reviewed_at AS reviewedAt,
         COALESCE(NULLIF(reviewers.display_name, ''), reviewers.username) AS reviewedByName
  FROM orders
  INNER JOIN users ON users.id = orders.user_id
  LEFT JOIN order_reviews ON order_reviews.order_id = orders.id
  LEFT JOIN users AS reviewers ON reviewers.id = order_reviews.reviewed_by
`;

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const url = new URL(request.url);
  const trash = url.searchParams.get("trash") === "1";
  if (trash && user.role !== "admin") {
    return json({ error: "Acesso restrito aos administradores." }, { status: 403 });
  }
  const specificId = url.searchParams.get("id");
  if (specificId) {
    const row = await env.DB.prepare(`${orderSelect} WHERE orders.id = ?`)
      .bind(specificId)
      .first<OrderRow>();
    // Orders in the trash stay visible to administrators only.
    return row && (!row.deletedAt || user.role === "admin")
      ? json({ order: mapOrder(row) })
      : json({ error: "OS não encontrada." }, { status: 404 });
  }

  const where = trash
    ? "orders.deleted_at IS NOT NULL"
    : "orders.deleted_at IS NULL AND orders.superseded_by_id IS NULL";
  const result = await env.DB.prepare(
    `${orderSelect} WHERE ${where} ORDER BY orders.created_at DESC LIMIT 1000`,
  ).all<OrderRow>();
  return json({ orders: result.results.map(mapOrder) });
}

async function resolveTechnicians(body: OrderInput) {
  const ids = Array.isArray(body.technicianIds)
    ? [...new Set(body.technicianIds.map(String).filter(Boolean))].slice(0, 10)
    : [];
  if (!ids.length) {
    return {
      ids,
      names: Array.isArray(body.technicians)
        ? body.technicians.map((name) => String(name).trim()).filter(Boolean).slice(0, 10)
        : [],
    };
  }
  const placeholders = ids.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName
     FROM users
     WHERE id IN (${placeholders}) AND status = 'active'`,
  ).bind(...ids).all<{ id: string; username: string; displayName: string }>();
  const byId = new Map(result.results.map((item) => [item.id, item]));
  const names = ids
    .map((id) => byId.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => item.displayName || item.username);
  return { ids: ids.filter((id) => byId.has(id)), names };
}

async function existingByRequest(clientRequestId: string) {
  return env.DB.prepare(`${orderSelect} WHERE orders.client_request_id = ?`)
    .bind(clientRequestId)
    .first<OrderRow>();
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const body = await request.json() as OrderInput;
  const clientRequestId = String(body.clientRequestId ?? "").trim();
  if (!clientRequestId || clientRequestId.length > 100) {
    return json({ error: "Identificador de sincronização inválido." }, { status: 400 });
  }
  const alreadySaved = await existingByRequest(clientRequestId);
  if (alreadySaved) return json({ order: mapOrder(alreadySaved), duplicate: true });

  const clientId = String(body.clientId ?? "").trim();
  const client = await env.DB.prepare(
    "SELECT id, name, status FROM clients WHERE id = ?",
  ).bind(clientId).first<{ id: string; name: string; status: string }>();
  if (!client || client.status !== "active") {
    return json({ error: "Selecione um cliente ativo." }, { status: 400 });
  }

  const equipment = String(body.equipmentDescription ?? "").trim().slice(0, 180);
  const arrivalTime = String(body.arrivalTime ?? "");
  const departureTime = String(body.departureTime ?? "");
  const signatureDataUrl = String(body.signatureDataUrl ?? "");
  const consentConfirmed = body.consentConfirmed === true;
  const technicians = await resolveTechnicians(body);
  if (
    !technicians.names.length
    || !/^\d{2}:\d{2}$/.test(arrivalTime)
    || !/^\d{2}:\d{2}$/.test(departureTime)
    || !signatureDataUrl.startsWith("data:image/png;base64,")
    || !consentConfirmed
  ) {
    return json({
      error: "Preencha cliente, técnicos, horários, confirmação e assinatura.",
    }, { status: 400 });
  }
  if (signatureDataUrl.length > 500_000) {
    return json({ error: "A assinatura ultrapassou o tamanho permitido." }, { status: 413 });
  }

  const correctedFromId = String(body.correctedFromId ?? "").trim() || null;
  const correctionReason = String(body.correctionReason ?? "").trim().slice(0, 500) || null;
  let original: OrderRow | null = null;
  if (correctedFromId) {
    if (user.role !== "admin") {
      return json({ error: "Somente administradores podem corrigir uma OS assinada." }, { status: 403 });
    }
    original = await env.DB.prepare(
      `${orderSelect}
       WHERE orders.id = ? AND orders.deleted_at IS NULL AND orders.superseded_by_id IS NULL`,
    ).bind(correctedFromId).first<OrderRow>();
    if (!original) return json({ error: "A OS original não está disponível para correção." }, { status: 404 });
    if (!correctionReason || correctionReason.length < 5) {
      return json({ error: "Informe o motivo da correção." }, { status: 400 });
    }
  }

  let orderNumber: number;
  let revisionNumber = 1;
  if (original) {
    orderNumber = original.orderNumber;
    revisionNumber = original.revisionNumber + 1;
  } else {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO app_counters (name, value)
       SELECT 'order_number', COALESCE(MAX(order_number), 0) FROM orders`,
    ).run();
    const counter = await env.DB.prepare(
      "UPDATE app_counters SET value = value + 1 WHERE name = 'order_number' RETURNING value",
    ).first<{ value: number }>();
    if (!counter) return json({ error: "Não foi possível reservar o número da OS." }, { status: 500 });
    orderNumber = counter.value;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const signedAt = Number(body.signedAt) > 0 ? Number(body.signedAt) : now;
  const sanitizedBody = {
    ...body,
    clientId: client.id,
    clientName: client.name,
    technicianIds: technicians.ids,
    technicians: technicians.names,
    photos: undefined,
    consentConfirmed: true,
    signedAt,
  };
  const dataJson = JSON.stringify(sanitizedBody);
  if (dataJson.length > 1_000_000) {
    return json({ error: "A OS ultrapassou o tamanho permitido." }, { status: 413 });
  }

  const cycle = await getOrCreateActiveCycle(user.id);
  const statements = [
    env.DB.prepare(
      `INSERT INTO orders (
        id, user_id, order_number, client_id, client_request_id, client_name,
        equipment, technicians_json, arrival_time, departure_time, data_json,
        status, revision_number, corrected_from_id, correction_reason,
        finalized_at, signed_at, consent_confirmed, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).bind(
      id,
      user.id,
      orderNumber,
      client.id,
      clientRequestId,
      client.name,
      equipment,
      JSON.stringify(technicians.names),
      arrivalTime,
      departureTime,
      dataJson,
      revisionNumber,
      original?.id ?? null,
      correctionReason,
      now,
      signedAt,
      now,
      now,
    ),
    // A client can have only one active service workflow. Completing the OS
    // closes any older duplicate draft for the same establishment as well.
    env.DB.prepare("DELETE FROM drafts WHERE client_request_id = ? OR client_id = ?")
      .bind(clientRequestId, client.id),
    env.DB.prepare(
      `INSERT OR IGNORE INTO service_cycle_completions (
        id, cycle_id, client_name, order_id, completed_at, completed_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), cycle.id, client.name, id, now, user.id),
  ];

  if (original) {
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO order_revisions (
          id, order_id, revision_number, data_json, reason, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        original.id,
        original.revisionNumber,
        original.dataJson,
        correctionReason,
        user.id,
        now,
      ),
      env.DB.prepare("UPDATE orders SET superseded_by_id = ?, updated_at = ? WHERE id = ?")
        .bind(id, now, original.id),
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const concurrent = await existingByRequest(clientRequestId);
    if (concurrent) return json({ order: mapOrder(concurrent), duplicate: true });
    throw error;
  }

  await writeAudit(
    user.id,
    original ? "order.corrected" : "order.completed",
    "order",
    id,
    original
      ? `OS-${String(orderNumber).padStart(5, "0")} corrigida — revisão ${revisionNumber}.`
      : `OS-${String(orderNumber).padStart(5, "0")} de ${client.name} finalizada.`,
    original ? { correctedFromId: original.id, correctionReason } : {},
  );

  const saved = await env.DB.prepare(`${orderSelect} WHERE orders.id = ?`).bind(id).first<OrderRow>();
  return json({ order: saved ? mapOrder(saved) : null }, { status: 201 });
}

export async function PATCH(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const body = await request.json() as {
    orderId?: string;
    action?: "trash" | "restore" | "review" | "unreview";
    reason?: string;
  };
  const orderId = String(body.orderId ?? "");
  const order = await env.DB.prepare(
    "SELECT id, order_number AS orderNumber, client_name AS clientName, deleted_at AS deletedAt FROM orders WHERE id = ?",
  ).bind(orderId).first<{
    id: string;
    orderNumber: number;
    clientName: string;
    deletedAt: number | null;
  }>();
  if (!order) return json({ error: "Ordem de serviço não encontrada." }, { status: 404 });

  if (body.action === "trash") {
    if (order.deletedAt) return json({ ok: true });
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (reason.length < 3) return json({ error: "Informe o motivo da remoção." }, { status: 400 });
    await env.DB.prepare(
      "UPDATE orders SET deleted_at = ?, deleted_by = ?, deletion_reason = ?, updated_at = ? WHERE id = ?",
    ).bind(Date.now(), auth.user.id, reason, Date.now(), order.id).run();
    await writeAudit(
      auth.user.id,
      "order.trashed",
      "order",
      order.id,
      `OS-${String(order.orderNumber).padStart(5, "0")} de ${order.clientName} movida para a lixeira.`,
      { reason },
    );
  } else if (body.action === "restore") {
    if (!order.deletedAt) return json({ ok: true });
    await env.DB.prepare(
      "UPDATE orders SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL, updated_at = ? WHERE id = ?",
    ).bind(Date.now(), order.id).run();
    await writeAudit(
      auth.user.id,
      "order.restored",
      "order",
      order.id,
      `OS-${String(order.orderNumber).padStart(5, "0")} de ${order.clientName} restaurada.`,
    );
  } else if (body.action === "review") {
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO order_reviews (order_id, reviewed_at, reviewed_by) VALUES (?, ?, ?)",
    ).bind(order.id, Date.now(), auth.user.id).run();
    if (result.meta?.changes) {
      await writeAudit(
        auth.user.id,
        "order.reviewed",
        "order",
        order.id,
        `OS-${String(order.orderNumber).padStart(5, "0")} de ${order.clientName} marcada como conferida.`,
      );
    }
  } else if (body.action === "unreview") {
    const result = await env.DB.prepare("DELETE FROM order_reviews WHERE order_id = ?").bind(order.id).run();
    if (result.meta?.changes) {
      await writeAudit(
        auth.user.id,
        "order.review_removed",
        "order",
        order.id,
        `OS-${String(order.orderNumber).padStart(5, "0")} de ${order.clientName} voltou a ficar pendente de conferência.`,
      );
    }
  } else {
    return json({ error: "Ação inválida." }, { status: 400 });
  }

  return json({ ok: true });
}

export async function DELETE() {
  return json({
    error: "A exclusão definitiva foi desativada. Use a lixeira administrativa.",
  }, { status: 405 });
}
