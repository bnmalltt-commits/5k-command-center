"use client";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BarChart3,
  CalendarOff,
  Check,
  ChevronRight,
  Crosshair,
  History,
  LayoutGrid,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { PartyCommandCenter } from "./party-command-center";
import { Picker, shrinkImage } from "./picker";
import {
  Chips,
  Avatar,
  ConfirmDialog,
  DiscordGate,
  DiscordMark,
  Dot,
  EmptyState,
  Panel,
  PromptDialog,
  Row,
  SearchInput,
  Segmented,
} from "./ui";

// A 413 from Vercel (body over 4.5 MB) is plain text, not JSON, so a bare
// r.json() threw and the member only saw a generic failure.
const uploadResult = async (r: Response) =>
  r.json().catch(() => ({
    error:
      r.status === 413
        ? "รูปใหญ่เกินไป ลองใช้รูปที่เล็กลงหรือแคปหน้าจอใหม่"
        : "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
  }));

// First Discord sign-in: the person picks their own name from members not yet
// on Discord, or registers a new one. The server re-checks everything.
function ClaimScreen({
  claim,
  onDone,
  onCancel,
}: {
  claim: { discordName: string; avatar: string | null; members: { id: string; display_name: string }[] };
  onDone: (error?: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ id: string; display_name: string } | null>(null);
  const [newName, setNewName] = useState(claim.discordName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = query.trim().toLowerCase();
  const shown = claim.members.filter((m) => !q || m.display_name.toLowerCase().includes(q));
  const submit = async (body: any) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/discord", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim", ...body }),
      });
      const x: any = await r.json().catch(() => ({}));
      if (x.error) setError(x.error);
      else onDone();
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[#0d0d0d] p-5 text-white">
      <section className="command-panel hud-login w-full max-w-md p-7 text-center">
        <div className="flex justify-center">
          <Avatar url={claim.avatar} name={claim.discordName} size={64} />
        </div>
        <p className="label mt-4">FIRST LOGIN</p>
        <h1 className="mt-1 text-2xl font-black">สวัสดี {claim.discordName}</h1>
        <p className="mt-3 text-sm text-[var(--ui-text-3)]">
          เลือกชื่อของคุณในแก๊ง ทำครั้งเดียว ครั้งหน้ากดเข้าด้วย Discord ได้เลย
          <br />
          เลือกชื่อคนอื่นไม่ได้นะ แอดมินเห็นทุกครั้งที่มีคนผูกชื่อ
        </p>
        {picked ? (
          <div className="mt-6 space-y-3">
            <p className="text-lg font-bold">ฉันคือ “{picked.display_name}”</p>
            <button disabled={busy} onClick={() => submit({ memberId: picked.id })} className="red-action hud-clip w-full">
              {busy ? "กำลังบันทึก…" : "ยืนยัน ใช่ชื่อนี้"}
            </button>
            <button disabled={busy} onClick={() => setPicked(null)} className="ui-btn ui-btn--ghost w-full">
              เลือกใหม่
            </button>
          </div>
        ) : (
          <>
            <input
              id="claim-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อของคุณ"
              className="hud-clip mt-6 w-full border border-white/15 bg-black/30 px-4 py-3"
            />
            <div className="claim-list mt-3">
              {shown.length ? (
                shown.map((m) => (
                  <button key={m.id} type="button" onClick={() => setPicked(m)} className="claim-list__item">
                    {m.display_name}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-[var(--ui-text-3)]">
                  {claim.members.length ? "ไม่พบชื่อนี้" : "ทุกชื่อในแก๊งผูก Discord แล้ว"}
                </p>
              )}
            </div>
            <form
              className="mt-5 space-y-2 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                submit({ newName });
              }}
            >
              <label htmlFor="claim-new" className="text-sm text-[var(--ui-text-3)]">
                ไม่มีชื่อคุณ? สมัครเป็นสมาชิกใหม่
              </label>
              <div className="flex gap-2">
                <input
                  id="claim-new"
                  required
                  minLength={2}
                  maxLength={40}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ชื่อในแก๊ง"
                  className="ui-input min-w-0 flex-1"
                />
                <button disabled={busy} className="ui-btn ui-btn--primary">
                  สมัคร
                </button>
              </div>
            </form>
          </>
        )}
        {error && <p className="mt-4 text-sm text-[var(--ui-text)]">{error}</p>}
        <button type="button" onClick={onCancel} className="mt-5 text-xs text-[var(--ui-text-3)] underline">
          ยกเลิก
        </button>
      </section>
    </main>
  );
}

