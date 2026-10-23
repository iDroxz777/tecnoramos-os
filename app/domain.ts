import type { FormState, OrderRecord } from "./types";

export const MAX_SERVICE_TEXT_LENGTH = 1400;
export const MAX_NOTES_LENGTH = 900;
export const MAX_EQUIPMENT_LENGTH = 180;

export function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function safePdfFilename(establishment: string, timestamp: number) {
  const cleanName = establishment
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Tecnoramos OS";
  const date = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(timestamp)).replace(/\//g, "-");
  return `${cleanName} ${date}.pdf`;
}

export function formCanContinue(step: number, form: FormState) {
  if (step === 1) return Boolean(form.clientId);
  if (step === 2) {
    // Service type (stored in `call`) and what was done. Older drafts that
    // used the quick procedure buttons still count.
    return Boolean(form.call.length && (form.procedureText.trim() || form.procedures.length));
  }
  return Boolean(
    form.technicians.some((name) => name.trim())
    && form.arrivalTime
    && form.departureTime
    && form.signatureDataUrl
    && form.consentConfirmed,
  );
}

/** What still blocks the current step, in the technician's words. */
export function missingForStep(step: number, form: FormState) {
  if (step === 1) return form.clientId ? [] : ["cliente"];
  if (step === 2) {
    return [
      !form.call.length && "tipo de atendimento",
      !form.procedureText.trim() && !form.procedures.length && "procedimento",
    ].filter(Boolean) as string[];
  }
  return [
    !form.technicians.some((name) => name.trim()) && "técnicos",
    !form.arrivalTime && "chegada",
    !form.departureTime && "saída",
    !form.consentConfirmed && "confirmação",
    !form.signatureDataUrl && "assinatura",
  ].filter(Boolean) as string[];
}

export function pdfContentLength(form: FormState) {
  return [
    form.equipmentDescription,
    ...form.call,
    form.callOther,
    form.callText,
    ...form.defects,
    form.defectsOther,
    form.defectText,
    ...form.procedures,
    form.procedureOther,
    form.procedureText,
    ...form.parts,
    form.partOther,
    form.notes,
  ].join(" ").length;
}

export function orderMatchesSearch(order: OrderRecord, search: string) {
  const query = normalizeName(search);
  if (!query) return true;
  const searchable = normalizeName([
    order.orderNumber ? `OS ${order.orderNumber}` : "pendente",
    order.clientName,
    order.equipment,
    ...order.technicians,
    order.completedBy,
    order.data.callText,
    order.data.defectText,
    order.data.procedureText,
  ].join(" "));
  const terms = query.split(" ").filter((term) => term && !["da", "de", "do", "das", "dos"].includes(term));
  return terms.every((term) => searchable.includes(term));
}
