"use client";
import { useEffect, useState } from "react";
import {
  Chips,
  Avatar,
  Dot,
  EmptyState,
  Panel,
  PromptDialog,
  Row,
  SearchInput,
  Segmented,
} from "../ui";
import { ReviewDialog, EditAwardDialog } from "./admin-dialogs";
import { ROUNDS, type Data, Thumb, DateBadge } from "./shared";

export function AdminCommandCenter({
  data,
  call,
  busy,
  reviewTarget,
  onReviewTargetUsed,
}: {
  data: Data;
  call: (body: any) => Promise<boolean>;
  busy: boolean;
  // "airdrop-184" from a Discord "ตรวจเลย" link: open that item right away.
  reviewTarget?: string;
  onReviewTargetUsed?: (found: boolean) => void;
}) {
  const [tab, setTab] = useState<
    "verify" | "attendance" | "members" | "parties" | "points" | "audit" | "leave" | "admins"
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
  const [pointShops, setPointShops] = useState("");
  const [review, setReview] = useState<{ items: any[]; start: number } | null>(null);
  const [editingAward, setEditingAward] = useState<any>(null);
  useEffect(() => {
    if (!reviewTarget) return;
    const index = data.pending.findIndex((item: any) => `${item.type}-${item.id}` === reviewTarget);
    if (index >= 0) {
      setTab("verify");
      setReview({ items: data.pending, start: index });
    }
    onReviewTargetUsed?.(index >= 0);
  }, [reviewTarget, data.pending]);
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
  const visibleAudit = (data.pointAudit || []).filter((row: any) => matches(`${row.admin_name} ${row.summary}`));
  const AUDIT_LABEL: Record<string, string> = { approve: "ตรวจผ่าน", reject: "ไม่ผ่าน", adjust: "ปรับแต้ม", undo: "ย้อน", edit: "แก้ไข" };
  const visibleLeaves = data.adminLeaves.filter((leave: any) =>
    matches(`${leave.display_name} ${leave.reason} ${leave.leave_date}`),
  );
  const sourceLabel = (entry: any) =>
    entry.source === "adjustment"
      ? "ปรับแต้มโดยแอดมิน"
      : entry.source === "party"
        ? `${entry.kind === "loop" ? "ลูป" : "งัดร้าน"}ตรวจผ่าน${String(entry.note || "").includes("แก้โดย") ? ` · ${String(entry.note).split(" · ").slice(1).join(" · ")}` : ""}`
        : `แอร์ดรอปรอบ ${entry.round_time || ""} ตรวจผ่าน`;
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
      <Panel label="SQUAD COMMAND" flush>
        <div className="admin-tabs space-y-3 p-4">
          <Segmented
            label="จัดการแก๊ง"
            value={tab}
            onChange={(next) => {
              setTab(next as typeof tab);
              setQuery("");
            }}
            options={[
              { id: "verify", label: "รอตรวจ", count: data.pending.length || undefined },
              { id: "attendance", label: "เช็กชื่อ", count: attCounts.missing },
              { id: "members", label: "สมาชิก", count: activeMembers.length },
              { id: "parties", label: "ทีม", count: data.adminParties.length },
              { id: "points", label: "แต้ม" },
              { id: "audit", label: "ประวัติแก้แต้ม" },
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
                  ? "ค้นหาชื่อทีมหรือสมาชิก"
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
                  <div key={round} className="att-summary__cell tilt">
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
                  { id: "team", label: `ขาดคะแนนทีม ${attCounts.teamDebt}` },
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
                  shops: Number(pointValue) < 0 && pointShops ? Number(pointShops) : undefined,
                  name: member?.display_name,
                }).then((saved) => {
                  if (saved) {
                    setPointValue("");
                    setPointReason("");
                    setPointShops("");
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
              {Number(pointValue) < 0 && (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  step={1}
                  value={pointShops}
                  onChange={(event) => setPointShops(event.target.value)}
                  placeholder="คืนแต้มเมื่องัดร้านครบ…ร้าน (ไม่ใส่ = ไม่คืน)"
                  className="ui-input"
                  aria-label="จำนวนร้านที่ต้องงัดเพื่อได้แต้มคืน"
                />
              )}
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
                  leading={<Thumb imageKey={item.image_key} tone="amber" />}
                  title={
                    item.type === "party"
                      ? `${item.detail} · ${item.activity_date}`
                      : `แอร์ดรอปรอบ ${item.round_time} · ${item.activity_date}`
                  }
                  subtitle={`ส่งโดย ${item.submitted_by} · ได้แต้ม ${Number(item.member_count) || 1} คน คนละ +${item.points}`}
                  trailing={
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void call({ action: "evidence_resend", type: item.type, id: item.id })}
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                        title="ส่งการ์ดรายการนี้เข้า Discord อีกครั้ง พร้อมปุ่มตรวจ"
                      >
                        ส่งเข้า Discord
                      </button>
                      <button
                        type="button"
                        onClick={() => setReview({ items: visiblePending, start: index })}
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                      >
                        ตรวจ
                      </button>
                    </div>
                  }
                />
              ))}
            </>
          ) : data.pending.length ? (
            noMatch
          ) : (
            <EmptyState art="check" title="ไม่มีรายการรอตรวจในตอนนี้" hint="คิวตรวจว่างแล้ว" />
          ))}

        {tab === "members" &&
          (visibleMembers.length ? (
            visibleMembers.map((member: any) => (
              <Row
                key={member.id}
                inset={false}
                leading={<Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={34} />}
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
                      ยุบทีม
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
                        aria-label={`นำ ${member.name} ออกจากทีม`}
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
            <EmptyState art="team" title="ไม่มีทีมที่กำลังใช้งาน" />
          ))}

        {tab === "points" &&
          (data.openPenalties || []).map((penalty: any) => (
            <Row
              key={`penalty-${penalty.id}`}
              inset={false}
              title={`−${penalty.points} · ${penalty.name} · รอคืนแต้ม`}
              subtitle={`${penalty.reason} · งัดร้านแล้ว ${penalty.done}/${penalty.shops} ร้าน ครบแล้วคืนอัตโนมัติ · โดย ${penalty.adminName}`}
              trailing={<b className="rank-score">{penalty.done}/{penalty.shops}</b>}
            />
          ))}
        {tab === "points" &&
          (visibleLedger.length ? (
            visibleLedger.map((entry: any) => (
              <Row
                key={entry.source + entry.source_id}
                inset={false}
                title={`${entry.points > 0 ? "+" : ""}${entry.points} · ${entry.names}`}
                subtitle={`${entry.source === "adjustment" ? entry.note : sourceLabel(entry)} · ${entry.activity_date || bangkokDate(entry.created_at)}`}
                trailing={
                  <>
                    {entry.source === "party" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingAward(entry)}
                        className="ui-btn ui-btn--ghost ui-btn--sm"
                      >
                        แก้ไข
                      </button>
                    )}
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
                  </>
                }
              />
            ))
          ) : data.ledger.length ? (
            noMatch
          ) : (
            <EmptyState art="trophy" title="ยังไม่มีประวัติแต้ม" />
          ))}

        {tab === "audit" &&
          (visibleAudit.length ? (
            visibleAudit.map((row: any) => (
              <Row
                key={row.id}
                inset={false}
                title={row.summary}
                subtitle={`${AUDIT_LABEL[row.action] || row.action} โดย ${row.admin_name} · ${new Date(row.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                trailing={
                  row.points != null && Number(row.points) !== 0 ? (
                    <b className={`rank-score ${Number(row.points) < 0 ? "text-[var(--ui-red-light)]" : "text-[var(--ui-green)]"}`}>
                      {Number(row.points) > 0 ? "+" : ""}
                      {Number(row.points)}
                    </b>
                  ) : undefined
                }
              />
            ))
          ) : (data.pointAudit || []).length ? (
            noMatch
          ) : (
            <EmptyState art="check" title="ยังไม่มีประวัติการแก้แต้ม" hint="ทุกครั้งที่แอดมินตรวจ ปรับ ย้อน หรือแก้แต้ม จะบันทึกไว้ที่นี่ (เริ่มเก็บตั้งแต่วันนี้)" />
          ))}

        {tab === "leave" &&
          (visibleLeaves.length ? (
            visibleLeaves.map((leave: any) => (
              <Row
                key={leave.id}
                inset={false}
                leading={<DateBadge date={leave.leave_date} today={data.date} />}
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
            <EmptyState art="calendar" title="ยังไม่มีรายการลา" hint="สมาชิกแจ้งลาได้จากหน้าห้องลา" />
          ))}

        {tab === "attendance" &&
          (visibleAttendance.length ? (
            visibleAttendance.map((r: any) => (
              <Row
                key={r.member.id}
                inset={false}
                leading={<Avatar url={data.avatars?.[String(r.member.id)]} name={r.member.display_name} size={34} />}
                title={r.member.display_name}
                subtitle={`${r.leave ? "ลา" : `ส่งแล้ว ${r.sent}/${ROUNDS.length} รอบ`} · ทีม ${r.teamPoints}/${data.team?.perDay ?? 9}${r.teamDebt > 0 ? ` · เดือนนี้ขาด ${r.teamDebt}` : ""}`}
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
              art={attFilter === "missing" ? "check" : undefined}
              title={
                attFilter === "missing"
                  ? "ทุกคนส่งครบหรือแจ้งลาแล้ว"
                  : attFilter === "done"
                    ? "ยังไม่มีใครส่งครบ 4 รอบ"
                    : attFilter === "team"
                      ? "ไม่มีใครขาดคะแนนทีมเดือนนี้"
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
                leading={<Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={34} />}
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
      {editingAward && (
        <EditAwardDialog
          entry={editingAward}
          data={data}
          busy={busy}
          onCancel={() => setEditingAward(null)}
          onSave={async (kind, keep) => {
            if (
              await call({
                action: "points_edit",
                sourceId: editingAward.source_id,
                kind,
                keep,
                confirmed: true,
              })
            )
              setEditingAward(null);
          }}
        />
      )}
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
