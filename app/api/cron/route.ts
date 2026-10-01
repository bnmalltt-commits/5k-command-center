import { db } from "@/lib/db";
import { now, thaiDate } from "@/lib/auth";
import { postCard, discordUserId } from "@/lib/notify";
import { pointsByDaySql, shopStatusSql } from "@/lib/points";

export const maxDuration = 30;

// Scheduled Discord reminders. A GitHub Actions workflow calls this every
// 30 minutes; this route decides what is due from the Bangkok clock. Each
// reminder claims a unique key in notification_log before posting, so it is
// sent at most once however often (or by whom) this URL is hit — which is why
// it needs no secret.
const BKK_OFFSET_MS = 7 * 3600_000;

const bkkDateOf = (ms: number) => new Date(ms + BKK_OFFSET_MS).toISOString().slice(0, 10);
// UTC ms for a Bangkok wall-clock time on a Bangkok date.
const bkkTime = (date: string, hhmm: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - BKK_OFFSET_MS;
};

async function claim(key: string) {
  const row = await db
    .prepare("INSERT INTO notification_log (key,sent_at) VALUES (?,?) ON CONFLICT (key) DO NOTHING RETURNING key")
    .bind(key, now())
    .first();
  return !!row;
}
const release = (key: string) => db.prepare("DELETE FROM notification_log WHERE key=?").bind(key).run();

async function send(key: string, card: Parameters<typeof postCard>[1]) {
  const url = process.env.DISCORD_REMINDER_WEBHOOK_URL || process.env.DISCORD_POINTS_WEBHOOK_URL;
  if (!url || !(await claim(key))) return false;
  const ok = await postCard(url, card);
  if (!ok) await release(key); // let the next run retry
  return ok;
}

const mentions = (rows: any[]) => rows.map((r) => discordUserId(r.external_user_id)).filter(Boolean) as string[];

// 30 minutes before the 20:00 and 23:00 rounds: tag every active member who
// has linked Discord (members on leave that day are skipped) to get ready.
// The window is 35 minutes wide so a late scheduler run still lands before
// the round starts.
const REMINDED_ROUNDS = ["20:00", "23:00"];
async function roundReminders(nowMs: number) {
  const done: string[] = [];
  const date = bkkDateOf(nowMs);
  for (const round of REMINDED_ROUNDS) {
    const start = bkkTime(date, round);
    if (nowMs < start - 35 * 60_000 || nowMs >= start) continue;
    const people = (await db.prepare(
      "SELECT m.display_name,m.external_user_id FROM members m WHERE m.active=1 AND m.external_user_id LIKE 'discord:%' AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.member_id=m.id AND l.leave_date=?) ORDER BY m.display_name"
    ).bind(date).all<any>()).results;
    if (!people.length) continue;
    const sent = await send(`round:${date}:${round}`, {
      title: `⏰ อีก 30 นาทีเริ่มแอร์ดรอปรอบ ${round}`,
      lines: [
        ["วันที่", date],
        ["รอบ", `${round} · เตรียมตัวแล้วส่งหลักฐานในเว็บ`],
      ],
      color: 0xf59e0b,
      mention: mentions(people),
    });
    if (sent) done.push(`round ${date} ${round}`);
  }
  return done;
}

// 21:45–23:45: tag who still needs shop raids to avoid tonight's deduction.
async function shopReminder(nowMs: number) {
  const date = bkkDateOf(nowMs);
  if (nowMs < bkkTime(date, "21:45") || nowMs >= bkkTime(date, "23:45")) return [];
  const short = (await db.prepare(
    `SELECT m.display_name,m.external_user_id,s.needed_today FROM (${shopStatusSql(date)}) s JOIN members m ON m.id=s.member_id WHERE s.needed_today>0 ORDER BY s.needed_today DESC,m.display_name`
  ).bind().all<any>()).results;
  if (!short.length) return [];
  const sent = await send(`shop:${date}`, {
    title: "🏪 เตือนงัดร้านก่อนจบวัน",
    lines: [
      ["วันที่", date],
      ["ยังไม่ครบ", `${short.length} คน · ขาดร้านละ 1 แต้มตอนเที่ยงคืน`],
      ...short.map((m: any): [string, unknown] => [m.display_name, `ต้องงัดอีก ${m.needed_today} ร้าน`]),
    ],
    color: 0xf59e0b,
    mention: mentions(short),
  });
  return sent ? [`shop ${date}`] : [];
}

// 1st of the month, 00:00–06:00: announce last month's top 3 (ties share a place).
async function monthlyWinners(nowMs: number) {
  const date = bkkDateOf(nowMs);
  if (!date.endsWith("-01") || nowMs >= bkkTime(date, "06:00")) return [];
  const [y, m] = date.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const board = (await db.prepare(
    `SELECT m.display_name,m.external_user_id,SUM(x.points) AS score FROM (${pointsByDaySql(date)}) x JOIN members m ON m.id=x.member_id WHERE m.active=1 AND substr(x.day,1,7)=? GROUP BY m.id ORDER BY score DESC,m.display_name`
  ).bind(prev).all<any>()).results;
  const ranked: { rank: number; row: any }[] = [];
  board.forEach((row: any, i: number) => {
    const rank = i > 0 && Number(row.score) === Number(board[i - 1].score) ? ranked[i - 1].rank : i + 1;
    ranked.push({ rank, row });
  });
  const winners = ranked.filter((r) => r.rank <= 3 && Number(r.row.score) > 0);
  if (!winners.length) return [];
  const medal = ["🥇", "🥈", "🥉"];
  const month = new Date(`${prev}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
  const sent = await send(`winners:${prev}`, {
    title: `🏆 ผู้ชนะประจำเดือน ${month}`,
    lines: [
      ...winners.map(({ rank, row }): [string, unknown] => [`${medal[rank - 1]} อันดับ ${rank}`, `${row.display_name} · ${Number(row.score)} แต้ม`]),
      ["เดือนใหม่", "เริ่มนับแต้มใหม่แล้ว สู้ๆ!"],
    ],
    color: 0xfbbf24,
    mention: mentions(winners.map((w) => w.row)),
  });
  return sent ? [`winners ${prev}`] : [];
}

export async function GET(request: Request) {
  // ?at=<ISO time> simulates the clock for local testing; ignored in production.
  const at = new URL(request.url).searchParams.get("at");
  const nowMs = process.env.NODE_ENV !== "production" && at && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : Date.now();
  try {
    const ran = [
      ...(await roundReminders(nowMs)),
      ...(await shopReminder(nowMs)),
      ...(await monthlyWinners(nowMs)),
    ];
    return Response.json({ ok: true, at: new Date(nowMs).toISOString(), bkkDate: thaiDate(), ran });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "cron failed" }, { status: 500 });
  }
}
