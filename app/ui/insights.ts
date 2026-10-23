import type { FormState, OrderRecord } from "../types";
import { normalizeName } from "../domain.ts";
import { formatDate, minutesBetween, monthKey, orderTimestamp } from "./format.ts";

export const NO_PARTS = "Sem utilização de peças";

/** Selected quick options plus the free text, as printed on the PDF. */
export function describeService(items: string[] = [], other = "", text = "") {
  const selected = items.filter((item) => item !== "Outro");
  if (items.includes("Outro") && other) selected.push(other);
  const first = selected.join("; ");
  if (first && text) return `${first}. ${text}`;
  return first || text || "Não informado";
}

export type Ranked = { label: string; count: number };

export type PeriodSummary = {
  total: number;
  clientsServed: number;
  totalMinutes: number;
  averageMinutes: number | null;
  byTechnician: { name: string; count: number; minutes: number }[];
  byClient: { name: string; count: number; lastAt: number }[];
  topDefects: Ranked[];
  topParts: Ranked[];
  topCalls: Ranked[];
};

/** Orders that count for reports: synchronized ones only. */
export function completedOrders(orders: OrderRecord[]) {
  return orders.filter((order) => order.status !== "sync_pending");
}

export function ordersInMonth(orders: OrderRecord[], month: string) {
  return completedOrders(orders).filter((order) => monthKey(orderTimestamp(order)) === month);
}

/** Replaces "Outro" with what the technician wrote, so it can be counted. */
function expandOther(items: string[], other: string) {
  const values = items.filter((item) => item !== "Outro");
  if (items.includes("Outro") && other.trim()) values.push(other.trim());
  return values;
}

function rank(values: string[], limit: number): Ranked[] {
  const counts = new Map<string, Ranked>();
  for (const value of values) {
    const key = normalizeName(value);
    if (!key) continue;
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label: value, count: 1 });
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "pt-BR"))
    .slice(0, limit);
}

export function summarize(orders: OrderRecord[]): PeriodSummary {
  const list = completedOrders(orders);
  const technicians = new Map<string, { name: string; count: number; minutes: number }>();
  const clients = new Map<string, { name: string; count: number; lastAt: number }>();
  let totalMinutes = 0;
  let timedOrders = 0;

  for (const order of list) {
    const minutes = minutesBetween(order.arrivalTime, order.departureTime);
    if (minutes !== null) {
      totalMinutes += minutes;
      timedOrders += 1;
    }
    for (const name of order.technicians.filter((item) => item.trim())) {
      const key = normalizeName(name);
      const entry = technicians.get(key) ?? { name, count: 0, minutes: 0 };
      entry.count += 1;
      entry.minutes += minutes ?? 0;
      technicians.set(key, entry);
    }
    const clientKey = order.clientId ?? normalizeName(order.clientName);
    const client = clients.get(clientKey) ?? { name: order.clientName, count: 0, lastAt: 0 };
    client.count += 1;
    client.lastAt = Math.max(client.lastAt, orderTimestamp(order));
    clients.set(clientKey, client);
  }

  return {
    total: list.length,
    clientsServed: clients.size,
    totalMinutes,
    averageMinutes: timedOrders ? totalMinutes / timedOrders : null,
    byTechnician: [...technicians.values()].sort((left, right) => right.count - left.count),
    byClient: [...clients.values()].sort((left, right) => right.count - left.count || right.lastAt - left.lastAt),
    topDefects: rank(list.flatMap((order) => expandOther(order.data.defects ?? [], order.data.defectsOther ?? "")), 6),
    topParts: rank(
      list.flatMap((order) => expandOther(order.data.parts ?? [], order.data.partOther ?? ""))
        .filter((part) => part !== NO_PARTS),
      8,
    ),
    topCalls: rank(list.flatMap((order) => expandOther(order.data.call ?? [], order.data.callOther ?? "")), 6),
  };
}

export type ClientProfile = {
  orders: OrderRecord[];
  lastVisit: number | null;
  averageMinutes: number | null;
  serviceTypes: Ranked[];
  parts: Ranked[];
};

export function clientProfile(orders: OrderRecord[], clientId: string, clientName: string): ClientProfile {
  const own = completedOrders(orders)
    .filter((order) => order.clientId === clientId
      || (!order.clientId && normalizeName(order.clientName) === normalizeName(clientName)))
    .sort((left, right) => orderTimestamp(right) - orderTimestamp(left));
  const summary = summarize(own);
  return {
    orders: own,
    lastVisit: own.length ? orderTimestamp(own[0]) : null,
    averageMinutes: summary.averageMinutes,
    serviceTypes: summary.topCalls,
    parts: summary.topParts,
  };
}

