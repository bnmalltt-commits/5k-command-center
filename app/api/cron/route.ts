import { db } from "@/lib/db";
import { now, thaiDate } from "@/lib/auth";
import { postCard, discordUserId } from "@/lib/notify";
import { pointsByDaySql, teamStatusSql, teamDayResultSql, TEAM_PER_DAY, TEAM_RULE_START, KIND_POINTS } from "@/lib/points";

export const maxDuration = 30;

// Scheduled Discord reminders. Something outside calls this every few minutes
// (a GitHub Actions workflow, which runs far less often than scheduled); this route decides what is due from the Bangkok clock. Each
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

// 30 minutes before the 20:00 and 23:00 rounds. With DISCORD_REMINDER_ROLE_ID
// set it tags that one role (one short ping for everyone); otherwise it tags
// every active member who has linked Discord, minus anyone on leave that day.
// The window is 35 minutes wide so a late scheduler run still lands before
// the round starts.
const REMINDED_ROUNDS = ["20:00", "23:00"];
async function roundReminders(nowMs: number) {
  const done: string[] = [];
  const date = bkkDateOf(nowMs);
  const roleId = /^[0-9]{5,25}$/.test(process.env.DISCORD_REMINDER_ROLE_ID || "") ? process.env.DISCORD_REMINDER_ROLE_ID! : null;
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
      ...(roleId ? { mentionRoles: [roleId] } : { mention: mentions(people) }),
    });
    if (sent) done.push(`round ${date} ${round}`);
  }
  return done;
}

