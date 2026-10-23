"use client";

import type { AppUser, DraftRecord, OrderRecord } from "../types";
import {
  dayLabel,
  formatDate,
  formatDuration,
  formatOrderNumber,
  formatTime,
  minutesBetween,
  orderTimestamp,
} from "./format";
import { Icon } from "./icons";
import { describeService, orderParts, orderSubtitle, serviceTypeOf } from "./insights";
import { Badge, Reveal, Sheet } from "./primitives";

function statusBadge(order: OrderRecord, trash: boolean) {
  if (order.status === "sync_pending") return <Badge tone="amber">Aguardando envio</Badge>;
  if (trash) return <Badge tone="gray">Na lixeira</Badge>;
  return <Badge tone="green">Concluída</Badge>;
}

export function OrderRow({
  order,
  onSelect,
  trash = false,
  showDate = false,
}: {
  order: OrderRecord;
  onSelect: (order: OrderRecord) => void;
  trash?: boolean;
  showDate?: boolean;
}) {
  const technicians = order.technicians.filter(Boolean).join(", ");
  return (
    <button type="button" className="order-row" onClick={() => onSelect(order)}>
      <span className="order-row-top">
        <span className="os-number">{formatOrderNumber(order.orderNumber)}</span>
        {order.revisionNumber > 1 && <span className="revision">Rev. {order.revisionNumber}</span>}
        <span className="order-row-time">
          {showDate && `${formatDate(orderTimestamp(order), { day: "2-digit", month: "2-digit" })} · `}
          {order.arrivalTime}–{order.departureTime}
        </span>
      </span>
      <strong className="order-row-client">{order.clientName}</strong>
      <span className="order-row-meta">
        <span className="order-row-equipment">{orderSubtitle(order)}</span>
        {technicians && <span className="order-row-techs">{technicians}</span>}
      </span>
      <span className="order-row-side">
        {order.reviewedAt && !trash ? <Badge tone="blue">Conferida</Badge> : statusBadge(order, trash)}
        <Icon name="chevronRight" size={18} />
      </span>
    </button>
  );
}

