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
const ROUNDS = ["17:00", "20:00", "23:00", "01:00"];
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
  const url = process.env.DISCORD_POINTS_WEBHOOK_URL;
  if (!url || !(await claim(key))) return false;
  const ok = await postCard(url, card);
  if (!ok) await release(key); // let the next run retry
  return ok;
}

const mentions = (rows: any[]) => rows.map((r) => discordUserId(r.external_user_id)).filter(Boolean) as string[];

// 30–120 min after each airdrop round starts: tag who hasn't sent it (pending
// and approved count as sent; a rejected one still needs a resend). Members
// on leave that day are skipped.
async function roundReminders(nowMs: number) {
  const done: string[] = [];
  for (const date of [bkkDateOf(nowMs), bkkDateOf(nowMs - 86400_000)]) {
    for (const round of ROUNDS) {
      const start = bkkTime(date, round);
      if (nowMs < start + 30 * 60_000 || nowMs >= start + 120 * 60_000) continue;
      const missing = (await db.prepare(
        "SELECT m.display_name,m.external_user_id FROM members m WHERE m.active=1 AND NOT EXISTS (SELECT 1 FROM airdrop_submissions a WHERE a.member_id=m.id AND a.activity_date=? AND a.round_time=? AND a.status IN ('pending','approved')) AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.member_id=m.id AND l.leave_date=?) ORDER BY m.display_name"
      ).bind(date, round, date).all<any>()).results;
      if (!missing.length) continue;
      const sent = await send(`round:${date}:${round}`, {
        title: `⏰ ยังไม่ส่งแอร์ดรอปรอบ ${round}`,
        lines: [
          ["วันที่", date],
          ["ยังไม่ส่ง", `${missing.length} คน`],
          ...missing.map((m: any, i: number): [string, unknown] => [`${i + 1}`, m.display_name]),
          ["ส่งที่", "เว็บ → หน้าภารกิจ"],
        ],
        color: 0xf59e0b,
        mention: mentions(missing),
      });
      if (sent) done.push(`round ${date} ${round}`);
    }
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
