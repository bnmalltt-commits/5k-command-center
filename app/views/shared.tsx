"use client";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Check, Clock, X } from "lucide-react";
import { playFx } from "../three/prefs";

// A 413 from Vercel (body over 4.5 MB) is plain text, not JSON, so a bare
// r.json() threw and the member only saw a generic failure.
export const uploadResult = async (r: Response) =>
  r.json().catch(() => ({
    error:
      r.status === 413
        ? "รูปใหญ่เกินไป ลองใช้รูปที่เล็กลงหรือแคปหน้าจอใหม่"
        : "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
  }));

export type Round = "17:00" | "20:00" | "23:00" | "01:00";
export const ROUNDS: Round[] = ["17:00", "20:00", "23:00", "01:00"];
export type Data = {
  me: {
    id: number;
    name: string;
    role: string;
    score: number;
    monthScore: number;
    monthRank: number | null;
    discordLinked?: boolean;
  };
  date: string;
  members: any[];
  managedMembers: any[];
  airdrops: any[];
  parties: any[];
  favorites: number[];
  leaderboard: any[];
  pending: any[];
  myParty: any;
  partyInvites: any[];
  openParties: any[];
  leaveRequests: any[];
  submissionLog: any[];
  adminParties: any[];
  ledger: any[];
  pointAudit?: any[];
  adminLeaves: any[];
  boards?: Record<string, any[]>;
  monthBoards?: Record<string, any[]>;
  monthTop: any[];
  avatars?: Record<string, string | null>;
  attendance: any[];
  attendanceLeaves: any[];
  teamStatus: any[];
  teamDays: any[];
  // "แต้มของฉัน": {day, category, points, n}, only after that view loads.
  myPoints?: any[];
  // Penalties being paid back with shop runs (lib/penalty.ts OpenPenalty):
  // the member's own, and everyone's for admins.
  myPenalties?: any[];
  openPenalties?: any[] | null;
  // "สรุป" (lib/summary.ts), only after that view loads.
  summary?: any;
  // Team quota: points from shops (+3) and loops (+1) per day.
  team?: {
    start: string;
    pointsStart: string;
    perDay: number;
    penalty: number;
    points: { shop: number; loop: number; airdrop: number };
    mine: { today: number; debt: number; bank: number; neededToday: number } | null;
  };
  pendingCount?: number;
};
// Baseline so every key is always defined even before its view has been
// loaded — lets consumers keep doing `data.submissionLog.map(...)` unguarded.
export const EMPTY_DATA: Omit<Data, "me" | "date" | "myParty"> = {
  members: [],
  managedMembers: [],
  airdrops: [],
  parties: [],
  favorites: [],
  leaderboard: [],
  pending: [],
  partyInvites: [],
  openParties: [],
  leaveRequests: [],
  submissionLog: [],
  adminParties: [],
  ledger: [],
  adminLeaves: [],
  monthTop: [],
  attendance: [],
  attendanceLeaves: [],
  teamStatus: [],
  teamDays: [],
};
const labels: Record<string, string> = {
  pending: "รอตรวจ",
  approved: "ผ่านแล้ว",
  rejected: "ไม่ผ่าน",
};
// Shown the first time a view is opened, while its data is still in flight:
// a grey outline of a list that fades in and out, instead of a bare message.
export function ViewLoading() {
  return (
    <section className="ui-panel" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
      <div className="ui-panel__body space-y-3">
        <span className="skel skel--title" />
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="skel skel--row" />
        ))}
      </div>
    </section>
  );
}

// A small preview of an evidence photo; falls back to the status dot when the
// photo is gone (approved evidence is deleted) or fails to load.
export function Thumb({ imageKey, tone }: { imageKey?: string | null; tone: "green" | "amber" | "red" | "idle" }) {
  const [broken, setBroken] = useState(false);
  if (!imageKey || broken)
    return (
      <span className={`thumb thumb--icon thumb--${tone}`} aria-hidden="true">
        {tone === "green" ? <Check /> : tone === "red" ? <X /> : <Clock />}
      </span>
    );
  return (
    <img
      src={`/api/image/${imageKey}`}
      alt=""
      loading="lazy"
      className={`thumb thumb--${tone}`}
      onError={() => setBroken(true)}
    />
  );
}

// A short burst of confetti with a message, for milestones the member just
// reached (all four rounds, the daily team score, a better rank).
export function Celebration({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    // 3D fireworks behind the message, when the 3D layer is moving.
    playFx("celebrate");
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [message]);
  const colors = ["#f5c542", "#4ade80", "#f87171", "#60a5fa", "#ffffff"];
  return (
    <div className="celebrate" role="status" aria-live="polite" onClick={onDone}>
      <div className="celebrate__burst" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            style={{
              background: colors[i % colors.length],
              left: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 7) * 60}ms`,
              transform: `rotate(${(i * 47) % 360}deg)`,
            }}
          />
        ))}
      </div>
      <p className="celebrate__msg">{message}</p>
    </div>
  );
}
export function Status({ value }: { value: string }) {
  const tone = value === "approved" ? "approved" : value === "rejected" ? "rejected" : "pending";
  return <span className={`status-pill status-pill--${tone}`}>{labels[value] || value}</span>;
}

// A calendar-style day badge for rows that are about one date.
export function DateBadge({ date, today }: { date: string; today?: string }) {
  const day = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return null;
  return (
    <span className={`date-badge ${date === today ? "is-today" : ""}`} title={date}>
      <b>{day.getUTCDate()}</b>
      <small>{day.toLocaleDateString("th-TH", { month: "short", timeZone: "UTC" })}</small>
    </span>
  );
}

// Podium medal: gold, silver or bronze by rank, with a ribbon.
const MEDAL_COLORS: Record<number, [string, string, string]> = {
  1: ["#ffe58a", "#f2b318", "#a8740a"],
  2: ["#f4f7fa", "#b5c0cb", "#6f7b87"],
  3: ["#f5b47a", "#c97632", "#7d4416"],
};
export function Medal({ rank, className }: { rank: number; className?: string }) {
  const [light, mid, dark] = MEDAL_COLORS[rank] || MEDAL_COLORS[3];
  const id = `medal-${rank}`;
  return (
    <svg viewBox="0 0 36 40" className={className} role="img" aria-label={`อันดับ ${rank}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset=".55" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <path d="M10 0h7l-3 12H7z" fill="#c8132a" />
      <path d="M19 0h7l3 12h-7z" fill="#ff4655" />
      <circle cx="18" cy="24" r="14" fill={`url(#${id})`} stroke={dark} strokeWidth="1.2" />
      <circle cx="18" cy="24" r="10" fill="none" stroke="#fff" strokeOpacity=".35" />
      <text x="18" y="29" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1a1205" style={{ fontFamily: "var(--font-display)" }}>
        {rank}
      </text>
    </svg>
  );
}