type Round = "17:00" | "20:00" | "23:00" | "01:00";
const ROUNDS: Round[] = ["17:00", "20:00", "23:00", "01:00"];
type Data = {
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
const EMPTY_DATA: Omit<Data, "me" | "date" | "myParty"> = {
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
// Shown the first time a view is opened, while its data is still in flight.
// Without it the view would render its "ยังไม่มี..." empty state for a beat.
function ViewLoading() {
  return (
    <section className="ui-panel">
      <p className="ui-panel__body text-center text-sm text-[var(--ui-text-3)]">
        กำลังโหลดข้อมูล…
      </p>
    </section>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${value === "approved" ? "bg-emerald-500/15 text-[var(--ui-green)]" : value === "rejected" ? "bg-red-500/15 text-[var(--ui-red-light)]" : "bg-amber-400/15 text-[var(--ui-amber)]"}`}
    >
      {labels[value] || value}
    </span>
  );
}

// The day's four rounds as one card: progress, per-round state, and the
// upload for the selected round all in one place. Replaces the old hero
// clock + progress bar + label buttons + separate check-in panel, which
// between them rendered the same round state three times over.
function MissionCard({
  data,
  round,
  setRound,
  mine,
  busy,
  image,
  setImage,
  pickerReset,
  onSubmit,
}: {
  data: Data;
  round: Round;
  setRound: (round: Round) => void;
  mine: Map<any, any>;
  busy: boolean;
  image: File | null;
  setImage: (file: File | null) => void;
  pickerReset: number;
  onSubmit: (event: FormEvent) => void;
}) {
  const approved = ROUNDS.filter(
    (r) => mine.get(r)?.status === "approved",
  ).length;
  const done = approved === ROUNDS.length;
  const selected = mine.get(round);
  const stateOf = (r: Round) => {
    const status = mine.get(r)?.status;
    // Airdrop points by the rule in force on that day (+5 from the team rule start).
    const pts = data.team && String(mine.get(r)?.activity_date) >= data.team.pointsStart ? data.team.points.airdrop : 3;
    return status === "approved"
      ? { label: `ผ่านแล้ว · +${pts}`, tone: "done" }
      : status === "pending"
        ? { label: "รอตรวจ", tone: "pending" }
        : status === "rejected"
          ? { label: "ไม่ผ่าน ส่งใหม่", tone: "rejected" }
          : { label: "ยังไม่ส่ง", tone: "idle" };
  };
  return (
    <section className="mission">
      <header className="mission__head">
        <div>
          <p className="ui-eyebrow">ภารกิจวันนี้ · {data.date}</p>
          <h2 className="mission__title">
            {done ? "ครบทุกรอบแล้ว" : `เหลืออีก ${ROUNDS.length - approved} รอบ`}
          </h2>
        </div>
        <div className="mission__count">
          <b>{approved}</b>
          <span>/{ROUNDS.length}</span>
        </div>
      </header>
      <div className="mission__bar" aria-hidden="true">
        {ROUNDS.map((r) => (
          <span key={r} className={`mission__seg is-${stateOf(r).tone}`} />
        ))}
      </div>
      <div className="mission__grid">
        {ROUNDS.map((r) => {
          const state = stateOf(r);
          const active = r === round;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRound(r)}
              aria-current={active ? "true" : undefined}
              className={`mission__tile is-${state.tone} ${active ? "is-active" : ""}`}
            >
              <span className="mission__tile-top">
                <span className="mission__tile-time">{r}</span>
                {state.tone === "done" && <Check className="h-4 w-4" />}
              </span>
              <span className="mission__tile-state">{state.label}</span>
            </button>
          );
        })}
      </div>
      {selected?.status === "approved" ? (
        <p className="mission__note">
          รอบ {round} ผ่านการตรวจแล้ว ไม่ต้องส่งซ้ำ
        </p>
      ) : !data.me.discordLinked ? (
        <div className="mission__submit">
          <DiscordGate what="ส่งหลักฐาน" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mission__submit">
          <p className="mission__note">
            {selected?.status === "pending"
              ? `หลักฐานรอบ ${round} กำลังรอตรวจ · เลือกรูปใหม่เพื่อส่งแก้ไข`
              : selected?.status === "rejected"
                ? `หลักฐานรอบ ${round} ไม่ผ่าน${selected.reject_reason ? ` (${selected.reject_reason})` : ""} · เลือกรูปใหม่แล้วส่งอีกครั้ง`
                : `ส่งหลักฐานรอบ ${round}`}
          </p>
          <Picker onChange={setImage} resetToken={`${round}-${pickerReset}`} />
          <button
            disabled={busy || !image}
            className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg"
          >
            <Upload className="h-5 w-5" />
            {selected ? `ส่งหลักฐานรอบ ${round} ใหม่` : `ส่งหลักฐานรอบ ${round}`}
          </button>
        </form>
      )}
    </section>
  );
}
const PERIODS = [
  { id: "day", label: "วันนี้", title: "ตารางคะแนนวันนี้" },
  { id: "week", label: "สัปดาห์นี้", title: "ตารางคะแนนสัปดาห์นี้" },
  { id: "month", label: "รายเดือน", title: "ตารางคะแนนรายเดือน" },
  { id: "all", label: "ทั้งหมด", title: "ตารางคะแนนทั้งหมด" },
];
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
function SquadRanking({
  leaderboard: allTime,
  boards,
  monthBoards,
  compact = false,
  highlightId,
  avatars = {},
}: {
  leaderboard: any[];
  boards?: Record<string, any[]>;
  monthBoards?: Record<string, any[]>;
  compact?: boolean;
  highlightId?: number;
  avatars?: Record<string, string | null>;
}) {
  const [period, setPeriod] = useState("month");
  const months = Object.keys(monthBoards || {}).sort().reverse();
  const [month, setMonth] = useState("");
  const shownMonth = months.includes(month) ? month : months[0];
  const leaderboard =
    period === "month" && shownMonth
      ? monthBoards![shownMonth]
      : period === "all" || !boards?.[period]
        ? allTime
        : boards[period];
  const rows = compact ? leaderboard.slice(0, 5) : leaderboard;
  // Standard competition ranking (10, 10, 7 → 1, 1, 3), matching the rank the
  // server computes for the home tile, so tied members see the same number.
  const ranks: number[] = [];
  leaderboard.forEach((member: any, i: number) => {
    ranks.push(
      i > 0 && Number(member.score || 0) === Number(leaderboard[i - 1].score || 0)
        ? ranks[i - 1]
        : i + 1,
    );
  });
  const myIndex = highlightId
    ? leaderboard.findIndex((member: any) => member.id === highlightId)
    : -1;
  const me = myIndex >= 0 ? leaderboard[myIndex] : null;
  const myRank = myIndex >= 0 ? ranks[myIndex] : 0;
  // The nearest member strictly ahead; beating them takes one point more than
  // the difference, since matching their score only ties.
  const ahead = myRank > 1 ? leaderboard[myRank - 2] : null;
  const toPass = ahead
    ? Number(ahead.score || 0) - Number(me.score || 0) + 1
    : 0;
  return (
    <Panel
      label="SQUAD RANKING"
      title={
        compact
          ? "ตารางคะแนนเดือนนี้"
          : period === "month" && shownMonth
            ? `ตารางคะแนน${monthLabel(shownMonth)}`
            : PERIODS.find((p) => p.id === period)!.title
      }
      subtitle={compact ? undefined : `${leaderboard.length} คน`}
      trailing={<Trophy className="h-4 w-4 text-[var(--ui-red)]" />}
      flush
    >
      {!compact && boards && (
        <div className="px-4 pt-3">
          <Segmented
            label="ช่วงเวลา"
            value={period}
            onChange={setPeriod}
            options={PERIODS.map(({ id, label }) => ({ id, label }))}
          />
          {period === "month" && months.length > 0 && (
            <select
              value={shownMonth}
              onChange={(event) => setMonth(event.target.value)}
              className="ui-input mt-2"
              aria-label="เลือกเดือน"
            >
              {months.map((value, index) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                  {index === 0 ? " (เดือนนี้)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {!compact && me && (
        <div className="rank-me">
          <span className="rank-me__pos">#{myRank}</span>
          <div className="min-w-0 flex-1">
            <div className="rank-me__label">อันดับของคุณ</div>
            <div className="rank-me__hint">
              {ahead
                ? `อีก ${toPass} แต้มจะแซง ${ahead.display_name}`
                : "คุณอยู่อันดับหนึ่งของแก๊ง"}
            </div>
          </div>
          <span className="rank-me__score">{Number(me.score || 0)}</span>
        </div>
      )}
      {rows.length ? (
        rows.map((member: any, index: number) => (
          <Row
            key={member.id}
            inset={false}
            leading={
              <span className={`rank-num rank-num--${ranks[index]}`}>
                {ranks[index]}
              </span>
            }
            title={
              <span className="name-with-avatar">
                <Avatar url={avatars[String(member.id)]} name={member.display_name} size={24} />
                {member.id === highlightId ? (
                  <span className="text-white">{member.display_name} · คุณ</span>
                ) : (
                  member.display_name
                )}
              </span>
            }
            subtitle={member.online ? "ออนไลน์" : undefined}
            trailing={
              <span className="rank-score">{Number(member.score || 0)}</span>
            }
          />
        ))
      ) : (
        <EmptyState
          title={
            compact
              ? "ยังไม่มีใครได้แต้มเดือนนี้"
              : period === "all"
              ? "ยังไม่มีคะแนนในตาราง"
              : period === "month" && shownMonth
                ? `ยังไม่มีใครได้แต้มในเดือน${monthLabel(shownMonth)}`
                : `ยังไม่มีใครได้แต้ม${PERIODS.find((p) => p.id === period)!.label}`
          }
          hint="เมื่อหลักฐานตรวจผ่าน คะแนนจะขึ้นที่นี่"
        />
      )}
    </Panel>
  );
}


function LeaveRoom({
  data,
  call,
  busy,
}: {
  data: Data;
  call: (body: any) => Promise<boolean>;
  busy: boolean;
}) {
  const isAdmin = data.me.role === "admin";
  const [memberId, setMemberId] = useState(data.me.id);
  const [leaveDate, setLeaveDate] = useState(data.date);
  const [reason, setReason] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    const ok = await call({
      action: "leave_request",
      memberId: isAdmin ? memberId : data.me.id,
      leaveDate,
      reason: reason.trim(),
    });
    if (ok) setReason("");
  };
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const needle = query.trim().toLowerCase();
  const history = data.leaveRequests.filter((item: any) =>
    needle
      ? `${item.display_name} ${item.reason} ${item.leave_date}`
          .toLowerCase()
          .includes(needle)
      : true,
  );
  const visible = history.slice(0, shown);
  return (
    <>
      <Panel
        label={`LEAVE ROOM // ${data.date}`}
        title="แจ้งลา"
        subtitle="สมาชิกแจ้งลาได้ด้วยตัวเอง แอดมินบันทึกแทนสมาชิกได้"
      >
        {!isAdmin && !data.me.discordLinked ? (
          <DiscordGate what="แจ้งลา" />
        ) : (
        <form onSubmit={submit} className="space-y-2.5">
          {isAdmin && (
            <select
              value={memberId}
              onChange={(e) => setMemberId(Number(e.target.value))}
              className="ui-input"
            >
              {data.members.map((member: any) => (
                <option key={member.id} value={member.id}>
                  {member.id === data.me.id ? "ตัวเอง" : member.display_name}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={leaveDate}
            onChange={(e) => setLeaveDate(e.target.value)}
            required
            className="ui-input"
          />
          <div className="flex gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผลการลา"
              required
              className="ui-input min-w-0 flex-1"
            />
            <button disabled={busy} className="ui-btn ui-btn--primary">
              แจ้งลา
            </button>
          </div>
        </form>
        )}
      </Panel>
      <Panel
        label="LEAVE HISTORY"
        title="ประวัติการลา"
        subtitle={`${history.length} รายการ`}
        flush
      >
        <div className="p-4">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setShown(PAGE_SIZE);
            }}
            placeholder="ค้นหาชื่อ เหตุผล หรือวันที่"
          />
        </div>
        {visible.length ? (
          <>
            {visible.map((item: any) => (
              <Row
                key={item.id}
                inset={false}
                title={item.display_name}
                subtitle={`${item.leave_date} · ${item.reason}`}
                trailing={
                  <span className="text-xs text-[var(--ui-text-3)]">
                    โดย {item.created_by_name}
                  </span>
                }
              />
            ))}
            {history.length > visible.length && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  โหลดเพิ่ม {Math.min(PAGE_SIZE, history.length - visible.length)} รายการ
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            title={
              data.leaveRequests.length
                ? "ไม่พบรายการที่ค้นหา"
                : "ยังไม่มีรายการลา"
            }
            hint={
              data.leaveRequests.length
                ? "ลองเปลี่ยนคำค้น"
                : "เมื่อมีคนแจ้งลา รายการจะขึ้นที่นี่"
            }
          />
        )}
      </Panel>
    </>
  );
}
// Where points come from, in display order ("แต้มของฉัน").
const POINT_CATEGORIES: [string, string][] = [
  ["airdrop", "แอร์ดรอป"],
  ["shop", "งัดร้าน"],
  ["loop", "ลูป"],
  ["adjust", "แอดมินปรับ"],
  ["penalty", "โดนหัก (ทีมไม่ครบ)"],
  ["refund", "ได้คืน (ทำชด)"],
];
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// The member's own points per day, split by where they came from, so a
// deduction is never a mystery. Same source as every score on the site.
function MyPoints({ data }: { data: Data }) {
  const rows = data.myPoints || [];
  const thisMonth = data.date.slice(0, 7);
  const months = [...new Set([thisMonth, ...rows.map((r: any) => String(r.day).slice(0, 7))])].sort().reverse();
  const [month, setMonth] = useState(thisMonth);
  const inMonth = rows.filter((r: any) => String(r.day).startsWith(month));
  const byCategory = new Map<string, number>();
  const byDay = new Map<string, Map<string, number>>();
  for (const r of inMonth) {
    byCategory.set(r.category, (byCategory.get(r.category) || 0) + r.points);
    if (!byDay.has(r.day)) byDay.set(r.day, new Map());
    const day = byDay.get(r.day)!;
    day.set(r.category, (day.get(r.category) || 0) + r.points);
  }
  const total = inMonth.reduce((sum: number, r: any) => sum + r.points, 0);
  const days = [...byDay.keys()].sort().reverse();
  const mine = data.team?.mine;
  return (
    <Panel label="MY POINTS" title="แต้มของฉัน" subtitle={`${monthLabel(month)} · รวม ${signed(total)} แต้ม`} flush>
      <div className="space-y-3 p-4">
        {months.length > 1 && (
          <select value={month} onChange={(event) => setMonth(event.target.value)} className="ui-input" aria-label="เลือกเดือน">
            {months.map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
                {value === thisMonth ? " (เดือนนี้)" : ""}
              </option>
            ))}
          </select>
        )}
        <div className="points-split">
          {POINT_CATEGORIES.filter(([id]) => byCategory.has(id)).map(([id, label]) => (
            <div key={id} className={`points-split__cell ${(byCategory.get(id) || 0) < 0 ? "is-minus" : ""}`}>
              <span>{label}</span>
              <b>{signed(byCategory.get(id) || 0)}</b>
            </div>
          ))}
        </div>
        {month === thisMonth && mine && (
          <p className="text-sm text-[var(--ui-text-2)]">
            คะแนนทีมวันนี้ {mine.today}/{data.team?.perDay ?? 9}
            {mine.debt > 0 ? ` · ค้าง ${mine.debt} คะแนน (ทำชดแล้วได้แต้มคืน)` : ""}
            {mine.bank > 0 && mine.neededToday === 0 ? ` · เกินเก็บไว้ ${mine.bank}` : ""}
          </p>
        )}
      </div>
      {days.length ? (
        days.map((day) => {
          const parts = byDay.get(day)!;
          const dayTotal = [...parts.values()].reduce((a, b) => a + b, 0);
          return (
            <Row
              key={day}
              inset={false}
              title={day}
              subtitle={POINT_CATEGORIES.filter(([id]) => parts.has(id))
                .map(([id, label]) => `${label} ${signed(parts.get(id)!)}`)
                .join(" · ")}
              trailing={
                <b className={dayTotal < 0 ? "text-[var(--ui-red-light)]" : "text-[var(--ui-green)]"}>{signed(dayTotal)}</b>
              }
            />
          );
        })
      ) : (
        <EmptyState title="ยังไม่มีแต้มในเดือนนี้" hint="ส่งหลักฐานแอร์ดรอปหรือหลักฐานทีม แต้มจะขึ้นที่นี่หลังตรวจผ่าน" />
      )}
    </Panel>
  );
}

const PAGE_SIZE = 50;
function SubmissionLog({ data }: { data: Data }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const needle = query.trim().toLowerCase();
  const filtered = data.submissionLog.filter((item: any) => {
    if (status !== "all" && item.status !== status) return false;
    if (!needle) return true;
    return `${item.submitted_by || ""} ${item.detail || ""} ${item.activity_date || ""}`
      .toLowerCase()
      .includes(needle);
  });
  const visible = filtered.slice(0, shown);
  return (
    <Panel
      label="SUBMISSION LOG"
      title="ประวัติการส่งทั้งหมด"
      subtitle={`${filtered.length} รายการ`}
      flush
    >
      <div className="space-y-3 p-4">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setShown(PAGE_SIZE);
          }}
          placeholder="ค้นหาชื่อ รอบ หรือวันที่"
        />
        <Chips
          value={status}
          onChange={(next) => {
            setStatus(next);
            setShown(PAGE_SIZE);
          }}
          options={[
            { id: "all", label: "ทั้งหมด" },
            { id: "pending", label: "รอตรวจ" },
            { id: "approved", label: "ผ่านแล้ว" },
            { id: "rejected", label: "ไม่ผ่าน" },
          ]}
        />
      </div>
      {visible.length ? (
        <>
          {visible.map((item: any) => {
            // Approved evidence is deleted from storage to save space, so
            // there's nothing left to open.
            const viewable = item.status !== "approved" && item.image_key;
            return (
              <Row
                key={item.type + item.id}
                inset={false}
                href={viewable ? `/api/image/${item.image_key}` : undefined}
                leading={
                  <Dot
                    tone={
                      item.status === "approved"
                        ? "green"
                        : item.status === "rejected"
                          ? "red"
                          : "amber"
                    }
                  />
                }
                title={item.type === "party" ? item.detail : `แอร์ดรอป · รอบ ${item.detail}`}
                subtitle={`${item.activity_date} · ส่งโดย ${item.submitted_by}${
                  item.approved_by ? ` · ตรวจโดย ${item.approved_by}` : " · ยังไม่ตรวจ"
                }${item.status === "rejected" && item.reject_reason ? ` · เหตุผล: ${item.reject_reason}` : ""}`}
                trailing={<Status value={item.status} />}
              />
            );
          })}
          {filtered.length > visible.length && (
            <div className="p-3 text-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
                className="ui-btn ui-btn--ghost ui-btn--sm"
              >
                โหลดเพิ่ม {Math.min(PAGE_SIZE, filtered.length - visible.length)} รายการ
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title={
            data.submissionLog.length
              ? "ไม่พบรายการที่ค้นหา"
              : "ยังไม่มีประวัติการส่ง"
          }
          hint={
            data.submissionLog.length
              ? "ลองเปลี่ยนคำค้นหรือตัวกรองสถานะ"
              : "เมื่อมีคนส่งหลักฐาน รายการจะขึ้นที่นี่"
          }
        />
      )}
    </Panel>
  );
}
// Preset reasons for a rejection; the admin can also type their own.
const REJECT_REASONS = [
  "รูปไม่ชัด มองไม่เห็นหลักฐาน",
  "ไม่ใช่รอบนี้หรือไม่ใช่วันนี้",
  "คนในรูปไม่ครบตามที่เลือก",
  "รูปเก่าหรือรูปของคนอื่น",
  "เลือกประเภทผิด (ร้าน/ลูป)",
];

// One evidence at a time: the photo large, who gets how many points, then
// approve or reject (with a reason) and straight on to the next — no new tab
// and no confirm per item. Works on a snapshot of the queue taken when opened.
function ReviewDialog({
  items,
  start,
  busy,
  onAct,
  onClose,
}: {
  items: any[];
  start: number;
  busy: boolean;
  onAct: (item: any, action: "approve" | "reject", reason?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [handled, setHandled] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const keyOf = (item: any) => `${item.type}-${item.id}`;
  const left = items.filter((item) => !handled.includes(keyOf(item))).length;
  // The nearest unhandled item from `from` in direction `dir`, wrapping; -1 if none.
  const step = (from: number, dir: 1 | -1, done: string[]) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (from + dir * n + items.length * n) % items.length;
      if (!done.includes(keyOf(items[i]))) return i;
    }
    return -1;
  };
  const go = (i: number) => {
    if (i < 0) return;
    setIndex(i);
    setRejecting(false);
    setReason("");
  };
  const item = items[index];
  const act = async (action: "approve" | "reject", why?: string) => {
    if (!item || busy || handled.includes(keyOf(item))) return;
    if (!(await onAct(item, action, why))) return;
    const done = [...handled, keyOf(item)];
    setHandled(done);
    go(step(index, 1, done));
  };
  // Fetch the next photo while this one is being looked at.
  useEffect(() => {
    const next = items[step(index, 1, handled)];
    if (next?.image_key && next !== item) new Image().src = `/api/image/${next.image_key}`;
  }, [index, handled]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(step(index, 1, handled));
      else if (event.key === "ArrowLeft") go(step(index, -1, handled));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, handled, onClose]);
  const finished = !left || !item || handled.includes(keyOf(item));
  return (
    <div className="ui-dialog-backdrop" role="dialog" aria-modal="true" aria-label="ตรวจหลักฐาน">
      <div className="ui-dialog review">
        <div className="review__head">
          <span className="ui-eyebrow">ตรวจหลักฐาน · เหลือ {left} รายการ</span>
          <button type="button" onClick={onClose} className="ui-btn ui-btn--ghost ui-btn--sm">
            ปิด
          </button>
        </div>
        {finished ? (
          <p className="ui-dialog__message">ตรวจครบทุกรายการแล้ว</p>
        ) : (
          <>
            <a href={`/api/image/${item.image_key}`} target="_blank" rel="noreferrer" title="เปิดรูปเต็ม">
              <img key={item.image_key} src={`/api/image/${item.image_key}`} alt="รูปหลักฐาน" className="review__img" />
            </a>
            <p className="review__title">
              {item.type === "party"
                ? `${item.detail} · ${item.activity_date}`
                : `แอร์ดรอปรอบ ${item.round_time} · ${item.activity_date}`}
            </p>
            <p className="review__meta">
              ได้คนละ +{item.points} แต้ม · {Number(item.member_count) || 1} คน: {item.members}
            </p>
            <p className="review__meta">
              ส่งโดย {item.submitted_by} · {new Date(item.created_at).toLocaleString("th-TH")}
            </p>
            {rejecting ? (
              <div className="review__reject">
                <Chips
                  value={reason}
                  onChange={setReason}
                  options={REJECT_REASONS.map((text) => ({ id: text, label: text }))}
                />
                <input
                  id="review-reason"
                  value={reason}
                  maxLength={120}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="หรือพิมพ์เหตุผลเอง"
                  className="ui-input"
                />
                <div className="ui-dialog__actions">
                  <button type="button" onClick={() => setRejecting(false)} className="ui-btn ui-btn--ghost">
                    กลับ
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act("reject", reason.trim())}
                    className="ui-btn ui-btn--primary"
                  >
                    ยืนยันไม่ผ่าน
                  </button>
                </div>
              </div>
            ) : (
              <div className="review__actions">
                <button
                  type="button"
                  disabled={left < 2}
                  onClick={() => go(step(index, 1, handled))}
                  className="ui-btn ui-btn--ghost"
                >
                  ข้าม
                </button>
                <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="ui-btn ui-btn--ghost">
                  ไม่ผ่าน
                </button>
                <button type="button" autoFocus disabled={busy} onClick={() => act("approve")} className="ui-btn ui-btn--ok">
                  ผ่าน +{item.points}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AdminCommandCenter({
  data,
  call,
  busy,
}: {
  data: Data;
  call: (body: any) => Promise<boolean>;
  busy: boolean;
}) {
  const [tab, setTab] = useState<
    "verify" | "attendance" | "members" | "parties" | "points" | "leave" | "admins"
  >("verify");
  const [attDate, setAttDate] = useState(data.date);
  const [attFilter, setAttFilter] = useState("missing");
  const [query, setQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState("active");
  const [memberName, setMemberName] = useState("");
  const [renaming, setRenaming] = useState<any>(null);
  const [pointMember, setPointMember] = useState("");
  const [pointValue, setPointValue] = useState("");
  const [pointReason, setPointReason] = useState("");
  const [review, setReview] = useState<{ items: any[]; start: number } | null>(null);
  // The owner flag, not the display name: names can be edited.
  const sam = Boolean(
    data.managedMembers.find((member: any) => String(member.id) === String(data.me.id))
      ?.is_primary_admin,
  );
  const adminSubtitle = (member: any) =>
    member.role === "admin" && !member.is_primary_admin
      ? "แอดมิน"
      : member.role === "admin"
        ? "แอดมิน (เจ้าของแก๊ง)"
        : "สมาชิก";
  const normalizedQuery = query.trim().toLowerCase();
  // Substring, not prefix-per-token: a prefix match can't find a name by the
  // middle of it, which is how people actually search a roster.
  const matches = (text: string) =>
    !normalizedQuery || String(text || "").toLowerCase().includes(normalizedQuery);
  const activeMembers = data.managedMembers.filter((member: any) => member.active);
  const removedMembers = data.managedMembers.filter((member: any) => !member.active);
  const noDiscordMembers = activeMembers.filter((member: any) => !member.discord_linked);
  const memberPool =
    memberFilter === "removed"
      ? removedMembers
      : memberFilter === "nodiscord"
        ? noDiscordMembers
        : activeMembers;
  const visibleMembers = memberPool.filter((member: any) =>
    matches(member.display_name),
  );
  const visiblePending = data.pending.filter((item: any) =>
    matches(`${item.submitted_by} ${item.detail}`),
  );
  const visibleAdmins = activeMembers.filter(
    (member: any) => member.id !== data.me.id && matches(member.display_name),
  );
  const visibleParties = data.adminParties.filter((party: any) =>
    matches(`${party.name} ${party.owner_name} ${party.members.map((m: any) => m.name).join(" ")}`),
  );
  const visibleLedger = data.ledger.filter((entry: any) =>
    matches(`${entry.names} ${entry.note}`),
  );
  const visibleLeaves = data.adminLeaves.filter((leave: any) =>
    matches(`${leave.display_name} ${leave.reason} ${leave.leave_date}`),
  );
  const sourceLabel = (entry: any) =>
    entry.source === "adjustment"
      ? "ปรับแต้มโดยแอดมิน"
      : entry.source === "party"
        ? "ปาร์ตี้ตรวจผ่าน"
        : "แอร์ดรอปตรวจผ่าน";
  // created_at is stored as UTC; without this, anything done between midnight
  // and 7am in Thailand would be labelled with the previous day.
  const bangkokDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value).slice(0, 10)
      : date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  };
  const noMatch = <EmptyState title="ไม่พบรายการที่ค้นหา" hint="ลองเปลี่ยนคำค้น" />;
  // Attendance: the last 7 Bangkok dates, today first. A round counts as sent
  // once it's pending or approved; a rejected one still needs a resend.
  const [ty, tm, td] = data.date.split("-").map(Number);
  const attDates = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(ty, tm - 1, td - i)).toISOString().slice(0, 10),
  );
  const attLabel = (value: string, index: number) =>
    index === 0
      ? "วันนี้"
      : index === 1
        ? "เมื่อวาน"
        : `${Number(value.slice(8))}/${Number(value.slice(5, 7))}`;
  const shownAttDate = attDates.includes(attDate) ? attDate : attDates[0];
  const statusByRound = new Map<string, string>();
  for (const row of data.attendance)
    if (row.activity_date === shownAttDate)
      statusByRound.set(`${row.member_id}|${row.round_time}`, row.status);
  const onLeave = new Set(
    data.attendanceLeaves
      .filter((row: any) => row.leave_date === shownAttDate)
      .map((row: any) => String(row.member_id)),
  );
  const teamOn = new Map<string, number>();
  for (const row of data.teamDays)
    if (row.activity_date === shownAttDate)
      teamOn.set(String(row.member_id), Number(row.n));
  const sentStatus = (status?: string) => status === "approved" || status === "pending";
  const attRows = activeMembers
    .map((member: any) => {
      const rounds = ROUNDS.map((round) => statusByRound.get(`${member.id}|${round}`));
      return {
        member,
        rounds,
        sent: rounds.filter(sentStatus).length,
        leave: onLeave.has(String(member.id)),
        teamPoints: teamOn.get(String(member.id)) || 0,
        teamDebt: Number(
          data.teamStatus.find((row: any) => String(row.member_id) === String(member.id))?.debt || 0,
        ),
      };
    })
    .sort(
      (a: any, b: any) =>
        Number(a.leave) - Number(b.leave) ||
        a.sent - b.sent ||
        a.member.display_name.localeCompare(b.member.display_name),
    );
  const attCounts = {
    teamDebt: attRows.filter((r: any) => r.teamDebt > 0).length,
    missing: attRows.filter((r: any) => !r.leave && r.sent < ROUNDS.length).length,
    done: attRows.filter((r: any) => r.sent === ROUNDS.length).length,
    leave: attRows.filter((r: any) => r.leave).length,
  };
  const visibleAttendance = attRows.filter(
    (r: any) =>
      matches(r.member.display_name) &&
      (attFilter === "team"
        ? r.teamDebt > 0
        : attFilter === "leave"
        ? r.leave
        : attFilter === "done"
          ? r.sent === ROUNDS.length
          : !r.leave && r.sent < ROUNDS.length),
  );
  const roundTone = (status?: string) =>
    status === "approved" ? "green" : status === "pending" ? "amber" : status === "rejected" ? "red" : "idle";

  return (
    <>
      <Panel
        label="SQUAD COMMAND"
        title="จัดการแก๊ง"
        subtitle={`${activeMembers.length} สมาชิกใช้งาน`}
        flush
      >
        <div className="space-y-3 p-4">
          <Segmented
            label="จัดการแก๊ง"
            value={tab}
            onChange={(next) => {
              setTab(next as typeof tab);
              setQuery("");
            }}
            options={[
              { id: "verify", label: "รอตรวจ", count: data.pending.length },
              { id: "attendance", label: "เช็กชื่อ", count: attCounts.missing },
              { id: "members", label: "สมาชิก", count: activeMembers.length },
              { id: "parties", label: "ปาร์ตี้", count: data.adminParties.length },
              { id: "points", label: "แต้ม" },
              { id: "leave", label: "การลา", count: data.adminLeaves.length },
              {
                id: "admins",
                label: "แอดมิน",
                count: activeMembers.filter((m: any) => m.role === "admin").length,
              },
            ]}
          />
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={
              tab === "verify"
                ? "ค้นหาผู้ส่งหรือรอบ"
                : tab === "parties"
                  ? "ค้นหาชื่อปาร์ตี้หรือสมาชิก"
                  : tab === "points"
                    ? "ค้นหาชื่อหรือเหตุผล"
                    : tab === "leave"
                      ? "ค้นหาชื่อ เหตุผล หรือวันที่"
                      : "ค้นหาชื่อสมาชิก"
            }
          />

          {tab === "attendance" && (
            <>
              <Chips
                value={shownAttDate}
                onChange={setAttDate}
                options={attDates.map((value, index) => ({
                  id: value,
                  label: attLabel(value, index),
                }))}
              />
              <div className="att-summary">
                {ROUNDS.map((round, index) => (
                  <div key={round} className="att-summary__cell">
                    <span className="att-summary__round">{round}</span>
                    <b>
                      {attRows.filter((r: any) => sentStatus(r.rounds[index])).length}
                    </b>
                    <span className="att-summary__of">/{activeMembers.length}</span>
                  </div>
                ))}
              </div>
              <Chips
                value={attFilter}
                onChange={setAttFilter}
                options={[
                  { id: "missing", label: `ยังไม่ครบ ${attCounts.missing}` },
                  { id: "done", label: `ครบแล้ว ${attCounts.done}` },
                  { id: "leave", label: `ลา ${attCounts.leave}` },
                  { id: "team", label: `ค้างคะแนนทีม ${attCounts.teamDebt}` },
                ]}
              />
            </>
          )}

          {tab === "members" && (
            <>
              <Chips
                value={memberFilter}
                onChange={setMemberFilter}
                options={[
                  { id: "active", label: `ใช้งาน ${activeMembers.length}` },
                  { id: "nodiscord", label: `ยังไม่ผูก Discord ${noDiscordMembers.length}` },
                  { id: "removed", label: `ถูกเอาออก ${removedMembers.length}` },
                ]}
              />
              {noDiscordMembers.length > 0 && (
                <div className="admin-warning">
                  <p>
                    {noDiscordMembers.length} คนยังไม่ผูก Discord — ให้กดเข้าสู่ระบบด้วย Discord แล้วเลือกชื่อตัวเอง
                    ถ้ามีใครเลือกชื่อผิด กด “ยกเลิกผูก Discord” ที่ชื่อนั้น
                  </p>
                </div>
              )}
              {memberFilter === "active" && (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (memberName.trim())
                      void call({ action: "member", name: memberName.trim() }).then(
                        (saved) => {
                          if (saved) setMemberName("");
                        },
                      );
                  }}
                >
                  <input
                    required
                    minLength={2}
                    maxLength={60}
                    value={memberName}
                    onChange={(event) => setMemberName(event.target.value)}
                    placeholder="ชื่อสมาชิกใหม่"
                    className="ui-input min-w-0 flex-1"
                  />
                  <button disabled={busy} className="ui-btn ui-btn--primary">
                    เพิ่ม
                  </button>
                </form>
              )}
            </>
          )}

          {tab === "points" && (
            <form
              className="admin-points-form"
              onSubmit={(event) => {
                event.preventDefault();
                const member = activeMembers.find(
                  (m: any) => String(m.id) === pointMember,
                );
                void call({
                  action: "points_adjust",
                  memberId: Number(pointMember),
                  points: Number(pointValue),
                  reason: pointReason.trim(),
                  name: member?.display_name,
                }).then((saved) => {
                  if (saved) {
                    setPointValue("");
                    setPointReason("");
                  }
                });
              }}
            >
              <select
                required
                value={pointMember}
                onChange={(event) => setPointMember(event.target.value)}
                className="ui-input"
                aria-label="สมาชิก"
              >
                <option value="">เลือกสมาชิก</option>
                {activeMembers.map((member: any) => (
                  <option key={member.id} value={String(member.id)}>
                    {member.display_name}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                inputMode="numeric"
                min={-100}
                max={100}
                step={1}
                value={pointValue}
                onChange={(event) => setPointValue(event.target.value)}
                placeholder="แต้ม เช่น 3 หรือ -3"
                className="ui-input"
                aria-label="จำนวนแต้ม"
              />
              <input
                required
                minLength={2}
                maxLength={100}
                value={pointReason}
                onChange={(event) => setPointReason(event.target.value)}
                placeholder="เหตุผล"
                className="ui-input"
                aria-label="เหตุผล"
              />
              <button disabled={busy} className="ui-btn ui-btn--primary">
                บันทึกแต้ม
              </button>
            </form>
          )}
        </div>

        {tab === "verify" &&
          (visiblePending.length ? (
            <>
              <div className="p-3">
                <button
                  type="button"
                  onClick={() => setReview({ items: visiblePending, start: 0 })}
                  className="ui-btn ui-btn--primary ui-btn--block"
                >
                  ตรวจทีละรายการ ({visiblePending.length})
                </button>
              </div>
              {visiblePending.map((item: any, index: number) => (
                <Row
                  key={item.type + item.id}
                  inset={false}
                  title={
                    item.type === "party"
                      ? `${item.detail} · ${item.activity_date}`
                      : `แอร์ดรอปรอบ ${item.round_time} · ${item.activity_date}`
                  }
                  subtitle={`ส่งโดย ${item.submitted_by} · ได้แต้ม ${Number(item.member_count) || 1} คน คนละ +${item.points}`}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setReview({ items: visiblePending, start: index })}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      ตรวจ
                    </button>
                  }
                />
              ))}
            </>
          ) : data.pending.length ? (
            noMatch
          ) : (
            <EmptyState title="ไม่มีรายการรอตรวจในตอนนี้" hint="คิวตรวจว่างแล้ว" />
          ))}

        {tab === "members" &&
          (visibleMembers.length ? (
            visibleMembers.map((member: any) => (
              <Row
                key={member.id}
                inset={false}
                title={member.display_name}
                subtitle={[
                  adminSubtitle(member),
                  member.active && (member.discord_linked ? "ผูก Discord แล้ว" : "ยังไม่ผูก Discord"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  !member.active ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        call({
                          action: "member_reactivate",
                          id: member.id,
                          name: member.display_name,
                        })
                      }
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      เอากลับเข้าแก๊ง
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setRenaming(member)}
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                      >
                        แก้ชื่อ
                      </button>
                      {member.discord_linked &&
                        member.id !== data.me.id &&
                        !member.is_primary_admin &&
                        (member.role !== "admin" || sam) && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              call({
                                action: "member_discord_unlink",
                                id: member.id,
                                name: member.display_name,
                              })
                            }
                            className="ui-btn ui-btn--ghost ui-btn--sm"
                          >
                            ยกเลิกผูก Discord
                          </button>
                        )}
                      {member.id !== data.me.id && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            call({ action: "member_delete", id: member.id })
                          }
                          className="ui-btn ui-btn--ghost ui-btn--sm"
                        >
                          เอาออก
                        </button>
                      )}
                    </>
                  )
                }
              />
            ))
          ) : memberPool.length ? (
            noMatch
          ) : (
            <EmptyState
              title={
                memberFilter === "removed"
                  ? "ไม่มีสมาชิกที่ถูกเอาออก"
                  : memberFilter === "nodiscord"
                    ? "ทุกคนผูก Discord แล้ว"
                    : "ยังไม่มีสมาชิก"
              }
            />
          ))}

        {tab === "parties" &&
          (visibleParties.length ? (
            visibleParties.map((party: any) => (
              <div key={party.id} className="admin-party">
                <Row
                  inset={false}
                  title={party.name}
                  subtitle={`หัวหน้า ${party.owner_name || "-"} · ${party.members.length}/5 คน · ${party.status === "locked" ? "ล็อกแล้ว" : "เปิดรับ"}`}
                  trailing={
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        call({
                          action: "admin_party_dissolve",
                          partyId: party.id,
                          name: party.name,
                        })
                      }
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      ยุบปาร์ตี้
                    </button>
                  }
                />
                {party.members.length > 0 && (
                  <div className="admin-party__members">
                    {party.members.map((member: any) => (
                      <button
                        key={member.id}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          call({
                            action: "admin_party_remove_member",
                            partyId: party.id,
                            memberId: member.id,
                            name: member.name,
                            partyName: party.name,
                          })
                        }
                        className="admin-party__member"
                        aria-label={`นำ ${member.name} ออกจากปาร์ตี้`}
                      >
                        {member.name} <span aria-hidden="true">×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : data.adminParties.length ? (
            noMatch
          ) : (
            <EmptyState title="ไม่มีปาร์ตี้ที่กำลังใช้งาน" />
          ))}

        {tab === "points" &&
          (visibleLedger.length ? (
            visibleLedger.map((entry: any) => (
              <Row
                key={entry.source + entry.source_id}
                inset={false}
                title={`${entry.points > 0 ? "+" : ""}${entry.points} · ${entry.names}`}
                subtitle={`${entry.source === "adjustment" ? entry.note : sourceLabel(entry)} · ${bangkokDate(entry.created_at)}`}
                trailing={
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      call({
                        action: "points_undo",
                        source: entry.source,
                        sourceId: entry.source_id,
                        names: entry.names,
                      })
                    }
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    ยกเลิก
                  </button>
                }
              />
            ))
          ) : data.ledger.length ? (
            noMatch
          ) : (
            <EmptyState title="ยังไม่มีประวัติแต้ม" />
          ))}

        {tab === "leave" &&
          (visibleLeaves.length ? (
            visibleLeaves.map((leave: any) => (
              <Row
                key={leave.id}
                inset={false}
                title={`${leave.display_name} · ${leave.leave_date}`}
                subtitle={`${leave.reason} · บันทึกโดย ${leave.created_by_name}`}
                trailing={
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      call({
                        action: "leave_delete",
                        id: leave.id,
                        name: leave.display_name,
                        date: leave.leave_date,
                      })
                    }
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    ลบ
                  </button>
                }
              />
            ))
          ) : data.adminLeaves.length ? (
            noMatch
          ) : (
            <EmptyState title="ยังไม่มีรายการลา" hint="สมาชิกแจ้งลาได้จากหน้าห้องลา" />
          ))}

        {tab === "attendance" &&
          (visibleAttendance.length ? (
            visibleAttendance.map((r: any) => (
              <Row
                key={r.member.id}
                inset={false}
                title={r.member.display_name}
                subtitle={`${r.leave ? "ลา" : `ส่งแล้ว ${r.sent}/${ROUNDS.length} รอบ`} · ทีม ${r.teamPoints}/${data.team?.perDay ?? 9}${r.teamDebt > 0 ? ` · ค้าง ${r.teamDebt} แต้ม` : ""}`}
                trailing={
                  <span className="att-rounds" aria-label="สถานะแต่ละรอบ">
                    {ROUNDS.map((round, index) => (
                      <span key={round} className="att-rounds__item">
                        <Dot tone={roundTone(r.rounds[index]) as any} />
                        <span>{round.slice(0, 2)}</span>
                      </span>
                    ))}
                  </span>
                }
              />
            ))
          ) : attRows.length && normalizedQuery ? (
            noMatch
          ) : (
            <EmptyState
              title={
                attFilter === "missing"
                  ? "ทุกคนส่งครบหรือแจ้งลาแล้ว"
                  : attFilter === "done"
                    ? "ยังไม่มีใครส่งครบ 4 รอบ"
                    : attFilter === "team"
                      ? "ไม่มีใครค้างคะแนนทีม"
                      : shownAttDate === data.date
                        ? "ไม่มีใครลาวันนี้"
                        : "ไม่มีใครลาวันนั้น"
              }
            />
          ))}

        {tab === "admins" &&
          (!sam ? (
            <EmptyState
              title="บัญชีนี้ไม่มีสิทธิ์จัดการแอดมิน"
              hint="เฉพาะ Sam เท่านั้นที่เพิ่มหรือถอดสิทธิ์แอดมินได้"
            />
          ) : visibleAdmins.length ? (
            visibleAdmins.map((member: any) => (
              <Row
                key={member.id}
                inset={false}
                title={member.display_name}
                subtitle={
                  member.role === "admin" && !member.discord_linked
                    ? `${adminSubtitle(member)} · ยังไม่ผูก Discord (ถอดแอดมินชั่วคราว ให้เจ้าตัวเข้าด้วย Discord เลือกชื่อ แล้วเพิ่มกลับ)`
                    : adminSubtitle(member)
                }
                trailing={
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({
                          action: "admin_access",
                          memberId: member.id,
                          enabled: member.role !== "admin",
                        })
                      }
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      {member.role === "admin" ? "ถอดแอดมิน" : "เพิ่มเป็นแอดมิน"}
                    </button>
                  </>
                }
              />
            ))
          ) : (
            noMatch
          ))}
      </Panel>
      {review && (
        <ReviewDialog
          items={review.items}
          start={review.start}
          busy={busy}
          onAct={(item, action, reason) =>
            call({ action, type: item.type, id: item.id, reason, confirmed: true })
          }
          onClose={() => setReview(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title={`แก้ชื่อสมาชิก “${renaming.display_name}”`}
          initial={renaming.display_name}
          busy={busy}
          onCancel={() => setRenaming(null)}
          onSave={(next) => {
            const target = renaming;
            setRenaming(null);
            if (next !== target.display_name)
              call({ action: "member_update", id: target.id, name: next });
          }}
        />
      )}
    </>
  );
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("airdrop"),
    [round, setRound] = useState<Round>(ROUNDS[0]),
    [image, setImage] = useState<File | null>(null),
    [crew, setCrew] = useState<number[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [name, setName] = useState(""),
    [authNeeded, setAuthNeeded] = useState(false),
    [partyName, setPartyName] = useState(""),
    [loadedViews, setLoadedViews] = useState<string[]>([]),
    [pickerReset, setPickerReset] = useState(0),
    [claim, setClaim] = useState<any>(null),
    [discordLater, setDiscordLater] = useState(false),
    [confirmState, setConfirmState] = useState<{
      message: string;
      resolve: (ok: boolean) => void;
    } | null>(null);
  // Styled stand-in for window.confirm. Same await-a-boolean shape, so every
  // caller keeps its existing control flow. Only one dialog can be pending at
  // a time — setConfirmState would silently replace an earlier unresolved
  // one otherwise, stranding whichever caller was waiting on it forever.
  const confirmStateRef = useRef(confirmState);
  confirmStateRef.current = confirmState;
  const confirmAsync = (message: string) => {
    if (confirmStateRef.current) confirmStateRef.current.resolve(false);
    return new Promise<boolean>((resolve) => setConfirmState({ message, resolve }));
  };
  // `load` is passed straight to onClick and setInterval, so it has to stay
  // zero-argument — the current view rides along in a ref instead.
  const viewRef = useRef(view);
  // Only the newest load may write: a slow 60s poll that lands after an
  // upload's refresh would otherwise put the old data back.
  const loadSeq = useRef(0);
  const load = async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const r = await fetch(`/api/dashboard?view=${viewRef.current}`, {
          cache: "no-store",
        }),
        x: any = await r.json();
      if (seq !== loadSeq.current) return;
      if (r.status === 401) {
        setData(null);
        setLoadedViews([]);
        setAuthNeeded(true);
      } else if (x.error) setNotice(x.error);
      else {
        // Merge, don't replace: the response only carries the requested
        // view's extra keys, so this keeps other views' already-loaded data.
        setData((prev) => ({ ...EMPTY_DATA, ...(prev ?? {}), ...x }));
        setLoadedViews((prev) =>
          prev.includes(x.view) ? prev : [...prev, x.view],
        );
        setAuthNeeded(false);
      }
    } catch {
      if (seq === loadSeq.current) setNotice("เชื่อมต่อระบบไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };
  useEffect(() => {
    viewRef.current = view;
    load();
  }, [view]);
  useEffect(() => {
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const id = "loading-indicator";
    let el = document.getElementById(id);
    if (loading || busy) {
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.setAttribute("role", "status");
        Object.assign(el.style, {
          position: "fixed",
          left: "50%",
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          zIndex: "100",
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#18090c",
          border: "1px solid rgba(248,113,113,.5)",
          color: "#fee2e2",
          fontSize: "14px",
          boxShadow: "0 8px 24px rgba(0,0,0,.4)",
        });
        document.body.appendChild(el);
      }
      el.textContent = loading ? "กำลังโหลดข้อมูล…" : "กำลังบันทึกข้อมูล…";
    } else if (el) el.remove();
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [loading, busy]);
  const mine = useMemo(
    () =>
      new Map(
        data?.airdrops
          .filter((x: any) => x.activity_date === data.date)
          .map((x: any) => [x.round_time, x]) || [],
      ),
    [data],
  );
  // Open on the unsent round closest to the current Bangkok time, so the send
  // button is the next thing to do (at 00:50 that's 01:00, not 17:00). Only on
  // the first load: a later refresh — including the one that crosses midnight
  // — must never switch the round, which would also clear a chosen image.
  // Admins see the review queue in the browser tab title even when the app is
  // in a background tab; the 60s poll keeps it current.
  useEffect(() => {
    const n = data?.me.role === "admin" ? data.pendingCount || 0 : 0;
    document.title = n > 0
      ? `(${n}) 5K Fivethousand Command Center`
      : "5K Fivethousand Command Center";
  }, [data?.pendingCount, data?.me.role]);
  useEffect(() => {
    const message = new URLSearchParams(window.location.search).get("discord");
    if (message === null) return;
    setNotice(message === "unavailable" ? "ยังไม่ได้ตั้งค่าเข้าสู่ระบบด้วย Discord" : message || "เข้าสู่ระบบด้วย Discord แล้ว");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("fivek_discord_later")) setDiscordLater(true);
    } catch {}
  }, []);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("claim")) return;
    window.history.replaceState(null, "", window.location.pathname);
    fetch("/api/auth/discord", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim_options" }),
    })
      .then((r) => r.json())
      .then((x: any) => {
        if (x.error) setNotice(x.error);
        else if (x.ok) void load(); // already linked (another tab)
        else setClaim(x);
      })
      .catch(() => setNotice("เชื่อมต่อไม่สำเร็จ ลองเข้าสู่ระบบด้วย Discord อีกครั้ง"));
  }, []);
  const autoRoundDone = useRef(false);
  useEffect(() => {
    if (!data || autoRoundDone.current) return;
    autoRoundDone.current = true;
    const [h, m] = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date())
      .split(":")
      .map(Number);
    const now = h * 60 + m;
    const distance = (r: Round) => {
      const [rh, rm] = r.split(":").map(Number);
      const d = Math.abs(rh * 60 + rm - now);
      return Math.min(d, 1440 - d);
    };
    const byTime = [...ROUNDS].sort((a, b) => distance(a) - distance(b));
    const next =
      byTime.find((r) => !mine.get(r)) ||
      byTime.find((r) => mine.get(r)?.status !== "approved");
    if (next) setRound(next);
  }, [data, mine]);
  const confirmationMessage = (body: any) => {
    const action = body.action;
    const messages: Record<string, string> = {
      favorite: body.enabled
        ? "ยืนยันเพิ่มสมาชิกคนนี้เป็นรายการโปรดใช่หรือไม่?"
        : "ยืนยันนำสมาชิกคนนี้ออกจากรายการโปรดใช่หรือไม่?",
      approve: "ยืนยันอนุมัติหลักฐานนี้และเพิ่มคะแนนให้สมาชิกใช่หรือไม่?",
      reject: "ยืนยันว่าไม่ผ่านหลักฐานนี้ใช่หรือไม่? สมาชิกจะต้องส่งหลักฐานใหม่",
      member: `ยืนยันเพิ่มสมาชิกใหม่ชื่อ “${body.name}” ใช่หรือไม่?`,
      member_update: `ตรวจสอบชื่อก่อนบันทึก\n\nยืนยันเปลี่ยนชื่อเป็น “${body.name}” ใช่หรือไม่?`,
      member_delete: "ยืนยันเอาสมาชิกนี้ออกจากแก๊งใช่หรือไม่? สมาชิกจะออกจากระบบทันทีและจะไม่แสดงในรายชื่ออีก",
      member_discord_unlink: `ยืนยันยกเลิกผูก Discord ของ “${body.name}” ใช่หรือไม่?\n\nคนที่ใช้บัญชีนี้อยู่จะถูกออกจากระบบ แล้วเจ้าของตัวจริงเข้าด้วย Discord และเลือกชื่อนี้ใหม่ได้`,
      member_reactivate: `ยืนยันเอา “${body.name}” กลับเข้าแก๊งใช่หรือไม่? แต้มและประวัติเดิมจะกลับมาด้วย`,
      admin_party_dissolve: `ยืนยันยุบปาร์ตี้ “${body.name}” ใช่หรือไม่? สมาชิกทุกคนจะออกจากทีมทันที`,
      admin_party_remove_member: `ยืนยันนำ “${body.name}” ออกจากปาร์ตี้ “${body.partyName}” ใช่หรือไม่? ถ้าเป็นหัวหน้า ตำแหน่งจะส่งต่อให้สมาชิกคนถัดไป`,
      points_adjust: `ยืนยัน${Number(body.points) > 0 ? "เพิ่ม" : "หัก"} ${Math.abs(Number(body.points))} แต้ม ${Number(body.points) > 0 ? "ให้" : "จาก"} “${body.name}” ใช่หรือไม่?\n\nเหตุผล: ${body.reason}`,
      points_undo:
        body.source === "adjustment"
          ? `ยืนยันยกเลิกการปรับแต้มของ “${body.names}” ใช่หรือไม่?`
          : `ยืนยันยกเลิกการอนุมัตินี้ใช่หรือไม่?\n\nแต้มของ ${body.names} จะถูกดึงคืน และรายการจะเปลี่ยนเป็น “ไม่ผ่าน” (ย้อนกลับไปรอตรวจไม่ได้ เพราะรูปหลักฐานถูกลบไปแล้ว)`,
      leave_delete: `ยืนยันลบรายการลาของ “${body.name}” วันที่ ${body.date} ใช่หรือไม่?`,
      admin_access: body.enabled
        ? "ยืนยันเพิ่มสิทธิ์แอดมินให้สมาชิกนี้ใช่หรือไม่?"
        : "ยืนยันถอนสิทธิ์แอดมินของสมาชิกนี้ใช่หรือไม่?",
      party_create: `ยืนยันสร้างปาร์ตี้ “${body.name}” และเพิ่มสมาชิกที่เลือกเข้าทีมทันทีใช่หรือไม่?`,
      party_update: `ยืนยันเปลี่ยนชื่อปาร์ตี้เป็น “${body.name}” ใช่หรือไม่?`,
      party_lock: "ยืนยันล็อกปาร์ตี้ใช่หรือไม่? หลังล็อกจะไม่รับสมาชิกเพิ่ม",
      party_leave: "ยืนยันออกจากปาร์ตี้ใช่หรือไม่?",
      party_remove_member: "ยืนยันนำสมาชิกคนนี้ออกจากปาร์ตี้ใช่หรือไม่?",
      party_invite: "ยืนยันเพิ่มสมาชิกคนนี้เข้าปาร์ตี้ทันทีใช่หรือไม่?",
      party_join: "ยืนยันเข้าร่วมปาร์ตี้นี้ใช่หรือไม่?",
      party_respond: body.accept
        ? "ยืนยันรับคำเชิญและเข้าร่วมปาร์ตี้ใช่หรือไม่?"
        : "ยืนยันปฏิเสธคำเชิญปาร์ตี้ใช่หรือไม่?",
      party_dissolve: "ยืนยันยุบปาร์ตี้ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้",
      leave_request: "ยืนยันบันทึกการแจ้งลานี้ใช่หรือไม่?",
    };
    return messages[action] || "ยืนยันดำเนินการนี้ใช่หรือไม่?";
  };
  const call = async (body: any) => {
    if (!body.confirmed && !(await confirmAsync(confirmationMessage(body))))
      return false;
    const { confirmed: _confirmed, ...payload } = body;
    setBusy(true);
    try {
      const r = await fetch(
          payload.action.startsWith("party_") ? "/api/party" : "/api/dashboard",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          },
        ),
        x: any = await r.json();
      setNotice(x.error || x.notice || "บันทึกแล้ว");
      if (!x.error) {
        await load();
        return true;
      }
      return false;
    } catch {
      setNotice("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async (type: "airdrop" | "party", event: FormEvent) => {
    event.preventDefault();
    if (!image) return setNotice("กรุณาเลือกรูปหลักฐาน");
    if (
      !(await confirmAsync(
        type === "airdrop"
          ? `ยืนยันส่งหลักฐานแอร์ดรอปรอบ ${round} เข้าคิวตรวจใช่หรือไม่?`
          : "ยืนยันส่งหลักฐานกิจกรรมปาร์ตี้เข้าคิวตรวจใช่หรือไม่?",
      ))
    )
      return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("image", await shrinkImage(image));
      if (type === "airdrop") form.append("round", round);
      else form.append("memberIds", JSON.stringify(crew));
      const r = await fetch("/api/upload", { method: "POST", body: form }),
        x: any = await uploadResult(r);
      setNotice(x.error || "ส่งเข้าคิวตรวจแล้ว");
      if (!x.error) {
        setImage(null);
        setCrew([]);
        setPickerReset((value) => value + 1);
        await load();
      }
    } catch (error) {
      setNotice(
        error instanceof Error && error.name === "ImageError"
          ? error.message
          : "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    loadSeq.current++; // drop any load still in flight for this account
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    try {
      sessionStorage.removeItem("fivek_discord_later");
    } catch {}
    setData(null);
    setLoadedViews([]);
    setView("airdrop");
    viewRef.current = "airdrop";
    autoRoundDone.current = false;
    setDiscordLater(false);
    setNotice("");
    setLoading(false);
    setAuthNeeded(true);
  };
  if (claim)
    return (
      <ClaimScreen
        claim={claim}
        onCancel={() => setClaim(null)}
        onDone={() => {
          setClaim(null);
          setNotice("");
          void load();
        }}
      />
    );
  if (!data && authNeeded)
    return (
      <main className="grid min-h-screen place-items-center bg-[#0d0d0d] p-5 text-white">
        <section className="command-panel hud-login w-full max-w-md p-7 text-center">
          <div className="hud-login__ring">
            <img
              src="/5k-logo.png"
              alt="5K Fivethousand"
              className="mx-auto h-full w-full object-contain"
            />
          </div>
          <p className="label mt-4">ACCESS TERMINAL</p>
          <h1 className="mt-1 text-2xl font-black">เข้าสู่ระบบแก๊ง</h1>
          <p className="mt-3 text-sm text-[var(--ui-text-3)]">
            เข้าด้วยบัญชี Discord ของคุณ
            <br />
            ครั้งแรกจะให้เลือกชื่อของคุณในแก๊ง
          </p>
          <a href="/api/auth/discord" className="discord-btn mt-6">
            <DiscordMark />
            เข้าสู่ระบบด้วย Discord
          </a>
          {notice && <p className="mt-4 text-sm text-[var(--ui-text)]">{notice}</p>}
        </section>
      </main>
    );
  if (!data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#0d0d0d] p-5 text-white">
        <section className="command-panel max-w-md p-6 text-center">
          <p>{loading ? "กำลังเปิดศูนย์บัญชาการ…" : "ยังเปิดข้อมูลไม่ได้"}</p>
          {!loading && <><p className="mt-2 text-sm text-[var(--ui-text-3)]">{notice || "ลองเชื่อมต่ออีกครั้ง"}</p><button onClick={load} className="red-action mt-5">ลองใหม่</button></>}
        </section>
      </main>
    );
  const members = [...data.members].sort(
    (a, b) =>
      Number(Boolean(b.online)) - Number(Boolean(a.online)) ||
      Number(data.favorites.includes(b.id)) -
        Number(data.favorites.includes(a.id)) ||
      a.display_name.localeCompare(b.display_name),
  );
  const todayRounds = ROUNDS;
  const completedRounds = todayRounds.filter(
    (time) => mine.get(time)?.status === "approved",
  );
  const nextIncompleteRound = todayRounds.find(
    (time) => mine.get(time)?.status !== "approved",
  );
  const checkInComplete = completedRounds.length === todayRounds.length;
  const selectedAirdrop = mine.get(round);
  // Three daily destinations stay one tap away; everything occasional lives
  // under "เพิ่มเติม" so the phone bar never grows past four slots.
  const mainNav: [string, string, any][] = [
    ["airdrop", "ภารกิจ", Crosshair],
    ["party", "ทีม", Users],
    ["score", "อันดับ", Trophy],
  ];
  // จัดการแก๊ง is admin-only, so it shouldn't appear for everyone else — the
  // view itself already refuses non-admins.
  const moreNav: [string, string, any, string][] = (
    [
      ["leave", "ห้องลา", CalendarOff, "แจ้งลาและดูประวัติการลา"],
      ["mine", "แต้มของฉัน", BarChart3, "แต้มรายวัน แยกว่าได้จากอะไร โดนหักเท่าไหร่"],
      ["log", "ประวัติการส่ง", History, "หลักฐานที่ส่งทั้งหมดและผลตรวจ"],
      ["admin", "จัดการแก๊ง", ShieldCheck, "ตรวจหลักฐาน สมาชิก ปาร์ตี้ แต้ม"],
    ] as [string, string, any, string][]
  ).filter(([id]) => id !== "admin" || data.me.role === "admin");
  const inMore = view === "more" || moreNav.some(([id]) => id === view);
  const pendingCount = data.me.role === "admin" ? data.pendingCount || 0 : 0;
  const pendingBadge = pendingCount > 0 && (
    <span className="nav-badge" aria-label={`รอตรวจ ${pendingCount} รายการ`}>
      {pendingCount > 99 ? "99+" : pendingCount}
    </span>
  );
  return (
    <main className="ui-v2 command-shell min-h-screen bg-[#0d0d0d] text-white">
      <div className="command-grid fixed inset-0 pointer-events-none opacity-30" />
      <div className="command-desktop relative mx-auto max-w-[1600px] p-4 lg:p-7">
        {/* No fixed width: the grid tracks on .command-desktop own the column
            widths, and a hard w-* here overflows its track and covers the
            content column. */}
        <aside className="command-sidebar hidden lg:block">
          <div className="side-brand">
            <img
              src="/5k-logo.png"
              alt="5K Fivethousand"
              className="h-28 w-full object-contain"
            />
            <div>
              <p>FIVETHOUSAND</p>
              <b>COMMAND MODE</b>
            </div>
          </div>
          <nav className="mt-7 space-y-2">
            {mainNav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className="hud-clip-sm side-nav__item"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
            <hr className="side-nav__divider" aria-hidden="true" />
            {moreNav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className="hud-clip-sm side-nav__item"
              >
                <Icon className="h-4 w-4" />
                {label}
                {id === "admin" && pendingBadge}
              </button>
            ))}
            {!data.me.discordLinked && (
              <a href="/api/auth/discord?mode=link" className="hud-clip-sm side-nav__item">
                <DiscordMark />
                เชื่อม Discord
              </a>
            )}
          </nav>
          {/* Pinned to the bottom of the rail, apart from the destinations. */}
          <div className="side-foot">
            <button onClick={logout} className="side-nav__item side-nav__item--quiet">
              <LogOut className="h-4 w-4" />
              ออกจากระบบ
            </button>
          </div>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="topbar">
            <img
              src="/5k-logo.png"
              alt="5K"
              className="topbar__logo lg:hidden"
            />
            <div className="min-w-0 flex-1">
              <div className="topbar__meta">5K // COMMAND</div>
              <div className="topbar__name name-with-avatar">
                <Avatar url={data.avatars?.[String(data.me.id)]} name={data.me.name} size={22} />
                {data.me.name}
              </div>
            </div>
            <div className="topbar__score">
              <b>{data.me.monthScore}</b>
              <span>แต้มเดือนนี้</span>
            </div>
            <button
              onClick={load}
              aria-label="รีเฟรชข้อมูล"
              className="topbar__icon"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </header>
          {!data.me.discordLinked && !discordLater && (
            <div className="link-discord">
              <span className="link-discord__icon">
                <DiscordMark />
              </span>
              <div className="min-w-0 flex-1">
                <p className="link-discord__title">ผูกบัญชี Discord ของคุณ</p>
                <p className="link-discord__sub">
                  เว็บเข้าด้วย Discord อย่างเดียวแล้ว · ถ้าไม่ผูก ออกจากระบบแล้วจะเข้าบัญชีนี้ไม่ได้ และส่งหลักฐาน/แจ้งลาไม่ได้
                </p>
              </div>
              <div className="link-discord__actions">
                <a href="/api/auth/discord?mode=link" className="discord-btn discord-btn--sm">
                  ผูกเลย
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setDiscordLater(true);
                    try {
                      sessionStorage.setItem("fivek_discord_later", "1");
                    } catch {}
                  }}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  ไว้ทีหลัง
                </button>
              </div>
            </div>
          )}
          {view === "airdrop" && (
            <MissionCard
              data={data}
              round={round}
              setRound={setRound}
              mine={mine}
              busy={busy}
              image={image}
              setImage={setImage}
              pickerReset={pickerReset}
              onSubmit={(e) => send("airdrop", e)}
            />
          )}
          {view === "airdrop" && (
            <div className="home-stats">
              <button
                type="button"
                onClick={() => setView("party")}
                className="hud-tile hud-tile--wide"
              >
                <span className="ui-eyebrow">คะแนนทีมวันนี้</span>
                {data.team?.mine ? (
                  <>
                    <b className="hud-tile__value">
                      {data.team.mine.today}/{data.team.perDay}
                    </b>
                    <span className="hud-tile__sub">
                      {data.team.mine.neededToday > 0
                        ? `ต้องได้อีก ${data.team.mine.neededToday} คะแนนก่อนจบวัน · งัดร้าน +${data.team.points.shop} ลูป +${data.team.points.loop}`
                        : data.team.mine.bank > 0
                          ? `ครบแล้ว · เกินเก็บไว้ ${data.team.mine.bank} คะแนน`
                          : "ครบแล้ววันนี้"}
                    </span>
                    {data.team.mine.debt > 0 && (
                      <span className="hud-tile__warn">
                        ค้าง {data.team.mine.debt} คะแนน · ถูกหัก {data.team.mine.debt * data.team.penalty} แต้ม (ทำชดแล้วได้คืน)
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <b className="hud-tile__value hud-tile__value--text">
                      ขั้นต่ำวันละ {data.team?.perDay ?? 9} คะแนน
                    </b>
                    <span className="hud-tile__sub">
                      {data.team && data.date < data.team.start
                        ? `เริ่ม ${Number(data.team.start.slice(8))}/${Number(data.team.start.slice(5, 7))} · งัดร้าน +${data.team.points.shop} ลูป +${data.team.points.loop} แอร์ดรอป +${data.team.points.airdrop} · ขาดแต้มละ ${data.team.penalty}`
                        : `งัดร้าน +${data.team?.points.shop ?? 3} · ลูป +${data.team?.points.loop ?? 1}`}
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setView("score")}
                className="hud-tile"
              >
                <span className="ui-eyebrow">อันดับเดือนนี้</span>
                <b className="hud-tile__value">
                  {data.me.monthRank ? `#${data.me.monthRank}` : "—"}
                </b>
                <span className="hud-tile__sub">
                  {data.me.monthRank
                    ? `${data.me.monthScore} แต้ม`
                    : "ยังไม่มีแต้มเดือนนี้"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setView("party")}
                className="hud-tile"
              >
                <span className="ui-eyebrow">ทีมของคุณ</span>
                <b className="hud-tile__value hud-tile__value--text">
                  {data.myParty?.name || "ยังไม่มีทีม"}
                </b>
                <span className="hud-tile__sub">
                  {data.myParty
                    ? `${data.myParty.members?.length || 0}/5 คน`
                    : "สร้างหรือเข้าร่วมทีม"}
                </span>
              </button>
            </div>
          )}
          {view === "more" && (
            <Panel label="MENU" title="เพิ่มเติม" flush>
              {moreNav.map(([id, label, Icon, hint]) => (
                <Row
                  key={id}
                  inset={false}
                  onClick={() => setView(id)}
                  leading={
                    <span className="more-icon">
                      <Icon className="h-5 w-5" />
                    </span>
                  }
                  title={label}
                  subtitle={hint}
                  trailing={
                    <>
                      {id === "admin" && pendingBadge}
                      <ChevronRight className="h-4 w-4 text-[var(--ui-text-3)]" />
                    </>
                  }
                />
              ))}
              {!data.me.discordLinked && (
                <Row
                  inset={false}
                  href="/api/auth/discord?mode=link"
                  leading={
                    <span className="more-icon">
                      <DiscordMark />
                    </span>
                  }
                  title="เชื่อม Discord"
                  subtitle="ต้องผูกก่อน ไม่งั้นออกจากระบบแล้วจะเข้าบัญชีนี้ไม่ได้"
                  trailing={<ChevronRight className="h-4 w-4 text-[var(--ui-text-3)]" />}
                />
              )}
              <Row
                inset={false}
                onClick={logout}
                leading={
                  <span className="more-icon">
                    <LogOut className="h-5 w-5" />
                  </span>
                }
                title="ออกจากระบบ"
                subtitle={`เข้าสู่ระบบในชื่อ ${data.me.name}`}
              />
            </Panel>
          )}
          {notice && (
            <div className="mb-5 flex items-center justify-between rounded-lg border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {view === "airdrop" && (
            <Panel label="AIRDROP LOG" title="ประวัติแอร์ดรอปของคุณ" flush>
              {data.airdrops.length ? (
                data.airdrops.map((x: any) => (
                  <Row
                    key={x.id}
                    inset={false}
                    // Approved evidence is deleted from storage to save
                    // space, so there's nothing left to link to.
                    href={
                      x.status !== "approved" && x.image_key
                        ? `/api/image/${x.image_key}`
                        : undefined
                    }
                    leading={
                      <Dot
                        tone={
                          x.status === "approved"
                            ? "green"
                            : x.status === "rejected"
                              ? "red"
                              : "amber"
                        }
                      />
                    }
                    title={`${x.activity_date} · รอบ ${x.round_time}`}
                    subtitle={
                      x.status === "rejected" && x.reject_reason
                        ? `ไม่ผ่าน: ${x.reject_reason}`
                        : new Date(x.created_at).toLocaleString("th-TH")
                    }
                    trailing={<Status value={x.status} />}
                  />
                ))
              ) : (
                <EmptyState
                  title="ยังไม่มีประวัติแอร์ดรอป"
                  hint="ส่งหลักฐานรอบแรกจากการ์ดภารกิจด้านบน"
                />
              )}
            </Panel>
          )}
          {view === "party" &&
            (!loadedViews.includes("party") ? (
              <ViewLoading />
            ) : (
            <PartyCommandCenter
              data={data}
              members={members}
              call={call}
              busy={busy}
              onSubmit={async (ids, file, shopName, kind) => {
                if (
                  !(await confirmAsync(
                    `ยืนยันส่งหลักฐาน${kind === "loop" ? "ลูป" : "งัดร้าน"}ให้สมาชิก ${ids.length} คนเข้าคิวตรวจใช่หรือไม่?`,
                  ))
                )
                  return false;
                setBusy(true);
                try {
                  const form = new FormData();
                  form.append("type", "party");
                  form.append("image", await shrinkImage(file));
                  form.append("memberIds", JSON.stringify(ids));
                  form.append("kind", kind);
                  if (shopName) form.append("shopName", shopName);
                  const r = await fetch("/api/upload", {
                      method: "POST",
                      body: form,
                    }),
                    x: any = await uploadResult(r);
                  setNotice(x.error || "ส่งเข้าคิวตรวจแล้ว");
                  if (x.error) return false;
                  await load();
                  return true;
                } catch (error) {
                  setNotice(
                    error instanceof Error && error.name === "ImageError"
                      ? error.message
                      : "ส่งหลักฐานกิจกรรมไม่สำเร็จ ลองใหม่อีกครั้ง",
                  );
                  return false;
                } finally {
                  setBusy(false);
                }
              }}
            />
            ))}
          {view === "score" &&
            // Without this the monthly tab briefly (or, if the request fails,
            // permanently) showed all-time scores under a monthly title.
            (!loadedViews.includes("score") ? (
              <ViewLoading />
            ) : (
              <SquadRanking
                leaderboard={data.leaderboard}
                boards={data.boards}
                monthBoards={data.monthBoards}
                highlightId={data.me.id}
                avatars={data.avatars}
              />
            ))}
          {view === "admin" &&
            (data.me.role !== "admin" ? (
              <Panel>
                <EmptyState title="หน้านี้สำหรับแอดมินเท่านั้น" />
              </Panel>
            ) : !loadedViews.includes("admin") ? (
              <ViewLoading />
            ) : (
              <AdminCommandCenter data={data} call={call} busy={busy} />
            ))}
          {view === "leave" &&
            (!loadedViews.includes("leave") ? (
              <ViewLoading />
            ) : (
              <LeaveRoom data={data} call={call} busy={busy} />
            ))}
          {view === "mine" &&
            (!loadedViews.includes("mine") ? (
              <ViewLoading />
            ) : (
              <MyPoints data={data} />
            ))}
          {view === "log" &&
            (!loadedViews.includes("log") ? (
              <ViewLoading />
            ) : (
              <SubmissionLog data={data} />
            ))}
        </section>
        <aside className="command-rail hidden xl:block space-y-5">
          <Panel
            label="SQUAD STATUS"
            title="สถานะแก๊ง"
            subtitle={`${data.members.filter((m: any) => m.online).length}/${data.members.length} คนออนไลน์`}
            flush
          >
            <div className="rail-scroll">
              {members.map((member: any) => (
                <Row
                  key={member.id}
                  inset={false}
                  leading={
                    <span className="avatar-status">
                      <Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={28} />
                      <Dot tone={member.online ? "green" : "idle"} />
                    </span>
                  }
                  title={member.display_name}
                  trailing={
                    <span className="text-xs text-[var(--ui-text-3)]">
                      {member.online ? "ออนไลน์" : "ออฟไลน์"}
                    </span>
                  }
                />
              ))}
            </div>
          </Panel>
          <SquadRanking leaderboard={data.monthTop} avatars={data.avatars} compact />
        </aside>
      </div>
      <nav className="bottom-nav lg:hidden" aria-label="เมนูหลัก">
        {[...mainNav, ["more", "เพิ่มเติม", LayoutGrid] as [string, string, any]].map(
          ([id, label, Icon]: any) => {
            const active = id === "more" ? inMore : view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={active ? "page" : undefined}
                className={`bottom-nav__item ${active ? "is-active" : ""}`}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
                {id === "more" && pendingBadge}
              </button>
            );
          },
        )}
      </nav>
      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          busy={busy}
          onResolve={(ok) => {
            confirmState.resolve(ok);
            setConfirmState(null);
          }}
        />
      )}
    </main>
  );
}
