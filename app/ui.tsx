"use client";

import { ReactNode, useEffect, useState } from "react";
import { Search } from "lucide-react";

export function Panel({
  label,
  title,
  subtitle,
  trailing,
  flush,
  children,
}: {
  label?: string;
  title?: string;
  subtitle?: string;
  trailing?: ReactNode;
  // Rows run edge to edge, so the panel drops its own horizontal padding and
  // each row supplies its own.
  flush?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="ui-panel">
      {(label || title || trailing) && (
        <header className="ui-panel__head">
          <div className="min-w-0">
            {label && <p className="ui-eyebrow">{label}</p>}
            {title && <h2 className="ui-panel__title">{title}</h2>}
            {subtitle && <p className="ui-panel__sub">{subtitle}</p>}
          </div>
          {trailing && <div className="ui-panel__trailing">{trailing}</div>}
        </header>
      )}
      <div className={flush ? "" : "ui-panel__body"}>{children}</div>
    </section>
  );
}

export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  href,
  inset = true,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  // Divider starts past the leading slot so the list reads as one column.
  inset?: boolean;
}) {
  const inner = (
    <>
      {leading && <div className="ui-row__lead">{leading}</div>}
      <div className="ui-row__main">
        <div className="ui-row__title">{title}</div>
        {subtitle && <div className="ui-row__sub">{subtitle}</div>}
      </div>
      {trailing && <div className="ui-row__trail">{trailing}</div>}
    </>
  );
  const className = `ui-row ${inset ? "ui-row--inset" : ""} ${onClick || href ? "ui-row--tappable" : ""}`;
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {inner}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  return <div className={className}>{inner}</div>;
}

export function Dot({ tone }: { tone: "green" | "amber" | "red" | "idle" }) {
  return <span className={`ui-dot ui-dot--${tone}`} aria-hidden="true" />;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <p className="ui-empty__title">{title}</p>
      {hint && <p className="ui-empty__hint">{hint}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}) {
  return (
    <label className="ui-search">
      <span className="sr-only">{label || placeholder}</span>
      <Search className="ui-search__icon" aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function Chips({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="ui-chips">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`ui-chip ${value === option.id ? "is-active" : ""}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`ui-segmented__item ${value === option.id ? "is-active" : ""}`}
        >
          {option.label}
          {option.count !== undefined && (
            <span className="ui-segmented__count">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// Shown once after a PIN reset. The plain PIN exists only in this response —
// it is hashed in the database — so the admin has to hand it over from here.
export function PinDialog({
  pins,
  onClose,
}: {
  pins: { name: string; pin: string }[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const asText = pins.map((entry) => `${entry.name}: ${entry.pin}`).join("\n");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="ui-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="PIN ใหม่"
    >
      <div className="ui-dialog">
        <p className="ui-dialog__message">
          {pins.length > 1
            ? `ตั้ง PIN ใหม่ให้ ${pins.length} คนแล้ว — ส่ง PIN ให้เจ้าตัว แล้วให้เปลี่ยนเองภายหลัง`
            : "ตั้ง PIN ใหม่แล้ว — ส่ง PIN นี้ให้เจ้าตัว แล้วให้เปลี่ยนเองภายหลัง"}
        </p>
        <div className="pin-list">
          {pins.map((entry) => (
            <div key={entry.name} className="pin-list__row">
              <span className="pin-list__name">{entry.name}</span>
              <span className="pin-list__pin">{entry.pin}</span>
            </div>
          ))}
        </div>
        <div className="ui-dialog__actions">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(asText).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            className="ui-btn ui-btn--ghost"
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอกทั้งหมด"}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="ui-btn ui-btn--primary"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

// Replaces window.confirm so the confirmation matches the rest of the app and
// stays usable on a phone. Resolves through the promise the caller is awaiting.
export function ConfirmDialog({
  message,
  busy,
  onResolve,
}: {
  message: string;
  busy: boolean;
  onResolve: (ok: boolean) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onResolve(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);
  return (
    <div
      className="ui-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="ยืนยันการทำรายการ"
    >
      <div className="ui-dialog">
        <p className="ui-dialog__message">{message}</p>
        <div className="ui-dialog__actions">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="ui-btn ui-btn--ghost"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => onResolve(true)}
            className="ui-btn ui-btn--primary"
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog({
  title,
  initial,
  busy,
  maxLength = 60,
  onCancel,
  onSave,
}: {
  title: string;
  initial: string;
  busy: boolean;
  maxLength?: number;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div
      className="ui-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <form
        className="ui-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          const next = value.trim();
          if (next) onSave(next);
        }}
      >
        <p className="ui-dialog__message">{title}</p>
        <input
          autoFocus
          required
          minLength={2}
          maxLength={maxLength}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="ui-input"
        />
        <div className="ui-dialog__actions">
          <button
            type="button"
            onClick={onCancel}
            className="ui-btn ui-btn--ghost"
          >
            ยกเลิก
          </button>
          <button disabled={busy} className="ui-btn ui-btn--primary">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
