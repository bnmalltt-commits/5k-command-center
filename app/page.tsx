"use client";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarOff,
  Check,
  Crosshair,
  History,
  LogOut,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { PartyCommandCenter } from "./party-command-center";
import { Picker } from "./picker";

type Round = "17:00" | "20:00" | "23:00" | "01:00";
const ROUNDS: Round[] = ["17:00", "20:00", "23:00", "01:00"];
type Data = {
  me: { id: number; name: string; role: string; score: number };
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
    <section className="command-panel p-6 text-center text-slate-400">
      กำลังโหลดข้อมูล…
    </section>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${value === "approved" ? "bg-emerald-500/15 text-emerald-300" : value === "rejected" ? "bg-red-500/15 text-red-300" : "bg-amber-400/15 text-amber-200"}`}
    >
      {labels[value] || value}
    </span>
  );
}

function MissionControl({
  data,
  onOpenAirdrop,
  onOpenParty,
}: {
  data: Data;
  onOpenAirdrop: (round: Round) => void;
  onOpenParty: () => void;
}) {
  const entries = new Map(
    data.airdrops
      .filter((entry: any) => entry.activity_date === data.date)
      .map((entry: any) => [entry.round_time, entry]),
  );
  const rounds = ROUNDS;
  const approved = rounds.filter(
    (round) => entries.get(round)?.status === "approved",
  ).length;
  const rejected = rounds.find(
    (round) => entries.get(round)?.status === "rejected",
  );
  const missing = rounds.find((round) => !entries.get(round));
  const pending = rounds.find(
    (round) => entries.get(round)?.status === "pending",
  );
  const nextRound = rejected || missing || pending || rounds[0];
  const done = approved === rounds.length;
  const title = done
    ? "ภารกิจแอร์ดรอปวันนี้ครบแล้ว"
    : rejected
      ? `ส่งหลักฐานรอบ ${rejected} ใหม่`
      : missing
        ? `เช็กอินแอร์ดรอปรอบ ${missing}`
        : `รอตรวจหลักฐานรอบ ${pending}`;
  const detail = done
    ? "ไปสร้างหรือเข้าปาร์ตี้ต่อเพื่อเก็บคะแนนทีมเพิ่ม"
    : rejected
      ? "หลักฐานเดิมไม่ผ่านการตรวจ เลือกรูปใหม่แล้วส่งได้ทันที"
      : missing
        ? "เลือกเวลา วางรูปหลักฐาน แล้วส่งเข้าคิวตรวจ"
        : "หลักฐานถูกส่งแล้ว ระบบกำลังรอแอดมินตรวจสอบ";
  const roundState = (round: Round) => {
    const status = entries.get(round)?.status;
    return status === "approved"
      ? "ผ่านแล้ว"
      : status === "pending"
        ? "รอตรวจ"
        : status === "rejected"
          ? "ส่งใหม่"
          : "พร้อมเช็กอิน";
  };

  return (
    <section className={`hud-hero ${done ? "hud-hero--complete" : ""}`}>
      <p className="hud-hero__eyebrow">
        {done ? "ภารกิจวันนี้ครบแล้ว" : `ภารกิจถัดไป · รอบ ${nextRound}`}
      </p>
      <div className="hud-hero__main">
        <div className="hud-hero__clock-wrap">
          <span className="hud-hero__clock-glow" aria-hidden="true" />
          <span className="hud-hero__clock">
            {done ? <Check className="hud-hero__clock-icon" /> : nextRound}
          </span>
        </div>
        <div className="hud-hero__body">
          <h3 className="hud-hero__title">{title}</h3>
          <p className="hud-hero__desc">{detail}</p>
          <button
            type="button"
            onClick={() => (done ? onOpenParty() : onOpenAirdrop(nextRound))}
            className="hud-hero__cta"
          >
            {done ? "ไปที่ปาร์ตี้" : pending && !missing && !rejected ? "ดูสถานะ" : "เริ่มภารกิจ"}
          </button>
        </div>
      </div>
      <div className="hud-hero__bar" aria-hidden="true">
        {rounds.map((round) => {
          const status = entries.get(round)?.status;
          const cls =
            status === "approved"
              ? "is-done"
              : status === "rejected"
                ? "is-rejected"
                : nextRound === round
                  ? "is-next"
                  : "is-upcoming";
          return <span key={round} className={`hud-hero__bar-seg ${cls}`} />;
        })}
      </div>
      <div className="hud-hero__labels" aria-label="เลือกเวลาเช็กอิน">
        {rounds.map((round) => {
          const status = entries.get(round)?.status;
          const isDone = status === "approved";
          const isNext = nextRound === round;
          const isRejected = status === "rejected";
          return (
            <button
              type="button"
              key={round}
              onClick={() => onOpenAirdrop(round)}
              className={`hud-hero__label-btn ${isNext ? "is-next" : ""} ${isDone ? "is-done" : ""} ${isRejected ? "is-rejected" : ""}`}
            >
              <span className="hud-hero__label-glyph" aria-hidden="true">
                {isDone ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="hud-hero__label-time">{round}</span>
              <span className="hud-hero__label-state">{roundState(round)}</span>
            </button>
          );
        })}
      </div>
      <div className="hud-hero__metrics" aria-label="สถานะกิจกรรมวันนี้">
        <span><b>{approved}/{rounds.length}</b><small>CHECK-IN</small></span>
        <span><b>{data.myParty ? "ON" : "—"}</b><small>PARTY</small></span>
      </div>
    </section>
  );
}
function PartyEditDialog({
  name,
  busy,
  onClose,
  onSave,
}: {
  name: string;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="แก้ไขชื่อปาร์ตี้"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
        className="command-panel w-full max-w-md p-5"
      >
        <p className="label">PARTY CONTROL // EDIT</p>
        <h2 className="mt-2 text-xl font-black">แก้ไขชื่อปาร์ตี้</h2>
        <input
          autoFocus
          required
          minLength={2}
          maxLength={40}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-5 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-3"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm"
          >
            ยกเลิก
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold"
          >
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
function SquadRanking({
  leaderboard,
  compact = false,
  highlightId,
}: {
  leaderboard: any[];
  compact?: boolean;
  highlightId?: number;
}) {
  const rows = compact ? leaderboard.slice(0, 5) : leaderboard,
    myRank = highlightId
      ? leaderboard.findIndex((member: any) => member.id === highlightId) + 1
      : 0,
    maxScore = Math.max(Number(rows[0]?.score || 0), 1);
  return (
    <section
      className={`command-panel ranking-panel ${compact ? "ranking-panel--compact" : ""}`}
    >
      <div className="ranking-panel__header">
        <div>
          <p className="label">SQUAD RANKING</p>
          <h2 className="mt-2 text-xl font-black">
            ตารางคะแนน{compact ? "" : "ทั้งหมด"}
          </h2>
        </div>
        <div className="ranking-panel__tools">
          {!compact && <span className="ranking-filter">{rows.length} คน</span>}
          <Trophy className="h-5 w-5 text-red-400" />
        </div>
      </div>
      {!compact && rows.length >= 3 && (
        <div className="ranking-podium" aria-hidden="true">
          {[rows[1], rows[0], rows[2]].map((member: any, i: number) => {
            const slot = [2, 1, 3][i];
            return (
              <div key={member.id} className={`ranking-podium__slot ranking-podium__slot--${slot}`}>
                <div className="ranking-podium__badge"><span>{slot}</span></div>
                <div className="ranking-podium__bar" />
                <div className="ranking-podium__name">{member.display_name}</div>
                <div className="ranking-podium__pt">{Number(member.score || 0)} pt</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="ranking-list">
        {rows.map((member: any, index: number) => {
          const score = Number(member.score || 0),
            progress = Math.max(8, Math.round((score / maxScore) * 100));
          return (
            <div
              key={member.id}
              className={`ranking-row ${index === 0 ? "ranking-row--leader" : ""} ${member.id === highlightId ? "ranking-row--mine" : ""}`}
            >
              <span className={`rank-badge rank-badge--${index + 1}`}>
                {index + 1}
              </span>
              <span
                className={`status-dot ranking-status ${!member.online ? "status-dot-offline" : ""}`}
              />
              <div className="ranking-row__main">
                <div className="ranking-row__top">
                  <span className="ranking-name">{member.display_name}</span>
                  <span className="ranking-score">
                    <strong>{score}</strong>
                    <small>PTS</small>
                  </span>
                </div>
                <span className="ranking-progress">
                  <span style={{ width: `${progress}%` }} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && myRank > 0 && (
        <p className="ranking-position">
          อันดับของคุณ <b>#{myRank}</b> จาก {leaderboard.length} คน
        </p>
      )}
      <div className="ranking-footer">
        <span />
        {compact ? "MORE PLAYERS" : "ALL SQUAD MEMBERS"} <b>//</b> HIGHER
        MOMENTS
        <span />
      </div>
    </section>
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
  return (
    <section className="command-panel p-5">
      <p className="label">LEAVE ROOM // {data.date}</p>
      <h2 className="mt-2 text-xl font-black">แจ้งลา</h2>
      <p className="mt-2 text-sm text-slate-400">
        สมาชิกแจ้งลาได้ด้วยตัวเอง และแอดมินสามารถบันทึกการลาแทนสมาชิกได้
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        {isAdmin && (
          <select
            value={memberId}
            onChange={(e) => setMemberId(Number(e.target.value))}
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
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
          className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
        />
        <div className="flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลการลา"
            required
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2"
          />
          <button
            disabled={busy}
            className="hud-clip-sm bg-red-600 px-4 font-bold disabled:opacity-40"
          >
            แจ้งลา
          </button>
        </div>
      </form>
      <div className="mt-6">
        <p className="label">ประวัติการลา</p>
        <div className="mt-3 space-y-2">
          {data.leaveRequests.length ? (
            data.leaveRequests.map((item: any) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <div>
                  <b>{item.display_name}</b>
                  <p className="text-xs text-slate-500">
                    {item.leave_date} · {item.reason}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  บันทึกโดย {item.created_by_name}
                </span>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-500">
              ยังไม่มีรายการลา
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
function SubmissionLog({ data }: { data: Data }) {
  return (
    <section className="command-panel p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="label">SUBMISSION LOG</p>
          <h2 className="mt-2 text-xl font-black">ประวัติการส่งทั้งหมด</h2>
        </div>
        <span className="text-sm text-slate-500">
          {data.submissionLog.length} รายการ
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {data.submissionLog.map((item: any) => (
          <div
            key={item.type + item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 p-3"
          >
            <div>
              <b>
                {item.type === "party" ? "ปาร์ตี้" : "แอร์ดรอป"} · {item.detail}
              </b>
              <p className="text-xs text-slate-500">
                {item.activity_date} · ส่งโดย {item.submitted_by}
                {item.approved_by ? ` · ตรวจโดย ${item.approved_by}` : " · ยังไม่ตรวจ"}
              </p>
            </div>
            <Status value={item.status} />
          </div>
        ))}
      </div>
    </section>
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
  const [tab, setTab] = useState<"verify" | "members" | "admins">("verify");
  const [query, setQuery] = useState("");
  const [memberName, setMemberName] = useState("");
  const sam = data.me.name === "Sam";
  const normalizedQuery = query.trim().toLowerCase();
  const activeMembers = data.managedMembers.filter(
    (member: any) => member.active,
  );
  // Removed members drop out of the roster entirely instead of lingering as
  // a disabled row — the action reads "เอาออก" (remove), so the list should
  // behave like they're actually gone.
  const visibleMembers = activeMembers.filter((member: any) => {
    if (!normalizedQuery) return true;
    return member.display_name
      .toLowerCase()
      .split(/\s+/)
      .some((part: string) => part.startsWith(normalizedQuery));
  });

  return (
    <section className="command-panel admin-command-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">SQUAD COMMAND</p>
          <h2 className="mt-2 text-xl font-black">จัดการแก๊ง</h2>
          <p className="mt-2 text-sm text-slate-400">
            จัดการคิวตรวจ สมาชิก และสิทธิ์แอดมินจากพื้นที่เดียว
          </p>
        </div>
        <span className="rounded-full border border-white/15 bg-black/20 px-3 py-1 text-xs font-bold text-slate-300">
          {activeMembers.length} สมาชิกใช้งาน
        </span>
      </div>
      <div
        className="admin-command-tabs mt-5"
        role="tablist"
        aria-label="จัดการแก๊ง"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "verify"}
          onClick={() => setTab("verify")}
          className={tab === "verify" ? "is-active" : ""}
        >
          รอตรวจ <span>{data.pending.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "members"}
          onClick={() => setTab("members")}
          className={tab === "members" ? "is-active" : ""}
        >
          สมาชิก <span>{activeMembers.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "admins"}
          onClick={() => setTab("admins")}
          className={tab === "admins" ? "is-active" : ""}
        >
          แอดมิน{" "}
          <span>
            {
              activeMembers.filter((member: any) => member.role === "admin")
                .length
            }
          </span>
        </button>
      </div>

      {tab === "verify" && (
        <div className="admin-command-content mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="label">VERIFY QUEUE</p>
              <h3 className="mt-1 text-lg font-black">รายการรอตรวจ</h3>
            </div>
            <span className="text-sm text-amber-200">
              {data.pending.length} รายการ
            </span>
          </div>
          <div className="admin-command-list mt-4">
            {data.pending.length ? (
              data.pending.map((item: any) => (
                <div key={item.type + item.id} className="admin-command-row">
                  <div className="min-w-0 flex-1">
                    <b>
                      {item.type === "party" ? "ปาร์ตี้" : "แอร์ดรอป"} #
                      {item.id}
                    </b>
                    <p>
                      {item.detail}
                      {item.submitted_by
                        ? ` · ส่งโดย ${item.submitted_by}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={`/api/image/${item.image_key}`}
                      target="_blank"
                      className="evidence-link"
                    >
                      <img
                        src={`/api/image/${item.image_key}`}
                        alt="ตัวอย่างหลักฐาน"
                        loading="lazy"
                      />
                      ดูรูป
                    </a>
                    <button
                      disabled={busy}
                      aria-label="อนุมัติ"
                      onClick={() =>
                        call({
                          action: "approve",
                          type: item.type,
                          id: item.id,
                        })
                      }
                      className="approval-action"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({ action: "reject", type: item.type, id: item.id })
                      }
                      className="reject-action"
                    >
                      ไม่ผ่าน
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-command-empty">
                ไม่มีรายการรอตรวจในตอนนี้
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="admin-command-content mt-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">MEMBER DIRECTORY</p>
              <h3 className="mt-1 text-lg font-black">สมาชิกแก๊ง</h3>
            </div>
            <label className="admin-member-search">
              <span className="sr-only">ค้นหาสมาชิก</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาสมาชิก"
              />
            </label>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (memberName.trim()) {
                void call({ action: "member", name: memberName.trim() }).then(
                  (saved) => {
                    if (saved) setMemberName("");
                  },
                );
              }
            }}
            className="admin-member-add mt-4"
          >
            <input
              required
              minLength={2}
              maxLength={60}
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="ชื่อสมาชิกใหม่"
            />
            <button disabled={busy}>เพิ่มสมาชิก</button>
          </form>
          <div className="admin-command-list mt-4">
            {visibleMembers.length ? (
              visibleMembers.map((member: any) => (
                <div key={member.id} className="admin-command-row">
                  <div className="min-w-0 flex-1">
                    <b>{member.display_name}</b>
                    <p>{member.role === "admin" ? "แอดมิน" : "สมาชิก"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const next = window.prompt(
                          "แก้ชื่อสมาชิก",
                          member.display_name,
                        );
                        const nextName = next?.trim();
                        if (nextName && nextName !== member.display_name)
                          call({
                            action: "member_update",
                            id: member.id,
                            name: nextName,
                          });
                      }}
                      className="member-edit-action"
                    >
                      แก้ชื่อ
                    </button>
                    {member.id !== data.me.id && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => call({ action: "member_delete", id: member.id })}
                        className="reject-action"
                      >
                        เอาออก
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-command-empty">ไม่พบสมาชิกที่ค้นหา</div>
            )}
          </div>
        </div>
      )}

      {tab === "admins" && (
        <div className="admin-command-content mt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label">ADMIN ACCESS</p>
              <h3 className="mt-1 text-lg font-black">จัดการแอดมิน</h3>
              <p className="mt-1 text-sm text-slate-400">
                เฉพาะ Sam เท่านั้นที่เพิ่มหรือถอดสิทธิ์แอดมินได้
              </p>
            </div>
            <span className="rounded-full border border-red-400/30 bg-red-950/30 px-3 py-1 text-xs font-bold text-red-200">
              SAM ONLY
            </span>
          </div>
          {sam ? (
            <div className="admin-command-list mt-4">
              {activeMembers
                .filter((member: any) => member.id !== data.me.id)
                .map((member: any) => (
                  <div key={member.id} className="admin-command-row">
                    <div className="min-w-0 flex-1">
                      <b>{member.display_name}</b>
                      <p>{member.role === "admin" ? "แอดมิน" : "สมาชิก"}</p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({
                          action: "admin_access",
                          memberId: member.id,
                          enabled: member.role !== "admin",
                        })
                      }
                      className={
                        member.role === "admin"
                          ? "member-edit-action"
                          : "admin-promote-action"
                      }
                    >
                      {member.role === "admin"
                        ? "ถอดแอดมิน"
                        : "เพิ่มเป็นแอดมิน"}
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div className="admin-command-empty mt-4">
              บัญชีนี้ไม่มีสิทธิ์จัดการแอดมิน
            </div>
          )}
        </div>
      )}
    </section>
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
    [loginName, setLoginName] = useState(""),
    [loginPin, setLoginPin] = useState(""),
    [partyName, setPartyName] = useState(""),
    [loadedViews, setLoadedViews] = useState<string[]>([]),
    [pickerReset, setPickerReset] = useState(0);
  // `load` is passed straight to onClick and setInterval, so it has to stay
  // zero-argument — the current view rides along in a ref instead.
  const viewRef = useRef(view);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/dashboard?view=${viewRef.current}`, {
          cache: "no-store",
        }),
        x: any = await r.json();
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
      setNotice("เชื่อมต่อระบบไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      setLoading(false);
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
          right: "20px",
          bottom: "20px",
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
    if (!body.confirmed && !window.confirm(confirmationMessage(body))) return false;
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
      setNotice(x.error || "บันทึกแล้ว");
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
      !window.confirm(
        type === "airdrop"
          ? `ยืนยันส่งหลักฐานแอร์ดรอปรอบ ${round} เข้าคิวตรวจใช่หรือไม่?`
          : "ยืนยันส่งหลักฐานกิจกรรมปาร์ตี้เข้าคิวตรวจใช่หรือไม่?",
      )
    )
      return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("type", type);
      form.append("image", image);
      if (type === "airdrop") form.append("round", round);
      else form.append("memberIds", JSON.stringify(crew));
      const r = await fetch("/api/upload", { method: "POST", body: form }),
        x: any = await r.json();
      setNotice(x.error || "ส่งเข้าคิวตรวจแล้ว");
      if (!x.error) {
        setImage(null);
        setCrew([]);
        setPickerReset((value) => value + 1);
        await load();
      }
    } catch {
      setNotice("ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setData(null);
    setAuthNeeded(true);
    setLoginName("");
  };
  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: loginName, pin: loginPin }),
        }),
        x: any = await r.json();
      if (x.error) setNotice(x.error);
      else {
        if (x.loginId)
          setNotice(`สร้างบัญชีแอดมินแล้ว รหัสสมาชิกของคุณคือ ${x.loginId}`);
        await load();
      }
    } catch {
      setNotice("เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  if (!data && authNeeded)
    return (
      <main className="grid min-h-screen place-items-center bg-[#07080b] p-5 text-white">
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
          <p className="mt-3 text-sm text-slate-400">
            พิมพ์ชื่อและตั้งรหัสสมาชิก 6 หลัก · ชื่อใหม่จะสมัครเป็นสมาชิกให้อัตโนมัติ
            <br />
            แอดมินใช้รหัสสมาชิกของตัวเอง
          </p>
          <form onSubmit={login} className="mt-6 space-y-3">
            <input
              required
              minLength={2}
              maxLength={120}
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              placeholder="ชื่อสำหรับเข้าแก๊ง หรือรหัสแอดมิน"
              className="hud-clip w-full border border-white/15 bg-black/30 px-4 py-3"
            />
            <input required inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={loginPin} onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="รหัสสมาชิก 6 หลัก" className="hud-clip w-full border border-white/15 bg-black/30 px-4 py-3 text-center tracking-[0.35em]" />
            <button
              disabled={busy}
              className="red-action hud-clip w-full disabled:opacity-40"
            >
              เข้าสู่ระบบ
            </button>
          </form>
          {notice && <p className="mt-4 text-sm text-red-300">{notice}</p>}
        </section>
      </main>
    );
  if (!data)
    return (
      <main className="grid min-h-screen place-items-center bg-[#07080b] p-5 text-white">
        <section className="command-panel max-w-md p-6 text-center">
          <p>{loading ? "กำลังเปิดศูนย์บัญชาการ…" : "ยังเปิดข้อมูลไม่ได้"}</p>
          {!loading && <><p className="mt-2 text-sm text-slate-400">{notice || "ลองเชื่อมต่ออีกครั้ง"}</p><button onClick={load} className="red-action mt-5">ลองใหม่</button></>}
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
  const nav: [string, string, any][] = [
    ["airdrop", "แอร์ดรอป", Crosshair],
    ["party", "ปาร์ตี้", Users],
    ["score", "คะแนน", Trophy],
    ["admin", "จัดการแก๊ง", ShieldCheck],
    ["leave", "ห้องลา", CalendarOff],
    ["log", "ประวัติการส่ง", History],
  ];
  return (
    <main className="ui-v2 command-shell min-h-screen bg-[#07080b] text-white">
      <div className="command-grid fixed inset-0 pointer-events-none opacity-30" />
      <div className="command-desktop relative mx-auto max-w-[1600px] p-4 lg:p-7">
        <aside className="command-sidebar hidden w-60 shrink-0 lg:block">
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
            {nav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className={`hud-clip-sm flex w-full items-center gap-3 px-4 py-3 text-left font-bold ${view === id ? "bg-red-600" : "text-slate-400 hover:bg-white/5"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <div className="command-header mb-4 overflow-hidden rounded-xl border border-red-500/25">
            <header className="command-header__identity flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <img
                  src="/5k-logo.png"
                  alt="5K"
                  className="topbar-logo--mobile h-12 w-24 object-contain lg:hidden"
                />
                <div className="topbar-info--desktop hidden lg:block">
                  <p className="label">LIVE COMMAND // THAILAND</p>
                  <p className="mt-1 text-sm text-slate-300">{data.date} · เล่นด้วยกัน ไปได้ไกลกว่า</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="system-online hidden lg:inline-flex"><i /> SYSTEM ONLINE</span>
                <div>
                  <b>{data.me.name}</b>
                  <p className="text-xs text-red-400">
                    {data.me.role === "admin" ? "ADMINISTRATOR" : "MEMBER"}
                  </p>
                </div>
                <button
                  onClick={logout}
                  aria-label="ออกจากระบบ"
                  className="rounded-lg border border-white/15 p-2 text-slate-300 hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="command-header__score flex items-end justify-between gap-4 px-5 py-4">
              <div>
                <p className="command-hero__title">แต้มสะสมของคุณ</p>
                <h1 className="text-2xl font-black sm:text-3xl">
                  <span className="text-red-500">{data.me.score}</span> PTS
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  แอร์ดรอป {ROUNDS.join(" / ")} · รอบละ +3 คะแนน · ปาร์ตี้คนละ +1
                  คะแนน
                </p>
              </div>
              <button
                onClick={load}
                className="hero-refresh hud-clip-sm"
                aria-label="รีเฟรชข้อมูล"
              >
                รีเฟรช
              </button>
            </div>
          </div>
          <MissionControl
            data={data}
            onOpenAirdrop={(nextRound) => {
              setRound(nextRound);
              setView("airdrop");
            }}
            onOpenParty={() => setView("party")}
          />
          <div className="mobile-tab-nav mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {nav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id ? "page" : undefined}
                className={`mobile-tab-nav__item hud-clip-sm ${view === id ? "is-active" : ""}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
          {notice && (
            <div className="mb-5 flex items-center justify-between rounded-lg border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {view === "airdrop" && (
            <div className="airdrop-workspace grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
              <form
                onSubmit={(e) => send("airdrop", e)}
                className="command-panel airdrop-submit-panel p-5"
              >
                <p className="label">AIRDROP CHECK-IN</p>
                <div className="round-switcher mt-3 flex gap-2">
                  {ROUNDS.map((r) => {
                    const status = mine.get(r)?.status;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRound(r)}
                        aria-current={round === r ? "true" : undefined}
                        className={`round-switcher__item ${round === r ? "is-active" : ""} ${status ? `is-${status}` : ""}`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                <h2 className="mt-3 text-xl font-black">
                  {checkInComplete
                    ? "เช็กอินวันนี้ครบแล้ว"
                    : `ส่งหลักฐานรอบ ${round}`}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {checkInComplete
                    ? "คะแนนของทุกรอบถูกบันทึกแล้ว ดูหลักฐานย้อนหลังได้ทางด้านขวา"
                    : "รอบที่เลือกจากภารกิจด้านบนจะแสดงที่นี่ เพื่อส่งหลักฐานเพียงครั้งเดียว"}
                </p>
                {checkInComplete ? (
                  <div className="airdrop-day-complete mt-5">
                    <Check className="h-5 w-5" />
                    <div>
                      <b>ภารกิจแอร์ดรอปเสร็จสมบูรณ์ · {completedRounds.length}/{todayRounds.length} รอบ</b>
                      <p>ไม่ต้องส่งหลักฐานซ้ำแล้ว รอภารกิจวันถัดไปได้เลย</p>
                    </div>
                  </div>
                ) : selectedAirdrop?.status === "approved" ? (
                  <>
                    <div className="airdrop-complete mt-5">
                      <Check className="h-5 w-5" />
                      <div>
                        <b>รอบ {round} ผ่านการตรวจแล้ว</b>
                        <p>คะแนนถูกบันทึกเรียบร้อย ไม่ต้องส่งหลักฐานซ้ำ</p>
                      </div>
                    </div>
                    {nextIncompleteRound && (
                      <button
                        type="button"
                        onClick={() => setRound(nextIncompleteRound)}
                        className="airdrop-next-round mt-4"
                      >
                        ไปส่งหลักฐานรอบ {nextIncompleteRound}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="airdrop-next mt-5">
                      {selectedAirdrop?.status === "pending"
                        ? "หลักฐานกำลังรอตรวจ หากต้องการเปลี่ยน ให้เลือกรูปใหม่แล้วส่งแก้ไข"
                        : selectedAirdrop?.status === "rejected"
                          ? "หลักฐานไม่ผ่านการตรวจ กรุณาเลือกรูปใหม่และส่งอีกครั้ง"
                          : `ยังไม่มีหลักฐานสำหรับรอบ ${round}`}
                    </p>
                    <div className="mt-3">
                      <Picker onChange={setImage} resetToken={`${round}-${pickerReset}`} />
                    </div>
                    <button
                      disabled={busy}
                      className="red-action mt-4 w-full disabled:opacity-40"
                    >
                      <Upload className="h-5 w-5" />
                      {selectedAirdrop?.status === "rejected"
                        ? "ส่งหลักฐานใหม่"
                        : selectedAirdrop?.status === "pending"
                          ? "ส่งหลักฐานแก้ไข"
                          : "ส่งรอบ " + round}
                    </button>
                  </>
                )}
              </form>
              <section className="command-panel airdrop-history-panel p-5">
                <p className="label">AIRDROP LOG</p>
                <h2 className="mt-2 text-xl font-black">ประวัติแอร์ดรอป</h2>
                <div className="mt-4 space-y-2">
                  {data.airdrops.length ? (
                    data.airdrops.map((x: any) => {
                      // Approved evidence is deleted from storage to save
                      // space, so there's nothing left to link to.
                      const viewable = x.status !== "approved";
                      const Row = viewable ? "a" : "div";
                      return (
                        <Row
                          {...(viewable
                            ? { href: `/api/image/${x.image_key}`, target: "_blank", rel: "noreferrer" }
                            : {})}
                          key={x.id}
                          className="airdrop-history-item flex items-center justify-between rounded-lg bg-white/5 p-3"
                        >
                          <div>
                            <b>
                              {x.activity_date} · รอบ {x.round_time}
                            </b>
                            <p className="text-xs text-slate-500">
                              {new Date(x.created_at).toLocaleString("th-TH")}
                            </p>
                          </div>
                          <Status value={x.status} />
                        </Row>
                      );
                    })
                  ) : (
                    <p className="text-slate-400">ยังไม่มีประวัติ</p>
                  )}
                </div>
              </section>
            </div>
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
              onSubmit={async (ids, file) => {
                if (!window.confirm(`ยืนยันส่งหลักฐานกิจกรรมให้สมาชิก ${ids.length} คนเข้าคิวตรวจใช่หรือไม่?`)) return;
                setBusy(true);
                try {
                  const form = new FormData();
                  form.append("type", "party");
                  form.append("image", file);
                  form.append("memberIds", JSON.stringify(ids));
                  const r = await fetch("/api/upload", {
                      method: "POST",
                      body: form,
                    }),
                    x: any = await r.json();
                  setNotice(x.error || "ส่งเข้าคิวตรวจแล้ว");
                  if (!x.error) await load();
                } catch {
                  setNotice("ส่งหลักฐานกิจกรรมไม่สำเร็จ ลองใหม่อีกครั้ง");
                } finally {
                  setBusy(false);
                }
              }}
            />
            ))}
          {view === "score" && (
            <SquadRanking
              leaderboard={data.leaderboard}
              highlightId={data.me.id}
            />
          )}
          {view === "admin" &&
            (data.me.role !== "admin" ? (
              <section className="command-panel p-6">
                หน้านี้สำหรับแอดมินเท่านั้น
              </section>
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
          {view === "log" &&
            (!loadedViews.includes("log") ? (
              <ViewLoading />
            ) : (
              <SubmissionLog data={data} />
            ))}
        </section>
        <aside className="command-rail hidden xl:block w-72 shrink-0 space-y-5">
          <section className="command-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label">SQUAD STATUS // ALL MEMBERS</p>
                <h2 className="mt-2 text-lg font-black">สถานะแก๊ง</h2>
              </div>
              <span className="text-sm text-emerald-300">
                {data.members.filter((member: any) => member.online).length}/{data.members.length}
                คนออนไลน์
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {members.map((member: any) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <span
                    className={`status-dot ${member.online ? "" : "status-dot-offline"}`}
                  />
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {member.display_name}
                  </span>
                  <span
                    className={`text-xs ${member.online ? "text-slate-500" : "text-slate-600"}`}
                  >
                    {member.online ? "ออนไลน์" : "ออฟไลน์"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <SquadRanking leaderboard={data.leaderboard} compact />
        </aside>
      </div>
    </main>
  );
}
