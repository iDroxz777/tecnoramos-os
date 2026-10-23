"use client";

import { useState } from "react";
import { normalizeName } from "../domain";
import type { Client, MonthCycleState, OrderRecord } from "../types";
import { formatDate, formatDuration, formatOrderNumber, initials, monthKey, orderTimestamp, plural } from "./format";
import { useNow } from "./hooks";
import { Icon } from "./icons";
import { clientProfile, materialsSummary, monthLabel, orderParts, orderSubtitle, shiftMonth } from "./insights";
import { OrderList } from "./orders";
import { Badge, EmptyState, ProgressBar, Reveal, SearchField, SectionHeader } from "./primitives";

export function ClientsScreen({
  clients,
  orders,
  monthCycle,
  search,
  setSearch,
  onOpenClient,
}: {
  clients: Client[];
  orders: OrderRecord[];
  monthCycle: MonthCycleState;
  search: string;
  setSearch: (value: string) => void;
  onOpenClient: (client: Client) => void;
}) {
  const completedNames = new Set(monthCycle.completions.map((item) => item.clientName));
  const query = normalizeName(search);
  const filtered = clients.filter((client) => normalizeName(client.name).includes(query));
  const stats = new Map<string, { count: number; last: number }>();
  for (const order of orders) {
    if (!order.clientId || order.status === "sync_pending") continue;
    const entry = stats.get(order.clientId) ?? { count: 0, last: 0 };
    entry.count += 1;
    entry.last = Math.max(entry.last, order.finalizedAt || order.createdAt);
    stats.set(order.clientId, entry);
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Clientes</h1>
          <p>{plural(clients.length, "estabelecimento ativo", "estabelecimentos ativos")}</p>
        </div>
      </header>
      <div className="screen-body">
        <SearchField value={search} onChange={setSearch} placeholder="Buscar estabelecimento" />
        <section className="card card-flush">
          {filtered.length ? (
            <div className="client-list">
              {filtered.map((client, index) => {
                const entry = stats.get(client.id);
                const done = completedNames.has(client.name);
                return (
                  <Reveal key={client.id} index={index}>
                    <button type="button" className="client-row" onClick={() => onOpenClient(client)}>
                      <span className="client-mark">{initials(client.name)}</span>
                      <span className="client-row-text">
                        <strong>{client.name}</strong>
                        <span>
                          {entry
                            ? `Última visita ${formatDate(entry.last, { day: "2-digit", month: "2-digit" })} · ${plural(entry.count, "OS", "OS")}`
                            : "Nenhuma OS registrada"}
                        </span>
                      </span>
                      <Badge tone={done ? "green" : "gray"}>{done ? "Preventiva feita" : "Pendente"}</Badge>
                      <Icon name="chevronRight" size={18} />
                    </button>
                  </Reveal>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="store" title="Nenhum cliente encontrado" text="Confira o nome ou peça ao administrador para cadastrar." />
          )}
        </section>
      </div>
    </div>
  );
}

type ReviewFilter = "all" | "parts" | "pending";

export function ClientDetailScreen({
  client,
  orders,
  monthCycle,
  isAdmin,
  onBack,
  onStartOrder,
  onSelectOrder,
  onToggleReview,
  onMonthlyReport,
  reportBusy,
}: {
  client: Client;
  orders: OrderRecord[];
  monthCycle: MonthCycleState;
  isAdmin: boolean;
  onBack: () => void;
  onStartOrder: (client: Client) => void;
  onSelectOrder: (order: OrderRecord) => void;
  onToggleReview: (order: OrderRecord, reviewed: boolean) => void;
  /** Only administrators get the monthly client report. */
  onMonthlyReport?: (client: Client, month: string) => void;
  reportBusy: boolean;
}) {
  const now = useNow();
  const currentMonth = monthKey(now);
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const profile = clientProfile(orders, client.id, client.name);
  const monthOrders = profile.orders
    .filter((order) => monthKey(orderTimestamp(order)) === month)
    .sort((left, right) => (left.orderNumber ?? 0) - (right.orderNumber ?? 0));
  const withParts = monthOrders.filter((order) => orderParts(order.data).length > 0);
  const reviewed = monthOrders.filter((order) => order.reviewedAt);
  const visible = filter === "parts" ? withParts : filter === "pending" ? monthOrders.filter((order) => !order.reviewedAt) : monthOrders;
  const materials = materialsSummary(monthOrders);
  const done = monthCycle.completions.some((item) => item.clientName === client.name);

  return (
    <div className="screen">
      <header className="screen-head screen-head-detail">
        <button className="icon-button" type="button" onClick={onBack} aria-label="Voltar para clientes">
          <Icon name="chevronLeft" />
        </button>
        <div>
          <h1>{client.name}</h1>
          <p>
            <Badge tone={done ? "green" : "gray"}>{done ? "Preventiva do mês feita" : "Preventiva do mês pendente"}</Badge>
          </p>
        </div>
      </header>
      <div className="screen-body">
        <div className="detail-actions">
          <button className="button button-primary" type="button" onClick={() => onStartOrder(client)}>
            <Icon name="plus" size={18} /> Nova OS
          </button>
          {onMonthlyReport && (
            <button className="button button-ghost" type="button" disabled={reportBusy || !monthOrders.length} onClick={() => onMonthlyReport(client, month)}>
              <Icon name="download" size={18} /> {reportBusy ? "Gerando…" : `Relatório de ${monthLabel(month).split(" ")[0].toLowerCase()}`}
            </button>
          )}
        </div>

        <section className="card closing">
          <div className="closing-head">
            <SectionHeader title="Fechamento do mês" />
            <div className="month-switcher month-switcher-inline">
              <button className="icon-button" type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
                <Icon name="chevronLeft" />
              </button>
              <strong>{monthLabel(month)}</strong>
              <button className="icon-button" type="button" disabled={month === currentMonth} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
                <Icon name="chevronRight" />
              </button>
            </div>
          </div>

          {monthOrders.length ? (
            <>
              <div className="closing-summary">
                <span><strong>{monthOrders.length}</strong> {monthOrders.length === 1 ? "OS" : "OS"}</span>
                <span><strong>{withParts.length}</strong> com peças</span>
                {isAdmin && <span><strong>{reviewed.length}</strong> de {monthOrders.length} conferidas</span>}
              </div>
              {isAdmin && <ProgressBar value={reviewed.length} max={monthOrders.length} label="OS conferidas no mês" />}

              <div className="segmented closing-filter" role="group" aria-label="Filtrar OS do mês">
                {([
                  ["all", "Todas"],
                  ["parts", "Com peças"],
                  ...(isAdmin ? [["pending", "A conferir"]] : []),
                ] as [ReviewFilter, string][]).map(([id, label]) => (
                  <button key={id} type="button" className={filter === id ? "active" : ""} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>

              <ol className="closing-list">
                {visible.map((order) => {
                  const parts = orderParts(order.data);
                  return (
                    <li key={order.id} className={`closing-item ${order.reviewedAt ? "reviewed" : ""}`}>
                      {isAdmin && (
                        <button
                          type="button"
                          className="review-check"
                          role="checkbox"
                          aria-checked={Boolean(order.reviewedAt)}
                          aria-label={order.reviewedAt ? `Desmarcar ${formatOrderNumber(order.orderNumber)} como conferida` : `Marcar ${formatOrderNumber(order.orderNumber)} como conferida`}
                          onClick={() => onToggleReview(order, !order.reviewedAt)}
                        >
                          <Icon name="check" size={16} strokeWidth={2.6} />
                        </button>
                      )}
                      <button type="button" className="closing-main" onClick={() => onSelectOrder(order)}>
                        <span className="closing-top">
                          <span className="os-number">{formatOrderNumber(order.orderNumber)}</span>
                          <span className="order-row-time">{formatDate(orderTimestamp(order), { day: "2-digit", month: "2-digit" })} · {order.arrivalTime}–{order.departureTime}</span>
                        </span>
                        <span className="closing-type">{orderSubtitle(order)}</span>
                        {parts.length ? (
                          <span className="closing-parts"><Icon name="box" size={15} /> {parts.join(" · ")}</span>
                        ) : (
                          <span className="closing-parts closing-parts-none">Sem peças</span>
                        )}
                        {isAdmin && order.reviewedAt && (
                          <span className="closing-reviewed">Conferida por {order.reviewedBy ?? "administrador"} em {formatDate(order.reviewedAt, { day: "2-digit", month: "2-digit" })}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
              {!visible.length && <p className="muted-line">Nenhuma OS neste filtro.</p>}

              {materials.length > 0 && (
                <div className="closing-materials">
                  <h3>Materiais do mês</h3>
                  <ul>
                    {materials.map((item) => (
                      <li key={item.label}><span>{item.label}</span><strong>{item.count}×</strong></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon="calendar" title={`Nenhuma OS em ${monthLabel(month).toLowerCase()}`} text="Use as setas para ver outro mês." />
          )}
        </section>

        <div className="stat-row">
          <div className="stat">
            <span>Total de OS</span>
            <strong>{profile.orders.length}</strong>
          </div>
          <div className="stat">
            <span>Última visita</span>
            <strong className="stat-text">{profile.lastVisit ? formatDate(profile.lastVisit, { day: "2-digit", month: "short" }) : "—"}</strong>
          </div>
          <div className="stat">
            <span>Tempo médio</span>
            <strong className="stat-text">{formatDuration(profile.averageMinutes)}</strong>
          </div>
          <div className="stat">
            <span>OS este mês</span>
            <strong>{profile.orders.filter((order) => monthKey(orderTimestamp(order)) === currentMonth).length}</strong>
          </div>
        </div>

        <section className="card card-flush">
          <div className="card-pad">
            <SectionHeader title="Todas as OS" count={profile.orders.length} />
          </div>
          {profile.orders.length ? (
            <OrderList orders={profile.orders} onSelect={onSelectOrder} groupByDay now={now} />
          ) : (
            <EmptyState icon="clipboard" title="Nenhuma OS para este cliente" text="Abra a primeira pelo botão Nova OS." />
          )}
        </section>
      </div>
    </div>
  );
}
