import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readdir } from "node:fs/promises";
import {
  formCanContinue,
  missingForStep,
  normalizeName,
  orderMatchesSearch,
  safePdfFilename,
} from "../app/domain.ts";
import { clientReportFilename } from "../app/ui/client-report.ts";
import { formatDuration, minutesBetween } from "../app/ui/format.ts";
import {
  catalogPartLabel,
  clientProfile,
  materialsSummary,
  monthCsv,
  orderParts,
  orderSubtitle,
  previousOrdersForClient,
  reuseOrderFields,
  serviceTypeOf,
  shiftMonth,
  summarize,
} from "../app/ui/insights.ts";
import { PREVENTIVE_PROCEDURE_TEXT, commonParts, serviceTypes } from "../app/data.ts";
import { isDraftExpired, mergeDrafts, unsyncedDrafts } from "../app/offline-db.ts";
import { signOut } from "../app/sign-out.ts";

/** The main component plus every screen under app/ui, as one string. */
async function readAppSources() {
  const uiDir = new URL("../app/ui/", import.meta.url);
  const files = (await readdir(uiDir)).filter((name) => name.endsWith(".tsx"));
  const sources = await Promise.all([
    readFile(new URL("../app/TecnoramosApp.tsx", import.meta.url), "utf8"),
    ...files.map((name) => readFile(new URL(name, uiDir), "utf8")),
  ]);
  return sources.join("\n");
}

test("normalizes Portuguese names for reliable search", () => {
  assert.equal(normalizeName("  Verde Vale   Aclimação "), "verde vale aclimacao");
  assert.equal(normalizeName("Açougue Nobre"), "acougue nobre");
});

test("requires an explicit signature and client confirmation", () => {
  const form = {
    clientId: "client-001",
    equipmentDescription: "Câmara fria",
    call: ["Não está refrigerando"],
    callOther: "",
    callText: "",
    defects: ["Filtro sujo"],
    defectsOther: "",
    defectText: "",
    procedures: ["Limpeza e higienização"],
    procedureOther: "",
    procedureText: "",
    parts: ["Sem utilização de peças"],
    partOther: "",
    notes: "",
    arrivalTime: "08:00",
    departureTime: "09:00",
    technicianIds: ["user-1"],
    technicians: ["Carlos"],
    signatureDataUrl: "",
    consentConfirmed: false,
    signedAt: null,
  };
  assert.equal(formCanContinue(1, form), true);
  assert.equal(formCanContinue(2, form), true);
  assert.equal(formCanContinue(3, form), false);
  form.signatureDataUrl = "data:image/png;base64,AAAA";
  form.consentConfirmed = true;
  assert.equal(formCanContinue(3, form), true);
});

