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

// Discord avatar when the member has linked Discord, otherwise their initial.
export function Avatar({ url, name, size = 28 }: { url?: string | null; name: string; size?: number }) {
  // Remember which URL failed, so a new avatar URL gets a fresh try.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const style = { width: size, height: size };
  // Whole characters (emoji are two code units), skipping Thai leading vowels
  // so "เจ" shows "จ" rather than a lone "เ".
  const chars = Array.from(String(name || "").trim());
  const initial = (chars.find((c) => !/[เ-ไ]/.test(c)) || chars[0] || "?").toUpperCase();
  return url && url !== brokenUrl ? (
    <img src={url} alt="" width={size} height={size} style={style} className="avatar" loading="lazy" onError={() => setBrokenUrl(url)} />
  ) : (
    <span className="avatar avatar--initial" style={style} aria-hidden="true">
      {initial}
    </span>
  );
}
