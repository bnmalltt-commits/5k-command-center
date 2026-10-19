"use client";
import { useState } from "react";
import {
  CalendarCheck,
  Check,
  Crosshair,
  Crown,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Podium3D } from "../three/podium";
import { Widget3D } from "../three/widget";
import {
  Chips,
  Avatar,
  EmptyState,
  Panel,
  Segmented,
} from "../ui";
import { type Data, ViewLoading, monthLabel, Meter, POINT_CATEGORIES, signed, SUMMARY_PERIODS, dayLabel, competitionRanks, memberNames } from "./shared";

// One person as a small chip: picture and name, plus an optional note.
function PersonChip({ data, id, names, note }: { data: Data; id: string; names: Map<string, string>; note?: string }) {
  return (
    <li className="name-with-avatar">
      <Avatar url={data.avatars?.[id]} name={names.get(id) || "?"} size={22} />
      <span className="truncate">{names.get(id) || "สมาชิก"}</span>
      {note && <span className="sum-people__note">{note}</span>}
    </li>
  );
}

// "ภาพรวมแก๊ง": four status tiles that answer "how is the gang doing",
// then airdrops by round (with who hasn't sent), team points (with who is
// short), and the top earners. Colour carries meaning: green is fine, amber
// is in progress, red needs someone to act.
function SummaryOverview({ data, summary }: { data: Data; summary: any }) {
  const [period, setPeriod] = useState("day");
  const p = summary.periods.find((x: any) => x.id === period) || summary.periods[0];
  const names = memberNames(data);
  const isDay = p.id === "day";
  const label = SUMMARY_PERIODS.find((x) => x.id === p.id)!.label;
  const net = Object.values(p.points as Record<string, number>).reduce((a, b) => a + b, 0);
  const count = (status: string) => p.evidence.airdrop[status] + p.evidence.shop[status] + p.evidence.loop[status];
  const started = (round: string) => round <= summary.clock;
  const sentAll = p.rounds.filter((r: any) => !isDay || started(r.round)).reduce((s: number, r: any) => s + r.sent, 0);
  const dueAll = p.rounds.reduce((s: number, r: any) => s + r.due, 0);
  const sentPct = dueAll ? Math.round(Math.min(1, sentAll / dueAll) * 100) : null;
  const ranks = competitionRanks(p.top);
  const t = summary.teamNow;
  const perDay = data.team?.perDay ?? 9;
  const rate = (value: number) => (value >= 80 ? "good" : value >= 50 ? "warn" : "bad");
  const sources = POINT_CATEGORIES.filter(([id]) => p.points[id] && id !== "penalty" && id !== "refund")
    .map(([id, name]) => `${name} ${signed(p.points[id])}`)
    .join(" · ");
  // Today: the latest round that has started is the one to watch.
  const startedRounds = isDay ? p.rounds.filter((r: any) => started(r.round)) : [];
  const latest = startedRounds[startedRounds.length - 1];
  const pending = count("pending");

  const tiles: { label: string; value: string; sub: string; tone?: string }[] = [
    isDay
      ? latest
        ? {
            label: `แอร์ดรอปรอบ ${latest.round}`,
            value: `${latest.sent}/${latest.possible}`,
            sub: latest.missing?.length ? `ยังไม่ส่ง ${latest.missing.length} คน` : "ส่งครบทุกคน",
            tone: rate(latest.possible ? (latest.sent / latest.possible) * 100 : 100),
          }
        : { label: "แอร์ดรอป", value: "—", sub: "ยังไม่ถึงรอบแรกของวัน" }
      : {
          label: `ส่งแอร์ดรอป${label}`,
          value: sentPct === null ? "—" : `${sentPct}%`,
          sub: dueAll ? `${sentAll} จาก ${dueAll} ครั้ง` : "ยังไม่มีรอบ",
          tone: sentPct === null ? undefined : rate(sentPct),
        },
    t.on && isDay
      ? {
          label: `คะแนนทีมครบ ${perDay}`,
          value: `${t.done}/${t.subject}`,
          sub: t.subject - t.done ? `ยังขาด ${t.subject - t.done} คน · ปิดเที่ยงคืน` : "ครบทุกคน",
          tone: t.done === t.subject ? "good" : "warn",
        }
      : {
          label: `โดนหักคะแนนทีม${label}`,
          value: `${p.team.docked} คน`,
          sub: p.team.docked ? `หักรวม ${-p.points.penalty} แต้ม` : "ไม่มีใครโดนหัก",
          tone: p.team.docked ? "bad" : "good",
        },
    { label: `แต้มแก๊ง${label}`, value: signed(net), sub: sources || "ยังไม่มีแต้ม", tone: net < 0 ? "bad" : undefined },
    {
      label: "หลักฐานรอตรวจ",
      value: `${pending}`,
      sub: `ผ่านแล้ว ${count("approved")} · ไม่ผ่าน ${count("rejected")}`,
      tone: pending ? "warn" : "good",
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="sum-toolbar">
        <Chips value={p.id} onChange={setPeriod} options={SUMMARY_PERIODS} />
        <span className="sum-range">
          {isDay ? `${dayLabel(p.to)} · ถึง ${summary.clock} น.` : `${dayLabel(p.from)} – ${dayLabel(p.to)}`}
        </span>
      </div>

      <ul className="sum-tiles">
        {tiles.map((tile) => (
          <li key={tile.label} className={`sum-tile ${tile.tone ? `is-${tile.tone}` : ""}`}>
            <span className="sum-tile__label">{tile.label}</span>
            <b className="sum-tile__value">{tile.value}</b>
            <span className="sum-tile__sub">{tile.sub}</span>
          </li>
        ))}
      </ul>

      <div className="sum-cols">
        <div className="space-y-4">
          <section className="sum-card">
            <h3 className="sum-title">แอร์ดรอป{label}</h3>
            <p className="sum-note">
              {isDay ? "เรียงตามเวลา · กด “ยังไม่ส่ง” เพื่อดูชื่อ" : "ส่งแล้วเทียบกับรอบที่ถึงแล้ว (ไม่นับคนที่ลา)"}
            </p>
            <ul className="sum-bars">
              {p.rounds.map((r: any) => {
                const of = isDay ? r.possible : r.due;
                const waiting = isDay && !started(r.round);
                return (
                  <li key={r.round} className={waiting ? "is-waiting" : ""}>
                    <span className="sum-bars__round">{r.round}</span>
                    <Meter value={r.sent} max={of} label={`รอบ ${r.round} ส่งแล้ว ${r.sent} จาก ${of}`} />
                    <span className="sum-bars__count">{waiting ? "ยังไม่ถึง" : `${r.sent}/${of}`}</span>
                    {r.missing?.length > 0 && (
                      <details className="sum-missing" open={r === latest}>
                        <summary>ยังไม่ส่ง {r.missing.length} คน</summary>
                        <ul className="sum-people">
                          {r.missing.map((id: string) => (
                            <PersonChip key={id} data={data} id={id} names={names} />
                          ))}
                        </ul>
                      </details>
                    )}
                    {r.missing?.length === 0 && <span className="sum-missing sum-missing--done">ส่งครบทุกคน</span>}
                  </li>
                );
              })}
            </ul>
          </section>

          {t.on && (
            <section className="sum-card">
              <h3 className="sum-title">คะแนนทีม</h3>
              <p className="sum-note">
                วันละ {perDay} คะแนน · งัดร้าน +{data.team?.points.shop ?? 3} · ลูป +{data.team?.points.loop ?? 1} · ทำเกินวันไหนก็ชดวันที่ขาดในเดือนเดียวกันได้
              </p>
              {isDay && (
                <>
                  <div className="sum-line">
                    <span>ครบแล้ววันนี้</span>
                    <b>
                      {t.done}/{t.subject} คน
                    </b>
                  </div>
                  <Meter value={t.done} max={t.subject} label="คะแนนทีมครบวันนี้" />
                  {t.short?.length > 0 && (
                    <details className="sum-missing">
                      <summary>ยังไม่ครบ {t.short.length} คน (ขาดอีกกี่คะแนน)</summary>
                      <ul className="sum-people">
                        {t.short.map((row: any) => (
                          <PersonChip key={row.id} data={data} id={row.id} names={names} note={`ขาด ${row.n}`} />
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
              <div className="sum-line">
                <span>เดือนนี้ยังติดลบ</span>
                <b className={t.owing ? "is-bad" : "is-good"}>{t.owing ? `${t.owing} คน · รวม ${t.owingTotal} คะแนน` : "ไม่มี"}</b>
              </div>
              {isDay && (
                <div className="sum-line">
                  <span>เมื่อวานโดนหัก</span>
                  <b className={t.dockedYesterday ? "is-bad" : "is-good"}>{t.dockedYesterday ? `${t.dockedYesterday} คน` : "ไม่มี"}</b>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="sum-card">
            <h3 className="sum-title">ได้แต้มเยอะสุด{label}</h3>
            {p.top.length ? (
              <ol className="sum-top">
                {p.top.map((m: any, i: number) => (
                  <li key={m.id}>
                    <span className={`rank-num rank-num--${ranks[i]}`}>{ranks[i]}</span>
                    <span className="name-with-avatar min-w-0">
                      <Avatar url={data.avatars?.[m.id]} name={names.get(m.id) || "?"} size={26} />
                      <span className="truncate">
                        {names.get(m.id) || "สมาชิก"}
                        {String(m.id) === String(data.me.id) ? " · คุณ" : ""}
                      </span>
                    </span>
                    <span className="rank-score">{m.score}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="sum-empty">ยังไม่มีใครได้แต้ม{label}</p>
            )}
          </section>
          {(p.leave > 0 || p.absent > 0) && (
            <p className="sum-note sum-note--foot">
              {p.leave > 0 && `ลา ${p.leave} ครั้ง`}
              {p.leave > 0 && p.absent > 0 && " · "}
              {p.absent > 0 && `ขาด (ไม่ส่งอะไรเลยทั้งวัน) ${p.absent} ครั้ง`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryAward({ data, icon: Icon, label, winner, unit }: { data: Data; icon: any; label: string; winner: any; unit: string }) {
  const names = memberNames(data);
  return (
    <div className="sum-award tilt">
      {winner && <Widget3D kind="trophy" args={{ tone: "gold" }} className="sum-award__3d" />}
      <span className="sum-award__label">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      {winner ? (
        <>
          <span className="sum-award__who">
            {winner.ids.slice(0, 3).map((id: string) => (
              <span key={id} className="name-with-avatar">
                <Avatar url={data.avatars?.[id]} name={names.get(id) || "?"} size={22} />
                {names.get(id) || "สมาชิก"}
              </span>
            ))}
            {winner.ids.length > 3 && <span className="text-[var(--ui-text-3)]">+{winner.ids.length - 3} คน</span>}
          </span>
          <b className="sum-award__value">
            {winner.n} {unit}
          </b>
        </>
      ) : (
        <span className="sum-award__none">ยังไม่มี</span>
      )}
    </div>
  );
}

function MonthlyResults({ data, summary }: { data: Data; summary: any }) {
  const months: any[] = summary.months;
  // Opens on the last finished month: that's the one with final results.
  const [month, setMonth] = useState(() => (months.find((m) => m.complete) || months[0])?.month);
  const entry = months.find((m) => m.month === month) || months[0];
  if (!entry) return <EmptyState art="trophy" title="ยังไม่มีผลรายเดือน" />;
  const names = memberNames(data);
  const ranks = competitionRanks(entry.ranking);
  const a = entry.awards;
  // Trophy cabinet: the winner of each finished month, newest on the right.
  const cabinet = months
    .filter((m) => m.complete && m.ranking.length)
    .slice(0, 6)
    .reverse()
    .map((m) => ({ month: monthLabel(m.month), name: names.get(m.ranking[0].id) || "สมาชิก", score: Number(m.ranking[0].score) }));
  return (
    <div className="space-y-4 p-4">
      {cabinet.length > 0 && <Widget3D kind="cabinet" args={{ cabinet }} className="trophy-cabinet" />}
      {months.length > 1 && (
        <select value={entry.month} onChange={(event) => setMonth(event.target.value)} className="ui-input" aria-label="เลือกเดือน">
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {monthLabel(m.month)}
              {m.complete ? "" : " (ยังไม่จบเดือน)"}
            </option>
          ))}
        </select>
      )}
      <article className="sum-result">
        <header className="sum-result__head">
          <span className="ui-eyebrow">ผลประจำเดือน</span>
          <h3>{monthLabel(entry.month)}</h3>
          {!entry.complete && <span className="sum-live">ยังไม่จบเดือน · อันดับยังเปลี่ยนได้</span>}
        </header>
        {entry.ranking.length ? (
          <>
            <div className="podium">
              <Podium3D watch={`${entry.month}|${entry.ranking.slice(0, 3).map((m: any) => `${m.id}:${m.score}`).join(",")}`} />
              {[1, 0, 2].map((index) => {
                const member = entry.ranking[index];
                if (!member) return <div key={index} className="podium__slot podium__slot--empty" />;
                return (
                  <div key={member.id} className={`podium__slot podium__slot--${index + 1} tilt`}>
                    {index === 0 && <Crown className="sum-crown" aria-hidden="true" />}
                    <span className="podium__medal">{ranks[index]}</span>
                    <Avatar url={data.avatars?.[member.id]} name={names.get(member.id) || "?"} size={index === 0 ? 64 : 52} />
                    <span className="podium__name">{names.get(member.id) || "สมาชิก"}</span>
                    <b className="podium__score">{member.score}</b>
                    <span className="podium__base" data-rank={ranks[index]} />
                  </div>
                );
              })}
            </div>
            {entry.ranking.length > 3 && (
              <ol className="sum-top sum-top--flat">
                {entry.ranking.slice(3).map((m: any, i: number) => (
                  <li key={m.id}>
                    <span className="rank-num">{ranks[i + 3]}</span>
                    <span className="name-with-avatar min-w-0">
                      <Avatar url={data.avatars?.[m.id]} name={names.get(m.id) || "?"} size={22} />
                      <span className="truncate">{names.get(m.id) || "สมาชิก"}</span>
                    </span>
                    <span className="rank-score">{m.score}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <EmptyState art="trophy" title="ยังไม่มีใครได้แต้มเดือนนี้" />
        )}
        <div className="sum-awards">
          <SummaryAward data={data} icon={Crosshair} label="ส่งแอร์ดรอปผ่านเยอะสุด" winner={a.airdrop} unit="รอบ" />
          <SummaryAward data={data} icon={Users} label="สายทีม (งัดร้าน + ลูป)" winner={a.team} unit="แต้ม" />
          <SummaryAward data={data} icon={CalendarCheck} label="ส่งครบ 4 รอบมากสุด" winner={a.fullDays} unit="วัน" />
          {a.clean !== null && (
            <div className="sum-award tilt">
              <span className="sum-award__label">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                ไม่โดนหักทีมเลยทั้งเดือน
              </span>
              <b className="sum-award__value">
                {a.clean}/{a.members} คน
              </b>
            </div>
          )}
        </div>
        <p className="sum-result__totals">
          ทั้งแก๊งได้ {signed(entry.totals.points)} แต้ม · แอร์ดรอปผ่าน {entry.totals.airdrops} รอบ · หลักฐานทีมผ่าน {entry.totals.parties} รายการ
        </p>
      </article>
    </div>
  );
}

// Admin to-dos as one table: a row per member who needs chasing, a column
// per thing to chase, so each person shows up once with everything they owe.
const ADMIN_MODES = [
  { id: "now", label: "ต้องตามตอนนี้" },
  { id: "day", label: "วันนี้" },
  { id: "week", label: "สัปดาห์นี้" },
  { id: "month", label: "เดือนนี้" },
];
type StatKey = "name" | "points" | "airdrop" | "missed" | "team" | "met" | "penalty" | "leave" | "absent";

// Every member's numbers for one period, one row each, sortable by column.
function PeopleStats({ data, rows, range }: { data: Data; rows: any[]; range: string }) {
  const [sort, setSort] = useState<{ key: StatKey; dir: 1 | -1 }>({ key: "points", dir: -1 });
  const names = memberNames(data);
  const perDay = data.team?.perDay ?? 9;
  const missed = (r: any) => Math.max(0, r.due - r.sent);
  const value = (r: any, key: StatKey): number | string =>
    key === "name"
      ? names.get(r.id) || ""
      : key === "airdrop"
        ? r.due ? r.sent / r.due : 2
        : key === "missed"
          ? missed(r)
          : key === "met"
            ? r.quotaDays ? r.met / r.quotaDays : 2
            : r[key];
  const sorted = [...rows].sort((a, b) => {
    const va = value(a, sort.key), vb = value(b, sort.key);
    const c = typeof va === "string" ? va.localeCompare(String(vb)) : va - Number(vb);
    return c * sort.dir || (names.get(a.id) || "").localeCompare(names.get(b.id) || "");
  });
  const total = rows.reduce(
    (t, r) => ({
      points: t.points + r.points,
      sent: t.sent + r.sent,
      due: t.due + r.due,
      missed: t.missed + missed(r),
      team: t.team + r.team,
      met: t.met + r.met,
      quotaDays: t.quotaDays + r.quotaDays,
      penalty: t.penalty + r.penalty,
      leave: t.leave + r.leave,
      absent: t.absent + r.absent,
    }),
    { points: 0, sent: 0, due: 0, missed: 0, team: 0, met: 0, quotaDays: 0, penalty: 0, leave: 0, absent: 0 },
  );
  const head = (key: StatKey, label: string, sub?: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        className="sort-btn"
        onClick={() => setSort((now) => ({ key, dir: now.key === key ? (now.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}
      >
        {label}
        {sort.key === key ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
      </button>
      {sub && <small>{sub}</small>}
    </th>
  );
  const ok = (
    <>
      <Check className="todo-ok" aria-hidden="true" />
      <span className="sr-only">ไม่มี</span>
    </>
  );
  return (
    <div className="space-y-3">
      <p className="hint">{range} · แตะหัวตารางเพื่อเรียงลำดับ</p>
      <div className="todo-table-wrap">
        <table className="todo-table stats-table">
          <thead>
            <tr>
              {head("name", "ชื่อ")}
              {head("points", "แต้มรวม")}
              {head("airdrop", "แอร์ดรอป", "ส่ง / ต้องส่ง")}
              {head("missed", "ไม่ส่ง", "รอบ")}
              {head("team", "แต้มทีม", "ร้าน + ลูป")}
              {head("met", `ทีมครบ ${perDay}`, "วัน")}
              {head("penalty", "โดนหัก", "แต้ม")}
              {head("leave", "ลา", "วัน")}
              {head("absent", "ขาด", "วัน")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  <span className="name-with-avatar">
                    <Avatar url={data.avatars?.[r.id]} name={names.get(r.id) || "?"} size={26} />
                    <span className="truncate">{names.get(r.id) || "สมาชิก"}</span>
                  </span>
                </th>
                <td>
                  <span className={r.points > 0 ? "stat-pos" : r.points < 0 ? "stat-neg" : "stat-zero"}>{signed(r.points)}</span>
                </td>
                <td>{r.due ? `${r.sent}/${r.due}` : <span className="stat-zero">—</span>}</td>
                <td>{!r.due ? <span className="stat-zero">—</span> : missed(r) ? <span className="todo-bad">{missed(r)}</span> : ok}</td>
                <td>{r.team ? r.team : <span className="stat-zero">—</span>}</td>
                <td>
                  {r.quotaDays ? (
                    <span className={r.met < r.quotaDays ? "stat-warn" : "stat-pos"}>
                      {r.met}/{r.quotaDays}
                    </span>
                  ) : (
                    <span className="stat-zero">—</span>
                  )}
                </td>
                <td>
                  {r.penalty ? <span className="todo-bad">{r.penalty}</span> : <span className="stat-zero">—</span>}
                  {r.refund ? <small className="stat-refund"> +{r.refund} คืน</small> : null}
                </td>
                <td>{r.leave ? r.leave : <span className="stat-zero">—</span>}</td>
                <td>{r.absent ? <span className="todo-bad">{r.absent}</span> : ok}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">รวมทั้งแก๊ง</th>
              <td>{signed(total.points)}</td>
              <td>{total.due ? `${total.sent}/${total.due}` : "—"}</td>
              <td>{total.missed}</td>
              <td>{total.team}</td>
              <td>{total.quotaDays ? `${total.met}/${total.quotaDays}` : "—"}</td>
              <td>{total.penalty || "—"}</td>
              <td>{total.leave}</td>
              <td>{total.absent}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="todo-legend">
        แอร์ดรอป = รอบที่ส่ง (รอตรวจหรือผ่าน) เทียบกับรอบที่ถึงเวลาแล้ว ไม่นับวันลา · ทีมครบ {perDay} = วันที่ได้แต้มทีมถึง {perDay}
        (นับเฉพาะวันที่จบแล้ว) · โดนหัก = แต้มที่โดนหักเพราะทีมไม่ครบ · ขาด = วันที่ไม่ส่งอะไรเลย
      </p>
    </div>
  );
}

function AdminTodo({ data, summary, onGo }: { data: Data; summary: any; onGo: (view: string) => void }) {
  const [mode, setMode] = useState("now");
  const [filter, setFilter] = useState("all");
  const admin = summary.admin;
  const pending = admin.pending.airdrop + admin.pending.party;
  const waited = admin.pending.oldest ? Math.max(0, Date.now() - Date.parse(admin.pending.oldest)) : 0;
  const waitedLabel = waited >= 3600_000 ? `${Math.floor(waited / 3600_000)} ชม.` : `${Math.max(1, Math.floor(waited / 60_000))} นาที`;
  const roundMissing = new Set<string>([...admin.round.missing, ...admin.round.rejected]);
  const rejected = new Set<string>(admin.round.rejected);
  const short = new Map<string, number>(admin.neededToday.map((r: any) => [r.id, r.n]));
  const owing = new Map<string, number>(admin.owing.map((r: any) => [r.id, r.n]));
  const noTeam = new Set<string>(admin.noTeam);
  const absent = new Set<string>(admin.absentYesterday);
  const noDiscord = new Set<string>(admin.noDiscord);
  const onLeave = new Map<string, string>(admin.leaveToday.map((r: any) => [r.id, r.reason]));
  const roundDay = admin.round.date === summary.date ? "วันนี้" : "เมื่อวาน";
  // Each column: its header, its filter chip, and what to show when the
  // member has that problem (null = fine).
  const columns: { id: string; head: string; sub?: string; chip: string; problem: (id: string) => string | null }[] = [
    {
      id: "round",
      head: `รอบ ${admin.round.round}`,
      sub: roundDay,
      chip: `ยังไม่ส่งรอบ ${admin.round.round}`,
      problem: (id) => (roundMissing.has(id) ? (rejected.has(id) ? "ไม่ผ่าน" : "ไม่ส่ง") : null),
    },
    ...(summary.teamNow.on
      ? [
          {
            id: "short",
            head: "ทีมวันนี้",
            sub: `ขั้นต่ำ ${data.team?.perDay ?? 9}`,
            chip: "ทีมวันนี้ไม่ครบ",
            problem: (id: string) => (short.has(id) ? `ขาด ${short.get(id)}` : null),
          },
          {
            id: "owing",
            head: "ขาดทีม",
            sub: "จากวันก่อน",
            chip: "ขาดคะแนนทีม",
            problem: (id: string) => (owing.has(id) ? `${owing.get(id)}` : null),
          },
        ]
      : []),
    { id: "noTeam", head: "ทีม", chip: "ไม่มีทีม", problem: (id) => (noTeam.has(id) ? "ไม่มี" : null) },
    { id: "absent", head: "เมื่อวาน", chip: "ขาดเมื่อวาน", problem: (id) => (absent.has(id) ? "ขาด" : null) },
    { id: "noDiscord", head: "Discord", chip: "ไม่ผูก Discord", problem: (id) => (noDiscord.has(id) ? "ไม่ผูก" : null) },
  ];
  const rows = data.members
    .map((member: any) => {
      const id = String(member.id);
      const problems = columns.map((column) => column.problem(id));
      return { id, name: member.display_name as string, problems, n: problems.filter(Boolean).length };
    })
    .filter((row) => row.n > 0)
    // Most to chase first.
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const counts = columns.map((_, i) => rows.filter((row) => row.problems[i]).length);
  const focus = columns.findIndex((column) => column.id === filter);
  const shown = focus < 0 ? rows : rows.filter((row) => row.problems[focus]);
  const fine = data.members.length - rows.length;
  const modeSwitch = <Chips value={mode} onChange={setMode} options={ADMIN_MODES} />;
  if (mode !== "now" && admin.people) {
    const start = admin.starts?.[mode] || summary.date;
    const range =
      mode === "day"
        ? `วันนี้ ${dayLabel(summary.date)} · ถึง ${summary.clock} น.`
        : `${mode === "week" ? "สัปดาห์นี้" : "เดือนนี้"} ${dayLabel(start)} – ${dayLabel(summary.date)}`;
    return (
      <div className="space-y-4 p-4">
        {modeSwitch}
        <PeopleStats key={mode} data={data} rows={admin.people[mode] || []} range={range} />
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {modeSwitch}
      {pending > 0 && (
        <div className="todo-alert">
          <span>
            <b>{pending}</b> หลักฐานรอตรวจ · รอนานสุด {waitedLabel}
          </span>
          <button type="button" onClick={() => onGo("admin")} className="ui-btn ui-btn--primary ui-btn--sm">
            ไปตรวจ
          </button>
        </div>
      )}
      <div className="todo-head">
        <h3 className="sum-title">ต้องตาม {rows.length} คน</h3>
        <Chips
          value={focus < 0 ? "all" : filter}
          onChange={setFilter}
          options={[
            { id: "all", label: `ทั้งหมด ${rows.length}` },
            ...columns.map((column, i) => ({ id: column.id, label: `${column.chip} ${counts[i]}` })).filter((_, i) => counts[i] > 0),
          ]}
        />
      </div>
      {shown.length ? (
        <div className="todo-table-wrap">
          <table className="todo-table">
            <thead>
              <tr>
                <th scope="col">ชื่อ</th>
                {columns.map((column, i) => (
                  <th key={column.id} scope="col" className={i === focus ? "is-focus" : ""}>
                    {column.head}
                    {column.sub && <small>{column.sub}</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="name-with-avatar">
                      <Avatar url={data.avatars?.[row.id]} name={row.name} size={26} />
                      <span className="truncate">{row.name}</span>
                      {onLeave.has(row.id) && (
                        <span className="todo-tag" title={onLeave.get(row.id)}>
                          ลาวันนี้
                        </span>
                      )}
                    </span>
                  </th>
                  {row.problems.map((problem, i) => (
                    <td key={columns[i].id} className={i === focus ? "is-focus" : ""}>
                      {problem ? (
                        <span className="todo-bad">{problem}</span>
                      ) : (
                        <>
                          <Check className="todo-ok" aria-hidden="true" />
                          <span className="sr-only">เรียบร้อย</span>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="todo-clear">
          <Check className="h-4 w-4" aria-hidden="true" />
          ไม่มีใครต้องตาม ทุกคนเรียบร้อย
        </p>
      )}
      <p className="todo-done">
        <Check className="h-4 w-4" aria-hidden="true" />
        เรียบร้อยทุกเรื่อง {fine} คน
        {pending === 0 ? " · ไม่มีหลักฐานรอตรวจ" : ""}
        {onLeave.size ? ` · ลาวันนี้ ${onLeave.size} คน` : ""}
      </p>
      <p className="todo-legend">
        ทีมวันนี้ = นับรวมทั้งเดือน ทำเกินวันไหนก็ชดวันที่ขาดได้ ทำชดแล้วได้คืน · ขาดทีม = คะแนนทีมที่ขาดรวมทั้งเดือน · รอบที่ยังไม่ส่ง ไม่นับคนที่ลา ·
        ขาดเมื่อวานบันทึกผิด ลบได้ที่ จัดการแก๊ง → การลา
      </p>
    </div>
  );
}

export function GangSummary({ data, onGo }: { data: Data; onGo: (view: string) => void }) {
  const summary = data.summary;
  const [tab, setTab] = useState("overview");
  if (!summary) return <ViewLoading />;
  const showAdmin = data.me.role === "admin" && Boolean(summary.admin);
  const shownTab = tab === "admin" && !showAdmin ? "overview" : tab;
  return (
    <Panel label="SUMMARY" flush>
      <div className="px-4 pt-4">
        <Segmented
          label="สรุป"
          value={shownTab}
          onChange={setTab}
          options={[
            { id: "overview", label: "ภาพรวมแก๊ง" },
            { id: "monthly", label: "ผลรายเดือน" },
            ...(showAdmin
              ? [{ id: "admin", label: "งานแอดมิน", count: summary.admin.pending.airdrop + summary.admin.pending.party || undefined }]
              : []),
          ]}
        />
      </div>
      {shownTab === "overview" && <SummaryOverview data={data} summary={summary} />}
      {shownTab === "monthly" && <MonthlyResults data={data} summary={summary} />}
      {shownTab === "admin" && showAdmin && <AdminTodo data={data} summary={summary} onGo={onGo} />}
    </Panel>
  );
}
