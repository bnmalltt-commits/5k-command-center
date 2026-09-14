"use client";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Clipboard,
  Crosshair,
  LogOut,
  Pencil,
  ShieldCheck,
  Star,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import { PartyCommandCenter } from "./party-command-center";

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
};
const labels: Record<string, string> = {
  pending: "รอตรวจ",
  approved: "ผ่านแล้ว",
  rejected: "ไม่ผ่าน",
};
function Status({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold ${value === "approved" ? "bg-emerald-500/15 text-emerald-300" : value === "rejected" ? "bg-red-500/15 text-red-300" : "bg-amber-400/15 text-amber-200"}`}
    >
      {labels[value] || value}
    </span>
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
          {!compact && (
            <span className="ranking-filter">{rows.length} คน</span>
          )}
          <Trophy className="h-5 w-5 text-red-400" />
        </div>
      </div>
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
        <p className="ranking-position">อันดับของคุณ <b>#{myRank}</b> จาก {leaderboard.length} คน</p>
      )}
      <div className="ranking-footer">
        <span />
        {compact ? "MORE PLAYERS" : "ALL SQUAD MEMBERS"} <b>//</b> HIGHER MOMENTS
        <span />
      </div>
    </section>
  );
}
function Picker({ onChange }: { onChange: (file: File | null) => void }) {
  const [filename, setFilename] = useState("เลือกรูปหลักฐาน"),
    [preview, setPreview] = useState("");
  const applyFile = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    setFilename(file.name || "รูปจากคลิปบอร์ด");
    setPreview(URL.createObjectURL(file));
    onChange(file);
  };
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files || []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (file) {
        event.preventDefault();
        applyFile(file);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-white/20 bg-black/20 px-4 py-4 text-sm text-slate-300 hover:border-red-400">
        {preview && (
          <img
            src={preview}
            alt="ตัวอย่างหลักฐาน"
            className="h-14 w-14 rounded-md object-cover"
          />
        )}
        <label className="flex cursor-pointer items-center gap-2">
          <Camera className="h-5 w-5 text-red-400" />
          {filename}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(e) => applyFile(e.target.files?.[0] || null)}
          />
        </label>
        {preview && (
          <button
            type="button"
            onClick={() => {
              setFilename("เลือกรูปหลักฐาน");
              setPreview("");
              onChange(null);
            }}
            aria-label="ลบรูปหลักฐาน"
            title="ลบรูปหลักฐาน"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const type = item.types.find((value) =>
                value.startsWith("image/"),
              );
              if (type) {
                const blob = await item.getType(type);
                applyFile(
                  new File(
                    [blob],
                    "clipboard-image." + (type.split("/")[1] || "png"),
                    { type },
                  ),
                );
                return;
              }
            }
          } catch {
            setFilename("กด Ctrl + V เพื่อวางรูป");
          }
        }}
        className="mx-auto flex items-center gap-2 text-xs text-slate-400 hover:text-red-300"
      >
        <Clipboard className="h-4 w-4" />
        วางจากคลิปบอร์ด · Ctrl + V
      </button>
    </div>
  );
}

function PartyWorkspace({
  data,
  members,
  call,
  partyName,
  setPartyName,
  busy,
}: {
  data: Data;
  members: any[];
  call: (body: any) => void;
  partyName: string;
  setPartyName: (value: string) => void;
  busy: boolean;
}) {
  const party = data.myParty;
  const [editing, setEditing] = useState(false),
    [editName, setEditName] = useState("");
  const partyMemberIds = new Set(
    party?.members?.map((member: any) => member.id) || [],
  );
  return (
    <div className="space-y-5">
      {editing && party && (
        <PartyEditDialog
          name={editName}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={(value) => {
            call({ action: "party_update", partyId: party.id, name: value });
            setEditing(false);
          }}
        />
      )}
      <section className="command-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">PARTY CONTROL</p>
            {party ? (
              <div className="flex items-center gap-2">
                <h2 className="mt-2 text-xl font-black">{party.name}</h2>
                {party.status === "open" &&
                  (party.owner_member_id === data.me.id ||
                    data.me.role === "admin") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditName(party.name);
                        setEditing(true);
                      }}
                      aria-label="แก้ชื่อปาร์ตี้"
                      title="แก้ชื่อปาร์ตี้"
                      className="mt-2 rounded-md border border-red-400/40 p-1.5 text-red-300 hover:bg-red-500/10"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
              </div>
            ) : (
              <h2 className="mt-2 text-xl font-black">สร้างปาร์ตี้ของคุณ</h2>
            )}
            {party && (
              <p className="mt-1 text-sm text-slate-400">
                หัวหน้าปาร์ตี้: {party.owner_name} ·{" "}
                {party.status === "open" ? "กำลังรับสมาชิก" : "ล็อกทีมแล้ว"}
              </p>
            )}
          </div>
          {party ? (
            <div className="flex gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">
                {party.members.length}/5 คน
              </span>
              {party.status === "open" &&
                party.owner_member_id === data.me.id && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      call({
                        action: "party_lock",
                        partyId: party.id,
                        locked: true,
                      })
                    }
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold"
                  >
                    ล็อกทีม
                  </button>
                )}
              <button
                disabled={busy}
                onClick={() => call({ action: "party_leave" })}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm"
              >
                ออกจากปาร์ตี้
              </button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (partyName.trim())
                  call({ action: "party_create", name: partyName });
              }}
              className="flex w-full max-w-md gap-2"
            >
              <input
                required
                minLength={2}
                maxLength={40}
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                placeholder="ชื่อปาร์ตี้"
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              />
              <button
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 font-bold"
              >
                สร้างปาร์ตี้
              </button>
            </form>
          )}
        </div>
        {party && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {party.members.map((member: any) => (
                <div
                  key={member.id}
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`status-dot ${member.online ? "" : "status-dot-offline"}`}
                    />
                    <b className="truncate">{member.display_name}</b>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {member.online ? "ออนไลน์" : "ออฟไลน์"} ·{" "}
                    {member.id === party.owner_member_id
                      ? "หัวหน้า"
                      : member.role}
                  </p>
                  {party.owner_member_id === data.me.id &&
                    member.id !== data.me.id &&
                    party.status === "open" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          call({
                            action: "party_remove_member",
                            memberId: member.id,
                          })
                        }
                        className="mt-2 text-xs text-red-300"
                      >
                        นำออก
                      </button>
                    )}
                </div>
              ))}
            </div>
            {party.status === "open" &&
              party.owner_member_id === data.me.id && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="mb-3 text-sm font-bold">
                    เชิญสมาชิกเข้าปาร์ตี้
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members
                      .filter(
                        (member: any) =>
                          member.id !== data.me.id &&
                          !partyMemberIds.has(member.id),
                      )
                      .map((member: any) => (
                        <button
                          key={member.id}
                          disabled={busy}
                          onClick={() =>
                            call({
                              action: "party_invite",
                              partyId: party.id,
                              memberId: member.id,
                            })
                          }
                          className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:border-red-400"
                        >
                          <span
                            className={`status-dot mr-2 inline-block align-middle ${member.online ? "" : "status-dot-offline"}`}
                          />
                          {member.display_name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
          </>
        )}
      </section>
      {!party && (
        <>
          <section className="command-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label">PARTY INVITES</p>
                <h2 className="mt-2 text-lg font-black">คำเชิญที่ได้รับ</h2>
              </div>
              <span className="text-sm text-red-300">
                {data.partyInvites.length} รายการ
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {data.partyInvites.length ? (
                data.partyInvites.map((invite: any) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/5 p-3"
                  >
                    <div>
                      <b>{invite.party_name}</b>
                      <p className="text-xs text-slate-400">
                        เชิญโดย {invite.inviter_name} · {invite.member_count}/5
                        คน
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() =>
                          call({
                            action: "party_respond",
                            inviteId: invite.id,
                            accept: true,
                          })
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold"
                      >
                        เข้าร่วม
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          call({
                            action: "party_respond",
                            inviteId: invite.id,
                            accept: false,
                          })
                        }
                        className="rounded-lg border border-white/15 px-3 py-2 text-sm"
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">ยังไม่มีคำเชิญ</p>
              )}
            </div>
          </section>
          <section className="command-panel p-5">
            <p className="label">OPEN PARTIES</p>
            <h2 className="mt-2 text-lg font-black">ปาร์ตี้ที่เปิดรับสมาชิก</h2>
            <div className="mt-4 space-y-2">
              {data.openParties.length ? (
                data.openParties.map((open: any) => (
                  <div
                    key={open.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3"
                  >
                    <div>
                      <b>{open.name}</b>
                      <p className="text-xs text-slate-400">
                        หัวหน้า {open.owner_name} · {open.member_count}/5 คน
                      </p>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({ action: "party_join", partyId: open.id })
                      }
                      className="rounded-lg border border-red-400/50 px-3 py-2 text-sm font-bold text-red-200"
                    >
                      ขอเข้าร่วม
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">
                  ยังไม่มีปาร์ตี้ที่เปิดรับ
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AdminAccessPanel({
  data,
  call,
  busy,
}: {
  data: Data;
  call: (body: any) => void;
  busy: boolean;
}) {
  const sam = data.me.name === "Sam";
  const candidates = data.managedMembers.filter(
    (member: any) => member.active && member.id !== data.me.id,
  );
  return (
    <section className="command-panel admin-access-v2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">ADMIN ACCESS</p>
          <h2 className="mt-2 text-xl font-black">จัดการแอดมิน</h2>
          <p className="mt-2 text-sm text-slate-400">
            เฉพาะ Sam เท่านั้นที่เพิ่มหรือถอดสิทธิ์แอดมินได้
          </p>
        </div>
        <span className="rounded-full border border-red-400/30 bg-red-950/30 px-3 py-1 text-xs font-bold text-red-200">
          SAM ONLY
        </span>
      </div>
      {!sam ? (
        <p className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-400">
          บัญชีนี้ไม่มีสิทธิ์จัดการแอดมิน
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {candidates.map((member: any) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
            >
              <div>
                <b>{member.display_name}</b>
                <p className="text-xs text-slate-500">
                  {member.role === "admin" ? "แอดมิน" : "สมาชิก"}
                </p>
              </div>
              {member.role === "admin" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    call({
                      action: "admin_access",
                      memberId: member.id,
                      enabled: false,
                    })
                  }
                  className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-200"
                >
                  ถอดแอดมิน
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() =>
                    call({
                      action: "admin_access",
                      memberId: member.id,
                      enabled: true,
                    })
                  }
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold"
                >
                  เพิ่มเป็นแอดมิน
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminCommandCenter({
  data,
  call,
  busy,
}: {
  data: Data;
  call: (body: any) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"verify" | "members" | "admins">("verify");
  const [query, setQuery] = useState("");
  const [memberName, setMemberName] = useState("");
  const sam = data.me.name === "Sam";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleMembers = data.managedMembers.filter((member: any) =>
    member.display_name.toLowerCase().includes(normalizedQuery),
  );
  const activeMembers = data.managedMembers.filter((member: any) => member.active);

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
      <div className="admin-command-tabs mt-5" role="tablist" aria-label="จัดการแก๊ง">
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
          สมาชิก <span>{data.managedMembers.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "admins"}
          onClick={() => setTab("admins")}
          className={tab === "admins" ? "is-active" : ""}
        >
          แอดมิน <span>{activeMembers.filter((member: any) => member.role === "admin").length}</span>
        </button>
      </div>

      {tab === "verify" && (
        <div className="admin-command-content mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="label">VERIFY QUEUE</p>
              <h3 className="mt-1 text-lg font-black">รายการรอตรวจ</h3>
            </div>
            <span className="text-sm text-amber-200">{data.pending.length} รายการ</span>
          </div>
          <div className="admin-command-list mt-4">
            {data.pending.length ? (
              data.pending.map((item: any) => (
                <div key={item.type + item.id} className="admin-command-row">
                  <div className="min-w-0 flex-1">
                    <b>{item.type === "party" ? "ปาร์ตี้" : "แอร์ดรอป"} #{item.id}</b>
                    <p>{item.detail}{item.submitted_by ? ` · ส่งโดย ${item.submitted_by}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a href={`/api/image/${item.image_key}`} target="_blank" className="evidence-link">
                      <img src={`/api/image/${item.image_key}`} alt="ตัวอย่างหลักฐาน" loading="lazy" />
                      ดูรูป
                    </a>
                    <button disabled={busy} aria-label="อนุมัติ" onClick={() => call({ action: "approve", type: item.type, id: item.id })} className="approval-action">
                      <Check className="h-4 w-4" />
                    </button>
                    <button disabled={busy} onClick={() => call({ action: "reject", type: item.type, id: item.id })} className="reject-action">ไม่ผ่าน</button>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-command-empty">ไม่มีรายการรอตรวจในตอนนี้</div>
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
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาสมาชิก" />
            </label>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (memberName.trim()) {
                call({ action: "member", name: memberName.trim() });
                setMemberName("");
              }
            }}
            className="admin-member-add mt-4"
          >
            <input required minLength={2} maxLength={60} value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="ชื่อสมาชิกใหม่" />
            <button disabled={busy}>เพิ่มสมาชิก</button>
          </form>
          <div className="admin-command-list mt-4">
            {visibleMembers.length ? (
              visibleMembers.map((member: any) => (
                <div key={member.id} className="admin-command-row">
                  <div className="min-w-0 flex-1">
                    <b>{member.display_name}</b>
                    <p>{member.active ? "ใช้งาน" : "ปิดใช้งาน"} · {member.role === "admin" ? "แอดมิน" : "สมาชิก"}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={!member.active || busy}
                      onClick={() => {
                        const next = window.prompt("แก้ชื่อสมาชิก", member.display_name);
                        if (next?.trim()) call({ action: "member_update", id: member.id, name: next.trim() });
                      }}
                      className="member-edit-action"
                    >
                      แก้ชื่อ
                    </button>
                    {member.id !== data.me.id && member.active && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("ปิดใช้งานสมาชิกนี้?")) call({ action: "member_delete", id: member.id });
                        }}
                        className="reject-action"
                      >
                        ปิดใช้งาน
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
              <p className="mt-1 text-sm text-slate-400">เฉพาะ Sam เท่านั้นที่เพิ่มหรือถอดสิทธิ์แอดมินได้</p>
            </div>
            <span className="rounded-full border border-red-400/30 bg-red-950/30 px-3 py-1 text-xs font-bold text-red-200">SAM ONLY</span>
          </div>
          {sam ? (
            <div className="admin-command-list mt-4">
              {activeMembers.filter((member: any) => member.id !== data.me.id).map((member: any) => (
                <div key={member.id} className="admin-command-row">
                  <div className="min-w-0 flex-1">
                    <b>{member.display_name}</b>
                    <p>{member.role === "admin" ? "แอดมิน" : "สมาชิก"}</p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => call({ action: "admin_access", memberId: member.id, enabled: member.role !== "admin" })}
                    className={member.role === "admin" ? "member-edit-action" : "admin-promote-action"}
                  >
                    {member.role === "admin" ? "ถอดแอดมิน" : "เพิ่มเป็นแอดมิน"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-command-empty mt-4">บัญชีนี้ไม่มีสิทธิ์จัดการแอดมิน</div>
          )}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState("airdrop"),
    [round, setRound] = useState<"20:00" | "23:00">("20:00"),
    [image, setImage] = useState<File | null>(null),
    [crew, setCrew] = useState<number[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [name, setName] = useState(""),
    [authNeeded, setAuthNeeded] = useState(false),
    [loginName, setLoginName] = useState(""),
    [partyName, setPartyName] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" }),
        x: any = await r.json();
      if (r.status === 401) {
        setData(null);
        setAuthNeeded(true);
      } else if (x.error) setNotice(x.error);
      else {
        setData(x);
        setAuthNeeded(false);
      }
    } catch {
      setNotice("เชื่อมต่อระบบไม่สำเร็จ ลองรีเฟรชอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const id = "admin-login-id";
    document.getElementById(id)?.remove();
    if (!data) return;
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((x: any) => {
        if (x.user?.role !== "admin" || !x.user.username) return;
        const el = document.createElement("div");
        el.id = id;
        el.setAttribute("role", "note");
        Object.assign(el.style, {
          position: "fixed",
          left: "20px",
          bottom: "20px",
          zIndex: "100",
          maxWidth: "calc(100vw - 40px)",
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#111827",
          border: "1px solid rgba(248,113,113,.5)",
          color: "#fee2e2",
          fontSize: "14px",
          boxShadow: "0 8px 24px rgba(0,0,0,.4)",
        });
        el.textContent = `รหัสสมาชิกแอดมิน: ${x.user.username}`;
        document.body.appendChild(el);
      })
      .catch(() => {});
    return () => {
      document.getElementById(id)?.remove();
    };
  }, [data]);
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
  const call = async (body: any) => {
    setBusy(true);
    try {
      const r = await fetch(
          body.action.startsWith("party_") ? "/api/party" : "/api/dashboard",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        ),
        x: any = await r.json();
      setNotice(x.error || "บันทึกแล้ว");
      if (!x.error) await load();
    } catch {
      setNotice("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  const send = async (type: "airdrop" | "party", event: FormEvent) => {
    event.preventDefault();
    if (!image) return setNotice("กรุณาเลือกรูปหลักฐาน");
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
          body: JSON.stringify({ name: loginName }),
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
        <section className="command-panel w-full max-w-md p-7 text-center">
          <img
            src="/5k-logo.png"
            alt="5K Fivethousand"
            className="mx-auto h-28 w-full object-contain"
          />
          <h1 className="mt-5 text-2xl font-black">เข้าสู่ระบบแก๊ง</h1>
          <p className="mt-3 text-sm text-slate-400">
            สมาชิกใช้ชื่อที่แอดมินเพิ่มไว้ ส่วนแอดมินใช้รหัสสมาชิก
          </p>
          <form onSubmit={login} className="mt-6 space-y-3">
            <input
              required
              minLength={2}
              maxLength={120}
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              placeholder="ชื่อสมาชิก หรือรหัสสมาชิก"
              className="w-full rounded-lg border border-white/15 bg-black/30 px-4 py-3"
            />
            <button
              disabled={busy}
              className="red-action w-full disabled:opacity-40"
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
      <main className="grid min-h-screen place-items-center bg-[#07080b] text-white">
        กำลังเปิดศูนย์บัญชาการ…
      </main>
    );
  const members = [...data.members].sort(
    (a, b) =>
      Number(Boolean(b.online)) - Number(Boolean(a.online)) ||
      Number(data.favorites.includes(b.id)) -
        Number(data.favorites.includes(a.id)) ||
      a.display_name.localeCompare(b.display_name),
  );
  const nav: [string, string, any][] = [
    ["airdrop", "แอร์ดรอป", Crosshair],
    ["party", "ปาร์ตี้", Users],
    ["score", "คะแนน", Trophy],
    ["admin", "จัดการแก๊ง", ShieldCheck],
  ];
  return (
    <main className="ui-v2 command-shell min-h-screen bg-[#07080b] text-white">
      <div className="command-grid fixed inset-0 pointer-events-none opacity-30" />
      <div className="relative mx-auto flex max-w-7xl gap-6 p-4 lg:p-7">
        <aside className="hidden w-60 shrink-0 lg:block">
          <img
            src="/5k-logo.png"
            alt="5K Fivethousand"
            className="h-28 w-full object-contain"
          />
          <nav className="mt-7 space-y-2">
            {nav.map(([id, label, Icon]: any) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left font-bold ${view === id ? "bg-red-600" : "text-slate-400 hover:bg-white/5"}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <img
                src="/5k-logo.png"
                alt="5K"
                className="h-12 w-24 object-contain lg:hidden"
              />
              <p className="hidden text-sm text-slate-400 lg:block">
                {data.date} · ประเทศไทย
              </p>
            </div>
            <div className="flex items-center gap-3 text-right">
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
          <div className="command-hero mb-5 rounded-xl border border-red-500/25 p-5">
            <p className="label">FIVETHOUSAND COMMAND CENTER</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-black sm:text-3xl">
                  แต้มของคุณ{" "}
                  <span className="text-red-500">{data.me.score} PTS</span>
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  แอร์ดรอป 20:00 และ 23:00 · รอบละ +3 คะแนน · ปาร์ตี้คนละ +1
                  คะแนน
                </p>
              </div>
              <button
                onClick={load}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm"
              >
                รีเฟรช
              </button>
            </div>
          </div>
          <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {nav.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm ${view === id ? "bg-red-600" : "bg-white/10"}`}
              >
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
            <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
              <form
                onSubmit={(e) => send("airdrop", e)}
                className="command-panel p-5"
              >
                <p className="label">AIRDROP CHECK-IN</p>
                <h2 className="mt-2 text-xl font-black">ส่งหลักฐานแอร์ดรอป</h2>
                <p className="mt-2 text-sm text-slate-400">
                  เลือกรอบที่ต้องการ แล้วส่งภาพเฉพาะเมื่อรอบนั้นยังไม่ผ่านการตรวจ
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {(["20:00", "23:00"] as const).map((time) => {
                    const entry = mine.get(time);
                    return (
                      <button
                        type="button"
                        key={time}
                        onClick={() => setRound(time)}
                        className={`rounded-lg border p-4 text-left ${round === time ? "border-red-500 bg-red-950/30" : "border-white/10"}`}
                      >
                        <b className="text-2xl">{time}</b>
                        <p className="mt-3">
                          {entry ? (
                            <Status value={entry.status} />
                          ) : (
                            <span className="text-sm text-slate-400">
                              ยังไม่ส่ง
                            </span>
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {mine.get(round)?.status === "approved" ? (
                  <div className="airdrop-complete mt-5">
                    <Check className="h-5 w-5" />
                    <div>
                      <b>รอบ {round} ผ่านการตรวจแล้ว</b>
                      <p>คะแนนถูกบันทึกเรียบร้อย ไม่ต้องส่งหลักฐานซ้ำ</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="airdrop-next mt-5">
                      {mine.get(round)?.status === "pending"
                        ? "หลักฐานกำลังรอตรวจ หากต้องการเปลี่ยน ให้เลือกรูปใหม่แล้วส่งแก้ไข"
                        : mine.get(round)?.status === "rejected"
                          ? "หลักฐานไม่ผ่านการตรวจ กรุณาเลือกรูปใหม่และส่งอีกครั้ง"
                          : `ยังไม่มีหลักฐานสำหรับรอบ ${round}`}
                    </p>
                    <div className="mt-3">
                      <Picker onChange={setImage} />
                    </div>
                    <button
                      disabled={busy}
                      className="red-action mt-4 w-full disabled:opacity-40"
                    >
                      <Upload className="h-5 w-5" />
                      {mine.get(round)?.status === "rejected"
                        ? "ส่งหลักฐานใหม่"
                        : mine.get(round)?.status === "pending"
                          ? "ส่งหลักฐานแก้ไข"
                          : "ส่งรอบ " + round}
                    </button>
                  </>
                )}
              </form>
              <section className="command-panel p-5">
                <p className="label">ประวัติแอร์ดรอป</p>
                <div className="mt-4 space-y-2">
                  {data.airdrops.length ? (
                    data.airdrops.map((x: any) => (
                      <div
                        key={x.id}
                        className="flex items-center justify-between rounded-lg bg-white/5 p-3"
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
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400">ยังไม่มีประวัติ</p>
                  )}
                </div>
              </section>
            </div>
          )}
          {view === "party" && (
            <PartyCommandCenter
              data={data}
              members={members}
              call={call}
              busy={busy}
              onSubmit={async (ids, file) => {
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
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {view === "score" && <SquadRanking leaderboard={data.leaderboard} highlightId={data.me.id} />}
          {view === "admin" &&
            (data.me.role !== "admin" ? (
              <section className="command-panel p-6">หน้านี้สำหรับแอดมินเท่านั้น</section>
            ) : (
              <AdminCommandCenter data={data} call={call} busy={busy} />
            ))}
          {view === "admin_legacy" &&
            (data.me.role !== "admin" ? (
              <section className="command-panel p-6">
                หน้านี้สำหรับแอดมินเท่านั้น
              </section>
            ) : (
              <div className="admin-v2 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
                <section className="command-panel p-5">
                  <p className="label">VERIFY QUEUE</p>
                  <h2 className="mt-2 text-xl font-black">รายการรอตรวจ</h2>
                  <div className="mt-4 space-y-3">
                    {data.pending.length ? (
                      data.pending.map((item: any) => (
                        <div
                          key={item.type + item.id}
                          className="rounded-lg border border-white/10 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <b>
                                {item.type === "party" ? "ปาร์ตี้" : "แอร์ดรอป"}{" "}
                                #{item.id}
                              </b>
                              <p className="text-sm text-slate-400">
                                {item.detail}
                                {item.submitted_by && (
                                  <>
                                    <span className="mx-1">·</span>ส่งโดย{" "}
                                    {item.submitted_by}
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <a
                                className="group flex items-center gap-2 rounded bg-white/10 px-2 py-1 text-sm"
                                href={`/api/image/${item.image_key}`}
                                target="_blank"
                              >
                                <img
                                  src={`/api/image/${item.image_key}`}
                                  alt="ตัวอย่างหลักฐาน"
                                  loading="lazy"
                                  className="h-10 w-14 rounded object-cover"
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
                                className="rounded bg-emerald-600 px-3 py-2 text-sm"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  call({
                                    action: "reject",
                                    type: item.type,
                                    id: item.id,
                                  })
                                }
                                className="rounded bg-red-700 px-3 py-2 text-sm"
                              >
                                ไม่ผ่าน
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-400">ไม่มีรายการรอตรวจ</p>
                    )}
                  </div>
                </section>
                <section className="command-panel p-5">
                  <p className="label">SQUAD MANAGEMENT</p>
                  <h2 className="mt-2 text-xl font-black">เพิ่มสมาชิก</h2>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (name.trim()) {
                        call({ action: "member", name });
                        setName("");
                      }
                    }}
                    className="mt-4 flex gap-2"
                  >
                    <input
                      required
                      minLength={2}
                      maxLength={60}
                      value={name}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setName(event.target.value)
                      }
                      placeholder="ชื่อสมาชิก"
                      className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2"
                    />
                    <button className="rounded-lg bg-red-600 px-3 font-bold">
                      เพิ่ม
                    </button>
                  </form>
                  <p className="mt-3 text-xs text-slate-400">
                    เพิ่มด้วยชื่อได้ทันที สมาชิกใช้ชื่อนี้เพื่อเข้าใช้งาน
                  </p>
                  <p className="mt-5 text-sm text-slate-400">
                    สมาชิกทั้งหมด {data.managedMembers.length} คน
                  </p>
                  <div className="mt-4 space-y-2">
                    {data.managedMembers.map((member: any) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-2 rounded-lg bg-white/5 p-3"
                      >
                        <span className="flex-1">
                          <b>{member.display_name}</b>
                          <span className="ml-2 text-xs text-slate-500">
                            {member.active ? "ใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={!member.active}
                          onClick={() => {
                            const next = window.prompt(
                              "แก้ชื่อสมาชิก",
                              member.display_name,
                            );
                            if (next)
                              call({
                                action: "member_update",
                                id: member.id,
                                name: next,
                              });
                          }}
                          className="rounded bg-white/10 px-2 py-1 text-xs"
                        >
                          แก้ชื่อ
                        </button>
                        {member.id !== data.me.id && member.active && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("ปิดใช้งานสมาชิกนี้?"))
                                call({
                                  action: "member_delete",
                                  id: member.id,
                                });
                            }}
                            className="rounded bg-red-700/70 px-2 py-1 text-xs"
                          >
                            ปิดใช้งาน
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
                <AdminAccessPanel data={data} call={call} busy={busy} />
              </div>
            ))}
        </section>
        <aside className="command-rail hidden xl:block w-72 shrink-0 space-y-5">
          <section className="command-panel p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="label">SQUAD STATUS // 25 SLOTS</p>
                <h2 className="mt-2 text-lg font-black">สถานะแก๊ง</h2>
              </div>
              <span className="text-sm text-emerald-300">
                {data.members.filter((member: any) => member.online).length}/25
                คนออนไลน์
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {members.slice(0, 25).map((member: any) => (
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
