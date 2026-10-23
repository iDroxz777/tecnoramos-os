"use client";

import { AnimatePresence, m } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from "react";
import { PREVENTIVE_PROCEDURE_TEXT, commonParts, serviceTypes } from "../data";
import {
  MAX_NOTES_LENGTH,
  MAX_SERVICE_TEXT_LENGTH,
  formCanContinue,
  missingForStep,
  normalizeName,
} from "../domain";
import { initialForm, type AppUser, type Client, type DraftRecord, type FormState, type OrderRecord } from "../types";
import { formatDate, formatOrderNumber, initials, orderTimestamp } from "./format";
import { Icon } from "./icons";
import {
  NO_PARTS,
  describeService,
  formHasServiceContent,
  orderParts,
  orderSubtitle,
  previousOrdersForClient,
  reuseOrderFields,
  serviceTypeOf,
} from "./insights";
import { SearchField } from "./primitives";

export function normalizeForm(value: Partial<FormState> | null | undefined): FormState {
  return {
    ...initialForm,
    ...(value ?? {}),
    clientId: value?.clientId ? String(value.clientId) : null,
    technicianIds: Array.isArray(value?.technicianIds) ? value.technicianIds.map(String) : [],
    technicians: Array.isArray(value?.technicians) ? value.technicians.map(String) : [],
    consentConfirmed: Boolean(value?.consentConfirmed),
    signedAt: value?.signedAt ? Number(value.signedAt) : null,
  };
}

