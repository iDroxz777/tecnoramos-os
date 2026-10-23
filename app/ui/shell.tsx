"use client";

import { useState, type ReactNode } from "react";
import type { AppUser, SyncState } from "../types";
import { BrandLockup } from "./brand";
import { initials } from "./format";
import { Icon, type IconName } from "./icons";
import { Sheet, SyncPill } from "./primitives";

export type Screen = "home" | "history" | "clients" | "reports" | "admin";

const NAV: { id: Screen; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { id: "home", label: "Início", icon: "home" },
  { id: "history", label: "Histórico", icon: "history" },
  { id: "clients", label: "Clientes", icon: "store" },
  { id: "reports", label: "Relatórios", icon: "chart", adminOnly: true },
  { id: "admin", label: "Administração", icon: "sliders", adminOnly: true },
];

export function AppShell({
  account,
  screen,
  syncState,
  pendingCount,
  onNavigate,
  onNewOrder,
  onLogout,
  children,
}: {
  account: AppUser;
  screen: Screen;
  syncState: SyncState;
  pendingCount: number;
  onNavigate: (screen: Screen) => void;
  onNewOrder: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const isAdmin = account.role === "admin";
  const name = account.displayName || account.username;
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);
  // Administration lives in the account menu on phones.
  const bottomItems = items.filter((item) => item.id !== "admin");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><BrandLockup tone="light" /></div>
        <button className="button button-new" type="button" onClick={onNewOrder}>
          <Icon name="plus" size={18} strokeWidth={2.2} /> Nova OS
        </button>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? "active" : ""}
              aria-current={screen === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} size={19} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SyncPill state={syncState} pending={pendingCount} />
          <button type="button" className="sidebar-user" onClick={() => setAccountOpen(true)}>
            <span className="person-mark person-mark-light">{initials(name)}</span>
            <span>
              <strong>{name}</strong>
              <small>{isAdmin ? "Administrador" : "Técnico"}</small>
            </span>
            <Icon name="more" size={18} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <BrandLockup tone="light" compact />
        <div className="topbar-actions">
          <SyncPill state={syncState} pending={pendingCount} />
          <button className="person-mark person-mark-light" type="button" onClick={() => setAccountOpen(true)} aria-label="Conta e configurações">
            {initials(name)}
          </button>
        </div>
      </header>

      <main className="shell-main">{children}</main>

      <nav className="bottom-nav" aria-label="Navegação principal">
        {bottomItems.slice(0, 2).map((item) => (
          <NavButton key={item.id} item={item} active={screen === item.id} onNavigate={onNavigate} />
        ))}
        <button className="bottom-nav-new" type="button" onClick={onNewOrder} aria-label="Nova ordem de serviço">
          <span><Icon name="plus" size={24} strokeWidth={2.3} /></span>
          Nova OS
        </button>
        {bottomItems.slice(2).map((item) => (
          <NavButton key={item.id} item={item} active={screen === item.id} onNavigate={onNavigate} />
        ))}
        {/* Technicians have no reports tab; the account keeps "Nova OS" centered. */}
        {bottomItems.length < 4 && (
          <button type="button" onClick={() => setAccountOpen(true)}>
            <Icon name="user" size={22} />
            Conta
          </button>
        )}
      </nav>

      <Sheet open={accountOpen} onClose={() => setAccountOpen(false)} title={name} subtitle={isAdmin ? "Administrador" : "Técnico"}>
        <div className="account-menu">
          <SyncPill state={syncState} pending={pendingCount} />
          {isAdmin && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setAccountOpen(false);
                onNavigate("admin");
              }}
            >
              <Icon name="sliders" size={20} />
              <span><strong>Administração</strong><small>Equipe, clientes, atividades e exportação</small></span>
              <Icon name="chevronRight" size={18} />
            </button>
          )}
          <button
            type="button"
            className="menu-item menu-item-danger"
            onClick={() => {
              setAccountOpen(false);
              onLogout();
            }}
          >
            <Icon name="logout" size={20} />
            <span><strong>Sair da conta</strong><small>Precisa de internet para encerrar a sessão</small></span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function NavButton({
  item,
  active,
  onNavigate,
}: {
  item: { id: Screen; label: string; icon: IconName };
  active: boolean;
  onNavigate: (screen: Screen) => void;
}) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <Icon name={item.icon} size={22} />
      {item.label}
    </button>
  );
}
