import { env } from "cloudflare:workers";
import { json, rejectCrossOrigin, requireAdmin, requireUser, writeAudit } from "../_shared";
import { cycleLabel, getOrCreateActiveCycle } from "../_cycle";

export const dynamic = "force-dynamic";

type CycleAction = {
  action?: "toggle" | "reset";
  clientName?: string;
  completed?: boolean;
};

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const cycle = await getOrCreateActiveCycle(user.id);
  const completions = await env.DB.prepare(
    `SELECT client_name AS clientName, completed_at AS completedAt
     FROM service_cycle_completions
     WHERE cycle_id = ?
     ORDER BY completed_at DESC`,
  ).bind(cycle.id).all<{ clientName: string; completedAt: number }>();

  return json({ cycle, completions: completions.results });
}

export async function PATCH(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const body = await request.json() as CycleAction;
  const clientName = String(body.clientName ?? "").trim();
  if (body.action !== "toggle" || !clientName || typeof body.completed !== "boolean") {
    return json({ error: "Alteração mensal inválida." }, { status: 400 });
  }

  const cycle = await getOrCreateActiveCycle(user.id);
  if (body.completed) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO service_cycle_completions (
        id, cycle_id, client_name, order_id, completed_at, completed_by
      ) VALUES (?, ?, ?, NULL, ?, ?)`,
    ).bind(crypto.randomUUID(), cycle.id, clientName, Date.now(), user.id).run();
  } else {
    await env.DB.prepare(
      "DELETE FROM service_cycle_completions WHERE cycle_id = ? AND client_name = ?",
    ).bind(cycle.id, clientName).run();
  }

  await writeAudit(
    user.id,
    body.completed ? "cycle.client_completed" : "cycle.client_reopened",
    "service_cycle",
    cycle.id,
    `${clientName} foi ${body.completed ? "marcado como concluído" : "desmarcado"} no controle mensal.`,
  );
  return json({ ok: true });
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;
  const user = auth.user;

  const body = await request.json() as CycleAction;
  if (body.action !== "reset") {
    return json({ error: "Ação mensal inválida." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const startedAt = Date.now();
  const label = cycleLabel();

  await env.DB.batch([
    env.DB.prepare("UPDATE service_cycles SET is_active = 0 WHERE is_active = 1"),
    env.DB.prepare(
      `INSERT INTO service_cycles (id, label, is_active, started_at, started_by)
       VALUES (?, ?, 1, ?, ?)`,
    ).bind(id, label, startedAt, user.id),
  ]);
  await writeAudit(
    user.id,
    "cycle.reset",
    "service_cycle",
    id,
    "Lista de estabelecimentos concluídos reiniciada.",
  );

  return json({
    cycle: { id, label, startedAt },
    completions: [],
  }, { status: 201 });
}
