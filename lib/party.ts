import { db } from "./db";

// Removes a member and repairs the party in the same transaction: if they led
// it, the longest-standing remaining member takes over; if nobody is left, it
// closes. Choosing the successor in SQL (not in an earlier SELECT) means a
// successor who leaves at the same moment can't be picked. Run after
// partyLock() in one db.batch().
export function leaveStatements(partyId: unknown, memberId: unknown) {
  return [
    db.prepare("DELETE FROM party_members WHERE party_id=? AND member_id=?").bind(partyId, memberId),
    db.prepare(
      "UPDATE parties SET owner_member_id=(SELECT member_id FROM party_members WHERE party_id=? ORDER BY id LIMIT 1) WHERE id=? AND owner_member_id=? AND EXISTS (SELECT 1 FROM party_members WHERE party_id=?)"
    ).bind(partyId, partyId, memberId, partyId),
    db.prepare(
      "UPDATE parties SET status='completed',active=0 WHERE id=? AND status IN ('open','locked') AND NOT EXISTS (SELECT 1 FROM party_members WHERE party_id=?)"
    ).bind(partyId, partyId),
  ];
}