/** Recent orders for a client, newest first, to reuse as a starting point. */
export function previousOrdersForClient(orders: OrderRecord[], clientId: string | null, limit = 3) {
  if (!clientId) return [];
  return completedOrders(orders)
    .filter((order) => order.clientId === clientId)
    .sort((left, right) => orderTimestamp(right) - orderTimestamp(left))
    .slice(0, limit);
}

/**
 * Copies what usually repeats between visits (service type, what was done and
 * materials) from a previous order. Defects, notes, times and the signature
 * always start fresh because they describe this visit only. The equipment
 * field is no longer collected, so it is never carried into a new order.
 */
export function reuseOrderFields(form: FormState, previous: OrderRecord): FormState {
  const data = previous.data;
  const procedureText = data.procedureText
    || describeService(data.procedures ?? [], data.procedureOther ?? "", "").replace(/^Não informado$/, "");
  return {
    ...form,
    equipmentDescription: "",
    // Older orders without a service type leave the choice to the technician.
    call: SERVICE_TYPES.includes(serviceTypeOf(data)) ? [serviceTypeOf(data)] : [],
    callOther: "",
    callText: "",
    procedures: [],
    procedureOther: "",
    procedureText,
    parts: [...(data.parts ?? [])],
    partOther: data.partOther ?? "",
  };
}

const SERVICE_TYPES = ["Manutenção preventiva", "Manutenção corretiva"];

/** "Manutenção preventiva"/"corretiva" when chosen; older orders fall back to their call. */
export function serviceTypeOf(data: Pick<FormState, "call" | "callOther">) {
  const call = data.call ?? [];
  const type = call.find((item) => SERVICE_TYPES.includes(item));
  if (type) return type;
  return describeService(call, data.callOther ?? "", "").replace(/^Não informado$/, "");
}

/** What appears under the client name: the equipment on older orders, the service type on new ones. */
export function orderSubtitle(order: Pick<OrderRecord, "equipment" | "data">) {
  return order.equipment?.trim() || serviceTypeOf(order.data) || "Atendimento";
}

/** Parts and materials as printed on the PDF, without the "no parts" marker. */
export function orderParts(data: Pick<FormState, "parts" | "partOther">) {
  const parts = (data.parts ?? []).filter((part) => part !== "Outro" && part !== NO_PARTS);
  if ((data.parts ?? []).includes("Outro") && data.partOther?.trim()) parts.push(data.partOther.trim());
  return parts;
}

export function formHasServiceContent(form: FormState) {
  return Boolean(
    form.equipmentDescription.trim()
    || form.call.length
    || form.defects.length
    || form.procedures.length
    || form.parts.length
    || form.callText.trim()
    || form.defectText.trim()
    || form.procedureText.trim(),
  );
}

/** Catalog names for refrigerants are stored the same way as the quick buttons. */
export function catalogPartLabel(category: string, item: string) {
  return category === "Fluidos refrigerantes" && /^R-/.test(item) ? `Fluido ${item}` : item;
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthIndex - 1, 15)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function csvCell(value: unknown) {
  let text = String(value ?? "");
  // Spreadsheets run cells that start with these characters as formulas.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function monthCsv(orders: OrderRecord[]) {
  const header = ["OS", "Revisão", "Data", "Cliente", "Atendimento", "Técnicos", "Chegada", "Saída", "Defeitos", "Procedimento", "Peças e materiais", "Finalizada por", "Conferida"];
  const rows = [...orders]
    .sort((left, right) => orderTimestamp(left) - orderTimestamp(right))
    .map((order) => [
      order.orderNumber ?? "",
      order.revisionNumber,
      formatDate(orderTimestamp(order), { dateStyle: "short" }),
      order.clientName,
      orderSubtitle(order),
      order.technicians.join(" + "),
      order.arrivalTime,
      order.departureTime,
      describeService(order.data.defects, order.data.defectsOther, order.data.defectText),
      describeService(order.data.procedures, order.data.procedureOther, order.data.procedureText),
      orderParts(order.data).join("; ") || "Sem utilização de peças",
      order.completedByDisplayName || order.completedBy,
      order.reviewedAt ? `Sim (${order.reviewedBy ?? ""})` : "Não",
    ].map(csvCell).join(","));
  return `﻿${header.map(csvCell).join(",")}\n${rows.join("\n")}`;
}

/** Every part and material used across the given orders, most frequent first. */
export function materialsSummary(orders: OrderRecord[]) {
  return rank(completedOrders(orders).flatMap((order) => orderParts(order.data)), 100);
}
