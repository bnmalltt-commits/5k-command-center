import { db } from "./db";
import { now, thaiDate } from "./auth";
import { notifyApproval, notifyRejection, discordUserId } from "./notify";
import { pointsByDaySql, pointsFor } from "./points";
import { storage } from "./storage";

// Approving and rejecting evidence, shared by the admin page and the Discord
// review buttons so both behave exactly the same.

export type EvidenceType = "airdrop" | "party";

export const validType = (type: unknown): EvidenceType => {
  if (type !== "airdrop" && type !== "party") throw Error("ประเภทไม่ถูกต้อง");
  return type;
};

// "ส่ง 05:40": when the evidence was sent, Bangkok time, for Discord cards.
export const sentAt = (iso: unknown) => {
  const time = new Date(String(iso));
  return Number.isNaN(time.getTime())
    ? ""
    : `ส่ง ${time.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

// Each member's points for one month ("YYYY-MM"), the same total the monthly
// ranking shows, so the Discord card matches what members see on the site.
export async function totalsFor(memberIds: unknown[], today: string, month: string) {
  if (!memberIds.length) return [] as any[];
  return (await db.prepare(
    `SELECT m.id AS member_id,m.display_name AS name,m.external_user_id,COALESCE(SUM(x.points),0) AS total FROM members m LEFT JOIN (${pointsByDaySql(today)}) x ON x.member_id=m.id AND substr(x.day,1,7)=? WHERE m.id = ANY(?::bigint[]) GROUP BY m.id`
  ).bind(month, memberIds.map(Number)).all<any>()).results;
}

// Approves pending evidence, credits everyone on it and posts the points card.
// Throws if it was already reviewed (or doesn't exist).
export async function approveEvidence(admin: { id: unknown; display_name: string }, type: EvidenceType, id: number) {
  const table = type === "party" ? "party_activities" : "airdrop_submissions";
  const recipients = type === "party"
    ? await db.prepare("SELECT member_id FROM party_activity_members WHERE party_activity_id=?").bind(id).all<any>()
    : { results: [await db.prepare("SELECT member_id FROM airdrop_submissions WHERE id=?").bind(id).first<any>()] };
  const credited = recipients.results.filter(Boolean);
  // Measured, not assumed: a party approval can also refund a team-quota
  // penalty, so "after - before" may exceed the points credited here. Read
  // before the status flips — an approved activity already counts toward
  // the quota, which would fold the refund into "before".
  const today = thaiDate();
  // Points count toward the month the activity happened in.
  const activity = await db.prepare(`SELECT activity_date${type === "party" ? ",kind" : ""} FROM ${table} WHERE id=?`).bind(id).first<any>();
  const month = String(activity?.activity_date || today).slice(0, 7);
  const points = pointsFor(type, activity?.kind, String(activity?.activity_date || today));
  const kindLabel = type === "party" ? (activity?.kind === "loop" ? "ลูป" : "งัดร้าน") : "แอร์ดรอป";
  const before = await totalsFor(credited.map((r: any) => r.member_id), today, month);
  const updated = await db.prepare(`UPDATE ${table} SET status='approved',approved_by=? WHERE id=? AND status='pending' RETURNING image_key,activity_date,created_at${type === "party" ? "" : ",round_time"}`).bind(admin.id, id).first<any>();
  if (!updated) throw Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
  const inserted = await db.batch(
    credited.map((r: any) =>
      db.prepare("INSERT INTO point_ledger (member_id,source,source_id,points,note,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING")
        .bind(r.member_id, type, id, points, `${kindLabel}ตรวจผ่าน`, now())
    )
  );
  // The approval is committed; nothing in the Discord card may turn it into an error.
  try {
    await notifyApproval({
      kind: type === "party"
        ? `${kindLabel} · ${updated.activity_date} · ${sentAt(updated.created_at)}`
        : `แอร์ดรอปรอบ ${updated.round_time} · ${updated.activity_date} · ${sentAt(updated.created_at)}`,
      approvedBy: admin.display_name,
      month: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }),
      // Only people this approval actually credited.
      people: await (async () => {
        const ids = credited.filter((_: any, i: number) => inserted[i]?.meta.changes).map((r: any) => String(r.member_id));
        const after = await totalsFor(ids, today, month);
        return after
          .map((row: any) => ({
            name: row.name,
            discordId: discordUserId(row.external_user_id),
            before: Number(before.find((b: any) => String(b.member_id) === String(row.member_id))?.total || 0),
            after: Number(row.total),
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      })(),
      // Read before the delete below — this is the last moment the photo exists.
      loadImage: async () => {
        if (!updated.image_key) return null;
        const object = await storage.get(updated.image_key);
        if (!object) return null;
        return {
          blob: await new Response(object.body).blob(),
          ext: String(updated.image_key).split(".").pop() || "png",
        };
      },
    });
  } catch {}
  // Evidence is only needed until it's verified — delete it once approved
  // so storage doesn't fill up. Best-effort: never fail the approval over it.
  if (updated.image_key) await storage.delete(updated.image_key).catch(() => {});
  return { points, credited: credited.length };
}

// Rejects pending evidence with an optional reason and tags the members.
export async function rejectEvidence(admin: { id: unknown; display_name: string }, type: EvidenceType, id: number, reasonText?: unknown) {
  const table = type === "party" ? "party_activities" : "airdrop_submissions";
  const reason = String(reasonText || "").trim().replace(/\s+/g, " ").slice(0, 120) || null;
  const rejected = await db.prepare(`UPDATE ${table} SET status='rejected',approved_by=?,reject_reason=? WHERE id=? AND status='pending' RETURNING activity_date,created_at${type === "party" ? ",kind" : ",round_time"}`).bind(admin.id, reason, id).first<any>();
  if (!rejected) throw Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
  const people = (type === "party"
    ? await db.prepare("SELECT m.display_name AS name,m.external_user_id FROM party_activity_members pam JOIN members m ON m.id=pam.member_id WHERE pam.party_activity_id=? ORDER BY m.display_name").bind(id).all<any>()
    : await db.prepare("SELECT m.display_name AS name,m.external_user_id FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE a.id=?").bind(id).all<any>()
  ).results;
  await notifyRejection({
    reason,
    kind: type === "party"
      ? `${rejected.kind === "loop" ? "ลูป" : "งัดร้าน"} · ${rejected.activity_date} · ${sentAt(rejected.created_at)}`
      : `แอร์ดรอปรอบ ${rejected.round_time} · ${rejected.activity_date} · ${sentAt(rejected.created_at)}`,
    rejectedBy: admin.display_name,
    people: people.map((p: any) => ({ name: p.name, discordId: discordUserId(p.external_user_id) })),
  });
  return { reason };
}
