import { db } from "./db";
import { ABSENT_REASON } from "./party";
import { pointsDetailSql, teamStatusSql, TEAM_PER_DAY, TEAM_RULE_START } from "./points";

export type PersonStats = {
  id: string;
  points: number; // net points in the period
  sent: number; // airdrop rounds sent (pending or approved)
  approved: number;
  due: number; // rounds that were due (started, member in the gang, not on leave)
  team: number; // team points earned (shops + loops)
  met: number; // finished days on which they reached the daily team quota
  quotaDays: number; // finished days the quota applied to them
  penalty: number; // points docked (negative)
  refund: number; // points given back for making up
  leave: number; // days on leave
  absent: number; // days recorded absent (sent nothing)
};

// The "สรุป" page: the whole gang at a glance (today / this week / this
// month), each month's results, and for admins the list of things to chase.
// Everything is derived from the same tables and point rules as the rest of
// the site, so every number here matches the ranking and "แต้มของฉัน".

// The rounds of one Bangkok date in the order they start: 01:00 is the early
// hours of that same date (uploads are dated by the Bangkok day they're sent).
const ROUND_STARTS = ["01:00", "17:00", "20:00", "23:00"];
const ROUNDS = ["17:00", "20:00", "23:00", "01:00"];
const CATEGORIES = ["airdrop", "shop", "loop", "adjust", "penalty", "refund"] as const;

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const mondayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(date, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
};
const bangkokClock = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const num = (value: unknown) => Number(value || 0);
const id = (value: unknown) => String(value);

// Highest value and everyone tied on it (none when nobody scored).
function leaders(values: Map<string, number>) {
  let best = 0;
  for (const value of values.values()) best = Math.max(best, value);
  if (best <= 0) return null;
  return { ids: [...values].filter(([, value]) => value === best).map(([key]) => key), n: best };
}

