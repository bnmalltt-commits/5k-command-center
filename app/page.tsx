"use client";
import {
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
  RefreshCw,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { PartyCommandCenter } from "./party-command-center";
import { Picker } from "./picker";
import {
  Chips,
  ConfirmDialog,
  Dot,
  EmptyState,
  Panel,
  PromptDialog,
  Row,
  SearchInput,
  Segmented,
} from "./ui";

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
    return status === "approved"
      ? { label: "ผ่านแล้ว · +3", tone: "done" }
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
      ) : (
        <form onSubmit={onSubmit} className="mission__submit">
          <p className="mission__note">
            {selected?.status === "pending"
              ? `หลักฐานรอบ ${round} กำลังรอตรวจ · เลือกรูปใหม่เพื่อส่งแก้ไข`
              : selected?.status === "rejected"
                ? `หลักฐานรอบ ${round} ไม่ผ่าน · เลือกรูปใหม่แล้วส่งอีกครั้ง`
                : `ส่งหลักฐานรอบ ${round}`}
          </p>
          <Picker onChange={setImage} resetToken={`${round}-${pickerReset}`} />
          <button
            disabled={busy || !image}
            className="ui-btn ui-btn--primary ui-btn--block"
          >
            <Upload className="h-4 w-4" />
            {selected ? "ส่งหลักฐานใหม่" : `ส่งรอบ ${round}`}
          </button>
        </form>
      )}
    </section>
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
  const rows = compact ? leaderboard.slice(0, 5) : leaderboard;
  const myIndex = highlightId
    ? leaderboard.findIndex((member: any) => member.id === highlightId)
    : -1;
  const me = myIndex >= 0 ? leaderboard[myIndex] : null;
  const ahead = myIndex > 0 ? leaderboard[myIndex - 1] : null;
  const gap = ahead ? Number(ahead.score || 0) - Number(me.score || 0) : 0;
  return (
    <Panel
      label="SQUAD RANKING"
      title={`ตารางคะแนน${compact ? "" : "ทั้งหมด"}`}
      subtitle={compact ? undefined : `${leaderboard.length} คน`}
      trailing={<Trophy className="h-4 w-4 text-[var(--ui-red)]" />}
      flush
    >
      {!compact && me && (
        <div className="rank-me">
          <span className="rank-me__pos">#{myIndex + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="rank-me__label">อันดับของคุณ</div>
            <div className="rank-me__hint">
              {ahead
                ? `อีก ${gap === 0 ? 1 : gap} แต้มจะแซง ${ahead.display_name}`
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
              <span className={`rank-num rank-num--${index + 1}`}>
                {index + 1}
              </span>
            }
            title={
              member.id === highlightId ? (
                <span className="text-white">{member.display_name} · คุณ</span>
              ) : (
                member.display_name
              )
            }
            subtitle={member.online ? "ออนไลน์" : undefined}
            trailing={
              <span className="rank-score">{Number(member.score || 0)}</span>
            }
          />
        ))
      ) : (
        <EmptyState
          title="ยังไม่มีคะแนนในตาราง"
          hint="เมื่อมีคนเช็กอินผ่าน คะแนนจะขึ้นที่นี่"
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
                title={`${item.type === "party" ? "ปาร์ตี้" : "แอร์ดรอป"} · ${item.detail}`}
                subtitle={`${item.activity_date} · ส่งโดย ${item.submitted_by}${
                  item.approved_by ? ` · ตรวจโดย ${item.approved_by}` : " · ยังไม่ตรวจ"
                }`}
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
  const [renaming, setRenaming] = useState<any>(null);
  const sam = data.me.name === "Sam";
  const normalizedQuery = query.trim().toLowerCase();
  const activeMembers = data.managedMembers.filter(
    (member: any) => member.active,
  );
  // Substring, not prefix-per-token: a prefix match can't find a name by the
  // middle of it, which is how people actually search a roster.
  const matches = (text: string) =>
    !normalizedQuery || String(text || "").toLowerCase().includes(normalizedQuery);
  // Removed members drop out of the roster entirely instead of lingering as
  // a disabled row — the action reads "เอาออก" (remove), so the list should
  // behave like they're actually gone.
  const visibleMembers = activeMembers.filter((member: any) =>
    matches(member.display_name),
  );
  const visiblePending = data.pending.filter((item: any) =>
    matches(`${item.submitted_by} ${item.detail}`),
  );
  const visibleAdmins = activeMembers.filter(
    (member: any) => member.id !== data.me.id && matches(member.display_name),
  );

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
            onChange={(next) => setTab(next as typeof tab)}
            options={[
              { id: "verify", label: "รอตรวจ", count: data.pending.length },
              { id: "members", label: "สมาชิก", count: activeMembers.length },
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
              tab === "verify" ? "ค้นหาผู้ส่งหรือรอบ" : "ค้นหาชื่อสมาชิก"
            }
          />
          {tab === "members" && (
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
        </div>

        {tab === "verify" &&
          (visiblePending.length ? (
            visiblePending.map((item: any) => (
              <Row
                key={item.type + item.id}
                inset={false}
                title={`${item.type === "party" ? "ปาร์ตี้" : "แอร์ดรอป"} · ${item.detail}`}
                subtitle={
                  item.submitted_by ? `ส่งโดย ${item.submitted_by}` : undefined
                }
                trailing={
                  <>
                    {/* Opens the full asset on demand instead of every row
                        eagerly fetching one to shrink into a thumbnail. */}
                    <a
                      href={`/api/image/${item.image_key}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      ดูรูป
                    </a>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({ action: "approve", type: item.type, id: item.id })
                      }
                      className="ui-btn ui-btn--ok ui-btn--sm"
                    >
                      ผ่าน
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({ action: "reject", type: item.type, id: item.id })
                      }
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      ไม่ผ่าน
                    </button>
                  </>
                }
              />
            ))
          ) : (
            <EmptyState
              title={
                data.pending.length
                  ? "ไม่พบรายการที่ค้นหา"
                  : "ไม่มีรายการรอตรวจในตอนนี้"
              }
              hint={data.pending.length ? "ลองเปลี่ยนคำค้น" : "คิวตรวจว่างแล้ว"}
            />
          ))}

        {tab === "members" &&
          (visibleMembers.length ? (
            visibleMembers.map((member: any) => (
              <Row
                key={member.id}
                inset={false}
                title={member.display_name}
                subtitle={member.role === "admin" ? "แอดมิน" : "สมาชิก"}
                trailing={
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setRenaming(member)}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      แก้ชื่อ
                    </button>
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
                }
              />
            ))
          ) : (
            <EmptyState title="ไม่พบสมาชิกที่ค้นหา" hint="ลองเปลี่ยนคำค้น" />
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
                subtitle={member.role === "admin" ? "แอดมิน" : "สมาชิก"}
                trailing={
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
                }
              />
            ))
          ) : (
            <EmptyState title="ไม่พบสมาชิกที่ค้นหา" hint="ลองเปลี่ยนคำค้น" />
          ))}
      </Panel>
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
    [loginName, setLoginName] = useState(""),
    [loginPin, setLoginPin] = useState(""),
    [partyName, setPartyName] = useState(""),
    [loadedViews, setLoadedViews] = useState<string[]>([]),
    [pickerReset, setPickerReset] = useState(0),
    [confirmState, setConfirmState] = useState<{
      message: string;
      resolve: (ok: boolean) => void;
    } | null>(null);
  // Styled stand-in for window.confirm. Same await-a-boolean shape, so every
  // caller keeps its existing control flow.
  const confirmAsync = (message: string) =>
    new Promise<boolean>((resolve) => setConfirmState({ message, resolve }));
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
  const nav: [string, string, any][] = [
    ["airdrop", "แอร์ดรอป", Crosshair],
    ["party", "ปาร์ตี้", Users],
    ["score", "คะแนน", Trophy],
    ["admin", "จัดการแก๊ง", ShieldCheck],
    ["leave", "ห้องลา", CalendarOff],
    ["log", "ประวัติการส่ง", History],
  ];
  // จัดการแก๊ง is admin-only, so it shouldn't occupy a slot in either nav for
  // everyone else — the view itself already refuses non-admins.
  const visibleNav = nav.filter(
    ([id]) => id !== "admin" || data.me.role === "admin",
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
            {visibleNav.map(([id, label, Icon]: any) => (
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
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="topbar">
            <img
              src="/5k-logo.png"
              alt="5K"
              className="topbar__logo lg:hidden"
            />
            <div className="min-w-0 flex-1">
              <div className="topbar__name">{data.me.name}</div>
              <div className="topbar__meta">
                {data.date} · {data.me.role === "admin" ? "แอดมิน" : "สมาชิก"}
              </div>
            </div>
            <span className="topbar__score">
              <b>{data.me.score}</b> PTS
            </span>
            <button
              onClick={load}
              aria-label="รีเฟรชข้อมูล"
              className="topbar__icon"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={logout}
              aria-label="ออกจากระบบ"
              className="topbar__icon"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </header>
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
                      x.status !== "approved"
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
                    subtitle={new Date(x.created_at).toLocaleString("th-TH")}
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
              onSubmit={async (ids, file) => {
                if (
                  !(await confirmAsync(
                    `ยืนยันส่งหลักฐานกิจกรรมให้สมาชิก ${ids.length} คนเข้าคิวตรวจใช่หรือไม่?`,
                  ))
                )
                  return;
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
                  leading={<Dot tone={member.online ? "green" : "idle"} />}
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
          <SquadRanking leaderboard={data.leaderboard} compact />
        </aside>
      </div>
      <nav className="bottom-nav lg:hidden" aria-label="เมนูหลัก">
        {visibleNav
          .map(([id, label, Icon]: any) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-current={view === id ? "page" : undefined}
              className={`bottom-nav__item ${view === id ? "is-active" : ""}`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          ))}
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
