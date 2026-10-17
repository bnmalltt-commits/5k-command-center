"use client";
import { useEffect } from "react";
import { X } from "lucide-react";
import { Avatar } from "../ui";
import { type Data, monthLabel, useProfile, AchievementList } from "./shared";

export function ProfileDialog({ id, data, onClose }: { id: string; data: Data; onClose: () => void }) {
  const { profile: p, error } = useProfile(id);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const done = p ? p.achievements.filter((a: any) => a.done).length : 0;
  return (
    <div className="ui-dialog-backdrop" role="dialog" aria-modal="true" aria-label="โปรไฟล์สมาชิก" onClick={onClose}>
      <div className="ui-dialog profile" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-btn profile__close" onClick={onClose} aria-label="ปิด">
          <X />
        </button>
        {!p ? (
          <p className="ui-dialog__message">{error || "กำลังโหลด…"}</p>
        ) : (
          <>
            <header className="profile__head">
              <Avatar url={data.avatars?.[p.id]} name={p.name} size={64} />
              <div className="min-w-0">
                <h2 className="profile__name">{p.name}</h2>
                <p className="profile__sub">
                  {p.role === "admin" ? "แอดมิน" : "สมาชิก"} · อยู่แก๊งตั้งแต่ {p.joined}
                </p>
              </div>
            </header>
            <div className="profile__stats">
              <div><b>{p.month.score}</b><span>แต้มเดือนนี้{p.month.rank ? ` · อันดับ #${p.month.rank}` : ""}</span></div>
              <div><b>{p.airdrops.fullDays}</b><span>วันที่ครบ 4 รอบ · แอร์ดรอปผ่าน {p.airdrops.total} รอบ</span></div>
              <div><b>{p.team.metDays}/{p.team.days}</b><span>วันที่คะแนนทีมครบ</span></div>
              <div><b>{p.team.shops}</b><span>งัดร้าน · ลูป {p.team.loops}</span></div>
            </div>
            {p.airdrops.days30 > 0 && (
              <section className="profile__section">
                <h3>รอบที่ไม่ได้ส่ง (30 วันล่าสุด)</h3>
                <div className="profile__rounds">
                  {p.airdrops.missed30.map((r: any) => (
                    <div key={r.round} className={p.airdrops.worst?.round === r.round ? "is-worst" : ""}>
                      <span>{r.round}</span>
                      <span className="profile__roundbar"><span style={{ width: `${(r.missed / p.airdrops.days30) * 100}%` }} /></span>
                      <b>{r.missed} วัน</b>
                    </div>
                  ))}
                </div>
                {p.airdrops.worst && <p className="profile__note">พลาดบ่อยสุด: รอบ {p.airdrops.worst.round}</p>}
              </section>
            )}
            {p.months.length > 0 && (
              <section className="profile__section">
                <h3>แต้มรายเดือน</h3>
                <ul className="profile__months">
                  {p.months.map((m: any) => (
                    <li key={m.month}>
                      <span>{monthLabel(m.month)}{m.complete ? "" : " (เดือนนี้)"}</span>
                      <b>{m.score}</b>
                      <span>{m.rank ? `#${m.rank}` : "—"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="profile__section">
              <h3>ป้ายความสำเร็จ {done}/{p.achievements.length}</h3>
              <AchievementList items={p.achievements} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