export async function buildSummary(date: string, isAdmin: boolean) {
  const clock = bangkokClock();
  const yesterday = addDays(date, -1);
  const starts = { day: date, week: mondayOf(date), month: `${date.slice(0, 7)}-01` };
  const from = [starts.week, starts.month, yesterday].sort()[0];
  const detail = pointsDetailSql(date);

  const [daily, monthly, airdrops, parties, leaves, joins, team, monthRounds, monthParties] = await Promise.all([
    db.prepare(`SELECT d.member_id,d.day,d.category,SUM(d.points) AS points FROM (${detail}) d JOIN members m ON m.id=d.member_id WHERE m.active=1 AND d.day>=? AND d.day<=? GROUP BY 1,2,3`).bind(from, date).all<any>(),
    db.prepare(`SELECT substr(d.day,1,7) AS month,d.member_id,d.category,SUM(d.points) AS points FROM (${detail}) d JOIN members m ON m.id=d.member_id WHERE m.active=1 GROUP BY 1,2,3`).bind().all<any>(),
    db.prepare("SELECT a.activity_date AS day,a.round_time,a.status,COUNT(*) AS n FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE m.active=1 AND a.activity_date>=? AND a.activity_date<=? GROUP BY 1,2,3").bind(from, date).all<any>(),
    db.prepare("SELECT activity_date AS day,COALESCE(kind,'shop') AS kind,status,COUNT(*) AS n FROM party_activities WHERE activity_date>=? AND activity_date<=? GROUP BY 1,2,3").bind(from, date).all<any>(),
    db.prepare("SELECT l.leave_date AS day,(l.reason=?) AS auto,COUNT(*) AS n FROM leave_requests l JOIN members m ON m.id=l.member_id WHERE m.active=1 AND l.leave_date>=? AND l.leave_date<=? GROUP BY 1,2").bind(ABSENT_REASON, from, date).all<any>(),
    db.prepare("SELECT id,to_char((created_at::timestamptz AT TIME ZONE 'Asia/Bangkok')::date,'YYYY-MM-DD') AS joined FROM members WHERE active=1").bind().all<any>(),
    db.prepare(`SELECT member_id,today,debt,needed_today FROM (${teamStatusSql(date)}) s`).bind().all<any>(),
    // Approved airdrop rounds per member per month, and how many days they
    // had all four rounds approved.
    db.prepare("SELECT month,member_id,SUM(n) AS rounds,COUNT(*) FILTER (WHERE n>=4) AS full_days FROM (SELECT substr(a.activity_date,1,7) AS month,a.member_id,a.activity_date,COUNT(*) AS n FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE m.active=1 AND a.status='approved' GROUP BY 1,2,3) x GROUP BY 1,2").bind().all<any>(),
    db.prepare("SELECT substr(activity_date,1,7) AS month,COUNT(*) AS n FROM party_activities WHERE status='approved' GROUP BY 1").bind().all<any>(),
  ]);

  const joined = joins.results.map((row: any) => String(row.joined));
  // Leave filed by the member (or an admin) excuses the day; an automatic
  // "ขาด" entry does not: those are exactly the people who should have sent.
  const excused = new Map<string, number>();
  const absent = new Map<string, number>();
  for (const row of leaves.results) (row.auto ? absent : excused).set(row.day, num(row.n));
  const eligible = (day: string) => Math.max(0, joined.filter((value) => value <= day).length - (excused.get(day) || 0));

  const periods = (Object.entries(starts) as [keyof typeof starts, string][]).map(([period, start]) => {
    const inRange = (day: string) => day >= start && day <= date;
    const days: string[] = [];
    for (let day = start; day <= date; day = addDays(day, 1)) days.push(day);
    const points: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    const byMember = new Map<string, number>();
    const docked = new Set<string>();
    let dockedDays = 0;
    for (const row of daily.results) {
      if (!inRange(row.day)) continue;
      const value = num(row.points);
      points[row.category] = (points[row.category] || 0) + value;
      byMember.set(id(row.member_id), (byMember.get(id(row.member_id)) || 0) + value);
      if (row.category === "penalty") {
        docked.add(id(row.member_id));
        dockedDays++;
      }
    }
    const evidence: Record<string, Record<string, number>> = {
      airdrop: { approved: 0, pending: 0, rejected: 0 },
      shop: { approved: 0, pending: 0, rejected: 0 },
      loop: { approved: 0, pending: 0, rejected: 0 },
    };
    const sent = new Map<string, number>();
    for (const row of airdrops.results) {
      if (!inRange(row.day)) continue;
      evidence.airdrop[row.status] = (evidence.airdrop[row.status] || 0) + num(row.n);
      if (row.status !== "rejected") sent.set(row.round_time, (sent.get(row.round_time) || 0) + num(row.n));
    }
    for (const row of parties.results) {
      if (!inRange(row.day)) continue;
      const kind = row.kind === "loop" ? "loop" : "shop";
      evidence[kind][row.status] = (evidence[kind][row.status] || 0) + num(row.n);
    }
    const possible = days.reduce((sum, day) => sum + eligible(day), 0);
    // What was actually due so far: today's rounds that haven't started yet
    // don't count against anyone.
    const due = (round: string) => (round <= clock ? possible : possible - eligible(date));
    return {
      id: period,
      from: start,
      to: date,
      points,
      top: [...byMember]
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([member, score]) => ({ id: member, score })),
      evidence,
      // A round counts as sent once it's pending or approved.
      rounds: ROUNDS.map((round) => ({ round, sent: sent.get(round) || 0, possible, due: due(round) })),
      leave: days.reduce((sum, day) => sum + (excused.get(day) || 0), 0),
      absent: days.reduce((sum, day) => sum + (absent.get(day) || 0), 0),
      team: { docked: docked.size, dockedDays },
    };
  });

  const teamRows = team.results.map((row: any) => ({
    id: id(row.member_id),
    today: num(row.today),
    debt: num(row.debt),
    // Short of today's own quota. needed_today also folds in older debt
    // (it's what clears everything), which would read as "short 18" for
    // someone who only misses today's 9. While in debt, today's points first
    // pay that debt off, so today's shortfall is simply what's left of 9.
    short: num(row.debt) > 0 ? Math.max(0, TEAM_PER_DAY - num(row.today)) : num(row.needed_today),
  }));
  const quotaOn = date >= TEAM_RULE_START;
  const teamNow = {
    on: quotaOn,
    subject: teamRows.length,
    done: quotaOn ? teamRows.filter((row) => row.short === 0).length : 0,
    owing: teamRows.filter((row) => row.debt > 0).length,
    owingTotal: teamRows.reduce((sum, row) => sum + row.debt, 0),
    dockedYesterday: new Set(
      daily.results.filter((row: any) => row.day === yesterday && row.category === "penalty").map((row: any) => id(row.member_id)),
    ).size,
  };

  // One entry per month with any points, newest first; the current month
  // always shows even before anyone scores.
  const monthMap = new Map<string, { score: Map<string, number>; team: Map<string, number>; penalized: Set<string>; net: number }>();
  const monthOf = (month: string) => {
    if (!monthMap.has(month)) monthMap.set(month, { score: new Map(), team: new Map(), penalized: new Set(), net: 0 });
    return monthMap.get(month)!;
  };
  monthOf(date.slice(0, 7));
  for (const row of monthly.results) {
    const entry = monthOf(row.month);
    const member = id(row.member_id);
    const value = num(row.points);
    entry.score.set(member, (entry.score.get(member) || 0) + value);
    entry.net += value;
    if (row.category === "shop" || row.category === "loop") entry.team.set(member, (entry.team.get(member) || 0) + value);
    if (row.category === "penalty") entry.penalized.add(member);
  }
  const roundsBy = new Map<string, Map<string, number>>();
  const fullBy = new Map<string, Map<string, number>>();
  for (const row of monthRounds.results) {
    if (!roundsBy.has(row.month)) roundsBy.set(row.month, new Map());
    if (!fullBy.has(row.month)) fullBy.set(row.month, new Map());
    roundsBy.get(row.month)!.set(id(row.member_id), num(row.rounds));
    fullBy.get(row.month)!.set(id(row.member_id), num(row.full_days));
  }
  const partiesBy = new Map(monthParties.results.map((row: any) => [String(row.month), num(row.n)]));
  const months = [...monthMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, entry]) => {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      // Members already in the gang by the month's end (or today).
      const end = lastDay < date ? lastDay : date;
      const members = joined.filter((value) => value <= end).length;
      const rounds = roundsBy.get(month) || new Map();
      return {
        month,
        complete: month < date.slice(0, 7),
        ranking: [...entry.score]
          .filter(([, score]) => score > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([member, score]) => ({ id: member, score })),
        totals: {
          points: entry.net,
          airdrops: [...rounds.values()].reduce((sum, n) => sum + n, 0),
          parties: partiesBy.get(month) || 0,
        },
        awards: {
          airdrop: leaders(rounds),
          team: leaders(entry.team),
          fullDays: leaders(fullBy.get(month) || new Map()),
          // Only for months the team quota was running in.
          clean: end >= TEAM_RULE_START ? Math.max(0, members - entry.penalized.size) : null,
          members,
        },
      };
    });

  let admin = null;
  if (isAdmin) {
    // The latest round that has started; before 01:00 that's yesterday's 23:00.
    const startedToday = ROUND_STARTS.filter((round) => round <= clock);
    const latest = startedToday.length
      ? { date, round: startedToday[startedToday.length - 1] }
      : { date: yesterday, round: "23:00" };
    const [pending, missing, noTeam, noDiscord, absentYesterday, leaveToday, memberSubs, memberLeaves] = await Promise.all([
      db.prepare("SELECT (SELECT COUNT(*) FROM airdrop_submissions WHERE status='pending') AS a,(SELECT COUNT(*) FROM party_activities WHERE status='pending') AS p,LEAST((SELECT MIN(created_at) FROM airdrop_submissions WHERE status='pending'),(SELECT MIN(created_at) FROM party_activities WHERE status='pending')) AS oldest").bind().first<any>(),
      db.prepare("SELECT m.id,a.status FROM members m LEFT JOIN airdrop_submissions a ON a.member_id=m.id AND a.activity_date=? AND a.round_time=? WHERE m.active=1 AND (m.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok')::date<=?::date AND NOT EXISTS (SELECT 1 FROM leave_requests l WHERE l.member_id=m.id AND l.leave_date=?) AND (a.id IS NULL OR a.status='rejected') ORDER BY m.display_name").bind(latest.date, latest.round, latest.date, latest.date).all<any>(),
      db.prepare("SELECT m.id FROM members m WHERE m.active=1 AND NOT EXISTS (SELECT 1 FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.member_id=m.id AND p.status IN ('open','locked')) ORDER BY m.display_name").bind().all<any>(),
      db.prepare("SELECT id FROM members WHERE active=1 AND COALESCE(external_user_id,'') NOT LIKE 'discord:%' ORDER BY display_name").bind().all<any>(),
      db.prepare("SELECT m.id FROM leave_requests l JOIN members m ON m.id=l.member_id WHERE m.active=1 AND l.leave_date=? AND l.reason=? ORDER BY m.display_name").bind(yesterday, ABSENT_REASON).all<any>(),
      db.prepare("SELECT m.id,l.reason FROM leave_requests l JOIN members m ON m.id=l.member_id WHERE m.active=1 AND l.leave_date=? AND l.reason<>? ORDER BY m.display_name").bind(date, ABSENT_REASON).all<any>(),
      // Per member, for the per-person day / week / month tables.
      db.prepare("SELECT a.member_id,a.activity_date AS day,a.status,COUNT(*) AS n FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE m.active=1 AND a.activity_date>=? AND a.activity_date<=? GROUP BY 1,2,3").bind(from, date).all<any>(),
      db.prepare("SELECT l.member_id,l.leave_date AS day,(l.reason=?) AS auto FROM leave_requests l JOIN members m ON m.id=l.member_id WHERE m.active=1 AND l.leave_date>=? AND l.leave_date<=?").bind(ABSENT_REASON, from, date).all<any>(),
    ]);

    // One row per active member for a period, from the same tables as the
    // gang totals so the two always agree.
    const startedNow = ROUND_STARTS.filter((round) => round <= clock).length;
    const people = (start: string): PersonStats[] => {
      const days: string[] = [];
      for (let day = start; day <= date; day = addDays(day, 1)) days.push(day);
      const inRange = (day: string) => day >= start && day <= date;
      return joins.results.map((row: any) => {
        const member = id(row.id);
        const joinedOn = String(row.joined);
        const mine = days.filter((day) => day >= joinedOn);
        const leaveDays = new Set<string>();
        let absentDays = 0;
        for (const l of memberLeaves.results) {
          if (id(l.member_id) !== member || !inRange(l.day)) continue;
          if (l.auto) absentDays++;
          else leaveDays.add(l.day);
        }
        let sent = 0, approved = 0;
        for (const a of memberSubs.results) {
          if (id(a.member_id) !== member || !inRange(a.day) || a.status === "rejected") continue;
          sent += num(a.n);
          if (a.status === "approved") approved += num(a.n);
        }
        let points = 0, team = 0, penalty = 0, refund = 0;
        const teamByDay = new Map<string, number>();
        for (const d of daily.results) {
          if (id(d.member_id) !== member || !inRange(d.day)) continue;
          const value = num(d.points);
          points += value;
          if (d.category === "shop" || d.category === "loop") {
            team += value;
            teamByDay.set(d.day, (teamByDay.get(d.day) || 0) + value);
          }
          if (d.category === "penalty") penalty += value;
          if (d.category === "refund") refund += value;
        }
        // Only finished days count towards the quota (today isn't over yet).
        const quotaDays = mine.filter((day) => day >= TEAM_RULE_START && day < date);
        return {
          id: member,
          points,
          sent,
          approved,
          due: mine.filter((day) => !leaveDays.has(day)).reduce((sum, day) => sum + (day === date ? startedNow : ROUNDS.length), 0),
          team,
          met: quotaDays.filter((day) => (teamByDay.get(day) || 0) >= TEAM_PER_DAY).length,
          quotaDays: quotaDays.length,
          penalty,
          refund,
          leave: leaveDays.size,
          absent: absentDays,
        };
      });
    };
    admin = {
      pending: { airdrop: num(pending?.a), party: num(pending?.p), oldest: pending?.oldest || null },
      round: {
        ...latest,
        missing: missing.results.filter((row: any) => !row.status).map((row: any) => id(row.id)),
        rejected: missing.results.filter((row: any) => row.status === "rejected").map((row: any) => id(row.id)),
      },
      neededToday: quotaOn
        ? teamRows.filter((row) => row.short > 0).sort((a, b) => b.short - a.short).map((row) => ({ id: row.id, n: row.short }))
        : [],
      owing: teamRows.filter((row) => row.debt > 0).sort((a, b) => b.debt - a.debt).map((row) => ({ id: row.id, n: row.debt })),
      noTeam: noTeam.results.map((row: any) => id(row.id)),
      noDiscord: noDiscord.results.map((row: any) => id(row.id)),
      absentYesterday: absentYesterday.results.map((row: any) => id(row.id)),
      leaveToday: leaveToday.results.map((row: any) => ({ id: id(row.id), reason: String(row.reason || "") })),
      people: { day: people(starts.day), week: people(starts.week), month: people(starts.month) },
      starts,
    };
  }

  return { date, yesterday, clock, teamStart: TEAM_RULE_START, periods, teamNow, months, admin };
}
