// Scoring from POINTS_START: airdrop +5, shop raid (งัดร้าน) +3, loop (ลูป)
// +1 to every member credited on the evidence. Before it, airdrop +3 and any
// party activity +1. The value is written to the ledger at approval time, so
// changing these never rewrites points already earned.
export const TEAM_RULE_START = process.env.TEAM_RULE_START || process.env.SHOP_RULE_START || "2026-10-02";
// The new point values start a day before the quota does.
export const POINTS_START = process.env.POINTS_START || "2026-10-01";
export const ACTIVITY_KINDS = ["shop", "loop"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const KIND_POINTS: Record<ActivityKind, number> = { shop: 3, loop: 1 };
export const KIND_LABEL: Record<ActivityKind, string> = { shop: "งัดร้าน", loop: "ลูป" };
export const AIRDROP_POINTS = 5;

export function pointsFor(type: "airdrop" | "party", kind: unknown, activityDate: string) {
  if (activityDate < POINTS_START) return type === "party" ? 1 : 3;
  if (type === "airdrop") return AIRDROP_POINTS;
  return KIND_POINTS[kind === "loop" ? "loop" : "shop"];
}

// Team quota: every active member must earn TEAM_PER_DAY team points (shops +
// loops, not airdrops) each Bangkok day from TEAM_RULE_START. Each day stands
// alone: whatever that day falls short is docked (TEAM_PENALTY a point,
// leave days included), extra points don't carry to other days, and a
// docked day is never refunded by later work. Nothing is written to the
// ledger: the penalty is derived from approved evidence whenever scores are
// read, so approving evidence for a day late still fills that day.
export const TEAM_PER_DAY = 9;
export const TEAM_PENALTY = 1;

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Team points one approved activity earns toward the quota.
const kindPointsSql = `CASE pa.kind WHEN 'loop' THEN ${KIND_POINTS.loop} ELSE ${KIND_POINTS.shop} END`;

// Per member, per day since they became subject to the rule: that day's team
// points, cumulative points, cumulative requirement (today's quota isn't due
// until the day ends; days before TEAM_RULE_START only bank points) and the
// resulting debt. Dates are inlined after
// validation so this text can be embedded in queries that bind their own `?`
// parameters.
function teamDebtCte(today: string) {
  if (!isDate(today) || !isDate(TEAM_RULE_START)) throw Error("invalid date");
  return `team_days AS (
    SELECT m.id AS member_id, d::date AS day
    FROM members m
    CROSS JOIN LATERAL generate_series(
      GREATEST('${TEAM_RULE_START}'::date, (m.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok')::date),
      '${today}'::date, interval '1 day') d
    WHERE m.active=1),
  team_counts AS (
    SELECT pam.member_id, pa.activity_date AS day, SUM(${kindPointsSql}) AS n
    FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id=pa.id
    WHERE pa.status='approved' AND pa.activity_date>='${TEAM_RULE_START}'
    GROUP BY 1,2),
  team_short AS (
    SELECT td.member_id, td.day, COALESCE(tc.n,0) AS n,
      CASE WHEN td.day<>'${today}'::date THEN GREATEST(0, ${TEAM_PER_DAY}-COALESCE(tc.n,0)) ELSE 0 END AS short
    FROM team_days td
    LEFT JOIN team_counts tc ON tc.member_id=td.member_id AND tc.day=to_char(td.day,'YYYY-MM-DD')),
  team_debt AS (
    -- debt: points short so far this month (today isn't due until it ends).
    SELECT member_id, day, n, short,
      SUM(short) OVER (PARTITION BY member_id, date_trunc('month', day) ORDER BY day) AS debt
    FROM team_short)`;
}

// Every point movement with where it came from: ledger rows dated by the
// activity they reward (airdrop / shop / loop / adjust), plus a team-quota
// penalty row for each finished day that fell short. Summing any date range
// gives that period's score.
export function pointsDetailSql(today: string) {
  return `SELECT pl.member_id,pl.points,CASE pl.source WHEN 'airdrop' THEN a.activity_date WHEN 'party' THEN pa.activity_date ELSE to_char(pl.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') END AS day,
      CASE pl.source WHEN 'airdrop' THEN 'airdrop' WHEN 'party' THEN CASE pa.kind WHEN 'loop' THEN 'loop' ELSE 'shop' END ELSE 'adjust' END AS category
    FROM point_ledger pl
    LEFT JOIN airdrop_submissions a ON pl.source='airdrop' AND a.id=pl.source_id
    LEFT JOIN party_activities pa ON pl.source='party' AND pa.id=pl.source_id
  UNION ALL
  (WITH ${teamDebtCte(today)}
    SELECT member_id, -short*${TEAM_PENALTY} AS points, to_char(day,'YYYY-MM-DD') AS day, 'penalty' AS category FROM team_debt WHERE short>0)`;
}

// Every point movement as (member_id, points, day). Built on pointsDetailSql
// so totals and the per-source breakdown can never disagree.
export function pointsByDaySql(today: string) {
  return `SELECT member_id,points,day FROM (${pointsDetailSql(today)}) detail`;
}

// One finished day's team-quota outcome for members who fell short that day:
// team points earned (n), points short this month so far (debt) and points
// docked that day (inc). `today` must be after `day` so that day is due.
export function teamDayResultSql(today: string, day: string) {
  if (!isDate(day)) throw Error("invalid date");
  return `WITH ${teamDebtCte(today)}
    SELECT member_id, n, debt, short AS inc FROM team_debt WHERE day='${day}'::date AND short>0`;
}

// Where each member stands today: team points earned today, points short so
// far this month, and how many more they need before today ends. (bank stays
// 0: extra points no longer carry over.)
export function teamStatusSql(today: string) {
  return `WITH ${teamDebtCte(today)}
    SELECT member_id, n AS today, debt, 0 AS bank, GREATEST(0, ${TEAM_PER_DAY}-n) AS needed_today
    FROM team_debt WHERE day='${today}'::date`;
}

// Team points per member per day over a date range (admin attendance view).
export function teamPointsByDaySql(fromDate: string) {
  if (!isDate(fromDate)) throw Error("invalid date");
  return `SELECT pam.member_id, pa.activity_date, SUM(${kindPointsSql}) AS n
    FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id=pa.id
    WHERE pa.status='approved' AND pa.activity_date>='${fromDate}'
    GROUP BY 1,2`;
}