export function OrderList({
  orders,
  onSelect,
  trash = false,
  groupByDay = false,
  now = 0,
  showDate = false,
}: {
  orders: OrderRecord[];
  onSelect: (order: OrderRecord) => void;
  trash?: boolean;
  groupByDay?: boolean;
  now?: number;
  showDate?: boolean;
}) {
  if (!groupByDay) {
    return (
      <div className="order-list">
        {orders.map((order, index) => (
          <Reveal key={order.id} index={index}>
            <OrderRow order={order} onSelect={onSelect} trash={trash} showDate={showDate} />
          </Reveal>
        ))}
      </div>
    );
  }
  const groups: { label: string; orders: OrderRecord[] }[] = [];
  for (const order of orders) {
    const label = dayLabel(orderTimestamp(order), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.orders.push(order);
    else groups.push({ label, orders: [order] });
  }
  let index = 0;
  return (
    <div className="order-groups">
      {groups.map((group) => (
        <section key={group.label} className="order-group">
          <h3 className="order-group-label">
            {group.label}
            <span>{group.orders.length}</span>
          </h3>
          <div className="order-list">
            {group.orders.map((order) => (
              <Reveal key={order.id} index={index++}>
                <OrderRow order={order} onSelect={onSelect} trash={trash} />
              </Reveal>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function OrderSheet({
  order,
  account,
  trash = false,
  onClose,
  onOpenPdf,
  onShare,
  onToggleReview,
  onCorrect,
  onTrash,
  onRestore,
}: {
  order: OrderRecord | null;
  account: AppUser;
  trash?: boolean;
  onClose: () => void;
  onOpenPdf: (order: OrderRecord) => void;
  onShare: (order: OrderRecord) => void;
  onToggleReview: (order: OrderRecord, reviewed: boolean) => void;
  onCorrect: (order: OrderRecord) => void;
  onTrash: (order: OrderRecord) => void;
  onRestore?: (order: OrderRecord) => void;
}) {
  const isAdmin = account.role === "admin";
  const pending = order?.status === "sync_pending";
  return (
    <Sheet
      open={Boolean(order)}
      onClose={onClose}
      title={order ? formatOrderNumber(order.orderNumber) : ""}
      subtitle={order ? order.clientName : undefined}
      footer={order && !pending ? (
        <div className="sheet-actions">
          {!trash && (
            <>
              <button className="button button-primary" type="button" onClick={() => onOpenPdf(order)}>
                <Icon name="file" size={18} /> Ver PDF
              </button>
              <button className="button button-whatsapp" type="button" onClick={() => onShare(order)}>
                <Icon name="chat" size={18} /> Enviar
              </button>
            </>
          )}
          {trash && isAdmin && onRestore && (
            <button className="button button-primary" type="button" onClick={() => onRestore(order)}>
              <Icon name="restore" size={18} /> Restaurar OS
            </button>
          )}
        </div>
      ) : undefined}
    >
      {order && (
        <div className="order-detail">
          <div className="order-detail-status">
            {statusBadge(order, trash)}
            {order.revisionNumber > 1 && <Badge tone="blue">Revisão {order.revisionNumber}</Badge>}
            {order.reviewedAt && <Badge tone="blue">Conferida</Badge>}
          </div>
          {isAdmin && !trash && !pending && (
            <button
              type="button"
              className={`review-toggle ${order.reviewedAt ? "reviewed" : ""}`}
              role="checkbox"
              aria-checked={Boolean(order.reviewedAt)}
              onClick={() => onToggleReview(order, !order.reviewedAt)}
            >
              <span className="review-check" aria-hidden="true"><Icon name="check" size={16} strokeWidth={2.6} /></span>
              <span>
                <strong>{order.reviewedAt ? "Conferida" : "Marcar como conferida"}</strong>
                <small>
                  {order.reviewedAt
                    ? `Por ${order.reviewedBy ?? "administrador"} em ${formatDate(order.reviewedAt, { day: "2-digit", month: "2-digit" })}. Toque para desmarcar.`
                    : "Para o controle de quem confere as OS. Não altera a OS."}
                </small>
              </span>
            </button>
          )}
          <dl className="detail-grid">
            {order.equipment && <div className="full"><dt>Equipamento</dt><dd>{order.equipment}</dd></div>}
            {!order.equipment && <div className="full"><dt>Atendimento</dt><dd>{serviceTypeOf(order.data) || "—"}</dd></div>}
            <div>
              <dt>Data</dt>
              <dd>{formatDate(orderTimestamp(order), { day: "2-digit", month: "short", year: "numeric" })}</dd>
            </div>
            <div>
              <dt>Horário</dt>
              <dd>
                {order.arrivalTime} às {order.departureTime}
                <small>{formatDuration(minutesBetween(order.arrivalTime, order.departureTime))}</small>
              </dd>
            </div>
            <div className="full"><dt>Técnicos</dt><dd>{order.technicians.filter(Boolean).join(", ") || "—"}</dd></div>
            {order.equipment && (
              <div className="full">
                <dt>Chamado</dt>
                <dd>{describeService(order.data.call, order.data.callOther, order.data.callText)}</dd>
              </div>
            )}
            {(order.data.defectText || order.data.defects?.length > 0) && (
              <div className="full">
                <dt>Defeitos</dt>
                <dd>{describeService(order.data.defects, order.data.defectsOther, order.data.defectText)}</dd>
              </div>
            )}
            <div className="full">
              <dt>Procedimento</dt>
              <dd>{describeService(order.data.procedures, order.data.procedureOther, order.data.procedureText)}</dd>
            </div>
            <div className="full">
              <dt>Peças e materiais</dt>
              <dd>{orderParts(order.data).join("; ") || "Sem utilização de peças"}</dd>
            </div>
            <div className="full">
              <dt>Finalizada por</dt>
              <dd>
                {order.completedByDisplayName || order.completedBy}
                {!pending && <small>às {formatTime(orderTimestamp(order))}</small>}
              </dd>
            </div>
            {order.correctionReason && (
              <div className="full"><dt>Motivo da correção</dt><dd>{order.correctionReason}</dd></div>
            )}
            {trash && order.deletionReason && (
              <div className="full"><dt>Motivo da remoção</dt><dd>{order.deletionReason}</dd></div>
            )}
          </dl>
          {pending && (
            <p className="callout callout-amber">
              Esta OS está salva neste aparelho e será enviada assim que houver internet. O PDF fica disponível depois do envio.
            </p>
          )}
          {isAdmin && !trash && !pending && (
            <div className="detail-admin">
              <button className="text-button" type="button" onClick={() => onCorrect(order)}>
                <Icon name="edit" size={17} /> Corrigir OS
              </button>
              <button className="text-button text-button-danger" type="button" onClick={() => onTrash(order)}>
                <Icon name="trash" size={17} /> Mover para a lixeira
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function DraftList({
  drafts,
  account,
  onResume,
  onDiscard,
}: {
  drafts: DraftRecord[];
  account: AppUser;
  onResume: (draft: DraftRecord) => void;
  onDiscard: (draft: DraftRecord) => void;
}) {
  return (
    <div className="draft-list">
      {drafts.map((draft, index) => {
        const canDiscard = draft.userId === account.id || account.role === "admin";
        return (
          <Reveal key={draft.clientRequestId} index={index} className="draft-card">
            <button type="button" className="draft-main" onClick={() => onResume(draft)}>
              <span className="draft-step" aria-hidden="true">
                {[1, 2, 3].map((step) => <i key={step} className={step <= draft.step ? "done" : ""} />)}
              </span>
              <strong>{draft.clientName || "Cliente ainda não escolhido"}</strong>
              <span className="draft-meta">
                {draft.data.equipmentDescription || `Etapa ${draft.step} de 3`}
              </span>
              <span className="draft-owner">
                {draft.status === "sync_pending" && <Badge tone="amber">Só neste aparelho</Badge>}
                {draft.ownerName ? `${draft.ownerName} · ` : ""}{formatTime(draft.updatedAt)}
              </span>
            </button>
            <div className="draft-actions">
              <button className="button button-primary button-small" type="button" onClick={() => onResume(draft)}>
                Continuar
              </button>
              {canDiscard && (
                <button className="icon-button icon-button-danger" type="button" onClick={() => onDiscard(draft)} aria-label="Descartar rascunho">
                  <Icon name="trash" size={18} />
                </button>
              )}
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
