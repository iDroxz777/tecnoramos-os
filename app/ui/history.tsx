"use client";

import { useState } from "react";
import { normalizeName, orderMatchesSearch } from "../domain";
import type { AppUser, OrderRecord } from "../types";
import { dayKey, monthKey, orderTimestamp, plural } from "./format";
import { useNow } from "./hooks";
import { Icon } from "./icons";
import { OrderList } from "./orders";
import { EmptyState, SearchField } from "./primitives";

const PERIODS = [
  { id: "today", label: "Hoje" },
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "month", label: "Este mês" },
  { id: "all", label: "Tudo" },
] as const;

type Period = (typeof PERIODS)[number]["id"];

export function HistoryScreen({
  account,
  orders,
  trashOrders,
  search,
  setSearch,
  onLoadTrash,
  onSelectOrder,
  onSelectTrashOrder,
}: {
  account: AppUser;
  orders: OrderRecord[];
  trashOrders: OrderRecord[];
  search: string;
  setSearch: (value: string) => void;
  onLoadTrash: () => void;
  onSelectOrder: (order: OrderRecord) => void;
  onSelectTrashOrder: (order: OrderRecord) => void;
}) {
  const now = useNow();
  const [period, setPeriod] = useState<Period>("all");
  const [technician, setTechnician] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [onlyPendingReview, setOnlyPendingReview] = useState(false);
  const isAdmin = account.role === "admin";
  const source = showTrash ? trashOrders : orders;
  const technicianNames = [...new Map(
    orders.flatMap((order) => order.technicians).filter(Boolean).map((name) => [normalizeName(name), name] as const),
  ).values()].sort((left, right) => left.localeCompare(right, "pt-BR"));

  const filtered = source.filter((order) => {
    if (!orderMatchesSearch(order, search)) return false;
    if (technician && !order.technicians.some((name) => normalizeName(name) === technician)) return false;
    if (onlyPendingReview && !showTrash && (order.reviewedAt || order.status === "sync_pending")) return false;
    const timestamp = orderTimestamp(order);
    if (period === "today") return dayKey(timestamp) === dayKey(now);
    if (period === "7") return now - timestamp <= 7 * 24 * 60 * 60 * 1000;
    if (period === "30") return now - timestamp <= 30 * 24 * 60 * 60 * 1000;
    if (period === "month") return monthKey(timestamp) === monthKey(now);
    return true;
  });

  const toggleTrash = () => {
    const next = !showTrash;
    setShowTrash(next);
    if (next) onLoadTrash();
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>{showTrash ? "Lixeira" : "Histórico"}</h1>
          <p>{plural(filtered.length, "ordem de serviço", "ordens de serviço")}</p>
        </div>
        {isAdmin && (
          <button className={`button ${showTrash ? "button-primary" : "button-ghost"}`} type="button" onClick={toggleTrash}>
            <Icon name={showTrash ? "chevronLeft" : "trash"} size={17} />
            {showTrash ? "Voltar" : "Lixeira"}
          </button>
        )}
      </header>

      <div className="screen-body">
        <div className="filters">
          <SearchField value={search} onChange={setSearch} placeholder="Número, cliente, equipamento, defeito…" />
          <div className="filter-row">
            <div className="segmented" role="group" aria-label="Período">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={period === item.id ? "active" : ""}
                  aria-pressed={period === item.id}
                  onClick={() => setPeriod(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {isAdmin && !showTrash && (
              <button
                type="button"
                className={`filter-toggle ${onlyPendingReview ? "active" : ""}`}
                aria-pressed={onlyPendingReview}
                onClick={() => setOnlyPendingReview((current) => !current)}
              >
                <Icon name="check" size={15} strokeWidth={2.4} /> Só a conferir
              </button>
            )}
            {technicianNames.length > 1 && (
              <label className="select-field">
                <Icon name="user" size={16} />
                <select value={technician} onChange={(event) => setTechnician(event.target.value)} aria-label="Filtrar por técnico">
                  <option value="">Todos os técnicos</option>
                  {technicianNames.map((name) => (
                    <option key={name} value={normalizeName(name)}>{name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {showTrash && (
          <p className="callout">
            OS na lixeira continuam guardadas e podem ser restauradas. Nada aqui é apagado definitivamente.
          </p>
        )}

        <section className="card card-flush">
          {filtered.length ? (
            <OrderList
              orders={filtered}
              onSelect={showTrash ? onSelectTrashOrder : onSelectOrder}
              trash={showTrash}
              groupByDay
              now={now}
            />
          ) : (
            <EmptyState
              icon={showTrash ? "trash" : "history"}
              title={showTrash ? "A lixeira está vazia" : "Nenhuma OS encontrada"}
              text={search || technician || period !== "all" || onlyPendingReview ? "Tente outro filtro ou busca." : "As OS finalizadas aparecem aqui."}
            />
          )}
        </section>
      </div>
    </div>
  );
}
