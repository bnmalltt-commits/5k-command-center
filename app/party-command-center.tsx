"use client";

import { useMemo, useState } from "react";
import { Check, Crown, Lock, Plus, Repeat, Store, X } from "lucide-react";
import { Picker } from "./picker";
import { Widget3D } from "./three/widget";
import {
  ConfirmDialog,
  Dot,
  EmptyState,
  Panel,
  Row,
  SearchInput,
  Segmented,
  Avatar,
  DiscordGate,
} from "./ui";

type Props = {
  data: any;
  members: any[];
  call: (body: any) => Promise<boolean>;
  busy: boolean;
  onSubmit?: (ids: number[], file: File, shopName: string, kind: "shop" | "loop") => Promise<boolean>;
};

const SEATS = 5;
const statusText = (status: string) =>
  status === "approved" ? "ผ่านแล้ว" : status === "rejected" ? "ไม่ผ่าน" : "รอตรวจ";

export function PartyCommandCenter({ data, members, call, busy, onSubmit }: Props) {
  const party = data.myParty;
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"team" | "find" | "invites">("team");
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [inviteeIds, setInviteeIds] = useState<number[]>([]);
  const [activityFile, setActivityFile] = useState<File | null>(null);
  const [shopName, setShopName] = useState("");
  const [kind, setKind] = useState<"shop" | "loop">("shop");
  // Who actually took part; null = everyone in the team (the default).
  const [present, setPresent] = useState<string[] | null>(null);
  const [activityPickerReset, setActivityPickerReset] = useState(0);
  const [createSearch, setCreateSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [activityShown, setActivityShown] = useState(10);
  const isOwner = party?.owner_member_id === data.me.id;
  const available = useMemo(
    () =>
      members.filter(
        (member: any) =>
          !party?.members?.some((current: any) => current.id === member.id),
      ),
    [members, party],
  );
  const addMatches = available.filter((member: any) =>
    member.display_name.toLowerCase().includes(addSearch.trim().toLowerCase()),
  );
  const credited = party
    ? party.members.filter((m: any) => String(m.id) === String(data.me.id) || !present || present.includes(String(m.id))).length
    : 0;

  return (
    <section className="party-v2 space-y-5">
      <Segmented
        label="เมนูทีม"
        value={tab}
        onChange={(next) => setTab(next as typeof tab)}
        options={[
          { id: "team", label: party ? "ทีมของฉัน" : "สร้างทีม" },
          { id: "find", label: "ทีมที่เปิดรับ", count: data.openParties.length || undefined },
          { id: "invites", label: "คำเชิญ", count: data.partyInvites.length || undefined },
        ]}
      />

      {tab === "team" && party && (
        <>
          <Panel
            label="SQUAD"
            title={party.name}
            subtitle={`${party.members.length}/${SEATS} คน · ${party.status === "open" ? "กำลังจัดทีม รับคนเพิ่มได้" : "ล็อกทีมแล้ว"}`}
            trailing={
              <div className="flex flex-wrap justify-end gap-2">
                {party.status === "open" && isOwner && (
                  <button
                    disabled={busy}
                    onClick={() => call({ action: "party_lock", partyId: party.id, locked: true })}
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    <Lock />
                    ล็อกทีม
                  </button>
                )}
                {party.status === "locked" && isOwner && (
                  <button
                    disabled={busy}
                    onClick={() => call({ action: "party_lock", partyId: party.id, locked: false })}
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    ปลดล็อกทีม
                  </button>
                )}
                {isOwner ? (
                  <button disabled={busy} onClick={() => setConfirmDissolve(true)} className="ui-btn ui-btn--ghost ui-btn--sm">
                    ยุบทีม
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => call({ action: "party_leave" })} className="ui-btn ui-btn--ghost ui-btn--sm">
                    ออกจากทีม
                  </button>
                )}
              </div>
            }
            flush
          >
            <Widget3D kind="squad" args={{ filled: party.members.length, wide: true }} className="squad-hero" />
            {/* Five seats: who's in, who leads, who's online, what's free. */}
            <div className="squad">
              {party.members.map((member: any) => {
                const isLeader = member.id === party.owner_member_id;
                const canRemove = isOwner && !isLeader;
                return (
                  <div key={member.id} className={`squad__slot tilt ${isLeader ? "is-leader" : ""}`}>
                    {canRemove && (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`นำ ${member.display_name} ออกจากทีม`}
                        title="นำออกจากทีม"
                        onClick={() =>
                          call({ action: "party_remove_member", partyId: party.id, memberId: member.id })
                        }
                        className="party-remove squad__remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <span className="avatar-status">
                      <Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={52} />
                      <Dot tone={member.online ? "green" : "idle"} />
                    </span>
                    <span className="squad__name">{member.display_name}</span>
                    <span className="squad__role">
                      {isLeader ? (
                        <span className="team-status">
                          <Crown className="h-3.5 w-3.5 text-[var(--ui-gold)]" />
                          หัวหน้าทีม
                        </span>
                      ) : (
                        "สมาชิก"
                      )}
                    </span>
                    <span className={`squad__online ${member.online ? "is-on" : ""}`}>{member.online ? "ออนไลน์" : "ออฟไลน์"}</span>
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, SEATS - party.members.length) }, (_, i) => (
                <div key={`seat-${i}`} className="squad__slot is-empty">
                  <span className="squad__plus">
                    <Plus className="h-5 w-5" />
                  </span>
                  ที่ว่าง
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            label="PARTY ACTIVITY"
            title="ส่งหลักฐานทีม"
            subtitle={`งัดร้าน +${data.team?.points?.shop ?? 3} · ลูป +${data.team?.points?.loop ?? 1} ต่อคน · ขั้นต่ำวันละ ${data.team?.perDay ?? 9} คะแนน`}
          >
            {!data.me?.discordLinked && <DiscordGate what="ส่งหลักฐานทีม" />}
            <form
              hidden={!data.me?.discordLinked}
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!activityFile) return;
                // Keep the photo when the member cancels the confirm or the
                // upload fails, so they can retry without picking it again.
                const sent = await onSubmit?.(
                  party.members
                    .map((member: any) => String(member.id))
                    .filter((id: string) => !present || present.includes(id) || id === String(data.me.id))
                    .map(Number),
                  activityFile,
                  kind === "shop" ? shopName.trim() : "",
                  kind,
                );
                if (!sent) return;
                setActivityFile(null);
                setShopName("");
                setPresent(null);
                setActivityPickerReset((n) => n + 1);
              }}
            >
              <Segmented
                label="ประเภทหลักฐาน"
                value={kind}
                onChange={(id) => setKind(id === "loop" ? "loop" : "shop")}
                options={[
                  { id: "shop", label: `งัดร้าน +${data.team?.points?.shop ?? 3}` },
                  { id: "loop", label: `ลูป +${data.team?.points?.loop ?? 1}` },
                ]}
              />
              <div className="space-y-2">
                <p className="text-sm text-[var(--ui-text-2)]">
                  ใครไปบ้าง · แตะชื่อเพื่อเอาคนที่ไม่ได้ไปออก ({credited} คนได้แต้ม)
                </p>
                <div className="present-picks" role="group" aria-label="คนที่ไปจริง">
                  {party.members.map((member: any) => {
                    const id = String(member.id);
                    const isMe = id === String(data.me.id);
                    const on = isMe || !present || present.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={on}
                        disabled={isMe}
                        title={isMe ? "ผู้ส่งต้องอยู่ในหลักฐานเสมอ" : undefined}
                        onClick={() => {
                          const all = party.members.map((m: any) => String(m.id));
                          const current: string[] = present ?? all;
                          setPresent(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
                        }}
                        className={`present-chip ${on ? "is-on" : ""}`}
                      >
                        <Avatar url={data.avatars?.[id]} name={member.display_name} size={28} />
                        {member.display_name}
                        {isMe ? " (คุณ)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
              <input
                hidden={kind !== "shop"}
                value={shopName}
                maxLength={60}
                onChange={(event) => setShopName(event.target.value)}
                placeholder="ชื่อร้านที่งัด (ไม่บังคับ)"
                aria-label="ชื่อร้านที่งัด"
                className="ui-input"
              />
              <Picker onChange={setActivityFile} resetToken={activityPickerReset} />
              <button disabled={busy || !activityFile} className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg">
                ส่งเข้าคิวตรวจ
              </button>
            </form>
          </Panel>

          {isOwner && party.status === "open" && party.members.length < SEATS && (
            <Panel label="MEMBER CONTROL" title="เพิ่มคนเข้าทีม" subtitle="แตะชื่อเพื่อเพิ่มเข้าทีมทันที ไม่ต้องรอยืนยัน">
              <div className="space-y-3">
                <SearchInput value={addSearch} onChange={setAddSearch} placeholder="ค้นหาชื่อเพื่อน" />
                {addMatches.length ? (
                  <div className="member-picks">
                    {addMatches.map((member: any) => (
                      <button
                        key={member.id}
                        type="button"
                        disabled={busy}
                        onClick={() => call({ action: "party_invite", partyId: party.id, memberId: member.id })}
                        className="party-create-invite"
                      >
                        <span className="avatar-status">
                          <Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={28} />
                          <span className={`status-dot ${member.online ? "" : "status-dot-offline"}`} />
                        </span>
                        {member.display_name}
                        <Plus />
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title={addSearch.trim() ? "ไม่พบชื่อที่ค้นหา" : "ทุกคนอยู่ในทีมแล้ว"}
                    hint={addSearch.trim() ? "ลองเปลี่ยนคำค้น" : undefined}
                  />
                )}
              </div>
            </Panel>
          )}

          <Panel label="ACTIVITY LOG" title="ประวัติหลักฐานทีม" subtitle={`${data.parties.length} รายการ`} flush>
            {data.parties.length ? (
              <>
                {data.parties.slice(0, activityShown).map((activity: any) => (
                  <Row
                    key={activity.id}
                    inset={false}
                    // Approved evidence is deleted from storage to save space,
                    // so there's nothing left to link to.
                    href={activity.status !== "approved" && activity.image_key ? `/api/image/${activity.image_key}` : undefined}
                    leading={
                      <span className="more-icon" aria-hidden="true">
                        {activity.kind === "loop" ? <Repeat className="h-5 w-5" /> : <Store className="h-5 w-5" />}
                      </span>
                    }
                    title={`${activity.kind === "loop" ? "ลูป" : "งัดร้าน"} · ${activity.activity_date}`}
                    subtitle={
                      activity.status === "rejected" && activity.reject_reason
                        ? `ไม่ผ่าน: ${activity.reject_reason} · ${activity.members}`
                        : activity.members
                    }
                    trailing={
                      <span className={`status-pill status-pill--${activity.status === "approved" ? "approved" : activity.status === "rejected" ? "rejected" : "pending"}`}>
                        {statusText(activity.status)}
                      </span>
                    }
                  />
                ))}
                {data.parties.length > activityShown && (
                  <div className="p-3 text-center">
                    <button type="button" onClick={() => setActivityShown((n) => n + 10)} className="ui-btn ui-btn--ghost ui-btn--sm">
                      โหลดเพิ่ม {Math.min(10, data.parties.length - activityShown)} รายการ
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState art="crate" title="ยังไม่มีประวัติหลักฐานทีม" hint="ส่งหลักฐานงัดร้านหรือลูปจากด้านบนเพื่อเริ่มเก็บคะแนน" />
            )}
          </Panel>
        </>
      )}

      {tab === "team" && !party && (
        <Panel
          label="CREATE SQUAD"
          title="สร้างทีมของคุณ"
          subtitle="ต้องมีทีมก่อนถึงจะส่งงัดร้าน/ลูปได้ · ทีมคนเดียวก็ได้"
        >
          {/* The seats fill as friends are picked: you plus each invitee. */}
          <Widget3D kind="squad" args={{ filled: 1 + inviteeIds.length, wide: true }} className="squad-hero squad-hero--create" />
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim())
                void call({ action: "party_create", name, memberIds: inviteeIds }).then((created) => {
                  // Otherwise the old picks stay selected after this party
                  // is dissolved and silently ride into the next one.
                  if (created) setInviteeIds([]);
                });
            }}
          >
            <div className="form-row">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                minLength={2}
                maxLength={40}
                placeholder="ตั้งชื่อทีม"
                aria-label="ชื่อทีม"
                className="ui-input"
              />
              <button disabled={busy} className="ui-btn ui-btn--primary">
                สร้างทีม
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sum-title">ชวนเพื่อนเข้าทีม (ไม่บังคับ)</p>
                  <p className="hint">เลือกได้สูงสุด 4 คน · คนที่เลือกเข้าทีมทันที ไม่ต้องรอยืนยัน</p>
                </div>
                <span className="count-pill">{inviteeIds.length}/4 คน</span>
              </div>
              <SearchInput value={createSearch} onChange={setCreateSearch} placeholder="ค้นหาชื่อเพื่อน" />
              <div className="member-picks">
                {members
                  .filter((member: any) => member.id !== data.me.id)
                  .filter((member: any) => member.display_name.toLowerCase().includes(createSearch.trim().toLowerCase()))
                  .map((member: any) => {
                    const selected = inviteeIds.includes(member.id);
                    const blocked = !selected && inviteeIds.length >= 4;
                    return (
                      <button
                        type="button"
                        key={member.id}
                        disabled={busy || blocked}
                        aria-pressed={selected}
                        onClick={() =>
                          setInviteeIds((current) =>
                            selected ? current.filter((id) => id !== member.id) : [...current, member.id],
                          )
                        }
                        className={`party-create-invite ${selected ? "is-selected" : ""}`}
                      >
                        <span className="avatar-status">
                          <Avatar url={data.avatars?.[String(member.id)]} name={member.display_name} size={28} />
                          <span className={`status-dot ${member.online ? "" : "status-dot-offline"}`} />
                        </span>
                        {member.display_name}
                        {selected && <Check />}
                      </button>
                    );
                  })}
              </div>
            </div>
          </form>
        </Panel>
      )}

      {tab === "find" && (
        <Panel label="OPEN SQUADS" title="ทีมที่เปิดรับ" subtitle="เข้าร่วมได้ทันที ทีมละไม่เกิน 5 คน" flush>
          {data.openParties.length ? (
            data.openParties.map((open: any) => (
              <Row
                key={open.id}
                inset={false}
                leading={<Avatar url={data.avatars?.[String(open.owner_member_id)]} name={open.owner_name} size={36} />}
                title={open.name}
                subtitle={`หัวหน้า ${open.owner_name} · ${open.member_count}/${SEATS} คน`}
                trailing={
                  <button
                    disabled={busy || party}
                    onClick={() => call({ action: "party_join", partyId: open.id })}
                    className={`ui-btn ui-btn--sm ${party ? "ui-btn--ghost" : "ui-btn--primary"}`}
                  >
                    {party ? "มีทีมแล้ว" : "เข้าร่วม"}
                  </button>
                }
              />
            ))
          ) : (
            <EmptyState art="team" title="ยังไม่มีทีมที่เปิดรับ" hint="สร้างทีมของคุณเองได้จากแท็บแรก" />
          )}
        </Panel>
      )}

      {tab === "invites" && (
        <Panel label="PARTY INVITES" title="คำเชิญของคุณ" flush>
          {data.partyInvites.length ? (
            data.partyInvites.map((invite: any) => (
              <Row
                key={invite.id}
                inset={false}
                title={invite.party_name}
                subtitle={`เชิญโดย ${invite.inviter_name} · ${invite.member_count}/${SEATS} คน`}
                trailing={
                  <>
                    <button
                      onClick={() => call({ action: "party_respond", inviteId: invite.id, accept: true })}
                      className="ui-btn ui-btn--ok ui-btn--sm"
                    >
                      เข้าร่วม
                    </button>
                    <button
                      onClick={() => call({ action: "party_respond", inviteId: invite.id, accept: false })}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                      aria-label="ปฏิเสธคำเชิญ"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                }
              />
            ))
          ) : (
            <EmptyState art="team" title="ยังไม่มีคำเชิญ" hint="เมื่อมีคนชวนเข้าทีม คำเชิญจะขึ้นที่นี่" />
          )}
        </Panel>
      )}

      {confirmDissolve && party && (
        <ConfirmDialog
          message={`ยุบทีม "${party.name}" ?\nสมาชิกทั้งหมดจะออกจากทีมทันที การดำเนินการนี้ย้อนกลับไม่ได้`}
          busy={busy}
          onResolve={(ok) => {
            setConfirmDissolve(false);
            if (ok) call({ action: "party_dissolve", partyId: party.id, confirmed: true });
          }}
        />
      )}
    </section>
  );
}
