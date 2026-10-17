"use client";
import { useState } from "react";
import { Widget3D, useWidgets3D } from "../three/widget";
import { EmptyState, Panel, Row } from "../ui";
import { type Data, DateBadge, monthLabel, Meter, POINT_CATEGORIES, signed, useProfile, AchievementList } from "./shared";

// The member's own points per day, split by where they came from, so a
// deduction is never a mystery. Same source as every score on the site.
export function MyPoints({ data }: { data: Data }) {
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
  // The month as a row of 3D bars, one per day; days still to come are stubs.
  const show3d = useWidgets3D();
  const [year, mon] = month.split("-").map(Number);
  const monthDays = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const todayIndex = month === thisMonth ? Number(data.date.slice(8, 10)) - 1 : -1;
  const perDay = Array.from({ length: monthDays }, (_, i) => {
    if (todayIndex >= 0 && i > todayIndex) return null;
    const parts = byDay.get(`${month}-${String(i + 1).padStart(2, "0")}`);
    return parts ? [...parts.values()].reduce((a, b) => a + b, 0) : 0;
  });
  const best = Math.max(0, ...perDay.map((v) => v || 0));
  const { profile } = useProfile(String(data.me.id));
  return (
    <>
    <Panel label="MY POINTS" title={monthLabel(month)} subtitle={month === thisMonth ? "เดือนนี้ · นับถึงวันนี้" : "ทั้งเดือน"} flush>
      <div className="space-y-4 p-5">
        <div className="points-total">
          <b className={total < 0 ? "text-[var(--ui-red-light)]" : ""}>{signed(total)}</b>
          <span>แต้มรวม{month === thisMonth ? "เดือนนี้" : ""}</span>
        </div>
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
            <div key={id} className={`points-split__cell tilt ${(byCategory.get(id) || 0) < 0 ? "is-minus" : ""}`}>
              <span>{label}</span>
              <b>{signed(byCategory.get(id) || 0)}</b>
            </div>
          ))}
        </div>
        {show3d && inMonth.length > 0 && (
          <div className="points-chart">
            <Widget3D
              key={month}
              kind="bars"
              args={{ values: perDay, today: todayIndex }}
              className="points-chart__gl"
            />
            <div className="points-chart__axis">
              <span>วันที่ 1</span>
              <span>วันที่ดีที่สุด {signed(best)}</span>
              <span>วันที่ {monthDays}</span>
            </div>
          </div>
        )}
        {month === thisMonth &&
          (data.myPenalties || []).map((penalty: any) => (
            <div key={penalty.id} className="penalty-note">
              <p>
                <b>โดนหัก {penalty.points} แต้ม</b> · {penalty.reason}
              </p>
              <p>
                งัดร้านผ่านอีก {penalty.shops - penalty.done} ร้าน ได้ {penalty.points} แต้มคืนอัตโนมัติ ({penalty.done}/{penalty.shops} ร้าน)
              </p>
              <Meter value={penalty.done} max={penalty.shops} label="งัดร้านคืนแต้ม" />
            </div>
          ))}
        {month === thisMonth && mine && (
          <p className="text-sm text-[var(--ui-text-2)]">
            คะแนนทีมวันนี้ {mine.today}/{data.team?.perDay ?? 9}
            {mine.debt > 0 ? ` · เดือนนี้ขาดรวม ${mine.debt} คะแนน (หักไปแล้ว ทำเกินชดแล้วได้คืน)` : ""}
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
              leading={<DateBadge date={day} today={data.date} />}
              title={POINT_CATEGORIES.filter(([id]) => parts.has(id))
                .map(([id, label]) => `${label} ${signed(parts.get(id)!)}`)
                .join(" · ")}
              subtitle={day === data.date ? "วันนี้" : day}
              trailing={
                <b className={`rank-score ${dayTotal < 0 ? "text-[var(--ui-red-light)]" : "text-[var(--ui-green)]"}`}>{signed(dayTotal)}</b>
              }
            />
          );
        })
      ) : (
        <EmptyState art="crate" title="ยังไม่มีแต้มในเดือนนี้" hint="ส่งหลักฐานแอร์ดรอปหรือหลักฐานทีม แต้มจะขึ้นที่นี่หลังตรวจผ่าน" />
      )}
    </Panel>
    {profile && (
      <Panel
        label="ACHIEVEMENTS"
        title="ป้ายความสำเร็จ"
        subtitle={`ได้แล้ว ${profile.achievements.filter((a: any) => a.done).length} จาก ${profile.achievements.length} ป้าย`}
      >
        <Widget3D
          kind="medals"
          args={{ medals: profile.achievements.map((a: any) => ({ icon: a.icon, done: a.done })) }}
          className="medal-rack"
        />
        <AchievementList items={profile.achievements} />
      </Panel>
    )}
    </>
  );
}
