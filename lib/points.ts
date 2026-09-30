// Shop-raid quota (งัดร้าน): every active member must be credited with at least
// SHOP_PER_DAY approved party activities per Bangkok day from SHOP_RULE_START.
// Shortfalls accumulate as debt (leave days included), extra shops bank toward
// later days, and each shop of debt costs SHOP_PENALTY points. Nothing is
// written to the ledger: the penalty is derived from approved evidence every
// time scores are read, so making up a shop restores its point immediately and
// undoing an approval puts the debt back.
export const SHOP_RULE_START = process.env.SHOP_RULE_START || "2026-10-02";
export const SHOP_PER_DAY = 3;
export const SHOP_PENALTY = 1;

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Per member, per day since they became subject to the rule: that day's shops,
// cumulative shops, cumulative requirement (today's quota isn't due until the
// day ends) and the resulting debt. Dates are inlined after validation so this
// text can be embedded in queries that bind their own `?` parameters.
function shopDebtCte(today: string) {
  if (!isDate(today) || !isDate(SHOP_RULE_START)) throw Error("invalid date");
  return `shop_days AS (
    SELECT m.id AS member_id, d::date AS day
    FROM members m
    CROSS JOIN LATERAL generate_series(
      GREATEST('${SHOP_RULE_START}'::date, (m.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok')::date),
      '${today}'::date, interval '1 day') d
    WHERE m.active=1),
  shop_counts AS (
    SELECT pam.member_id, pa.activity_date AS day, COUNT(*) AS n
    FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id=pa.id
    WHERE pa.status='approved' AND pa.activity_date>='${SHOP_RULE_START}'
    GROUP BY 1,2),
  shop_cum AS (
    SELECT sd.member_id, sd.day, COALESCE(sc.n,0) AS n,
      SUM(COALESCE(sc.n,0)) OVER w AS done,
      ${SHOP_PER_DAY}*(ROW_NUMBER() OVER w - CASE WHEN sd.day='${today}'::date THEN 1 ELSE 0 END) AS req
    FROM shop_days sd
    LEFT JOIN shop_counts sc ON sc.member_id=sd.member_id AND sc.day=to_char(sd.day,'YYYY-MM-DD')
    WINDOW w AS (PARTITION BY sd.member_id ORDER BY sd.day)),
  shop_debt AS (
    SELECT member_id, day, n, done, req, GREATEST(0, req-done) AS debt FROM shop_cum)`;
}

// Every point movement as (member_id, points, day): ledger rows dated by the
// activity they reward, plus shop-quota penalty/refund rows dated by the day
// the debt changed. Summing any date range gives that period's score.
export function pointsByDaySql(today: string) {
  return `SELECT pl.member_id,pl.points,CASE pl.source WHEN 'airdrop' THEN a.activity_date WHEN 'party' THEN pa.activity_date ELSE to_char(pl.created_at::timestamptz AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') END AS day
    FROM point_ledger pl
    LEFT JOIN airdrop_submissions a ON pl.source='airdrop' AND a.id=pl.source_id
    LEFT JOIN party_activities pa ON pl.source='party' AND pa.id=pl.source_id
  UNION ALL
  (WITH ${shopDebtCte(today)},
    shop_delta AS (SELECT member_id, day, debt - COALESCE(LAG(debt) OVER (PARTITION BY member_id ORDER BY day),0) AS inc FROM shop_debt)
    SELECT member_id, -inc*${SHOP_PENALTY} AS points, to_char(day,'YYYY-MM-DD') AS day FROM shop_delta WHERE inc<>0)`;
}

// Where each member stands today: shops credited today, current debt, banked
// extras, and how many more they need before today ends to avoid new penalty.
export function shopStatusSql(today: string) {
  return `WITH ${shopDebtCte(today)}
    SELECT member_id, n AS today, debt, GREATEST(0, done-req) AS bank,
      GREATEST(0, req+${SHOP_PER_DAY}-done) AS needed_today
    FROM shop_debt WHERE day='${today}'::date`;
}
