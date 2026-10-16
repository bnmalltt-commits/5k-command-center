import { db } from "./db";
import { now } from "./auth";
import { audit } from "./audit";

// Penalties that are paid back with shop runs: the points come off at once,
// and once the member has that many shop runs approved (sent after the
// penalty) the same points go back on, automatically.
//
// Undoing the deduction in the admin page cancels the penalty (and takes back
// a refund already given), so it neither shows nor refunds.

// Unique, never-reused id for a manual adjustment (see the dashboard route).
export const adjustmentId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

// Open penalties with progress: done = approved shop runs crediting the
// member, sent after the penalty was given.
const OPEN_SQL = `SELECT p.id,p.member_id,p.points,p.shops,p.reason,p.admin_name,p.created_at,m.display_name,
    (SELECT COUNT(*) FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id=pa.id
      WHERE pam.member_id=p.member_id AND pa.kind='shop' AND pa.status='approved' AND pa.created_at>p.created_at) AS done
  FROM point_penalties p JOIN members m ON m.id=p.member_id
  WHERE p.refunded_at IS NULL AND p.cancelled_at IS NULL
    AND EXISTS (SELECT 1 FROM point_ledger l WHERE l.source='adjustment' AND l.source_id=p.ledger_source_id AND l.member_id=p.member_id)`;

export type OpenPenalty = { id: string; memberId: string; name: string; points: number; shops: number; done: number; reason: string; adminName: string; createdAt: string };

const shape = (row: any): OpenPenalty => ({
  id: String(row.id),
  memberId: String(row.member_id),
  name: row.display_name,
  points: Number(row.points),
  shops: Number(row.shops),
  done: Math.min(Number(row.shops), Number(row.done)),
  reason: row.reason,
  adminName: row.admin_name,
  createdAt: row.created_at,
});

export async function openPenalties(memberId?: unknown) {
  const rows = memberId === undefined
    ? await db.prepare(`${OPEN_SQL} ORDER BY p.created_at DESC`).bind().all<any>()
    : await db.prepare(`${OPEN_SQL} AND p.member_id=? ORDER BY p.created_at DESC`).bind(memberId).all<any>();
  return rows.results.map(shape);
}

// Takes `points` (positive) off a member now, to be given back once they have
// `shops` shop runs approved. The deduction and the penalty go in together.
export async function createPenalty(admin: { id?: unknown; display_name: string }, memberId: number, points: number, shops: number, reason: string) {
  const target = await db.prepare("SELECT id,display_name FROM members WHERE id=? AND active=1").bind(memberId).first<any>();
  if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
  const sourceId = adjustmentId();
  const at = now();
  await db.batch([
    db.prepare("INSERT INTO point_ledger (member_id,source,source_id,points,note,created_at) VALUES (?,'adjustment',?,?,?,?)")
      .bind(memberId, sourceId, -points, `${reason} · งัดร้านคืน ${shops} ร้านได้คืน · โดย ${admin.display_name}`, at),
    db.prepare("INSERT INTO point_penalties (member_id,points,shops,reason,ledger_source_id,admin_name,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(memberId, points, shops, reason, sourceId, admin.display_name, at),
  ]);
  await audit(admin, "adjust", `ลดแต้ม ${target.display_name} · ${reason} · งัดร้านคืน ${shops} ร้านแล้วได้คืน`, -points);
}

// Gives back every penalty whose shop runs are done (for these members, or
// everyone). Safe to call any number of times: each refund claims its
// penalty first, and the points only land for the claim that won.
export async function settlePenalties(memberIds?: unknown[]) {
  const open = memberIds
    ? (await db.prepare(`${OPEN_SQL} AND p.member_id = ANY(?::bigint[])`).bind(memberIds.map(Number)).all<any>()).results.map(shape)
    : await openPenalties();
  const settled: OpenPenalty[] = [];
  for (const p of open.filter((row) => row.done >= row.shops)) {
    const sourceId = adjustmentId();
    const at = now();
    const [claimed] = await db.batch([
      // Re-checked under the row lock: not cancelled, deduction still there.
      db.prepare("UPDATE point_penalties SET refunded_at=?,refund_source_id=? WHERE id=? AND refunded_at IS NULL AND cancelled_at IS NULL AND EXISTS (SELECT 1 FROM point_ledger l WHERE l.source='adjustment' AND l.source_id=point_penalties.ledger_source_id)").bind(at, sourceId, p.id),
      db.prepare("INSERT INTO point_ledger (member_id,source,source_id,points,note,created_at) SELECT ?,'adjustment',?,?,?,? WHERE EXISTS (SELECT 1 FROM point_penalties WHERE id=? AND refund_source_id=?)")
        .bind(p.memberId, sourceId, p.points, `คืนแต้มโทษ · งัดร้านครบ ${p.shops} ร้าน`, at, p.id, sourceId),
    ]);
    if (!claimed.meta.changes) continue;
    settled.push(p);
    await audit({ display_name: "ระบบ" }, "adjust", `คืนแต้ม ${p.name} · งัดร้านครบ ${p.shops} ร้าน (${p.reason})`, p.points);
  }
  return settled;
}
