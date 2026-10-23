"use client";

import { useState } from "react";
import type { AppUser, Client, DraftRecord, MonthCycleState, OrderRecord } from "../types";
import { dayKey, formatDate, greeting, orderTimestamp } from "./format";
import { isInstalledApp, useNow } from "./hooks";
import { Icon } from "./icons";
import { DraftList, OrderList } from "./orders";
import { CountUp, EmptyState, ProgressBar, SectionHeader } from "./primitives";

export function HomeScreen({
  account,
  orders,
  drafts,
  clients,
  monthCycle,
  onStartOrder,
  onResume,
  onDiscard,
  onSelectOrder,
  onOpenHistory,
  onToggleMonthClient,
  onResetMonthCompletions,
}: {
  account: AppUser;
  orders: OrderRecord[];
  drafts: DraftRecord[];
  clients: Client[];
  monthCycle: MonthCycleState;
  onStartOrder: (client?: Client) => void;
  onResume: (draft: DraftRecord) => void;
  onDiscard: (draft: DraftRecord) => void;
  onSelectOrder: (order: OrderRecord) => void;
  onOpenHistory: () => void;
  onToggleMonthClient: (clientName: string, completed: boolean) => void;
  onResetMonthCompletions: () => void;
}) {
  const now = useNow();
  const [managing, setManaging] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);
  const [installed] = useState(isInstalledApp);
  const isAdmin = account.role === "admin";
  const firstName = (account.displayName || account.username).split(" ")[0];
  const today = dayKey(now);
  const doneToday = orders.filter((order) => order.status !== "sync_pending" && dayKey(orderTimestamp(order)) === today);
  const completedNames = new Set(monthCycle.completions.map((item) => item.clientName));
  const doneThisCycle = clients.filter((client) => completedNames.has(client.name)).length;
  const pendingClients = clients.filter((client) => !completedNames.has(client.name));
  const visiblePending = showAllPending ? pendingClients : pendingClients.slice(0, 8);
  const dateLabel = formatDate(now, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="screen home-screen">
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-date">{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</p>
          <h1>{greeting(now)}, {firstName}.</h1>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>Finalizadas hoje</span>
            <strong><CountUp value={doneToday.length} /></strong>
          </div>
          <div className="hero-stat">
            <span>Em andamento</span>
            <strong><CountUp value={drafts.length} /></strong>
          </div>
          <div className="hero-stat hero-stat-wide">
            <span>Preventivas do mês</span>
            <strong><CountUp value={doneThisCycle} /><small>/{clients.length}</small></strong>
            <ProgressBar value={doneThisCycle} max={clients.length} label="Preventivas concluídas no mês" />
          </div>
        </div>
      </section>

      <div className="screen-body">
        {drafts.length > 0 && (
          <section className="card">
            <SectionHeader title="Em andamento" count={drafts.length} />
            <DraftList drafts={drafts} account={account} onResume={onResume} onDiscard={onDiscard} />
          </section>
        )}

        <section className="card">
          <SectionHeader
            title={`Preventivas · ${monthCycle.cycle?.label ?? "mês atual"}`}
            action={isAdmin ? (
              <button className="text-button" type="button" onClick={() => setManaging((current) => !current)}>
                {managing ? "Concluir" : "Gerenciar"}
              </button>
            ) : undefined}
          />
          {!managing && (
            pendingClients.length ? (
              <>
                <p className="card-lead">
                  {pendingClients.length === 1 ? "Falta 1 estabelecimento" : `Faltam ${pendingClients.length} estabelecimentos`}.
                  {" "}Toque para abrir a OS.
                </p>
                <div className="client-chips">
                  {visiblePending.map((client) => (
                    <button key={client.id} type="button" className="client-chip" onClick={() => onStartOrder(client)}>
                      {client.name}
                      <Icon name="plus" size={15} />
                    </button>
                  ))}
                  {pendingClients.length > 8 && (
                    <button type="button" className="client-chip client-chip-more" onClick={() => setShowAllPending((current) => !current)}>
                      {showAllPending ? "Mostrar menos" : `+${pendingClients.length - 8}`}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="card-lead card-lead-done"><Icon name="check" size={18} /> Todos os estabelecimentos foram atendidos neste ciclo.</p>
            )
          )}
          {managing && isAdmin && (
            <div className="month-manager">
              <p className="card-lead">Marque ou desmarque manualmente. Desmarcar não apaga nenhuma OS.</p>
              <div className="month-grid">
                {clients.map((client) => {
                  const completed = completedNames.has(client.name);
                  return (
                    <label key={client.id} className={`month-item ${completed ? "done" : ""}`}>
                      <input type="checkbox" checked={completed} onChange={(event) => onToggleMonthClient(client.name, event.target.checked)} />
                      <span className="month-box"><Icon name="check" size={14} strokeWidth={2.4} /></span>
                      <span>{client.name}</span>
                    </label>
                  );
                })}
              </div>
              <button className="button button-ghost" type="button" onClick={onResetMonthCompletions}>
                <Icon name="restore" size={17} /> Começar novo ciclo
              </button>
            </div>
          )}
        </section>

        <section className="card">
          <SectionHeader
            title="Últimas OS"
            action={orders.length > 0 ? (
              <button className="text-button" type="button" onClick={onOpenHistory}>
                Histórico <Icon name="arrowRight" size={16} />
              </button>
            ) : undefined}
          />
          {orders.length ? (
            <OrderList orders={orders.slice(0, 5)} onSelect={onSelectOrder} showDate />
          ) : (
            <EmptyState
              icon="clipboard"
              title="Nenhuma OS registrada ainda"
              text="A primeira ordem de serviço aparece aqui assim que for finalizada."
              action={<button className="button button-primary" type="button" onClick={() => onStartOrder()}>Nova OS</button>}
            />
          )}
        </section>

        {!installed && (
          <aside className="install-hint">
            <Icon name="phone" size={22} />
            <div>
              <strong>Use como aplicativo</strong>
              <p>No Android, menu ⋮ → “Instalar aplicativo”. No iPhone, Compartilhar → “Adicionar à Tela de Início”.</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
