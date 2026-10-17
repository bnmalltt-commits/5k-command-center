"use client";
import { useEffect, useRef, useState } from "react";
import { Chips, Avatar, Segmented } from "../ui";
import { type Data } from "./shared";

// Preset reasons for a rejection; the admin can also type their own.
const REJECT_REASONS = [
  "รูปไม่ชัด มองไม่เห็นหลักฐาน",
  "ไม่ใช่รอบนี้หรือไม่ใช่วันนี้",
  "คนในรูปไม่ครบตามที่เลือก",
  "รูปเก่าหรือรูปของคนอื่น",
  "เลือกประเภทผิด (ร้าน/ลูป)",
];

// One evidence at a time: the photo large, who gets how many points, then
// approve or reject (with a reason) and straight on to the next — no new tab
// and no confirm per item. Works on a snapshot of the queue taken when opened.
export function ReviewDialog({
  items,
  start,
  busy,
  onAct,
  onClose,
}: {
  items: any[];
  start: number;
  busy: boolean;
  onAct: (item: any, action: "approve" | "reject", reason?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [handled, setHandled] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const keyOf = (item: any) => `${item.type}-${item.id}`;
  const left = items.filter((item) => !handled.includes(keyOf(item))).length;
  // The nearest unhandled item from `from` in direction `dir`, wrapping; -1 if none.
  const step = (from: number, dir: 1 | -1, done: string[]) => {
    for (let n = 1; n <= items.length; n++) {
      const i = (from + dir * n + items.length * n) % items.length;
      if (!done.includes(keyOf(items[i]))) return i;
    }
    return -1;
  };
  const go = (i: number) => {
    if (i < 0) return;
    setIndex(i);
    setRejecting(false);
    setReason("");
  };
  const item = items[index];
  const act = async (action: "approve" | "reject", why?: string) => {
    if (!item || busy || handled.includes(keyOf(item))) return;
    if (!(await onAct(item, action, why))) return;
    const done = [...handled, keyOf(item)];
    setHandled(done);
    go(step(index, 1, done));
  };
  // Fetch the next photo while this one is being looked at.
  useEffect(() => {
    const next = items[step(index, 1, handled)];
    if (next?.image_key && next !== item) new Image().src = `/api/image/${next.image_key}`;
  }, [index, handled]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") go(step(index, 1, handled));
      else if (event.key === "ArrowLeft") go(step(index, -1, handled));
      // A = ผ่าน, R = ไม่ผ่าน (opens the reasons), while not already choosing one.
      else if (!rejecting && (event.key === "a" || event.key === "A")) void act("approve");
      else if (!rejecting && (event.key === "r" || event.key === "R")) setRejecting(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, handled, onClose, rejecting, busy]);
  // Swipe the photo: right far enough approves, left asks for a reason.
  const [dx, setDx] = useState(0);
  const swipe = useRef<{ x: number; moved: boolean } | null>(null);
  const SWIPE = 110;
  const swipeHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (rejecting) return;
      swipe.current = { x: event.clientX, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!swipe.current) return;
      const d = event.clientX - swipe.current.x;
      if (Math.abs(d) > 6) swipe.current.moved = true;
      setDx(d);
    },
    onPointerUp: () => {
      const moved = swipe.current?.moved;
      swipe.current = null;
      const d = dx;
      setDx(0);
      if (!moved) return;
      if (d > SWIPE) void act("approve");
      else if (d < -SWIPE) setRejecting(true);
    },
    onClickCapture: (event: React.MouseEvent) => {
      // A swipe isn't a click on the "open full size" link.
      if (dx !== 0 || swipe.current?.moved) event.preventDefault();
    },
  };
  const finished = !left || !item || handled.includes(keyOf(item));
  return (
    <div className="ui-dialog-backdrop" role="dialog" aria-modal="true" aria-label="ตรวจหลักฐาน">
      <div className="ui-dialog review">
        <div className="review__head">
          <span className="ui-eyebrow">ตรวจหลักฐาน · เหลือ {left} รายการ</span>
          <button type="button" onClick={onClose} className="ui-btn ui-btn--ghost ui-btn--sm">
            ปิด
          </button>
        </div>
        {finished ? (
          <p className="ui-dialog__message">ตรวจครบทุกรายการแล้ว</p>
        ) : (
          <>
            <div
              className={`review__swipe ${dx > SWIPE ? "is-ok" : dx < -SWIPE ? "is-no" : ""}`}
              style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined }}
              {...swipeHandlers}
            >
              <a href={`/api/image/${item.image_key}`} target="_blank" rel="noreferrer" title="เปิดรูปเต็ม" draggable={false}>
                <img key={item.image_key} src={`/api/image/${item.image_key}`} alt="รูปหลักฐาน" className="review__img" draggable={false} />
              </a>
              {dx !== 0 && <span className="review__swipe-label">{dx > 0 ? "ผ่าน" : "ไม่ผ่าน"}</span>}
            </div>
            <p className="review__hint">ปัดรูปไปขวา = ผ่าน · ปัดซ้าย = ไม่ผ่าน · คีย์ A = ผ่าน · R = ไม่ผ่าน · ← → เลื่อนรายการ</p>
            <p className="review__title">
              {item.type === "party"
                ? `${item.detail} · ${item.activity_date}`
                : `แอร์ดรอปรอบ ${item.round_time} · ${item.activity_date}`}
            </p>
            <p className="review__meta">
              ได้คนละ +{item.points} แต้ม · {Number(item.member_count) || 1} คน: {item.members}
            </p>
            <p className="review__meta">
              ส่งโดย {item.submitted_by} · {new Date(item.created_at).toLocaleString("th-TH")}
            </p>
            {rejecting ? (
              <div className="review__reject">
                <Chips
                  value={reason}
                  onChange={setReason}
                  options={REJECT_REASONS.map((text) => ({ id: text, label: text }))}
                />
                <input
                  id="review-reason"
                  value={reason}
                  maxLength={120}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="หรือพิมพ์เหตุผลเอง"
                  className="ui-input"
                />
                <div className="ui-dialog__actions">
                  <button type="button" onClick={() => setRejecting(false)} className="ui-btn ui-btn--ghost">
                    กลับ
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act("reject", reason.trim())}
                    className="ui-btn ui-btn--primary"
                  >
                    ยืนยันไม่ผ่าน
                  </button>
                </div>
              </div>
            ) : (
              <div className="review__actions">
                <button
                  type="button"
                  disabled={left < 2}
                  onClick={() => go(step(index, 1, handled))}
                  className="ui-btn ui-btn--ghost"
                >
                  ข้าม
                </button>
                <button type="button" disabled={busy} onClick={() => setRejecting(true)} className="ui-btn ui-btn--ghost">
                  ไม่ผ่าน
                </button>
                <button type="button" autoFocus disabled={busy} onClick={() => act("approve")} className="ui-btn ui-btn--ok">
                  ผ่าน +{item.points}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Fixes an approved team entry that was sent wrong: shop ↔ loop, and who it
// credits (tap a name to take them out; at least one must stay).
export function EditAwardDialog({
  entry,
  data,
  busy,
  onSave,
  onCancel,
}: {
  entry: any;
  data: Data;
  busy: boolean;
  onSave: (kind: "shop" | "loop", keep: string[]) => void;
  onCancel: () => void;
}) {
  const people: { id: string; name: string }[] = entry.people || [];
  const [kind, setKind] = useState<"shop" | "loop">(entry.kind === "loop" ? "loop" : "shop");
  const [keep, setKeep] = useState<string[]>(people.map((p) => String(p.id)));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  // Points follow the rule for the entry's date (before the new scoring every
  // team entry was +1).
  const newRule = Boolean(data.team && String(entry.activity_date) >= data.team.pointsStart);
  const pointsOf = (k: "shop" | "loop") => (newRule ? data.team!.points[k] : 1);
  return (
    <div className="ui-dialog-backdrop" role="dialog" aria-modal="true" aria-label="แก้ไขแต้มหลักฐานทีม">
      <div className="ui-dialog">
        <p className="ui-dialog__message">แก้ไขหลักฐานทีม · {entry.activity_date}</p>
        <div className="mt-3 space-y-3">
          <Segmented
            label="ประเภทหลักฐาน"
            value={kind}
            onChange={(id) => setKind(id === "loop" ? "loop" : "shop")}
            options={[
              { id: "shop", label: `งัดร้าน +${pointsOf("shop")}` },
              { id: "loop", label: `ลูป +${pointsOf("loop")}` },
            ]}
          />
          <p className="text-sm text-[var(--ui-text-2)]">ใครได้แต้ม · แตะชื่อเพื่อเอาคนที่ไม่ได้ไปออก</p>
          <div className="present-picks">
            {people.map((person) => {
              const id = String(person.id);
              const on = keep.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  disabled={on && keep.length === 1}
                  title={on && keep.length === 1 ? "ต้องเหลืออย่างน้อย 1 คน" : undefined}
                  onClick={() => setKeep(on ? keep.filter((x) => x !== id) : [...keep, id])}
                  className={`present-chip ${on ? "is-on" : ""}`}
                >
                  <Avatar url={data.avatars?.[id]} name={person.name} size={20} />
                  {person.name}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-[var(--ui-text)]">
            หลังแก้: {keep.length} คน คนละ +{pointsOf(kind)} แต้ม
            {people.length > keep.length ? ` · เอาออก ${people.length - keep.length} คน` : ""}
          </p>
        </div>
        <div className="ui-dialog__actions">
          <button type="button" onClick={onCancel} className="ui-btn ui-btn--ghost">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy || !keep.length}
            onClick={() => onSave(kind, keep)}
            className="ui-btn ui-btn--primary"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
