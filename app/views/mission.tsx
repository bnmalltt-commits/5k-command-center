"use client";
import { FormEvent, useEffect, useState } from "react";
import { Check, Clock, Upload, X } from "lucide-react";
import { bangkokHour, LATE_ROUND_UNTIL_HOUR } from "@/lib/rounds";
import { Picker, shrinkImage } from "../picker";
import { Widget3D } from "../three/widget";
import {
  DiscordGate,
  EmptyState,
  Panel,
  Row,
} from "../ui";
import { uploadResult, type Round, ROUNDS, type Data, DateBadge, Ring } from "./shared";

// Several rounds at once: pick a few screenshots, check which round each is
// for (filled in with the rounds still to send, in order), send them one by
// one through the same upload as a single round.
function BatchUpload({ open, onDone }: { open: Round[]; onDone: (message: string, sent: number) => void }) {
  const [items, setItems] = useState<{ file: File; url: string; round: Round }[]>([]);
  const [sending, setSending] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(() => () => items.forEach((item) => URL.revokeObjectURL(item.url)), [items]);
  if (open.length < 2) return null;
  const pick = (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith("image/")).slice(0, open.length);
    setItems(list.map((file, i) => ({ file, url: URL.createObjectURL(file), round: open[i] })));
  };
  const duplicate = new Set(items.map((i) => i.round)).size !== items.length;
  const send = async () => {
    setSending(true);
    const results: string[] = [];
    let sent = 0;
    for (const item of items) {
      try {
        const form = new FormData();
        form.append("type", "airdrop");
        form.append("image", await shrinkImage(item.file));
        form.append("round", item.round);
        const x: any = await uploadResult(await fetch("/api/upload", { method: "POST", body: form }));
        if (x.error) results.push(`รอบ ${item.round}: ${x.error}`);
        else sent++;
      } catch (error) {
        results.push(`รอบ ${item.round}: ${error instanceof Error && error.name === "ImageError" ? error.message : "ส่งไม่สำเร็จ"}`);
      }
    }
    setSending(false);
    setItems([]);
    setShown(false);
    onDone(results.length ? `ส่งแล้ว ${sent} รอบ · ${results.join(" · ")}` : `ส่งเข้าคิวตรวจแล้ว ${sent} รอบ`, sent);
  };
  if (!shown)
    return (
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm batch-toggle" onClick={() => setShown(true)}>
        <Upload className="h-4 w-4" />
        ส่งหลายรอบพร้อมกัน
      </button>
    );
  return (
    <div className="batch">
      <div className="batch__head">
        <b>ส่งหลายรอบพร้อมกัน</b>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => (setItems([]), setShown(false))}>
          ปิด
        </button>
      </div>
      <label className="ui-btn ui-btn--ghost ui-btn--block">
        <input type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
        เลือกรูป (สูงสุด {open.length} รูป)
      </label>
      {items.length > 0 && (
        <>
          <ul className="batch__list">
            {items.map((item, i) => (
              <li key={item.url}>
                <img src={item.url} alt="" />
                <select
                  className="ui-input"
                  value={item.round}
                  aria-label={`รูปที่ ${i + 1} เป็นของรอบไหน`}
                  onChange={(e) => setItems((all) => all.map((x, j) => (j === i ? { ...x, round: e.target.value as Round } : x)))}
                >
                  {open.map((round) => (
                    <option key={round} value={round}>
                      รอบ {round}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {duplicate && <p className="mission__note">มีสองรูปที่เลือกรอบเดียวกัน แก้ให้ไม่ซ้ำก่อนส่ง</p>}
          <button type="button" className="ui-btn ui-btn--primary ui-btn--block" disabled={sending || duplicate} onClick={send}>
            {sending ? "กำลังส่ง…" : `ส่ง ${items.length} รอบเข้าคิวตรวจ`}
          </button>
        </>
      )}
    </div>
  );
}

// Countdown under the mission title: time to the next round still to send,
// and (with the team rule) how much team score is left before midnight.
// Re-renders itself every 30 seconds.
const ROUND_MINUTES: Record<string, number> = { "17:00": 17 * 60, "20:00": 20 * 60, "23:00": 23 * 60, "01:00": 25 * 60 };
const spell = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} ชม.${m ? ` ${m} นาที` : ""}` : `${m} นาที`;
};
function MissionClock({ data, mine }: { data: Data; mine: Map<any, any> }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date())
    .split(":")
    .map(Number);
  // A clock running past midnight until 05:00, so the 01:00 round is 25:00.
  const now = (h < LATE_ROUND_UNTIL_HOUR ? h + 24 : h) * 60 + m;
  // Still to send: nothing sent yet, or sent and rejected.
  const next = ROUNDS.find((round) => ROUND_MINUTES[round] >= now && (!mine.get(round) || mine.get(round).status === "rejected"));
  const parts: { text: string; urgent: boolean }[] = [];
  if (next) {
    const left = ROUND_MINUTES[next] - now;
    parts.push({ text: left === 0 ? `ถึงรอบ ${next} แล้ว` : `รอบถัดไป ${next} · อีก ${spell(left)}`, urgent: left <= 30 });
  }
  const need = data.team?.mine?.neededToday ?? 0;
  if (data.team?.mine && need > 0 && data.date >= data.team.start) {
    const toMidnight = 24 * 60 - (h * 60 + m);
    parts.push({ text: `ทีมขาดอีก ${need} คะแนน · เหลือ ${spell(toMidnight)} ก่อนเที่ยงคืน`, urgent: toMidnight <= 120 });
  }
  if (!parts.length) return null;
  return (
    <p className="mission__clock">
      {parts.map((part) => (
        <span key={part.text} className={part.urgent ? "is-urgent" : ""}>
          <Clock aria-hidden="true" />
          {part.text}
        </span>
      ))}
    </p>
  );
}

// The day's four rounds as one card: progress, per-round state, and the
// upload for the selected round all in one place. Replaces the old hero
// clock + progress bar + label buttons + separate check-in panel, which
// between them rendered the same round state three times over.
export function MissionCard({
  data,
  round,
  setRound,
  mine,
  busy,
  image,
  setImage,
  pickerReset,
  onSubmit,
  onBatchDone,
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
  onBatchDone: (message: string, sent: number) => void;
}) {
  const approved = ROUNDS.filter(
    (r) => mine.get(r)?.status === "approved",
  ).length;
  const done = approved === ROUNDS.length;
  const selected = mine.get(round);
  const stateOf = (r: Round) => {
    const status = mine.get(r)?.status;
    // Airdrop points by the rule in force on that day (+5 from the team rule start).
    const pts = data.team && String(mine.get(r)?.activity_date) >= data.team.pointsStart ? data.team.points.airdrop : 3;
    return status === "approved"
      ? { label: `ผ่านแล้ว · +${pts}`, tone: "done" }
      : status === "pending"
        ? { label: "รอตรวจ", tone: "pending" }
        : status === "rejected"
          ? { label: "ไม่ผ่าน ส่งใหม่", tone: "rejected" }
          : { label: "ยังไม่ส่ง", tone: "idle" };
  };
  return (
    <section className="mission">
      <Widget3D
        kind="crate"
        args={{
          done,
          drop: (["pending", "rejected", "approved"] as const).find((s) => s === selected?.status) || "idle",
        }}
        className="mission__art mission__art--3d"
        fallback={
          <div className="mission__art" aria-hidden="true">
            <img src="/art/gen/empty/crate.webp" alt="" />
          </div>
        }
      />
      <header className="mission__head">
        <span className="mission__count">
          <Ring value={approved} max={ROUNDS.length} size={80} />
        </span>
        <div className="min-w-0">
          <p className="ui-eyebrow">
            แอร์ดรอป · <span className="whitespace-nowrap">{data.date}</span>
            {bangkokHour() < LATE_ROUND_UNTIL_HOUR ? " · 17–23 น. ยังนับเป็นของเมื่อคืน" : ""}
          </p>
          <h2 className="mission__title">
            {done ? "ครบทุกรอบแล้ว" : `เหลืออีก ${ROUNDS.length - approved} รอบ`}
          </h2>
          <p className="mission__lead">
            ส่งรูปหลักฐานทุกรอบ · ผ่านแล้วได้รอบละ +{data.team?.points.airdrop ?? 5}
          </p>
          <MissionClock data={data} mine={mine} />
        </div>
      </header>
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
      ) : !data.me.discordLinked ? (
        <div className="mission__submit">
          <DiscordGate what="ส่งหลักฐาน" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mission__submit">
          <p className="mission__note">
            {selected?.status === "pending"
              ? `หลักฐานรอบ ${round} กำลังรอตรวจ · เลือกรูปใหม่เพื่อส่งแก้ไข`
              : selected?.status === "rejected"
                ? `หลักฐานรอบ ${round} ไม่ผ่าน${selected.reject_reason ? ` (${selected.reject_reason})` : ""} · เลือกรูปใหม่แล้วส่งอีกครั้ง`
                : `ส่งหลักฐานรอบ ${round}`}
          </p>
          <Picker onChange={setImage} resetToken={`${round}-${pickerReset}`} />
          <button
            disabled={busy || !image}
            className="ui-btn ui-btn--primary ui-btn--block ui-btn--lg"
          >
            <Upload className="h-5 w-5" />
            {selected ? `ส่งหลักฐานรอบ ${round} ใหม่` : `ส่งหลักฐานรอบ ${round}`}
          </button>
          {!image && <p className="form-hint">เลือกรูปหลักฐานก่อน แล้วปุ่มส่งจะกดได้</p>}
          <BatchUpload
            open={ROUNDS.filter((r) => !mine.get(r) || mine.get(r).status === "rejected")}
            onDone={onBatchDone}
          />
        </form>
      )}
    </section>
  );
}
// The member's own airdrop history: one row per day with the four rounds as
// small coloured chips, instead of one row per round.
const ROUND_STATE: Record<string, [string, string]> = {
  approved: ["done", "ผ่านแล้ว"],
  pending: ["pending", "รอตรวจ"],
  rejected: ["rejected", "ไม่ผ่าน"],
};
export function AirdropHistory({ data }: { data: Data }) {
  const [days, setDays] = useState(5);
  const byDay = new Map<string, Map<string, any>>();
  for (const x of data.airdrops) {
    if (!byDay.has(x.activity_date)) byDay.set(x.activity_date, new Map());
    byDay.get(x.activity_date)!.set(x.round_time, x);
  }
  const dates = [...byDay.keys()].sort().reverse();
  return (
    <Panel
      label="AIRDROP LOG"
      title="ประวัติแอร์ดรอปของคุณ"
      subtitle="ติ๊กถูก = ผ่าน · นาฬิกา = รอตรวจ · กากบาท = ไม่ผ่าน · แตะรอบที่ยังไม่ผ่านเพื่อดูรูป"
      flush
    >
      {dates.length ? (
        <>
          {dates.slice(0, days).map((date) => {
            const rounds = byDay.get(date)!;
            const passed = ROUNDS.filter((r) => rounds.get(r)?.status === "approved").length;
            const rejected = ROUNDS.map((r) => rounds.get(r)).filter((x) => x?.status === "rejected");
            return (
              <Row
                key={date}
                inset={false}
                leading={<DateBadge date={date} today={data.date} />}
                title={`${date === data.date ? "วันนี้ · " : ""}ผ่าน ${passed}/${ROUNDS.length} รอบ`}
                subtitle={
                  rejected.length
                    ? `ไม่ผ่าน ${rejected.map((x) => `${x.round_time}${x.reject_reason ? ` (${x.reject_reason})` : ""}`).join(" · ")}`
                    : undefined
                }
                trailing={
                  <span className="round-pills">
                    {ROUNDS.map((r) => {
                      const x = rounds.get(r);
                      const [tone, label] = ROUND_STATE[x?.status] || ["none", "ไม่ได้ส่ง"];
                      const chip = (
                        <span className={`round-pill round-pill--${tone}`} title={`รอบ ${r} · ${label}`} aria-label={`รอบ ${r} ${label}`}>
                          {r.slice(0, 2)}
                          {tone === "done" ? <Check aria-hidden="true" /> : tone === "pending" ? <Clock aria-hidden="true" /> : tone === "rejected" ? <X aria-hidden="true" /> : null}
                        </span>
                      );
                      // Approved photos are deleted to save space; the rest open.
                      return x && x.status !== "approved" && x.image_key ? (
                        <a key={r} href={`/api/image/${x.image_key}`} target="_blank" rel="noreferrer">
                          {chip}
                        </a>
                      ) : (
                        <span key={r}>{chip}</span>
                      );
                    })}
                  </span>
                }
              />
            );
          })}
          {dates.length > days && (
            <div className="p-3 text-center">
              <button type="button" onClick={() => setDays((n) => n + 7)} className="ui-btn ui-btn--ghost ui-btn--sm">
                ดูย้อนหลังเพิ่ม
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState art="crate" title="ยังไม่มีประวัติแอร์ดรอป" hint="ส่งหลักฐานรอบแรกจากการ์ดภารกิจด้านบน" />
      )}
    </Panel>
  );
}
