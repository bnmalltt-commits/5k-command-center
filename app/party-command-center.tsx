"use client";

import { useMemo, useState } from "react";
import { Check, Lock, ShieldCheck, Users, X } from "lucide-react";
import { Picker } from "./picker";
import {
  ConfirmDialog,
  Dot,
  EmptyState,
  Panel,
  Row,
  SearchInput,
  Segmented,
} from "./ui";

type Props = {
  data: any;
  members: any[];
  call: (body: any) => void;
  busy: boolean;
  onSubmit?: (ids: number[], file: File) => void;
};

export function PartyCommandCenter({ data, members, call, busy, onSubmit }: Props) {
  const party = data.myParty;
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"team" | "find" | "invites">("team");
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [inviteeIds, setInviteeIds] = useState<number[]>([]);
  const [activityFile, setActivityFile] = useState<File | null>(null);
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

  return (
    <section className="party-v2 space-y-5">
      <Panel
        label="PARTY MISSION CONTROL"
        title={party ? party.name : "รวมทีมสำหรับภารกิจ"}
        subtitle={
          party
            ? `${party.members.length}/5 คน · ${party.status === "open" ? "กำลังจัดทีม" : "ล็อกทีมแล้ว"}`
            : "สร้างปาร์ตี้หรือเข้าร่วมทีมที่กำลังเปิดรับ"
        }
        trailing={
          party && (
            <div className="flex gap-2">
              {party.status === "open" && isOwner && (
                <button
                  disabled={busy}
                  onClick={() =>
                    call({ action: "party_lock", partyId: party.id, locked: true })
                  }
                  className="ui-btn ui-btn--primary ui-btn--sm"
                >
                  <Lock className="h-3.5 w-3.5" />
                  ล็อกทีม
                </button>
              )}
              {party.status === "locked" && isOwner && (
                <button
                  disabled={busy}
                  onClick={() =>
                    call({ action: "party_lock", partyId: party.id, locked: false })
                  }
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  ปลดล็อกทีม
                </button>
              )}
              {isOwner ? (
                <button
                  disabled={busy}
                  onClick={() => setConfirmDissolve(true)}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  ยุบปาร์ตี้
                </button>
              ) : (
                <button
                  disabled={busy}
                  onClick={() => call({ action: "party_leave" })}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  ออก
                </button>
              )}
            </div>
          )
        }
        flush
      >
        {party && (
          <div>
            {party.members.map((member: any) => {
              const isLeader = member.id === party.owner_member_id;
              const canRemove = isOwner && !isLeader;
              return (
                <Row
                  key={member.id}
                  inset={false}
                  leading={<Dot tone={member.online ? "green" : "idle"} />}
                  title={member.display_name}
                  subtitle={`${member.online ? "ออนไลน์" : "ออฟไลน์"} · ${isLeader ? "หัวหน้าทีม" : "สมาชิก"}`}
                  trailing={
                    canRemove ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`นำ ${member.display_name} ออกจากทีม`}
                        onClick={() =>
                          call({
                            action: "party_remove_member",
                            partyId: party.id,
                            memberId: member.id,
                          })
                        }
                        className="party-remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </Panel>
      {party && (
        <>
          <Panel
            label="PARTY ACTIVITY"
            title="ส่งหลักฐานกิจกรรมปาร์ตี้"
            subtitle={`ส่งรูปเดียวเพื่อบันทึกกิจกรรมให้สมาชิก ${party.members.length} คน`}
          >
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!activityFile) return;
                await onSubmit?.(
                  party.members.map((member: any) => member.id),
                  activityFile,
                );
                setActivityFile(null);
                setActivityPickerReset((n) => n + 1);
              }}
            >
              <Picker onChange={setActivityFile} resetToken={activityPickerReset} />
              <button
                disabled={busy || !activityFile}
                className="ui-btn ui-btn--primary ui-btn--block"
              >
                ส่งเข้าคิวตรวจ
              </button>
            </form>
          </Panel>
          <Panel
            label="ACTIVITY LOG"
            title="ประวัติกิจกรรมปาร์ตี้"
            subtitle={`${data.parties.length} รายการ`}
            flush
          >
            {data.parties.length ? (
              <>
                {data.parties.slice(0, activityShown).map((activity: any) => (
                  <Row
                    key={activity.id}
                    inset={false}
                    // Approved evidence is deleted from storage to save space,
                    // so there's nothing left to link to.
                    href={
                      activity.status !== "approved"
                        ? `/api/image/${activity.image_key}`
                        : undefined
                    }
                    leading={
                      <Dot
                        tone={
                          activity.status === "approved"
                            ? "green"
                            : activity.status === "rejected"
                              ? "red"
                              : "amber"
                        }
                      />
                    }
                    title={activity.activity_date}
                    subtitle={activity.members}
                    trailing={
                      <span className="text-xs text-[var(--ui-text-3)]">
                        {activity.status === "approved"
                          ? "ผ่านแล้ว"
                          : activity.status === "rejected"
                            ? "ไม่ผ่าน"
                            : "รอตรวจ"}
                      </span>
                    }
                  />
                ))}
                {data.parties.length > activityShown && (
                  <div className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => setActivityShown((n) => n + 10)}
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      โหลดเพิ่ม{" "}
                      {Math.min(10, data.parties.length - activityShown)} รายการ
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="ยังไม่มีประวัติกิจกรรม"
                hint="ส่งหลักฐานกิจกรรมทีมจากด้านบนเพื่อเริ่มเก็บคะแนน"
              />
            )}
          </Panel>
        </>
      )}
      <Segmented
        label="เมนูปาร์ตี้"
        value={tab}
        onChange={(next) => setTab(next as typeof tab)}
        options={[
          { id: "team", label: "ทีมของฉัน" },
          { id: "find", label: "ค้นหาปาร์ตี้" },
          { id: "invites", label: "คำเชิญ", count: data.partyInvites.length },
        ]}
      />
      {tab === "team" && (
        <Panel>
          {!party ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (name.trim())
                  call({ action: "party_create", name, memberIds: inviteeIds });
              }}
            >
              <p className="label">CREATE SQUAD</p>
              <h3 className="mt-2 text-xl font-black">สร้างปาร์ตี้และชวนเพื่อน</h3>
              <p className="mt-2 text-sm text-[var(--ui-text-3)]">
                ตั้งชื่อทีมและเลือกสมาชิก — สมาชิกที่เลือกจะเข้าทีมทันที ไม่ต้องรอยืนยัน
              </p>
              <div className="mt-4 flex max-w-xl gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={40}
                  placeholder="ชื่อปาร์ตี้"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-3"
                />
                <button
                  disabled={busy}
                  className="ui-btn ui-btn--primary"
                >
                  สร้างและเพิ่มเข้าทีม
                </button>
              </div>
              <div className="party-create-invites mt-5 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">เลือกเพื่อนเข้าปาร์ตี้</p>
                    <p className="mt-1 text-xs text-[var(--ui-text-3)]">เลือกได้สูงสุด 4 คน นอกเหนือจากคุณ</p>
                  </div>
                  <span className="rounded-full border border-red-400/35 bg-red-500/10 px-3 py-1 text-xs font-bold text-[var(--ui-text)]">
                    {inviteeIds.length}/4 คน
                  </span>
                </div>
                <div className="mt-3">
                  <SearchInput
                    value={createSearch}
                    onChange={setCreateSearch}
                    placeholder="ค้นหาชื่อเพื่อน"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {members
                    .filter((member: any) => member.id !== data.me.id)
                    .filter((member: any) =>
                      member.display_name.toLowerCase().includes(createSearch.trim().toLowerCase()),
                    )
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
                              selected
                                ? current.filter((id) => id !== member.id)
                                : [...current, member.id],
                            )
                          }
                          className={`party-create-invite ${selected ? "is-selected" : ""}`}
                        >
                          <span className={`status-dot ${member.online ? "" : "status-dot-offline"}`} />
                          {member.display_name}
                          {selected && <Check className="h-4 w-4" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[var(--ui-red)]" />
                <div>
                  <p className="label">MEMBER CONTROL</p>
                  <h3 className="mt-1 text-xl font-black">เพิ่มสมาชิกเข้าทีม</h3>
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--ui-text-3)]">
                เลือกสมาชิกเพื่อเพิ่มเข้าปาร์ตี้ทันที ไม่ต้องรอยืนยัน
              </p>
              <div className="mt-3">
                <SearchInput
                  value={addSearch}
                  onChange={setAddSearch}
                  placeholder="ค้นหาชื่อเพื่อน"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {available
                  .filter((member: any) =>
                    member.display_name.toLowerCase().includes(addSearch.trim().toLowerCase()),
                  )
                  .map((member: any) => (
                    <button
                      key={member.id}
                      disabled={
                        busy ||
                        party.status !== "open" ||
                        party.owner_member_id !== data.me.id
                      }
                      onClick={() =>
                        call({
                          action: "party_invite",
                          partyId: party.id,
                          memberId: member.id,
                        })
                      }
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      <span
                        className={`status-dot mr-2 inline-block ${member.online ? "" : "status-dot-offline"}`}
                      />
                      {member.display_name}
                    </button>
                  ))}
                {!available.some((member: any) =>
                  member.display_name
                    .toLowerCase()
                    .includes(addSearch.trim().toLowerCase()),
                ) && (
                  <EmptyState
                    title={
                      addSearch.trim()
                        ? "ไม่พบสมาชิกที่ค้นหา"
                        : "ทุกคนอยู่ในทีมแล้ว"
                    }
                    hint={addSearch.trim() ? "ลองเปลี่ยนคำค้น" : undefined}
                  />
                )}
              </div>
            </>
          )}
        </Panel>
      )}
      {tab === "find" && (
        <Panel label="OPEN SQUADS" title="ปาร์ตี้ที่เปิดรับ" flush>
          {data.openParties.length ? (
            data.openParties.map((open: any) => (
              <Row
                key={open.id}
                inset={false}
                title={open.name}
                subtitle={`หัวหน้า ${open.owner_name} · ${open.member_count}/5 คน`}
                trailing={
                  <button
                    disabled={busy || party}
                    onClick={() =>
                      call({ action: "party_join", partyId: open.id })
                    }
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                  >
                    {party ? "ทีมของคุณ" : "เข้าร่วมทันที"}
                  </button>
                }
              />
            ))
          ) : (
            <EmptyState
              title="ยังไม่มีปาร์ตี้เปิดรับ"
              hint="ลองสร้างทีมของคุณเองจากแท็บทีมของฉัน"
            />
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
                subtitle={`เชิญโดย ${invite.inviter_name}`}
                trailing={
                  <>
                    <button
                      onClick={() =>
                        call({
                          action: "party_respond",
                          inviteId: invite.id,
                          accept: true,
                        })
                      }
                      className="ui-btn ui-btn--ok ui-btn--sm"
                    >
                      เข้าร่วม
                    </button>
                    <button
                      onClick={() =>
                        call({
                          action: "party_respond",
                          inviteId: invite.id,
                          accept: false,
                        })
                      }
                      className="ui-btn ui-btn--ghost ui-btn--sm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                }
              />
            ))
          ) : (
            <EmptyState title="ยังไม่มีคำเชิญ" />
          )}
        </Panel>
      )}
      {confirmDissolve && party && (
        <ConfirmDialog
          message={`ยุบปาร์ตี้ "${party.name}" ?\nสมาชิกทั้งหมดจะออกจากปาร์ตี้ทันที การดำเนินการนี้ย้อนกลับไม่ได้`}
          busy={busy}
          onResolve={(ok) => {
            setConfirmDissolve(false);
            if (ok)
              call({ action: "party_dissolve", partyId: party.id, confirmed: true });
          }}
        />
      )}
    </section>
  );
}
