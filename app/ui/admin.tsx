"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AppUser, AuditRecord, Client } from "../types";
import { readJson } from "./auth";
import { formatDate, initials } from "./format";
import { Icon } from "./icons";
import { Badge, EmptyState, Reveal, SectionHeader } from "./primitives";

type AdminTab = "users" | "clients" | "activity" | "backup";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "users", label: "Equipe" },
  { id: "clients", label: "Clientes" },
  { id: "activity", label: "Atividades" },
  { id: "backup", label: "Exportação" },
];

export function AdminScreen({
  currentUser,
  onUsersChanged,
  onClientsChanged,
  notify,
}: {
  currentUser: AppUser;
  onUsersChanged: () => Promise<void>;
  onClientsChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<AdminTab>("users");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [clientName, setClientName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [userResult, clientResult, auditResult] = await Promise.all([
        readJson<{ users: AppUser[] }>(await fetch("/api/users", { cache: "no-store" })),
        readJson<{ clients: Client[] }>(await fetch("/api/clients?includeArchived=1", { cache: "no-store" })),
        readJson<{ logs: AuditRecord[] }>(await fetch("/api/audit", { cache: "no-store" })),
      ]);
      setUsers(userResult.users);
      setClients(clientResult.clients);
      setLogs(auditResult.logs);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível abrir a administração.");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await readJson(await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, displayName, password }),
      }));
      setUsername("");
      setDisplayName("");
      setPassword("");
      notify("Técnico criado. A troca da senha será exigida no primeiro acesso.");
      await load();
      await onUsersChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível criar o técnico.");
    }
  };

  const userAction = async (
    user: AppUser,
    action: "status" | "role" | "reset-password" | "rename",
  ) => {
    const payload: Record<string, unknown> = { userId: user.id, action };
    if (action === "status") payload.status = user.status === "active" ? "blocked" : "active";
    if (action === "role") payload.role = user.role === "admin" ? "technician" : "admin";
    if (action === "reset-password") {
      const temporary = window.prompt(`Digite uma senha temporária para ${user.displayName || user.username}:`);
      if (!temporary) return;
      payload.password = temporary;
    }
    if (action === "rename") {
      const name = window.prompt("Nome de exibição:", user.displayName || user.username)?.trim();
      if (!name) return;
      payload.displayName = name;
    }
    try {
      await readJson(await fetch("/api/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
      notify("Usuário atualizado.");
      await load();
      await onUsersChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível atualizar o usuário.");
    }
  };

  const createClient = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await readJson(await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: clientName }),
      }));
      setClientName("");
      notify("Cliente cadastrado.");
      await load();
      await onClientsChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível cadastrar o cliente.");
    }
  };

  const clientAction = async (client: Client, action: "rename" | "status") => {
    const payload: Record<string, unknown> = { clientId: client.id, action };
    if (action === "rename") {
      const name = window.prompt("Nome do estabelecimento:", client.name)?.trim();
      if (!name) return;
      payload.name = name;
    } else {
      payload.status = client.status === "active" ? "archived" : "active";
    }
    try {
      await readJson(await fetch("/api/clients", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }));
      notify("Cliente atualizado.");
      await load();
      await onClientsChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível atualizar o cliente.");
    }
  };

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <h1>Administração</h1>
          <p>Equipe, clientes, atividades e cópias de segurança.</p>
        </div>
      </header>
      <div className="screen-body">
        <div className="segmented segmented-tabs" role="tablist" aria-label="Seções da administração">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <section className="card"><p className="muted-line">Carregando…</p></section>
        ) : (
          <>
            {tab === "users" && (
              <div className="admin-layout">
                <form className="card admin-form" onSubmit={createUser}>
                  <SectionHeader title="Cadastrar técnico" />
                  <label className="field"><span>Nome</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Ana" required /></label>
                  <label className="field"><span>Usuário</span><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ex.: ana" autoCapitalize="none" required /></label>
                  <label className="field"><span>Senha temporária</span><input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
                  <button className="button button-primary button-block" type="submit"><Icon name="plus" size={18} /> Criar técnico</button>
                </form>
                <section className="card card-flush">
                  <div className="card-pad"><SectionHeader title="Equipe" count={users.length} /></div>
                  <div className="admin-list">
                    {users.map((user, index) => (
                      <Reveal key={user.id} index={index} className="admin-item">
                        <span className="person-mark">{initials(user.displayName || user.username)}</span>
                        <div className="admin-item-text">
                          <strong>{user.displayName || user.username}</strong>
                          <span>@{user.username} · {user.role === "admin" ? "Administrador" : "Técnico"}</span>
                        </div>
                        <Badge tone={user.status === "active" ? "green" : "gray"}>{user.status === "active" ? "Ativo" : "Bloqueado"}</Badge>
                        <div className="admin-item-actions">
                          <button className="chip-button" type="button" onClick={() => void userAction(user, "rename")}>Renomear</button>
                          <button className="chip-button" type="button" onClick={() => void userAction(user, "reset-password")}>Nova senha</button>
                          <button className="chip-button" type="button" onClick={() => void userAction(user, "role")}>{user.role === "admin" ? "Tornar técnico" : "Tornar admin"}</button>
                          {user.id !== currentUser.id && (
                            <button className="chip-button chip-button-danger" type="button" onClick={() => void userAction(user, "status")}>
                              {user.status === "active" ? "Bloquear" : "Reativar"}
                            </button>
                          )}
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </section>
              </div>
            )}
            {tab === "clients" && (
              <div className="admin-layout">
                <form className="card admin-form" onSubmit={createClient}>
                  <SectionHeader title="Novo cliente" />
                  <label className="field"><span>Nome do estabelecimento</span><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Ex.: Mercado Aurora Centro" required /></label>
                  <button className="button button-primary button-block" type="submit"><Icon name="plus" size={18} /> Cadastrar cliente</button>
                </form>
                <section className="card card-flush">
                  <div className="card-pad"><SectionHeader title="Clientes" count={clients.length} /></div>
                  <div className="admin-list">
                    {clients.map((client, index) => (
                      <Reveal key={client.id} index={index} className="admin-item">
                        <span className="client-mark">{initials(client.name)}</span>
                        <div className="admin-item-text">
                          <strong>{client.name}</strong>
                          <span>{client.status === "active" ? "Disponível para novas OS" : "Arquivado · histórico preservado"}</span>
                        </div>
                        <Badge tone={client.status === "active" ? "green" : "gray"}>{client.status === "active" ? "Ativo" : "Arquivado"}</Badge>
                        <div className="admin-item-actions">
                          <button className="chip-button" type="button" onClick={() => void clientAction(client, "rename")}>Renomear</button>
                          <button className={`chip-button ${client.status === "active" ? "chip-button-danger" : ""}`} type="button" onClick={() => void clientAction(client, "status")}>
                            {client.status === "active" ? "Arquivar" : "Reativar"}
                          </button>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </section>
              </div>
            )}
            {tab === "activity" && (
              <section className="card card-flush">
                <div className="card-pad"><SectionHeader title="Atividades recentes" count={logs.length} /></div>
                {logs.length ? (
                  <ol className="timeline">
                    {logs.map((log) => (
                      <li key={log.id}>
                        <span className="timeline-dot" aria-hidden="true" />
                        <div>
                          <strong>{log.summary}</strong>
                          <span>{log.actorDisplayName || log.actorUsername} · {formatDate(log.createdAt, { dateStyle: "short", timeStyle: "short" })}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <EmptyState icon="history" title="Nenhuma atividade registrada" />}
              </section>
            )}
            {tab === "backup" && (
              <section className="card backup-card">
                <SectionHeader title="Exportar dados" />
                <p className="card-lead">Cópias das ordens, clientes e usuários. Guarde o arquivo de migração em local seguro: ele contém os acessos da equipe.</p>
                <div className="backup-actions">
                  <a className="button button-primary" href="/api/export?format=csv"><Icon name="download" size={18} /> Planilha CSV</a>
                  <a className="button button-ghost" href="/api/export?format=json"><Icon name="download" size={18} /> Backup JSON</a>
                  <a className="button button-ghost" href="/api/export?format=migration"><Icon name="download" size={18} /> Arquivo de migração</a>
                </div>
                <small className="muted-line">Os códigos de sessão nunca fazem parte das exportações.</small>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
