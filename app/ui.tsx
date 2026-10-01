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
            ? `ตั้ง PIN ใหม่ให้ ${pins.length} คนแล้ว — ส่ง PIN ให้เจ้าตัว แล้วให้เปลี่ยนเองได้ที่ เพิ่มเติม → เปลี่ยน PIN`
            : "ตั้ง PIN ใหม่แล้ว — ส่ง PIN นี้ให้เจ้าตัว แล้วให้เปลี่ยนเองได้ที่ เพิ่มเติม → เปลี่ยน PIN"}
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

// Self-service PIN change. Validates shape locally so the member sees a
// mistake (mismatch, too short) before any request is made.
export function PinChangeDialog({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: (currentPin: string, newPin: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);
  const field = (
    id: string,
    label: string,
    value: string,
    set: (value: string) => void,
    autoFocus = false,
  ) => (
    <label htmlFor={id} className="pin-field">
      <span>{label}</span>
      <input
        id={id}
        autoFocus={autoFocus}
        type="password"
        inputMode="numeric"
        autoComplete={id === "pin-current" ? "current-password" : "new-password"}
        maxLength={6}
        value={value}
        onChange={(event) => {
          set(digits(event.target.value));
          setError("");
        }}
        className="ui-input"
      />
    </label>
  );
  return (
    <div
      className="ui-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="เปลี่ยน PIN"
    >
      <form
        className="ui-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (next.length !== 6) return setError("PIN ใหม่ต้องเป็นตัวเลข 6 หลัก");
          if (next !== confirm) return setError("PIN ใหม่ทั้งสองช่องไม่ตรงกัน");
          if (next === current) return setError("PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม");
          onSave(current, next);
        }}
      >
        <p className="ui-dialog__message">เปลี่ยน PIN</p>
        {field("pin-current", "PIN เดิม", current, setCurrent, true)}
        {field("pin-new", "PIN ใหม่ 6 หลัก", next, setNext)}
        {field("pin-confirm", "ยืนยัน PIN ใหม่", confirm, setConfirm)}
        {error && (
          <p role="alert" className="pin-field__error">
            {error}
          </p>
        )}
        <p className="pin-field__hint">
          อุปกรณ์อื่นที่ล็อกอินบัญชีนี้ไว้จะถูกออกจากระบบ
        </p>
        <div className="ui-dialog__actions">
          <button type="button" onClick={onCancel} className="ui-btn ui-btn--ghost">
            ยกเลิก
          </button>
          <button disabled={busy} className="ui-btn ui-btn--primary">
            บันทึก PIN
          </button>
        </div>
      </form>
    </div>
  );
}

// Discord logo, for the login button and link prompts.
export function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.2.5a18 18 0 0 1 4.4 2.2 15.5 15.5 0 0 0-15.2 0A18 18 0 0 1 8.8 3.5L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9 -.2 13.5.2 18a19.7 19.7 0 0 0 6 3l.8-1.2-1.6-.8.4-.3a14 14 0 0 0 12.4 0l.4.3-1.6.8.8 1.2a19.7 19.7 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.6ZM8.3 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Zm7.4 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.1 1.1 2.1 2.4-.9 2.4-2.1 2.4Z" />
    </svg>
  );
}

// Stands in for a submit form when the member hasn't linked Discord yet.
export function DiscordGate({ what }: { what: string }) {
  return (
    <div className="discord-gate">
      <p>
        ผูกบัญชี Discord ก่อนถึงจะ{what}ได้
      </p>
      <a href="/api/auth/discord?mode=link" className="discord-btn">
        <DiscordMark />
        ผูก Discord ตอนนี้
      </a>
    </div>
  );
}
