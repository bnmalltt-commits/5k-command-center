import { db } from "./db";
import { pointsByDaySql, teamPointsByDaySql, TEAM_PER_DAY, TEAM_RULE_START } from "./points";
import { ROUNDS } from "./rounds";

// One member's profile: points by month, how they place, which rounds they
// tend to miss, team-quota record, and achievements with progress.

export type Achievement = { id: string; icon: string; title: string; hint: string; done: boolean; progress: number; goal: number };

const num = (value: unknown) => Number(value || 0);
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// Longest run of consecutive dates in a sorted list.
function longestRun(dates: string[]) {
  let best = 0, run = 0, prev = "";
  for (const day of dates) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

export async function buildProfile(memberId: number, today: string) {
  const member = await db.prepare("SELECT id,display_name,role,created_at FROM members WHERE id=? AND active=1").bind(memberId).first<any>();
  if (!member) throw Error("ไม่พบสมาชิกนี้");
  const month = today.slice(0, 7);
  const since30 = addDays(today, -30);

  const [byMonth, boards, airdrops, teamDays, totals] = await Promise.all([
    db.prepare(`SELECT substr(day,1,7) AS month, SUM(points) AS score FROM (${pointsByDaySql(today)}) x WHERE member_id=? GROUP BY 1 ORDER BY 1 DESC LIMIT 6`).bind(memberId).all<any>(),
    // Everyone's score per month, to place this member (ties share a rank).
    db.prepare(`SELECT substr(x.day,1,7) AS month, x.member_id, SUM(x.points) AS score FROM (${pointsByDaySql(today)}) x JOIN members m ON m.id=x.member_id WHERE m.active=1 GROUP BY 1,2`).bind().all<any>(),
    db.prepare("SELECT activity_date,round_time FROM airdrop_submissions WHERE member_id=? AND status='approved' ORDER BY activity_date").bind(memberId).all<any>(),
    db.prepare(`SELECT activity_date,n FROM (${teamPointsByDaySql(TEAM_RULE_START)}) t WHERE member_id=?`).bind(memberId).all<any>(),
    db.prepare("SELECT COUNT(*) FILTER (WHERE pa.kind='loop') AS loops, COUNT(*) FILTER (WHERE pa.kind<>'loop') AS shops FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id=pa.id WHERE pam.member_id=? AND pa.status='approved'").bind(memberId).first<any>(),
  ]);

  // Rank in each month (only months with points count as placed).
  const rankIn = (m: string) => {
    const rows = boards.results.filter((r: any) => r.month === m).map((r: any) => ({ id: String(r.member_id), score: num(r.score) })).sort((a: any, b: any) => b.score - a.score);
    const mine = rows.find((r: any) => r.id === String(memberId));
    if (!mine) return null;
    return 1 + rows.filter((r: any) => r.score > mine.score).length;
  };
  const months = byMonth.results.map((r: any) => ({ month: r.month, score: num(r.score), rank: rankIn(r.month), complete: r.month < month }));

  // Airdrops: days with all four rounds, and the round missed most in 30 days.
  const roundsByDay = new Map<string, Set<string>>();
  for (const a of airdrops.results) {
    const day = String(a.activity_date);
    if (!roundsByDay.has(day)) roundsByDay.set(day, new Set());
    roundsByDay.get(day)!.add(String(a.round_time));
  }
  const fullDays = [...roundsByDay.entries()].filter(([, set]) => set.size >= ROUNDS.length).map(([day]) => day).sort();
  const recentDays: string[] = [];
  for (let d = since30; d < today; d = addDays(d, 1)) if (d >= String(member.created_at).slice(0, 10)) recentDays.push(d);
  const missed = ROUNDS.map((round) => ({ round, missed: recentDays.filter((d) => !roundsByDay.get(d)?.has(round)).length }));
  const worst = [...missed].sort((a, b) => b.missed - a.missed)[0];

  // Team quota: finished days that reached the daily score.
  const teamByDay = new Map(teamDays.results.map((r: any) => [String(r.activity_date), num(r.n)]));
  const quotaDays: string[] = [];
  for (let d = TEAM_RULE_START; d < today; d = addDays(d, 1)) if (d >= String(member.created_at).slice(0, 10)) quotaDays.push(d);
  const metDays = quotaDays.filter((d) => (teamByDay.get(d) || 0) >= TEAM_PER_DAY);

  const thisMonth = months.find((m: any) => m.month === month);
  const completed = months.filter((m: any) => m.complete && m.rank);
  const best = (goal: number, value: number) => ({ progress: Math.min(goal, value), goal, done: value >= goal });
  const achievements: Achievement[] = [
    { id: "full", icon: "4", title: "ครบ 4 รอบ", hint: "ส่งแอร์ดรอปผ่านครบ 4 รอบในวันเดียว", ...best(1, fullDays.length) },
    { id: "streak", icon: "7", title: "สายอึด", hint: "ครบ 4 รอบ 7 วันติด", ...best(7, longestRun(fullDays)) },
    { id: "team7", icon: "9", title: "ทีมเวิร์ก", hint: "ทำคะแนนทีมครบ 7 วันติด ไม่โดนหักเลย", ...best(7, longestRun(metDays)) },
    { id: "shop50", icon: "S", title: "นักงัดร้าน", hint: "งัดร้านผ่าน 50 ครั้ง", ...best(50, num(totals?.shops)) },
    { id: "loop30", icon: "L", title: "สายลูป", hint: "ลูปผ่าน 30 ครั้ง", ...best(30, num(totals?.loops)) },
    { id: "air100", icon: "A", title: "นักล่าแอร์ดรอป", hint: "แอร์ดรอปผ่าน 100 รอบ", ...best(100, airdrops.results.length) },
    { id: "pts100", icon: "+", title: "ร้อยแต้ม", hint: "ได้ 100 แต้มในเดือนเดียว", ...best(100, Math.max(0, ...months.map((m: any) => m.score))) },
    { id: "top3", icon: "3", title: "ขึ้นโพเดียม", hint: "จบเดือนในอันดับ 1–3", ...best(1, completed.filter((m: any) => m.rank <= 3).length) },
    { id: "champ", icon: "1", title: "แชมป์ประจำเดือน", hint: "จบเดือนเป็นอันดับ 1", ...best(1, completed.filter((m: any) => m.rank === 1).length) },
  ];

  return {
    id: String(member.id),
    name: member.display_name,
    role: member.role,
    joined: String(member.created_at).slice(0, 10),
    month: thisMonth || { month, score: 0, rank: null, complete: false },
    months,
    airdrops: { total: airdrops.results.length, fullDays: fullDays.length, missed30: missed, worst: worst && worst.missed > 0 ? worst : null, days30: recentDays.length },
    team: { metDays: metDays.length, days: quotaDays.length, shops: num(totals?.shops), loops: num(totals?.loops) },
    achievements,
  };
}
