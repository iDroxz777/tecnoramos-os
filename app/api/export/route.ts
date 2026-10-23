import { env } from "cloudflare:workers";
import { requireAdmin, writeAudit } from "../_shared";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  let text = String(value ?? "");
  // Spreadsheets run cells that start with these characters as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

const migrationTables = [
  "users",
  "clients",
  "orders",
  "drafts",
  "order_revisions",
  "audit_logs",
  "service_cycles",
  "service_cycle_completions",
  "app_counters",
  "order_reviews",
] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const url = new URL(request.url);
  const requestedFormat = url.searchParams.get("format");
  const format = requestedFormat === "migration"
    ? "migration"
    : requestedFormat === "json"
      ? "json"
      : "csv";
  const timestamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  if (format === "migration") {
    await writeAudit(
      auth.user.id,
      "data.migration_exported",
      "system",
      "migration",
      "Backup completo de migração exportado.",
    );
    const snapshots = await Promise.all(
      migrationTables.map(async (table) => {
        const result = await env.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
        return [table, result.results] as const;
      }),
    );
    return new Response(JSON.stringify({
      schemaVersion: 1,
      source: "tecnoramos-sites",
      exportedAt: Date.now(),
      tables: Object.fromEntries(snapshots),
    }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="tecnoramos-migracao-${timestamp}.json"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const orders = await env.DB.prepare(
    `SELECT orders.order_number AS orderNumber,
            orders.revision_number AS revisionNumber,
            orders.client_name AS clientName,
            orders.equipment,
            orders.technicians_json AS techniciansJson,
            orders.arrival_time AS arrivalTime,
            orders.departure_time AS departureTime,
            orders.status,
            orders.created_at AS createdAt,
            orders.finalized_at AS finalizedAt,
            orders.deleted_at AS deletedAt,
            orders.deletion_reason AS deletionReason,
            users.username AS completedBy,
            users.display_name AS completedByDisplayName
     FROM orders
     INNER JOIN users ON users.id = orders.user_id
     ORDER BY orders.order_number, orders.revision_number`,
  ).all<{
    orderNumber: number;
    revisionNumber: number;
    clientName: string;
    equipment: string;
    techniciansJson: string;
    arrivalTime: string;
    departureTime: string;
    status: string;
    createdAt: number;
    finalizedAt: number | null;
    deletedAt: number | null;
    deletionReason: string | null;
    completedBy: string;
    completedByDisplayName: string;
  }>();
  const clients = await env.DB.prepare(
    "SELECT id, name, status, created_at AS createdAt, updated_at AS updatedAt FROM clients ORDER BY name",
  ).all();
  const users = await env.DB.prepare(
    `SELECT id, username, display_name AS displayName, role, status, created_at AS createdAt
     FROM users ORDER BY username`,
  ).all();

  await writeAudit(
    auth.user.id,
    "data.exported",
    "system",
    "export",
    `Dados exportados em formato ${format.toUpperCase()}.`,
  );

  if (format === "json") {
    const body = JSON.stringify({
      exportedAt: Date.now(),
      orders: orders.results.map((order) => ({
        ...order,
        technicians: JSON.parse(order.techniciansJson),
        techniciansJson: undefined,
      })),
      clients: clients.results,
      users: users.results,
    }, null, 2);
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="tecnoramos-backup-${timestamp}.json"`,
        "cache-control": "no-store",
      },
    });
  }

  const header = [
    "Número", "Revisão", "Cliente", "Equipamento", "Técnicos", "Chegada", "Saída",
    "Finalizada por", "Data", "Status", "Na lixeira", "Motivo da remoção",
  ];
  const lines = orders.results.map((order) => [
    order.orderNumber,
    order.revisionNumber,
    order.clientName,
    order.equipment,
    (JSON.parse(order.techniciansJson) as string[]).join(" + "),
    order.arrivalTime,
    order.departureTime,
    order.completedByDisplayName || order.completedBy,
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(order.finalizedAt ?? order.createdAt)),
    order.status,
    order.deletedAt ? "Sim" : "Não",
    order.deletionReason ?? "",
  ].map(csvCell).join(","));
  const csv = `\uFEFF${header.map(csvCell).join(",")}\n${lines.join("\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tecnoramos-os-${timestamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