export const PERIODS = [
  { id: "day", label: "วันนี้", title: "ตารางคะแนนวันนี้" },
  { id: "week", label: "สัปดาห์นี้", title: "ตารางคะแนนสัปดาห์นี้" },
  { id: "month", label: "รายเดือน", title: "ตารางคะแนนรายเดือน" },
  { id: "all", label: "ทั้งหมด", title: "ตารางคะแนนทั้งหมด" },
];
export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
// Counts up to a number when it first appears or changes. Skipped for people
// who ask for less motion.
export const prefersLessMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (prefersLessMotion() ? value : 0));
  const from = useRef(prefersLessMotion() ? value : 0);
  useEffect(() => {
    const start = from.current;
    if (prefersLessMotion() || start === value) {
      setShown(value);
      from.current = value;
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (time: number) => {
      const progress = Math.min(1, (time - began) / 650);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value]);
  return <>{shown}</>;
}

// A glowing progress ring with "value/max" in the middle (team score).
export function Ring({ value, max, size = 68 }: { value: number; max: number; size?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const tone = pct >= 1 ? "done" : pct >= 0.5 ? "half" : "low";
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`score-ring score-ring--${tone}`} style={{ width: size, height: size }} role="img" aria-label={`${value} จาก ${max}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="score-ring__track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="score-ring__fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b className="score-ring__label" aria-hidden="true">
        <CountUp value={value} />
        <small>/{max}</small>
      </b>
    </span>
  );
}

// A small progress bar: red under half, amber past half, green when done.
export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const tone = pct >= 100 ? "done" : pct >= 50 ? "half" : "low";
  return (
    <span className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <span className={`meter__fill meter__fill--${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

// Where points come from, in display order ("แต้มของฉัน").
export const POINT_CATEGORIES: [string, string][] = [
  ["airdrop", "แอร์ดรอป"],
  ["shop", "งัดร้าน"],
  ["loop", "ลูป"],
  ["adjust", "แอดมินปรับ"],
  ["penalty", "โดนหัก (ทีมไม่ครบ)"],
  ["refund", "ได้คืน"],
];
export const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// ---- Profiles and achievements ----
// Any name in the ranking opens that member's profile; the page listens for
// this event so lists don't have to pass a callback down.
export const openProfile = (id: unknown) => window.dispatchEvent(new CustomEvent("fivek-profile", { detail: String(id) }));
export const profileKeys = (id: unknown) => ({
  role: "button" as const,
  tabIndex: 0,
  onClick: () => openProfile(id),
  onKeyDown: (event: ReactKeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProfile(id);
    }
  },
});

export function useProfile(id: string | null) {
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setProfile(null);
    setError("");
    fetch(`/api/profile?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((x) => alive && (x.error ? setError(x.error) : setProfile(x)))
      .catch(() => alive && setError("เปิดโปรไฟล์ไม่สำเร็จ"));
    return () => {
      alive = false;
    };
  }, [id]);
  return { profile, error };
}

export function AchievementList({ items }: { items: any[] }) {
  return (
    <ul className="achievements">
      {items.map((a) => (
        <li key={a.id} className={a.done ? "is-done" : ""}>
          <span className="achievements__icon" aria-hidden="true">{a.icon}</span>
          <span className="min-w-0 flex-1">
            <b>{a.title}</b>
            <span>{a.hint}</span>
            {!a.done && (
              <span className="achievements__bar" aria-label={`${a.progress} จาก ${a.goal}`}>
                <span style={{ width: `${(a.progress / a.goal) * 100}%` }} />
              </span>
            )}
          </span>
          <span className="achievements__state">{a.done ? "ได้แล้ว" : `${a.progress}/${a.goal}`}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- สรุป: the gang at a glance, monthly results, admin to-dos ----
export const SUMMARY_PERIODS = [
  { id: "day", label: "วันนี้" },
  { id: "week", label: "สัปดาห์นี้" },
  { id: "month", label: "เดือนนี้" },
];
export const dayLabel = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
// Standard competition ranks (10, 10, 7 → 1, 1, 3), like the ranking page.
export const competitionRanks = (rows: { score: number }[]) => {
  const ranks: number[] = [];
  rows.forEach((row, i) => ranks.push(i > 0 && row.score === rows[i - 1].score ? ranks[i - 1] : i + 1));
  return ranks;
};
export const memberNames = (data: Data) => new Map<string, string>(data.members.map((m: any) => [String(m.id), m.display_name]));
