import { env } from "cloudflare:workers";
import { json, requireAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response || !auth.user) return auth.response;

  const result = await env.DB.prepare(
    `SELECT audit_logs.id,
            audit_logs.action,
            audit_logs.entity_type AS entityType,
            audit_logs.entity_id AS entityId,
            audit_logs.summary,
            audit_logs.created_at AS createdAt,
            users.username AS actorUsername,
            users.display_name AS actorDisplayName
     FROM audit_logs
     INNER JOIN users ON users.id = audit_logs.actor_user_id
     ORDER BY audit_logs.created_at DESC
     LIMIT 250`,
  ).all();
  return json({ logs: result.results });
}