export function NewOrder({
  draft,
  setDraft,
  clients,
  technicians,
  orders,
  correctionOf,
  onPersist,
  onDiscard,
  onComplete,
  onClose,
}: {
  draft: DraftRecord;
  setDraft: Dispatch<SetStateAction<DraftRecord | null>>;
  clients: Client[];
  technicians: AppUser[];
  orders: OrderRecord[];
  correctionOf: OrderRecord | null;
  onPersist: (draft: DraftRecord, announce?: boolean) => void;
  onDiscard: () => void;
  onComplete: (draft: DraftRecord) => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState("Salvamento automático");
  const form = normalizeForm(draft.data);
  const step = draft.step;
  const activeClient = clients.find((client) => client.id === form.clientId);
  const missing = missingForStep(step, form);

  const updateForm = (next: FormState | ((current: FormState) => FormState)) => {
    setSaveLabel("Salvando…");
    setDraft((current) => {
      if (!current) return current;
      const currentForm = normalizeForm(current.data);
      const value = typeof next === "function" ? next(currentForm) : next;
      return {
        ...current,
        clientId: value.clientId,
        clientName: clients.find((client) => client.id === value.clientId)?.name ?? current.clientName,
        data: value,
        updatedAt: Date.now(),
      };
    });
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onPersist(draft);
      setSaveLabel(navigator.onLine ? "Rascunho salvo" : "Salvo neste aparelho");
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [draft.data, draft.step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const next = async () => {
    if (!formCanContinue(step, form)) return;
    if (step < 3) {
      setDraft((current) => current ? { ...current, step: current.step + 1, updatedAt: Date.now() } : current);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSaving(true);
    try {
      await onComplete({ ...draft, data: form });
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Não foi possível finalizar a OS.");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    onPersist({ ...draft, data: form }, true);
    onClose();
  };

  const stepNames = ["Cliente", "Atendimento", "Assinatura"];
  return (
    <div className="flow">
      <header className="flow-head">
        <button className="icon-button" type="button" onClick={close} aria-label="Fechar e manter rascunho">
          <Icon name="close" />
        </button>
        <div className="flow-title">
          <span>{correctionOf ? `Correção da ${formatOrderNumber(correctionOf.orderNumber)}` : "Nova ordem de serviço"}</span>
          <strong>{activeClient?.name || "Escolha o cliente"}</strong>
        </div>
        <button className="save-state" type="button" onClick={() => onPersist({ ...draft, data: form }, true)}>
          <Icon name={saveLabel === "Salvando…" ? "sync" : "cloudCheck"} size={16} className={saveLabel === "Salvando…" ? "spin" : undefined} />
          <span>{saveLabel}</span>
        </button>
      </header>

      <nav className="stepper" aria-label="Etapas da OS">
        {stepNames.map((name, index) => {
          const number = index + 1;
          const state = step === number ? "active" : step > number ? "done" : "";
          return (
            <button
              key={name}
              type="button"
              className={`stepper-item ${state}`}
              aria-current={step === number ? "step" : undefined}
              onClick={() => {
                if (number < step) setDraft((current) => current ? { ...current, step: number } : current);
              }}
            >
              <span className="stepper-bar" />
              <span className="stepper-label">
                <i>{step > number ? <Icon name="check" size={12} strokeWidth={2.6} /> : number}</i>
                {name}
              </span>
            </button>
          );
        })}
      </nav>

      {correctionOf && (
        <div className="callout callout-blue flow-callout">
          <strong>Nova revisão</strong> A versão original fica preservada no histórico. O cliente precisa assinar de novo.
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <m.main
          key={step}
          className="flow-body"
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.2 }}
        >
          {step === 1 && <SelectClient form={form} setForm={updateForm} clients={clients} />}
          {step === 2 && (
            <ServiceDetails
              form={form}
              setForm={updateForm}
              client={activeClient}
              previousOrders={correctionOf ? [] : previousOrdersForClient(orders, form.clientId)}
            />
          )}
          {step === 3 && <Signature form={form} setForm={updateForm} client={activeClient} technicians={technicians} />}
        </m.main>
      </AnimatePresence>

      <footer className="flow-foot">
        <button
          className="button button-ghost"
          type="button"
          onClick={() => step > 1
            ? setDraft((current) => current ? { ...current, step: current.step - 1 } : current)
            : onDiscard()}
        >
          {step > 1 ? <><Icon name="chevronLeft" size={18} /> Voltar</> : "Descartar"}
        </button>
        <span className="flow-missing" aria-live="polite">
          {missing.length ? `Falta: ${missing.join(", ")}` : step === 3 ? "Tudo pronto para finalizar" : `Etapa ${step} de 3`}
        </span>
        <button className="button button-primary" type="button" disabled={!formCanContinue(step, form) || saving} onClick={() => void next()}>
          {saving ? "Salvando…" : step === 3 ? <><Icon name="check" size={18} /> Finalizar OS</> : <>Continuar <Icon name="chevronRight" size={18} /></>}
        </button>
      </footer>
    </div>
  );
}

function SelectClient({
  form,
  setForm,
  clients,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  clients: Client[];
}) {
  const [query, setQuery] = useState("");
  const results = clients.filter((client) => normalizeName(client.name).includes(normalizeName(query)));
  return (
    <section className="flow-section">
      <h1>Qual estabelecimento?</h1>
      <p className="flow-lead">Escolha o cliente atendido. O equipamento é informado na próxima etapa.</p>
      <SearchField value={query} onChange={setQuery} placeholder="Buscar estabelecimento" />
      <div className="pick-list">
        {results.map((client) => {
          const selected = form.clientId === client.id;
          return (
            <button
              type="button"
              key={client.id}
              className={`pick-item ${selected ? "selected" : ""}`}
              aria-pressed={selected}
              onClick={() => setForm({ ...form, clientId: client.id })}
            >
              <span className="client-mark">{initials(client.name)}</span>
              <strong>{client.name}</strong>
              <span className="pick-check"><Icon name={selected ? "check" : "chevronRight"} size={18} /></span>
            </button>
          );
        })}
        {!results.length && <p className="muted-line">Nenhum estabelecimento com esse nome.</p>}
      </div>
    </section>
  );
}

function FieldCard({
  number,
  title,
  hint,
  done,
  optional = false,
  children,
}: {
  number: number;
  title: string;
  hint?: string;
  done: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`field-card ${done ? "done" : ""}`}>
      <header>
        <span className="field-number">{done ? <Icon name="check" size={14} strokeWidth={2.6} /> : number}</span>
        <div>
          <h2>{title}{optional && <small>Opcional</small>}</h2>
          {hint && <p>{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function OptionChips({
  items,
  values,
  onToggle,
  single = false,
  label = (item) => item,
}: {
  items: string[];
  values: string[];
  onToggle: (item: string) => void;
  single?: boolean;
  label?: (item: string) => string;
}) {
  return (
    <div className={`option-chips ${single ? "option-chips-single" : ""}`} role={single ? "radiogroup" : undefined}>
      {items.map((item) => {
        const selected = values.includes(item);
        return (
          <button
            key={item}
            type="button"
            className={`option-chip ${selected ? "selected" : ""}`}
            role={single ? "radio" : undefined}
            aria-checked={single ? selected : undefined}
            aria-pressed={single ? undefined : selected}
            onClick={() => onToggle(item)}
          >
            <Icon name={selected ? "check" : single ? "chevronRight" : "plus"} size={15} strokeWidth={2.2} />
            {label(item)}
          </button>
        );
      })}
    </div>
  );
}

function TextArea({
  label,
  placeholder,
  value,
  onChange,
  max = MAX_SERVICE_TEXT_LENGTH,
  rows,
}: {
  label?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  max?: number;
  rows?: number;
}) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <textarea
        value={value}
        maxLength={max}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ? undefined : placeholder}
      />
      <small className="field-counter">{value.length}/{max}</small>
    </label>
  );
}

function ServiceDetails({
  form,
  setForm,
  client,
  previousOrders,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  client?: Client;
  previousOrders: OrderRecord[];
}) {
  const [reusedFrom, setReusedFrom] = useState<OrderRecord | null>(null);
  const serviceType = form.call.find((item) => serviceTypes.includes(item)) ?? "";
  const legacyCall = form.call.length > 0 && !serviceType;

  const chooseServiceType = (type: string) => {
    const text = form.procedureText.trim();
    const isDefault = !text || text === PREVENTIVE_PROCEDURE_TEXT;
    let procedureText = form.procedureText;
    // Preventive visits start from the standard sentence; the technician
    // completes it. Switching away only clears it if nothing was added.
    if (type === serviceTypes[0] && !text) procedureText = `${PREVENTIVE_PROCEDURE_TEXT} `;
    if (type !== serviceTypes[0] && isDefault) procedureText = "";
    setForm({ ...form, call: [type], callOther: "", procedureText });
  };

  const toggleNoParts = form.parts.includes(NO_PARTS);
  const togglePart = (part: string) => {
    if (part === NO_PARTS) {
      setForm({ ...form, parts: toggleNoParts ? [] : [NO_PARTS], partOther: toggleNoParts ? form.partOther : "" });
      return;
    }
    const next = form.parts.includes(part)
      ? form.parts.filter((item) => item !== part)
      : [...form.parts.filter((item) => item !== NO_PARTS), part];
    setForm({ ...form, parts: next });
  };
  // Free text is stored as the "Outro" part, so PDFs and reports read it as before.
  const changeOtherParts = (partOther: string) => {
    const withoutOther = form.parts.filter((item) => item !== "Outro" && (partOther.trim() ? item !== NO_PARTS : true));
    setForm({ ...form, partOther, parts: partOther.trim() ? [...withoutOther, "Outro"] : withoutOther });
  };
  const extraParts = form.parts.filter((part) => !commonParts.includes(part) && part !== "Outro");

  const reuse = (order: OrderRecord) => {
    if (formHasServiceContent(form) && !window.confirm(
      "Substituir o tipo de atendimento, o procedimento e as peças já preenchidos pelos dados desta OS?",
    )) return;
    setForm(reuseOrderFields(form, order));
    setReusedFrom(order);
  };

  return (
    <section className="flow-section flow-section-wide">
      <h1>Detalhes do atendimento</h1>
      <p className="flow-lead">{client?.name}. Escolha o tipo, conte o que encontrou e o que foi feito.</p>

      {previousOrders.length > 0 && !reusedFrom && (
        <section className="reuse-card">
          <header>
            <Icon name="history" size={18} />
            <div>
              <h2>Visitas anteriores neste cliente</h2>
              <p>Use uma OS anterior como base: tipo, procedimento e peças são copiados. Defeitos, horários e assinatura ficam em branco.</p>
            </div>
          </header>
          <div className="reuse-list">
            {previousOrders.map((order) => (
              <button key={order.id} type="button" className="reuse-item" onClick={() => reuse(order)}>
                <span className="reuse-date">{formatDate(orderTimestamp(order), { day: "2-digit", month: "2-digit" })}</span>
                <span className="reuse-text">
                  <strong>{orderSubtitle(order)}</strong>
                  <span>{order.data.procedureText || describeService(order.data.procedures, order.data.procedureOther, "").replace(/^Não informado$/, "")}</span>
                </span>
                <span className="reuse-action">Usar</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {reusedFrom && (
        <div className="callout callout-blue">
          <Icon name="check" size={16} />
          <span>Dados copiados da {formatOrderNumber(reusedFrom.orderNumber)}. Confira antes de continuar.</span>
          <button type="button" className="text-button" onClick={() => setReusedFrom(null)}>Ver outras</button>
        </div>
      )}

      <FieldCard number={1} title="Tipo de atendimento" done={Boolean(serviceType)}>
        <OptionChips
          items={serviceTypes}
          values={serviceType ? [serviceType] : []}
          onToggle={chooseServiceType}
          label={(item) => item.replace("Manutenção p", "P").replace("Manutenção c", "C")}
          single
        />
        {legacyCall && (
          <p className="muted-line">Este rascunho começou na versão anterior ({describeService(form.call, form.callOther, "")}). Escolha o tipo acima.</p>
        )}
      </FieldCard>

      <FieldCard number={2} title="Defeitos constatados" hint="O que foi encontrado no local" done={Boolean(form.defectText.trim() || form.defects.length)} optional>
        <TextArea
          placeholder="Ex.: micromotor do balcão de frios travado, dreno da câmara obstruído"
          value={form.defectText}
          onChange={(defectText) => setForm({ ...form, defectText })}
        />
      </FieldCard>

      <FieldCard number={3} title="Procedimento realizado" hint="O que foi feito e como o equipamento ficou" done={Boolean(form.procedureText.trim() || form.procedures.length)}>
        <TextArea
          placeholder={serviceType === serviceTypes[0]
            ? "Complete com o que mais foi feito"
            : "Ex.: trocado o micromotor do balcão de frios, equipamento testado e funcionando"}
          value={form.procedureText}
          onChange={(procedureText) => setForm({ ...form, procedureText })}
          rows={4}
        />
      </FieldCard>

      <FieldCard number={4} title="Peças e materiais" hint="Toque nas mais usadas e escreva o resto abaixo" done={form.parts.length > 0} optional>
        <OptionChips items={commonParts} values={form.parts} onToggle={togglePart} />
        {extraParts.length > 0 && (
          <div className="extra-parts">
            <span>Também nesta OS:</span>
            {extraParts.map((part) => (
              <button key={part} type="button" className="option-chip selected" onClick={() => togglePart(part)} aria-label={`Remover ${part}`}>
                {part}
                <Icon name="close" size={14} strokeWidth={2.2} />
              </button>
            ))}
          </div>
        )}
        <TextArea
          label="Outras peças e detalhes"
          placeholder="Quantidade, medida e quem forneceu. Ex.: 1 mangueira capilar 1/4, fornecida pela Tecnoramos"
          value={form.partOther}
          onChange={changeOtherParts}
          max={500}
          rows={2}
        />
      </FieldCard>

      <FieldCard number={5} title="Observações finais" hint="Recomendações, retorno necessário ou recado ao cliente" done={Boolean(form.notes.trim())} optional>
        <TextArea
          placeholder="Ex.: recomendado trocar a borracha da porta na próxima visita"
          value={form.notes}
          onChange={(notes) => setForm({ ...form, notes })}
          max={MAX_NOTES_LENGTH}
        />
      </FieldCard>
    </section>
  );
}

function Signature({
  form,
  setForm,
  client,
  technicians,
}: {
  form: FormState;
  setForm: (form: FormState) => void;
  client?: Client;
  technicians: AppUser[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !form.signatureDataUrl) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = form.signatureDataUrl;
  }, [form.signatureDataUrl]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const position = point(event);
    const context = canvasRef.current?.getContext("2d");
    if (position && context) {
      context.beginPath();
      context.moveTo(position.x, position.y);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const position = point(event);
    const context = canvasRef.current?.getContext("2d");
    if (position && context) {
      context.lineWidth = 3;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#0B1B44";
      context.lineTo(position.x, position.y);
      context.stroke();
    }
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      setForm({
        ...form,
        signatureDataUrl: canvas.toDataURL("image/png"),
        signedAt: Date.now(),
      });
    }
  };
  const clear = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setForm({ ...form, signatureDataUrl: "", signedAt: null, consentConfirmed: false });
  };
  const toggleTechnician = (technician: AppUser) => {
    const selected = form.technicianIds.includes(technician.id);
    const nextIds = selected
      ? form.technicianIds.filter((id) => id !== technician.id)
      : [...form.technicianIds, technician.id];
    const names = nextIds
      .map((id) => technicians.find((item) => item.id === id))
      .filter((item): item is AppUser => Boolean(item))
      .map((item) => item.displayName || item.username);
    setForm({ ...form, technicianIds: nextIds, technicians: names });
  };
  const currentTime = () => new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <section className="flow-section">
      <h1>Horários e assinatura</h1>
      <p className="flow-lead">Revise o resumo com o cliente antes de pedir a assinatura.</p>

      <dl className="review-card">
        <div><dt>Cliente</dt><dd>{client?.name}</dd></div>
        {form.equipmentDescription && <div><dt>Equipamento</dt><dd>{form.equipmentDescription}</dd></div>}
        <div><dt>Atendimento</dt><dd>{serviceTypeOf(form) || "—"}</dd></div>
        <div><dt>Procedimento</dt><dd>{describeService(form.procedures, form.procedureOther, form.procedureText)}</dd></div>
        <div><dt>Peças</dt><dd>{orderParts(form).join("; ") || "Sem utilização de peças"}</dd></div>
      </dl>

      <FieldCard number={1} title="Técnicos responsáveis" hint="Selecione uma ou mais pessoas" done={form.technicians.some((name) => name.trim())}>
        <div className="option-chips">
          {technicians.map((technician) => {
            const selected = form.technicianIds.includes(technician.id);
            return (
              <button type="button" key={technician.id} className={`option-chip ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => toggleTechnician(technician)}>
                <Icon name={selected ? "check" : "plus"} size={15} strokeWidth={2.2} />
                {technician.displayName || technician.username}
              </button>
            );
          })}
        </div>
      </FieldCard>

      <FieldCard number={2} title="Horário do atendimento" done={Boolean(form.arrivalTime && form.departureTime)}>
        <div className="time-grid">
          <label className="field">
            <span>Chegada</span>
            <input type="time" value={form.arrivalTime} onChange={(event) => setForm({ ...form, arrivalTime: event.target.value })} required />
            <button type="button" className="text-button" onClick={() => setForm({ ...form, arrivalTime: currentTime() })}>
              <Icon name="clock" size={15} /> Agora
            </button>
          </label>
          <label className="field">
            <span>Saída</span>
            <input type="time" value={form.departureTime} onChange={(event) => setForm({ ...form, departureTime: event.target.value })} required />
            <button type="button" className="text-button" onClick={() => setForm({ ...form, departureTime: currentTime() })}>
              <Icon name="clock" size={15} /> Agora
            </button>
          </label>
        </div>
      </FieldCard>

      <FieldCard number={3} title="Assinatura digital" hint="Assine com o dedo ou com o mouse. Data e hora são registradas." done={Boolean(form.signatureDataUrl && form.consentConfirmed)}>
        <label className={`consent ${form.consentConfirmed ? "checked" : ""}`}>
          <input
            type="checkbox"
            checked={form.consentConfirmed}
            onChange={(event) => setForm({ ...form, consentConfirmed: event.target.checked })}
          />
          <span className="consent-box"><Icon name="check" size={14} strokeWidth={2.6} /></span>
          <span>Confirmo que revisei as informações acima e que o serviço descrito foi realizado.</span>
        </label>
        <div className="signature-pad">
          <canvas
            ref={canvasRef}
            width={900}
            height={260}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}
            aria-label="Área de assinatura do cliente"
          />
          {!form.signatureDataUrl && <span className="signature-placeholder"><Icon name="pen" size={18} /> Assinatura do cliente</span>}
          <span className="signature-baseline" aria-hidden="true" />
          {form.signatureDataUrl && (
            <button type="button" className="signature-clear" onClick={clear}>
              <Icon name="restore" size={15} /> Limpar
            </button>
          )}
        </div>
      </FieldCard>
    </section>
  );
}