test("builds a safe PDF filename for every establishment", () => {
  const timestamp = Date.UTC(2026, 6, 28, 15, 0);
  const filename = safePdfFilename('Mercado Aurora / Centro: "A"', timestamp);
  assert.match(filename, /^Mercado Aurora Centro A \d{2}-\d{2}-2026\.pdf$/);
  assert.doesNotMatch(filename, /[/:"]/);
});

test("searches orders by technical content", () => {
  const order = {
    orderNumber: 12,
    clientName: "Empório Serra Azul",
    equipment: "Câmara congelada",
    technicians: ["Carlos", "Ana"],
    completedBy: "carlos",
    data: {
      callText: "Temperatura oscilando",
      defectText: "Dreno obstruído",
      procedureText: "Realizada limpeza",
    },
  };
  assert.equal(orderMatchesSearch(order, "emporio serra"), true);
  assert.equal(orderMatchesSearch(order, "dreno obstruido"), true);
  assert.equal(orderMatchesSearch(order, "compressor queimado"), false);
});

test("uses additive migrations and preserves current operational data", async () => {
  const migration = await readFile(new URL("../drizzle/0002_free_ezekiel.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+orders\b/i);
  assert.match(migration, /lower\(`username`\) IN \('admin'\)/);
  assert.match(migration, /COALESCE\(MAX\(`order_number`\), 0\)/);
  assert.match(migration, /INSERT OR IGNORE INTO `clients`/);
});

test("keeps offline writes idempotent and never caches API responses", async () => {
  const [ordersRoute, serviceWorker, app] = await Promise.all([
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/TecnoramosApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ordersRoute, /orders_client_request_idx|client_request_id/);
  assert.match(ordersRoute, /existingByRequest/);
  assert.match(app, /sync_pending/);
  assert.match(app, /getPendingOrders/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\(\"\/api\/\"\)/);
});

test("does not resurrect a server-deleted draft from an old phone cache", () => {
  const stale = {
    id: "draft-old",
    clientRequestId: "request-finalized",
    userId: "user-1",
    clientId: "client-1",
    clientName: "Mercado Aurora",
    data: {},
    step: 2,
    status: "draft",
    createdAt: 1,
    updatedAt: 2,
  };
  assert.deepEqual(mergeDrafts([], [stale], 10), []);
  assert.equal(mergeDrafts([], [{ ...stale, status: "sync_pending" }], 10).length, 1);
});

test("lets the team continue drafts while protecting finalized orders", async () => {
  const [draftRoute, orderRoute, app] = await Promise.all([
    readFile(new URL("../app/api/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readAppSources(),
  ]);
  assert.match(draftRoute, /ORDER_FINALIZED/);
  assert.match(draftRoute, /CLIENT_BUSY/);
  assert.doesNotMatch(draftRoute, /Este atendimento está sendo preenchido por outro técnico/);
  assert.match(orderRoute, /DELETE FROM drafts WHERE client_request_id = \? OR client_id = \?/);
  assert.doesNotMatch(app, /Este atendimento está com/);
  // Team drafts open the home screen, where anyone can continue them.
  assert.match(app, /<SectionHeader title="Em andamento"/);
  assert.match(app, /<DraftList drafts=\{drafts\}/);
});

test("accepts legacy six-character passwords only for login", async () => {
  const [shared, auth, app] = await Promise.all([
    readFile(new URL("../app/api/_shared.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readAppSources(),
  ]);
  assert.match(shared, /validLoginPassword/);
  assert.match(auth, /action === "login" && !validLoginPassword\(password\)/);
  assert.match(auth, /action === "register" && !validPassword\(password\)/);
  assert.match(app, /minLength=\{canBootstrap \? 8 : 1\}/);
});

test("keeps PBKDF2 within the production runtime limit", async () => {
  const shared = await readFile(new URL("../app/api/_shared.ts", import.meta.url), "utf8");
  assert.match(shared, /PASSWORD_HASH_ITERATIONS = 100_000/);
  assert.doesNotMatch(shared, /PASSWORD_HASH_ITERATIONS = 210_000/);
});

test("removes photos and keeps a three-step service order flow", async () => {
  const app = await readAppSources();
  assert.match(app, /const stepNames = \[\"Cliente\", \"Atendimento\", \"Assinatura\"\]/);
  assert.doesNotMatch(app, /function Photos\(/);
  assert.doesNotMatch(app, /Registro fotográfico/);
  assert.match(app, /Assinatura digital/);
});

test("build output contains migrations and hosting configuration", async () => {
  const [hosting, migration] = await Promise.all([
    readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/.openai/drizzle/0002_free_ezekiel.sql", import.meta.url), "utf8"),
  ]);
  assert.match(hosting, /"project_id"/);
  assert.match(migration, /CREATE TABLE `audit_logs`/);
});

test("creates a complete admin-only migration backup without active sessions", async () => {
  const exportRoute = await readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8");
  for (const table of [
    "users",
    "clients",
    "orders",
    "drafts",
    "order_revisions",
    "audit_logs",
    "service_cycles",
    "service_cycle_completions",
    "app_counters",
  ]) {
    assert.match(exportRoute, new RegExp(`\"${table}\"`));
  }
  assert.match(exportRoute, /requireAdmin/);
  assert.match(exportRoute, /private, no-store/);
  assert.doesNotMatch(exportRoute, /migrationTables[\\s\\S]*\"sessions\"/);
});

test("limits login attempts atomically per account and per shared IP", async () => {
  const auth = await readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8");
  assert.match(auth, /async function reserveLoginAttempt/);
  assert.match(auth, /ON CONFLICT\(username\) DO UPDATE SET[\s\S]*RETURNING locked_until/);
  assert.match(auth, /cf-connecting-ip/);
  const userLimit = Number(auth.match(/USER_ATTEMPT_LIMIT = (\d+)/)[1]);
  const ipLimit = Number(auth.match(/IP_ATTEMPT_LIMIT = (\d+)/)[1]);
  assert.ok(ipLimit > userLimit * 3, "a shared Wi-Fi must not lock out the whole team");
  assert.match(auth, /UNKNOWN_USER_SALT/);
  assert.doesNotMatch(auth, /failed_count = excluded\.failed_count/);
});

test("neutralizes spreadsheet formulas in CSV exports", async () => {
  const exportRoute = await readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8");
  assert.match(exportRoute, /\/\^\[=\+\\-@\\t\\r\]\/\.test\(text\)/);
});

test("requires replacing a temporary password before using the data routes", async () => {
  const shared = await readFile(new URL("../app/api/_shared.ts", import.meta.url), "utf8");
  assert.match(shared, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(shared, /export async function requireAdmin[\s\S]*await requireUser\(request\)/);
  for (const route of ["orders", "drafts", "users", "clients", "month-cycle", "audit", "export"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /currentUser\(/, `${route} must use requireUser or requireAdmin`);
  }
});

test("hides trashed orders from technicians", async () => {
  const ordersRoute = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  assert.match(ordersRoute, /row && \(!row\.deletedAt \|\| user\.role === "admin"\)/);
});

test("keeps unsynced offline work when signing out", async () => {
  const [offline, app] = await Promise.all([
    readFile(new URL("../app/offline-db.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/TecnoramosApp.tsx", import.meta.url), "utf8"),
  ]);
  const cleanup = offline.match(/clearSyncedAccountData[\s\S]*?\n  \},/)[0];
  assert.doesNotMatch(cleanup, /"pending"/);
  assert.doesNotMatch(offline, /clearAccountData/);
  assert.match(app, /countUnsynced\(account\.username\)/);
  assert.match(app, /clearSyncedAccountData\(account\.username\)/);
  const drafts = [
    { clientRequestId: "a", status: "draft" },
    { clientRequestId: "b", status: "sync_pending" },
  ];
  assert.deepEqual(unsyncedDrafts(drafts).map((draft) => draft.clientRequestId), ["b"]);
});

test("sends security headers without blocking PDF generation", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /frame-ancestors 'none'/);
  assert.match(worker, /x-content-type-options/);
  assert.doesNotMatch(worker, /script-src/);
});

function signOutScenario({
  online = true,
  unsynced = 0,
  confirm = true,
  serverOk = true,
  syncFails = false,
  clearFails = false,
} = {}) {
  const calls = [];
  const steps = {
    online,
    synchronize: async () => {
      calls.push("sync");
      if (syncFails) throw new Error("network");
    },
    countUnsynced: async () => {
      calls.push("count");
      return unsynced;
    },
    confirmKeepingUnsynced: (count) => {
      calls.push(`confirm:${count}`);
      return confirm;
    },
    endServerSession: async () => {
      calls.push("server");
      return serverOk;
    },
    clearLocalSession: async () => {
      calls.push("clear");
      if (clearFails) throw new Error("IndexedDB unavailable");
    },
  };
  return { calls, run: () => signOut(steps) };
}

test("does not sign out without internet, keeping the session and local work", async () => {
  const scenario = signOutScenario({ online: false, unsynced: 2 });
  assert.equal(await scenario.run(), "offline");
  assert.deepEqual(scenario.calls, []);
});

test("keeps everything when the server cannot end the session", async () => {
  const scenario = signOutScenario({ serverOk: false });
  assert.equal(await scenario.run(), "server_unreachable");
  assert.ok(!scenario.calls.includes("clear"));
});

test("clears local data only after the server ends the session", async () => {
  const scenario = signOutScenario();
  assert.equal(await scenario.run(), "signed_out");
  assert.deepEqual(scenario.calls, ["sync", "count", "server", "clear"]);
});

test("asks before signing out with unsynced work and respects a cancel", async () => {
  const cancelled = signOutScenario({ unsynced: 3, confirm: false });
  assert.equal(await cancelled.run(), "cancelled");
  assert.deepEqual(cancelled.calls, ["sync", "count", "confirm:3"]);

  const confirmed = signOutScenario({ unsynced: 1, syncFails: true });
  assert.equal(await confirmed.run(), "signed_out");
  assert.deepEqual(confirmed.calls, ["sync", "count", "confirm:1", "server", "clear"]);
});

test("the app signs out through the server-confirmed flow", async () => {
  const app = await readFile(new URL("../app/TecnoramosApp.tsx", import.meta.url), "utf8");
  assert.match(app, /await signOut\(\{/);
  assert.match(app, /\(await fetch\("\/api\/auth", \{ method: "DELETE" \}\)\)\.ok/);
  assert.doesNotMatch(app, /if \(navigator\.onLine\) await fetch\("\/api\/auth", \{ method: "DELETE" \}\)/);
});

test("closes the account screen even if local cleanup fails after the server signed out", async () => {
  const scenario = signOutScenario({ clearFails: true });
  assert.equal(await scenario.run(), "signed_out");
  assert.deepEqual(scenario.calls, ["sync", "count", "server", "clear"]);
});

const sampleOrder = (overrides = {}) => ({
  id: "o1",
  orderNumber: 61,
  clientId: "c1",
  clientName: "Hortifruti Verde Vale Paraíso",
  equipment: "Câmara de congelados",
  technicians: ["Naldo", "Wesley"],
  arrivalTime: "08:00",
  departureTime: "10:30",
  status: "completed",
  createdAt: Date.UTC(2026, 9, 6, 12),
  finalizedAt: Date.UTC(2026, 9, 6, 13),
  signedAt: null,
  completedBy: "naldo",
  revisionNumber: 1,
  correctedFromId: null,
  correctionReason: null,
  deletedAt: null,
  deletionReason: null,
  clientRequestId: "r1",
  data: {
    clientId: "c1",
    equipmentDescription: "Câmara de congelados",
    call: ["Manutenção preventiva"],
    callOther: "",
    callText: "",
    defects: ["Filtro sujo", "Outro"],
    defectsOther: "Borracha da porta rasgada",
    defectText: "Filtro saturado",
    procedures: ["Limpeza e higienização"],
    procedureOther: "",
    procedureText: "Limpeza completa",
    parts: ["Sem utilização de peças"],
    partOther: "",
    notes: "Voltar em 30 dias",
    arrivalTime: "08:00",
    departureTime: "10:30",
    technicianIds: ["u1"],
    technicians: ["Naldo", "Wesley"],
    signatureDataUrl: "data:image/png;base64,AAAA",
    consentConfirmed: true,
    signedAt: 1,
  },
  ...overrides,
});

test("measures visit length, including calls that run past midnight", () => {
  assert.equal(minutesBetween("08:00", "10:30"), 150);
  assert.equal(minutesBetween("22:40", "01:10"), 150);
  assert.equal(minutesBetween("", "10:00"), null);
  assert.equal(minutesBetween("25:00", "10:00"), null);
  assert.equal(formatDuration(150), "2h 30");
  assert.equal(formatDuration(45), "45 min");
  assert.equal(formatDuration(null), "—");
});

test("builds monthly figures from synchronized orders only", () => {
  const orders = [
    sampleOrder(),
    sampleOrder({ id: "o2", orderNumber: 62, arrivalTime: "13:00", departureTime: "14:00", technicians: ["Naldo"],
      data: { ...sampleOrder().data, defects: ["Filtro sujo"], parts: ["Contator", "Fluido R-404A"] } }),
    sampleOrder({ id: "o3", orderNumber: null, status: "sync_pending" }),
  ];
  const summary = summarize(orders);
  assert.equal(summary.total, 2);
  assert.equal(summary.totalMinutes, 210);
  assert.equal(summary.averageMinutes, 105);
  assert.deepEqual(summary.byTechnician.map((item) => [item.name, item.count, item.minutes]), [["Naldo", 2, 210], ["Wesley", 1, 150]]);
  assert.deepEqual(summary.topDefects[0], { label: "Filtro sujo", count: 2 });
  assert.ok(summary.topDefects.some((item) => item.label === "Borracha da porta rasgada"), "'Outro' counts as what was written");
  assert.ok(!summary.topParts.some((item) => item.label === "Sem utilização de peças"));
  assert.equal(summary.topParts.length, 2);
});

test("reuses only what repeats between visits", () => {
  const previous = sampleOrder();
  const blank = { ...previous.data, equipmentDescription: "", call: [], defects: [], defectsOther: "", defectText: "",
    procedures: [], procedureText: "", parts: [], notes: "", arrivalTime: "", departureTime: "",
    signatureDataUrl: "", consentConfirmed: false, signedAt: null };
  const reused = reuseOrderFields(blank, previous);
  assert.deepEqual(reused.call, ["Manutenção preventiva"]);
  assert.equal(reused.procedureText, "Limpeza completa");
  assert.deepEqual(reused.procedures, []);
  assert.deepEqual(reused.parts, ["Sem utilização de peças"]);
  // The equipment field is gone from the form, so it is never carried over.
  assert.equal(reused.equipmentDescription, "");
  // This visit's defects, notes, times and signature are never copied.
  assert.deepEqual(reused.defects, []);
  assert.equal(reused.defectText, "");
  assert.equal(reused.notes, "");
  assert.equal(reused.arrivalTime, "");
  assert.equal(reused.signatureDataUrl, "");
  assert.equal(reused.consentConfirmed, false);
  reused.parts.push("Contator");
  assert.deepEqual(previous.data.parts, ["Sem utilização de peças"], "the previous order is not mutated");

  const legacy = sampleOrder({ data: { ...previous.data, call: ["Não está refrigerando"], procedureText: "",
    procedures: ["Limpeza e higienização"] } });
  const fromLegacy = reuseOrderFields(blank, legacy);
  assert.deepEqual(fromLegacy.call, [], "older orders without a service type leave the choice open");
  assert.equal(fromLegacy.procedureText, "Limpeza e higienização");
});

test("offers previous orders of the same client, newest first", () => {
  const orders = [
    sampleOrder({ id: "a", finalizedAt: 1000 }),
    sampleOrder({ id: "b", finalizedAt: 3000, data: { ...sampleOrder().data, parts: ["Contator", "Outro"], partOther: "1 mangueira capilar 1/4" } }),
    sampleOrder({ id: "c", clientId: "other", finalizedAt: 4000 }),
    sampleOrder({ id: "d", status: "sync_pending", finalizedAt: 5000 }),
  ];
  assert.deepEqual(previousOrdersForClient(orders, "c1").map((order) => order.id), ["b", "a"]);
  assert.deepEqual(previousOrdersForClient(orders, null), []);
  const profile = clientProfile(orders, "c1", "Hortifruti Verde Vale Paraíso");
  assert.equal(profile.orders.length, 2);
  assert.equal(profile.lastVisit, 3000);
  assert.deepEqual(profile.serviceTypes.map((item) => item.label), ["Manutenção preventiva"]);
  assert.deepEqual(profile.parts.map((item) => item.label), ["1 mangueira capilar 1/4", "Contator"]);
});

test("tells the technician exactly what is missing", () => {
  const form = { ...sampleOrder().data, clientId: null, call: [], procedures: [], procedureText: " ",
    signatureDataUrl: "", consentConfirmed: false };
  assert.deepEqual(missingForStep(1, form), ["cliente"]);
  assert.deepEqual(missingForStep(2, form), ["tipo de atendimento", "procedimento"]);
  assert.deepEqual(missingForStep(3, form), ["confirmação", "assinatura"]);
  // Equipment and defects are no longer required.
  const simplified = { ...sampleOrder().data, equipmentDescription: "", defects: [], defectText: "",
    procedures: [], procedureText: "Foi realizada a manutenção preventiva na loja e na casa de máquinas." };
  assert.deepEqual(missingForStep(2, simplified), []);
  const complete = sampleOrder().data;
  for (const candidate of [complete, simplified]) {
    for (const step of [1, 2, 3]) {
      assert.equal(missingForStep(step, candidate).length === 0, formCanContinue(step, candidate), `step ${step} agrees with formCanContinue`);
    }
  }
});

test("exports the month to CSV without spreadsheet formulas", () => {
  const csv = monthCsv([sampleOrder({ equipment: "=HYPERLINK(\"http://x\")" })]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.match(csv, /"Filtro sujo; Borracha da porta rasgada\. Filtro saturado"/);
});

test("names catalog parts and months consistently", () => {
  assert.equal(catalogPartLabel("Fluidos refrigerantes", "R-22"), "Fluido R-22");
  assert.equal(catalogPartLabel("Fluidos refrigerantes", "Nitrogênio"), "Nitrogênio");
  assert.equal(catalogPartLabel("Elétrica e comando", "Contator"), "Contator");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(clientReportFilename('Sol Nascente / Centro', "2026-10"), "Relatorio Sol Nascente Centro 10-2026.pdf");
});

test("keeps the new screens free of placeholder glyph icons and old logo files", async () => {
  const app = await readAppSources();
  assert.doesNotMatch(app, /["'>](⌂|◎|◷|↻|⚙|＋)["'<]/);
  assert.doesNotMatch(app, /tecnoramos-logo-clean\.png/);
  assert.match(app, /\/brand\/logo-tecnoramos\.svg/);
});

test("shows reports to administrators only", async () => {
  const [shell, app] = await Promise.all([
    readFile(new URL("../app/ui/shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TecnoramosApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /id: "reports", label: "Relatórios", icon: "chart", adminOnly: true/);
  assert.match(shell, /const bottomItems = items\.filter/);
  assert.match(shell, /bottomItems\.length < 4 &&/);
  assert.match(app, /screen === "reports" && account\.role === "admin"/);
  assert.match(app, /onMonthlyReport=\{account\.role === "admin" \?/);
});

test("adds office review marks without touching signed orders", async () => {
  const [migration, ordersRoute, exportRoute, schema] = await Promise.all([
    readFile(new URL("../drizzle/0003_order_reviews.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE `order_reviews`/);
  assert.doesNotMatch(migration, /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i, "the migration only adds");
  assert.match(schema, /sqliteTable\(\s*"order_reviews"/);
  assert.match(ordersRoute, /LEFT JOIN order_reviews ON order_reviews\.order_id = orders\.id/);
  assert.match(ordersRoute, /INSERT OR IGNORE INTO order_reviews/);
  assert.match(ordersRoute, /DELETE FROM order_reviews WHERE order_id = \?/);
  assert.doesNotMatch(ordersRoute, /UPDATE orders SET reviewed/i);
  assert.match(ordersRoute, /"order\.reviewed"/);
  // PATCH (trash, restore, review) stays admin-only.
  assert.match(ordersRoute, /export async function PATCH[\s\S]*?requireAdmin\(request\)/);
  assert.match(exportRoute, /"order_reviews"/);
});

test("no longer requires equipment or the call description", async () => {
  const ordersRoute = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ordersRoute, /!equipment\b/);
  assert.deepEqual(serviceTypes, ["Manutenção preventiva", "Manutenção corretiva"]);
  assert.match(PREVENTIVE_PROCEDURE_TEXT, /manutenção preventiva na loja e na casa de máquinas/);
  assert.ok(!commonParts.some((part) => /fluido|R-\d/i.test(part)), "refrigerants are not offered as parts");
  assert.ok(commonParts.includes("Sem utilização de peças"));
  assert.ok(commonParts.length <= 15, "only the most used parts");
});

test("shows service type and parts for the monthly closing", () => {
  const order = sampleOrder({ equipment: "", data: { ...sampleOrder().data, equipmentDescription: "",
    parts: ["Contator", "Outro"], partOther: "1 porca 3/8 fornecida pela Tecnoramos" } });
  assert.equal(orderSubtitle(order), "Manutenção preventiva");
  assert.equal(orderSubtitle(sampleOrder()), "Câmara de congelados", "older orders keep their equipment");
  assert.equal(serviceTypeOf({ call: ["Não liga"], callOther: "" }), "Não liga");
  assert.deepEqual(orderParts(order.data), ["Contator", "1 porca 3/8 fornecida pela Tecnoramos"]);
  assert.deepEqual(orderParts(sampleOrder().data), [], "'no parts' is not listed as a material");
  const materials = materialsSummary([order, sampleOrder({ id: "x", data: { ...sampleOrder().data, parts: ["Contator"] } })]);
  assert.deepEqual(materials[0], { label: "Contator", count: 2 });
  assert.match(monthCsv([order]), /"Contator; 1 porca 3\/8 fornecida pela Tecnoramos"/);
});

test("prints free-text defects and procedures without a stray 'Não informado'", async () => {
  const { describeService } = await import("../app/ui/insights.ts");
  assert.equal(describeService([], "", "Foi realizada a manutenção preventiva."), "Foi realizada a manutenção preventiva.");
  assert.equal(describeService(["Filtro sujo"], "", "Trocado"), "Filtro sujo. Trocado");
  assert.equal(describeService([], "", ""), "Não informado");
  const preview = await readFile(new URL("../app/ui/os-preview.tsx", import.meta.url), "utf8");
  assert.match(preview, /const detail = \(items: string\[\], other: string, text: string\) => describeService\(/);
});

test("expires drafts untouched for 24 hours on the server and on the phone", async () => {
  const hour = 60 * 60 * 1000;
  const now = 1_000 * hour;
  assert.equal(isDraftExpired({ updatedAt: now - 23 * hour }, now), false);
  assert.equal(isDraftExpired({ updatedAt: now - 25 * hour }, now), true);
  const old = { id: "x", clientRequestId: "x", userId: "u", clientId: null, clientName: "", data: {}, step: 1,
    status: "sync_pending", createdAt: 0, updatedAt: now - 30 * hour };
  assert.deepEqual(mergeDrafts([], [old], now), [], "an old offline draft is not brought back");
  const [route, app] = await Promise.all([
    readFile(new URL("../app/api/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/TecnoramosApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /const DRAFT_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /DELETE FROM drafts WHERE updated_at < \?/);
  assert.equal((route.match(/await expireDrafts\(\);/g) ?? []).length, 2, "GET and PUT expire old drafts");
  assert.doesNotMatch(route, /DELETE FROM orders/);
  assert.match(app, /filter\(\(draft\) => !isDraftExpired\(draft\)\)/);
});
