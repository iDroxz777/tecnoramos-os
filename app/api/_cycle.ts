import { env } from "cloudflare:workers";

type ActiveCycle = {
  id: string;
  label: string;
  startedAt: number;
};

function cycleLabel(date = new Date()) {
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  return month.charAt(0).toUpperCase() + month.slice(1);
}

function saoPauloMonthStart(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return Date.UTC(year, month - 1, 1, 3);
}

export async function getOrCreateActiveCycle(userId: string): Promise<ActiveCycle> {
  const active = await env.DB.prepare(
    `SELECT id, label, started_at AS startedAt
     FROM service_cycles
     WHERE is_active = 1
     ORDER BY started_at DESC
     LIMIT 1`,
  ).first<ActiveCycle>();

  if (active) return active;

  const id = crypto.randomUUID();
  const startedAt = Date.now();
  const label = cycleLabel();

  await env.DB.prepare(
    `INSERT INTO service_cycles (id, label, is_active, started_at, started_by)
     VALUES (?, ?, 1, ?, ?)`,
  ).bind(id, label, startedAt, userId).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO service_cycle_completions (
      id, cycle_id, client_name, order_id, completed_at, completed_by
    )
    SELECT lower(hex(randomblob(16))), ?, client_name, id, created_at, user_id
    FROM orders
    WHERE created_at >= ?
    ORDER BY created_at DESC`,
  ).bind(id, saoPauloMonthStart()).run();

  return { id, label, startedAt };
}

export { cycleLabel };
