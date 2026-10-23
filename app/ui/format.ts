import type { OrderRecord } from "../types";

export const TIME_ZONE = "America/Sao_Paulo";

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** YYYY-MM-DD in São Paulo time. */
export function dayKey(timestamp: number) {
  return dayKeyFormat.format(new Date(timestamp));
}

/** YYYY-MM in São Paulo time. */
export function monthKey(timestamp: number) {
  return dayKey(timestamp).slice(0, 7);
}

export function orderTimestamp(order: Pick<OrderRecord, "finalizedAt" | "createdAt">) {
  return order.finalizedAt || order.createdAt;
}

export function formatOrderNumber(orderNumber: number | null) {
  return orderNumber ? `OS ${String(orderNumber).padStart(5, "0")}` : "OS pendente";
}

export function formatDate(timestamp: number, options: Intl.DateTimeFormatOptions = { dateStyle: "short" }) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, ...options }).format(new Date(timestamp));
}

export function formatTime(timestamp: number) {
  return formatDate(timestamp, { hour: "2-digit", minute: "2-digit" });
}

/** "Hoje", "Ontem" or a short weekday date, used to group lists by day. */
export function dayLabel(timestamp: number, now: number) {
  const key = dayKey(timestamp);
  if (key === dayKey(now)) return "Hoje";
  if (key === dayKey(now - 24 * 60 * 60 * 1000)) return "Ontem";
  const label = formatDate(timestamp, { weekday: "long", day: "2-digit", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function greeting(now: number) {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(new Date(now)));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Minutes between two "HH:MM" times. A departure earlier than the arrival is
 * read as the next day (night calls); missing or malformed times give null.
 */
export function minutesBetween(arrival: string, departure: string) {
  const parse = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
  };
  const start = parse(arrival);
  const end = parse(departure);
  if (start === null || end === null) return null;
  return end >= start ? end - start : end + 24 * 60 - start;
}

export function formatDuration(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}` : `${hours}h`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