// 21:45–23:45: tag who still needs team points to avoid tonight's deduction.
async function shopReminder(nowMs: number) {
  const date = bkkDateOf(nowMs);
  if (nowMs < bkkTime(date, "21:45") || nowMs >= bkkTime(date, "23:45")) return [];
  const short = (await db.prepare(
    `SELECT m.display_name,m.external_user_id,s.needed_today FROM (${teamStatusSql(date)}) s JOIN members m ON m.id=s.member_id WHERE s.needed_today>0 ORDER BY s.needed_today DESC,m.display_name`
  ).bind().all<any>()).results;
  if (!short.length) return [];
  const sent = await send(`shop:${date}`, {
    title: `🏪 เตือนคะแนนทีมก่อนจบวัน (ขั้นต่ำ ${TEAM_PER_DAY} คะแนน)`,
    lines: [
      ["วันที่", date],
      ["ยังไม่ครบ", `${short.length} คน · ขาดแต้มละ 1 แต้มตอนเที่ยงคืน`],
      ["ทำได้", "งัดร้าน +3 · ลูป +1"],
      ...short.map((m: any): [string, unknown] => [m.display_name, `ต้องได้อีก ${m.needed_today} คะแนน`]),
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

// Shortly after midnight (00:00–04:00), for the day that just ended: anyone who sent nothing at all (no airdrop
// submission of any status, not in any party evidence) and hadn't filed leave
// is recorded as absent — a leave entry an admin can delete if it's wrong —
// and tagged so they know. Only from AUTO_ABSENT_START, never retroactively.
const AUTO_ABSENT_START = "2026-10-02";
const ABSENT_REASON = "ขาด — ไม่ได้ส่งอะไรเลย (บันทึกอัตโนมัติ)";
async function autoAbsence(nowMs: number) {
  const today = bkkDateOf(nowMs);
  if (nowMs < bkkTime(today, "00:00") || nowMs >= bkkTime(today, "04:00")) return [];
  const date = bkkDateOf(nowMs - 86400_000);
  if (date < AUTO_ABSENT_START) return [];
  const url = process.env.DISCORD_REMINDER_WEBHOOK_URL || process.env.DISCORD_POINTS_WEBHOOK_URL;
  const key = `absent:${date}`;
  if (!(await claim(key))) return [];
  let absent: any[];
  try {
    // A leave row this job wrote itself still counts as absent, so a retry
    // after a failed Discord post finds the same people again.
    absent = (await db.prepare(
      `SELECT m.id,m.display_name,m.external_user_id FROM members m
       WHERE m.active=1 AND (m.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok')::date < ?::date
         AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.member_id=m.id AND l.leave_date=? AND l.reason<>?)
         AND NOT EXISTS (SELECT 1 FROM airdrop_submissions a WHERE a.member_id=m.id AND a.activity_date=?)
         AND NOT EXISTS (SELECT 1 FROM party_activity_members pam JOIN party_activities pa ON pa.id=pam.party_activity_id WHERE pam.member_id=m.id AND pa.activity_date=?)
       ORDER BY m.display_name`
    ).bind(date, date, ABSENT_REASON, date, date).all<any>()).results;
    if (!absent.length) return [`absent ${date}: none`];
    // Recorded by the owner account (leave_requests.created_by is required).
    const owner = await db.prepare("SELECT id FROM members WHERE is_primary_admin=1 LIMIT 1").bind().first<any>();
    await db.batch(absent.map((m: any) =>
      db.prepare("INSERT INTO leave_requests (member_id,leave_date,reason,created_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT (member_id,leave_date) DO NOTHING")
        .bind(m.id, date, ABSENT_REASON, owner?.id ?? m.id, now())
    ));
  } catch (error) {
    await release(key); // nothing posted; let the next run try again
    throw error;
  }
  if (url) {
    const ok = await postCard(url, {
      title: `📋 ไม่ได้ส่งอะไรเลยเมื่อวาน · บันทึกเป็นขาด`,
      lines: [
        ["วันที่", date],
        ["จำนวน", `${absent.length} คน`],
        ...absent.map((m: any, i: number): [string, unknown] => [`${i + 1}`, m.display_name]),
        ["หมายเหตุ", "ติดธุระวันไหน แจ้งลาในเว็บล่วงหน้าได้ที่ เพิ่มเติม → ห้องลา"],
      ],
      color: 0xef4444,
      mention: mentions(absent),
    });
    if (!ok) await release(key); // leave rows are idempotent; retry the post
  }
  return [`absent ${date}: ${absent.length}`];
}

// Shortly after midnight (00:00–04:00), for the day that just ended: who fell
// short of the team quota and how many points that cost them, tagged so the
// deduction is never silent. Nothing is written (the penalty is derived on
// read), so a failed post simply retries on the next run.
async function teamSummary(nowMs: number) {
  const today = bkkDateOf(nowMs);
  if (nowMs < bkkTime(today, "00:00") || nowMs >= bkkTime(today, "04:00")) return [];
  const date = bkkDateOf(nowMs - 86400_000);
  if (date < TEAM_RULE_START) return [];
  const url = process.env.DISCORD_REMINDER_WEBHOOK_URL || process.env.DISCORD_POINTS_WEBHOOK_URL;
  if (!url) return [];
  const key = `team:${date}`;
  if (!(await claim(key))) return [];
  let docked: any[];
  let total = 0;
  try {
    docked = (await db.prepare(
      `SELECT m.display_name,m.external_user_id,r.n,r.debt,r.inc FROM (${teamDayResultSql(today, date)}) r JOIN members m ON m.id=r.member_id WHERE m.active=1 ORDER BY r.inc DESC,m.display_name`
    ).bind().all<any>()).results;
    total = Number((await db.prepare(
      "SELECT COUNT(*) AS n FROM members WHERE active=1 AND (created_at::timestamptz AT TIME ZONE 'Asia/Bangkok')::date <= ?::date"
    ).bind(date).first<any>())?.n || 0);
  } catch (error) {
    await release(key);
    throw error;
  }
  const ok = await postCard(url, {
    title: `📉 สรุปคะแนนทีม ${date} (ขั้นต่ำ ${TEAM_PER_DAY} คะแนน)`,
    lines: [
      ["ไม่โดนหัก", `${Math.max(0, total - docked.length)} คน`],
      ["โดนหัก", docked.length ? `${docked.length} คน · หักตามคะแนนที่ขาด` : "ไม่มี ทุกคนทำครบ 🎉"],
      ...docked.map((m: any): [string, unknown] => [
        m.display_name,
        `ได้ ${Number(m.n)}/${TEAM_PER_DAY} · หัก ${Number(m.inc)} แต้ม · ค้างรวม ${Number(m.debt)}`,
      ]),
      ...(docked.length ? [["ทำชดได้คืน", `งัดร้าน +${KIND_POINTS.shop} · ลูป +${KIND_POINTS.loop} วันไหนก็ได้`] as [string, unknown]] : []),
    ],
    color: docked.length ? 0xef4444 : 0x4ade80,
    mention: mentions(docked),
  });
  if (!ok) await release(key);
  return ok ? [`team ${date}: ${docked.length} docked`] : [];
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
      ...(await autoAbsence(nowMs)),
      ...(await teamSummary(nowMs)),
    ];
    return Response.json({ ok: true, at: new Date(nowMs).toISOString(), bkkDate: thaiDate(), ran });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "cron failed" }, { status: 500 });
  }
}
