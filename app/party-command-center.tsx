"use client";

import { useMemo, useState } from "react";
import { Check, Lock, Plus, ShieldCheck, Users, X } from "lucide-react";

type Props = {
  data: any;
  members: any[];
  call: (body: any) => void;
  busy: boolean;
  onSubmit?: (ids: number[], file: File) => void;
};

export function PartyCommandCenter({ data, members, call, busy }: Props) {
  const party = data.myParty;
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"team" | "find" | "invites">("team");
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [inviteeIds, setInviteeIds] = useState<number[]>([]);
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
      <div className="command-panel overflow-hidden">
        <div className="border-b border-white/10 bg-gradient-to-r from-red-950/45 to-transparent p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="label">PARTY MISSION CONTROL</p>
              <h2 className="mt-2 flex items-center gap-2 text-2xl font-black">
                <Users className="h-6 w-6 text-red-400" />
                {party ? party.name : "รวมทีมสำหรับภารกิจ"}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {party
                  ? `${party.members.length}/5 คน · ${party.status === "open" ? "กำลังจัดทีม" : "ล็อกทีมแล้ว"}`
                  : "สร้างปาร์ตี้หรือเข้าร่วมทีมที่กำลังเปิดรับ"}
              </p>
            </div>
            {party && (
              <div className="flex gap-2">
                <span className="rounded-full border border-white/15 bg-black/20 px-3 py-2 text-sm font-bold">
                  {party.members.length}/5
                </span>
                {party.status === "open" &&
                  isOwner && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        call({
                          action: "party_lock",
                          partyId: party.id,
                          locked: true,
                        })
                      }
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold"
                    >
                      <Lock className="mr-1 inline h-4 w-4" />
                      ล็อกทีม
                    </button>
                  )}
                {isOwner ? (
                  <button
                    disabled={busy}
                    onClick={() => setConfirmDissolve(true)}
                    className="rounded-lg border border-red-400/50 px-4 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10"
                  >
                    ยุบปาร์ตี้
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => call({ action: "party_leave" })}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm"
                  >
                    ออก
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {party && (
          <div className="grid gap-3 p-5 sm:grid-cols-5">
            {party.members.map((member: any) => (
              <div
                key={member.id}
                className="rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <span
                  className={`status-dot ${member.online ? "" : "status-dot-offline"}`}
                />
                <b className="ml-2 block truncate">{member.display_name}</b>
                <small className="mt-1 block text-slate-500">
                  {member.online ? "ออนไลน์" : "ออฟไลน์"} · {member.id === party.owner_member_id
                    ? "หัวหน้าทีม"
                    : "สมาชิก"}
                </small>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 5 - party.members.length) }).map(
              (_, index) => (
                <div
                  key={index}
                  className="grid min-h-20 place-items-center rounded-xl border border-dashed border-white/15 text-slate-600"
                >
                  <Plus className="h-5 w-5" />
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        <button
          onClick={() => setTab("team")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "team" ? "bg-red-600" : "bg-white/5 text-slate-400"}`}
        >
          ทีมของฉัน
        </button>
        <button
          onClick={() => setTab("find")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "find" ? "bg-red-600" : "bg-white/5 text-slate-400"}`}
        >
          ค้นหาปาร์ตี้
        </button>
        <button
          onClick={() => setTab("invites")}
          className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "invites" ? "bg-red-600" : "bg-white/5 text-slate-400"}`}
        >
          คำเชิญ{" "}
          {data.partyInvites.length ? `(${data.partyInvites.length})` : ""}
        </button>
      </div>
      {tab === "team" && (
        <div className="command-panel p-5">
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
              <p className="mt-2 text-sm text-slate-400">
                ตั้งชื่อทีมและเลือกสมาชิกได้ทันที ระบบจะส่งคำเชิญหลังสร้างปาร์ตี้
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
                  className="rounded-lg bg-red-600 px-4 font-bold"
                >
                  สร้างและส่งคำเชิญ
                </button>
              </div>
              <div className="party-create-invites mt-5 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black">เลือกเพื่อนเข้าปาร์ตี้</p>
                    <p className="mt-1 text-xs text-slate-400">เลือกได้สูงสุด 4 คน นอกเหนือจากคุณ</p>
                  </div>
                  <span className="rounded-full border border-red-400/35 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-200">
                    {inviteeIds.length}/4 คน
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {members
                    .filter((member: any) => member.id !== data.me.id)
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
                <ShieldCheck className="h-5 w-5 text-red-400" />
                <div>
                  <p className="label">MEMBER CONTROL</p>
                  <h3 className="mt-1 text-xl font-black">เชิญสมาชิกเข้าทีม</h3>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                เลือกสมาชิกเพื่อส่งคำเชิญเข้าปาร์ตี้หลักของคุณ
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {available.map((member: any) => (
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
                    className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:border-red-400"
                  >
                    <span
                      className={`status-dot mr-2 inline-block ${member.online ? "" : "status-dot-offline"}`}
                    />
                    {member.display_name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {tab === "find" && (
        <div className="command-panel p-5">
          <p className="label">OPEN SQUADS</p>
          <h3 className="mt-2 text-xl font-black">ปาร์ตี้ที่เปิดรับ</h3>
          <div className="mt-4 space-y-2">
            {data.openParties.length ? (
              data.openParties.map((open: any) => (
                <div
                  key={open.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <div>
                    <b>{open.name}</b>
                    <p className="text-xs text-slate-500">
                      หัวหน้า {open.owner_name} · {open.member_count}/5 คน
                    </p>
                  </div>
                  <button
                    disabled={busy || party}
                    onClick={() =>
                      call({ action: "party_join", partyId: open.id })
                    }
                    className="rounded-lg border border-red-400/50 px-3 py-2 text-sm font-bold text-red-200"
                  >
                    {party ? "ทีมของคุณ" : "เข้าร่วมทันที"}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-slate-400">ยังไม่มีปาร์ตี้เปิดรับ</p>
            )}
          </div>
        </div>
      )}
      {tab === "invites" && (
        <div className="command-panel p-5">
          <p className="label">PARTY INVITES</p>
          <h3 className="mt-2 text-xl font-black">คำเชิญของคุณ</h3>
          <div className="mt-4 space-y-2">
            {data.partyInvites.length ? (
              data.partyInvites.map((invite: any) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-3"
                >
                  <div>
                    <b>{invite.party_name}</b>
                    <p className="text-xs text-slate-500">
                      เชิญโดย {invite.inviter_name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        call({
                          action: "party_respond",
                          inviteId: invite.id,
                          accept: true,
                        })
                      }
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm"
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
                      className="rounded-lg border border-white/15 px-3 py-2 text-sm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400">ยังไม่มีคำเชิญ</p>
            )}
          </div>
        </div>
      )}
      {confirmDissolve && party && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="dissolve-party-title">
          <div className="command-panel w-full max-w-md p-5 shadow-2xl">
            <p className="label text-red-300">PARTY CONTROL // DISSOLVE</p>
            <h3 id="dissolve-party-title" className="mt-2 text-xl font-black">ยุบปาร์ตี้ “{party.name}” ?</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">สมาชิกทั้งหมดจะออกจากปาร์ตี้และกลับไปสร้างหรือเข้าทีมใหม่ได้ทันที การดำเนินการนี้ย้อนกลับไม่ได้</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmDissolve(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold">ยกเลิก</button>
              <button type="button" disabled={busy} onClick={() => { call({ action: "party_dissolve", partyId: party.id, confirmed: true }); setConfirmDissolve(false); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-black text-white">ยืนยันยุบปาร์ตี้</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
