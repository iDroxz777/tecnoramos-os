"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { AppUser } from "../types";
import { FullLogo } from "./brand";
import { Icon } from "./icons";

export async function readJson<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({ error: "Não foi possível concluir esta operação." }));
  if (!response.ok) {
    throw new Error((result as { error?: string }).error || "Não foi possível concluir esta operação.");
  }
  return result as T;
}

function AuthLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <main className="auth">
      <section className="auth-aside">
        <FullLogo tone="light" className="auth-aside-logo" />
        <div className="auth-aside-copy">{aside}</div>
        <small>CNPJ 00.000.000/0001-00</small>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <FullLogo className="auth-card-logo" />
          {children}
        </div>
      </section>
    </main>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  minLength,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minLength?: number;
  placeholder?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-with-action">
        <input
          type={visible ? "text" : "password"}
          minLength={minLength}
          maxLength={128}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "Esconder senha" : "Mostrar senha"}>
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </span>
    </label>
  );
}

export function AuthScreen({
  canBootstrap,
  onAccess,
}: {
  canBootstrap: boolean;
  onAccess: (user: AppUser) => void;
}) {
  const [username, setUsername] = useState(canBootstrap ? "admin" : "");
  const [displayName, setDisplayName] = useState(canBootstrap ? "Administrador" : "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: canBootstrap ? "register" : "login",
          username,
          displayName,
          password,
        }),
      });
      const result = await readJson<{ user: AppUser }>(response);
      onAccess(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível acessar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      aside={(
        <>
          <h1>Ordens de serviço da equipe Tecnoramos.</h1>
          <p>Do chamado à assinatura do cliente, no celular, mesmo quando a internet cai.</p>
        </>
      )}
    >
      <form onSubmit={submit} className="auth-form">
        <h2>{canBootstrap ? "Configuração inicial" : "Entrar"}</h2>
        <p className="auth-lead">
          {canBootstrap
            ? "Primeiro acesso: crie a conta administradora da empresa."
            : "Use o usuário e a senha que o administrador passou para você."}
        </p>
        {canBootstrap && (
          <label className="field">
            <span>Nome de exibição</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Carlos" required />
          </label>
        )}
        <label className="field">
          <span>Usuário</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Ex.: carlos"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </label>
        <PasswordInput
          label="Senha"
          value={password}
          onChange={setPassword}
          minLength={canBootstrap ? 8 : 1}
          placeholder={canBootstrap ? "Mínimo de 8 caracteres" : "Sua senha"}
          autoComplete={canBootstrap ? "new-password" : "current-password"}
        />
        {error && <div className="form-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}
        <button className="button button-primary button-block" type="submit" disabled={submitting}>
          {submitting ? "Entrando…" : canBootstrap ? "Criar administrador" : "Entrar"}
        </button>
        <small className="auth-note">Não tem acesso? Peça ao administrador da Tecnoramos.</small>
      </form>
    </AuthLayout>
  );
}

export function PasswordChange({
  user,
  onChanged,
  onLogout,
}: {
  user: AppUser;
  onChanged: (user: AppUser) => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await readJson<{ user: AppUser }>(await fetch("/api/auth", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      }));
      onChanged(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível trocar a senha.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      aside={(
        <>
          <h1>Proteja sua conta.</h1>
          <p>Antes de começar, troque a senha temporária por uma senha só sua.</p>
        </>
      )}
    >
      <form onSubmit={submit} className="auth-form">
        <h2>Crie sua senha</h2>
        <p className="auth-lead">Olá, {user.displayName || user.username}. A senha temporária deixa de valer e as outras sessões são encerradas.</p>
        <PasswordInput label="Senha temporária" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
        <PasswordInput label="Nova senha" value={newPassword} onChange={setNewPassword} minLength={8} placeholder="Mínimo de 8 caracteres" autoComplete="new-password" />
        <PasswordInput label="Confirmar nova senha" value={confirmation} onChange={setConfirmation} minLength={8} autoComplete="new-password" />
        {error && <div className="form-error" role="alert"><Icon name="alert" size={16} /> {error}</div>}
        <button className="button button-primary button-block" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Trocar senha e continuar"}
        </button>
        <button className="button button-ghost button-block" type="button" onClick={onLogout}>Sair desta conta</button>
      </form>
    </AuthLayout>
  );
}
