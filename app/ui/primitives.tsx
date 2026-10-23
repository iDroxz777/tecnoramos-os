"use client";

import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SyncState } from "../types";
import { Icon, type IconName } from "./icons";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="sheet-layer">
          <m.div
            className="sheet-backdrop"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <m.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`sheet ${wide ? "sheet-wide" : ""}`}
            initial={{ y: 56, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 34, stiffness: 380, mass: 0.8 }}
          >
            <span className="sheet-grip" aria-hidden="true" />
            <header className="sheet-head">
              <div>
                <h2>{title}</h2>
                {subtitle && <p>{subtitle}</p>}
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">
                <Icon name="close" />
              </button>
            </header>
            <div className="sheet-body">{children}</div>
            {footer && <footer className="sheet-foot">{footer}</footer>}
          </m.section>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="search-field">
      <Icon name="search" size={18} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar busca">
          <Icon name="close" size={16} />
        </button>
      )}
    </label>
  );
}

export type BadgeTone = "green" | "amber" | "red" | "blue" | "gray";

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function SyncPill({ state, pending = 0 }: { state: SyncState; pending?: number }) {
  const label = state === "syncing"
    ? "Sincronizando"
    : state === "offline"
      ? pending ? `${pending} aguardando internet` : "Sem internet"
      : pending ? `${pending} aguardando envio` : "Sincronizado";
  const icon: IconName = state === "syncing" ? "sync" : state === "offline" ? "cloudOff" : "cloudCheck";
  return (
    <span className={`sync-pill sync-pill-${state}`} role="status" title={label}>
      <Icon name={icon} size={16} className={state === "syncing" ? "spin" : undefined} />
      <span>{label}</span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={22} /></span>
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <h2>
        {title}
        {typeof count === "number" && <span className="count">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/** Counts up to a number once, unless the user prefers reduced motion. */
export function CountUp({ value, duration = 650 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = value;
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(origin + (value - origin) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{shown}</>;
}

export function BarList({
  items,
  valueLabel,
  emptyText,
}: {
  items: { label: string; value: number; hint?: string }[];
  valueLabel?: (value: number) => string;
  emptyText: string;
}) {
  if (!items.length) return <p className="muted-line">{emptyText}</p>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ol className="bar-list">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="bar-list-row">
            <span className="bar-list-label">{item.label}</span>
            <span className="bar-list-value">{valueLabel ? valueLabel(item.value) : item.value}</span>
          </div>
          <span className="bar-track">
            <m.span
              className="bar-fill"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: item.value / max }}
              transition={{ duration: 0.55, delay: Math.min(index, 8) * 0.04, ease: [0.2, 0.7, 0.2, 1] }}
            />
          </span>
          {item.hint && <small className="bar-list-hint">{item.hint}</small>}
        </li>
      ))}
    </ol>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const ratio = max ? Math.min(1, value / max) : 0;
  return (
    <span className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <m.span
        className="progress-fill"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: ratio }}
        transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
      />
    </span>
  );
}

/** Fades and lifts list items in, capped so long lists do not feel slow. */
export function Reveal({ index = 0, children, className }: { index?: number; children: ReactNode; className?: string }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, 10) * 0.025 }}
    >
      {children}
    </m.div>
  );
}
