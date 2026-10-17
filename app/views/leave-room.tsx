"use client";
import { FormEvent, useState } from "react";
import {
  Avatar,
  DiscordGate,
  EmptyState,
  Panel,
  SearchInput,
} from "../ui";
import { type Data, DateBadge } from "./shared";
import { PAGE_SIZE } from "./submission-log";

export function LeaveRoom({
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
  // One block per day, newest first; "โหลดเพิ่ม" pages by days.
  const byDay = new Map<string, any[]>();
  for (const item of history) {
    const day = String(item.leave_date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(item);
  }
  const allDays = [...byDay.keys()].sort().reverse();
  const visible = allDays.slice(0, shown);
  const isAbsent = (item: any) => String(item.reason).startsWith("ขาด");
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
        <form onSubmit={submit} className="form-grid--leave">
          {isAdmin && (
            <label className="ui-field">
              <span>ลาให้ใคร</span>
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
            </label>
          )}
          <label className="ui-field">
            <span>วันที่ลา</span>
            <input
              type="date"
              value={leaveDate}
              min={isAdmin ? undefined : data.date}
              onChange={(e) => setLeaveDate(e.target.value)}
              required
              className="ui-input"
            />
          </label>
          <label className="ui-field ui-field--grow">
            <span>เหตุผล</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ติดงาน ไปต่างจังหวัด"
              required
              className="ui-input"
            />
          </label>
          <button disabled={busy} className="ui-btn ui-btn--primary">
            แจ้งลา
          </button>
        </form>
        )}
      </Panel>
      <Panel
        label="LEAVE HISTORY"
        title="ประวัติการลา"
        subtitle={`${allDays.length} วัน · ${history.length} รายการ`}
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
            {visible.map((day) => {
              const items = byDay.get(day)!;
              const absent = items.filter(isAbsent).length;
              const onLeave = items.length - absent;
              return (
                <section key={day} className="leave-day">
                  <DateBadge date={day} today={data.date} />
                  <div className="leave-day__body">
                    <p className="leave-day__head">
                      {day === data.date ? "วันนี้ · " : ""}
                      {[onLeave && `ลา ${onLeave} คน`, absent && `ขาด ${absent} คน`].filter(Boolean).join(" · ")}
                    </p>
                    <ul className="leave-day__list">
                      {items.map((item: any) => (
                        <li key={item.id}>
                          <span className="name-with-avatar">
                            <Avatar url={data.avatars?.[String(item.member_id)]} name={item.display_name} size={22} />
                            <b>{item.display_name}</b>
                          </span>
                          <span className="leave-day__reason">
                            {item.reason} · บันทึกโดย {item.created_by_name}
                          </span>
                          <span className={`status-pill ${isAbsent(item) ? "status-pill--rejected" : "status-pill--quiet"}`}>
                            {isAbsent(item) ? "ขาด" : "ลา"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })}
            {allDays.length > visible.length && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE_SIZE)}
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                >
                  โหลดเพิ่ม {Math.min(PAGE_SIZE, allDays.length - visible.length)} วัน
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            art={data.leaveRequests.length ? undefined : "calendar"}
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
