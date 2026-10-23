"use client";

import { useState } from "react";
import type { Client, OrderRecord } from "../types";
import { formatDuration, monthKey, plural } from "./format";
import { useNow } from "./hooks";
import { Icon } from "./icons";
import { monthCsv, monthLabel, ordersInMonth, shiftMonth, summarize } from "./insights";
import { BarList, CountUp, EmptyState, SectionHeader } from "./primitives";

export function ReportsScreen({
  orders,
  clients,
  onClientReport,
  onDownloadCsv,
  busyClientId,
}: {
  orders: OrderRecord[];
  clients: Client[];
  onClientReport: (client: Client, month: string) => void;
  onDownloadCsv: (month: string, csv: string) => void;
  busyClientId: string | null;
}) {
  const now = useNow();
  const currentMonth = monthKey(now);
  const [month, setMonth] = useState(currentMonth);
  const [reportClientId, setReportClientId] = useState("");
  const monthOrders = ordersInMonth(orders, month);
  const summary = summarize(monthOrders);
  const servedIds = new Set(monthOrders.map((order) => order.clientId).filter(Boolean));
  const notServed = clients.filter((client) => !servedIds.has(client.id));
  const reportClient = clients.find((client) => client.id === reportClientId);
  const reportClientOrders = reportClient ? monthOrders.filter((order) => order.clientId === reportClient.id) : [];
  const isCurrent = month === currentMonth;
  const reviewedCount = monthOrders.filter((order) => order.reviewedAt).length;
  const pendingByClient = [...monthOrders.filter((order) => !order.reviewedAt).reduce((map, order) => {
    map.set(order.clientName, (map.get(order.clientName) ?? 0) + 1);
    return map;
  }, new Map<string, number>())].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count).slice(0, 8);

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Relatórios</h1>
          <p>Calculados com as OS finalizadas e sincronizadas.</p>
        </div>
      </header>
      <div className="screen-body">
        <div className="month-switcher">
          <button className="icon-button" type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mês anterior">
            <Icon name="chevronLeft" />
          </button>
          <strong>{monthLabel(month)}</strong>
          <button className="icon-button" type="button" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Próximo mês">
            <Icon name="chevronRight" />
          </button>
        </div>

        <div className="stat-row">
          <div className="stat">
            <span>Atendimentos</span>
            <strong><CountUp value={summary.total} /></strong>
          </div>
          <div className="stat">
            <span>Horas em campo</span>
            <strong className="stat-text">{formatDuration(summary.totalMinutes)}</strong>
          </div>
          <div className="stat">
            <span>Tempo médio</span>
            <strong className="stat-text">{formatDuration(summary.averageMinutes)}</strong>
          </div>
          <div className="stat">
            <span>Clientes atendidos</span>
            <strong><CountUp value={summary.clientsServed} /><small>/{clients.length}</small></strong>
          </div>
        </div>

        {summary.total === 0 ? (
          <section className="card">
            <EmptyState icon="chart" title="Nenhuma OS neste mês" text="Escolha outro mês nas setas acima." />
          </section>
        ) : (
          <>
            <div className="two-columns">
              <section className="card">
                <SectionHeader title="Por técnico" />
                <BarList
                  items={summary.byTechnician.map((item) => ({
                    label: item.name,
                    value: item.count,
                    hint: `${formatDuration(item.minutes)} em campo`,
                  }))}
                  valueLabel={(value) => plural(value, "OS", "OS")}
                  emptyText="Sem técnicos registrados."
                />
              </section>
              <section className="card">
                <SectionHeader title="Por cliente" />
                <BarList
                  items={summary.byClient.slice(0, 8).map((item) => ({ label: item.name, value: item.count }))}
                  valueLabel={(value) => plural(value, "OS", "OS")}
                  emptyText="Sem clientes no período."
                />
              </section>
            </div>

            <div className="two-columns">
              <section className="card">
                <SectionHeader title="Conferência do mês" />
                <p className="card-lead">
                  {reviewedCount} de {summary.total} OS conferidas.
                  {summary.total - reviewedCount > 0 ? " Abra a ficha de cada cliente para conferir o resto." : " Tudo conferido."}
                </p>
                <BarList
                  items={pendingByClient.map((item) => ({ label: item.name, value: item.count }))}
                  valueLabel={(value) => `${value} a conferir`}
                  emptyText="Nenhuma OS pendente de conferência."
                />
              </section>
              <section className="card">
                <SectionHeader title="Peças e materiais mais usados" />
                <BarList
                  items={summary.topParts.map((item) => ({ label: item.label, value: item.count }))}
                  valueLabel={(value) => `${value}×`}
                  emptyText="Nenhuma peça utilizada no período."
                />
              </section>
            </div>

            <div className="two-columns">
              <section className="card">
                <SectionHeader title="Tipo de atendimento" />
                <BarList
                  items={summary.topCalls.map((item) => ({ label: item.label, value: item.count }))}
                  valueLabel={(value) => `${value}×`}
                  emptyText="Nenhum atendimento registrado."
                />
              </section>
              <section className="card">
                <SectionHeader title="Sem atendimento no mês" count={notServed.length} />
                {notServed.length ? (
                  <div className="client-chips client-chips-static">
                    {notServed.map((client) => <span key={client.id} className="client-chip">{client.name}</span>)}
                  </div>
                ) : (
                  <p className="card-lead card-lead-done"><Icon name="check" size={18} /> Todos os clientes tiveram pelo menos uma OS.</p>
                )}
              </section>
            </div>
          </>
        )}

        <section className="card report-export">
          <SectionHeader title="Relatório para o cliente" />
          <p className="card-lead">
            PDF com todas as OS do estabelecimento em {monthLabel(month).toLowerCase()}, com o logo da Tecnoramos, para enviar ao cliente.
          </p>
          <div className="report-export-row">
            <label className="select-field select-field-grow">
              <Icon name="store" size={16} />
              <select value={reportClientId} onChange={(event) => setReportClientId(event.target.value)} aria-label="Cliente do relatório">
                <option value="">Escolha o cliente</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <button
              className="button button-primary"
              type="button"
              disabled={!reportClient || !reportClientOrders.length || busyClientId === reportClient?.id}
              onClick={() => reportClient && onClientReport(reportClient, month)}
            >
              <Icon name="download" size={18} />
              {busyClientId && busyClientId === reportClient?.id ? "Gerando…" : "Gerar PDF"}
            </button>
          </div>
          {reportClient && !reportClientOrders.length && (
            <p className="muted-line">{reportClient.name} não tem OS em {monthLabel(month).toLowerCase()}.</p>
          )}
          {reportClient && reportClientOrders.length > 0 && (
            <p className="muted-line">{plural(reportClientOrders.length, "OS entra", "OS entram")} no relatório.</p>
          )}
          <div className="report-export-divider" />
          <button className="button button-ghost" type="button" disabled={!monthOrders.length} onClick={() => onDownloadCsv(month, monthCsv(monthOrders))}>
            <Icon name="download" size={18} /> Planilha do mês (CSV)
          </button>
        </section>
      </div>
    </div>
  );
}
