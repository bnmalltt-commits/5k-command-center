// Scoring from TEAM_RULE_START: airdrop +5, shop raid (งัดร้าน) +3, loop (ลูป)
// +1 to every member credited on the evidence. Before it, airdrop +3 and any
// party activity +1. The value is written to the ledger at approval time, so
// changing these never rewrites points already earned.
export const TEAM_RULE_START = process.env.TEAM_RULE_START || process.env.SHOP_RULE_START || "2026-10-02";
export const ACTIVITY_KINDS = ["shop", "loop"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const KIND_POINTS: Record<ActivityKind, number> = { shop: 3, loop: 1 };
export const KIND_LABEL: Record<ActivityKind, string> = { shop: "งัดร้าน", loop: "ลูป" };
export const AIRDROP_POINTS = 5;

export function pointsFor(type: "airdrop" | "party", kind: unknown, activityDate: string) {
  if (activityDate < TEAM_RULE_START) return type === "party" ? 1 : 3;
  if (type === "airdrop") return AIRDROP_POINTS;
  return KIND_POINTS[kind === "loop" ? "loop" : "shop"];
}

// Team quota: every active member must earn TEAM_PER_DAY team points (shops +
// loops, not airdrops) per Bangkok day from TEAM_RULE_START. Shortfalls
// accumulate as debt (leave days included), extra points bank toward later
// days, and each point of debt costs TEAM_PENALTY. Nothing is written to the
// ledger: the penalty is derived from approved evidence every time scores are
// read, so making up the shortfall restores the points immediately and
// undoing an approval puts the debt back.
export const TEAM_PER_DAY = 9;
export const TEAM_PENALTY = 1;

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Team points one approved activity earns toward the quota.
const kindPointsSql = `CASE pa.kind WHEN 'loop' THEN ${KIND_POINTS.loop} ELSE ${KIND_POINTS.shop} END`;

// Per member, per day since they became subject to the rule: that day's team
// points, cumulative points, cumulative requirement (today's quota isn't due
// until the day ends) and the resulting debt. Dates are inlined after
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
  team_cum AS (
    SELECT td.member_id, td.day, COALESCE(tc.n,0) AS n,
      SUM(COALESCE(tc.n,0)) OVER w AS done,
      ${TEAM_PER_DAY}*(ROW_NUMBER() OVER w - CASE WHEN td.day='${today}'::date THEN 1 ELSE 0 END) AS req
    FROM team_days td
    LEFT JOIN team_counts tc ON tc.member_id=td.member_id AND tc.day=to_char(td.day,'YYYY-MM-DD')
    WINDOW w AS (PARTITION BY td.member_id ORDER BY td.day)),
  team_debt AS (
    SELECT member_id, day, n, done, req, GREATEST(0, req-done) AS debt FROM team_cum)`;
}

// Every point movement as (member_id, points, day): ledger rows dated by the
// activity they reward, plus team-quota penalty/refund rows dated by the day
// the debt changed. Summing any date range gives that period's score.
export function pointsByDaySql(today: string) {
  return `SELECT pl.member_id,pl.points,CASE pl.source WHEN 'airdrop' THEN a.activity_date WHEN 'party' THEN pa.activity_date ELSE to_char(pl.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') END AS day
    FROM point_ledger pl
    LEFT JOIN airdrop_submissions a ON pl.source='airdrop' AND a.id=pl.source_id
    LEFT JOIN party_activities pa ON pl.source='party' AND pa.id=pl.source_id
  UNION ALL
  (WITH ${teamDebtCte(today)},
    team_delta AS (SELECT member_id, day, debt - COALESCE(LAG(debt) OVER (PARTITION BY member_id ORDER BY day),0) AS inc FROM team_debt)
    SELECT member_id, -inc*${TEAM_PENALTY} AS points, to_char(day,'YYYY-MM-DD') AS day FROM team_delta WHERE inc<>0)`;
}

// Where each member stands today: team points earned today, current debt,
// banked extras, and how many more they need before today ends to avoid new
// penalty.
export function teamStatusSql(today: string) {
  return `WITH ${teamDebtCte(today)}
    SELECT member_id, n AS today, debt, GREATEST(0, done-req) AS bank,
      GREATEST(0, req+${TEAM_PER_DAY}-done) AS needed_today
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
