import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { now, thaiDate, onlineSince, requireMember, requireAdmin, requireSam, json } from "@/lib/auth";

// Give the ~11 parallel queries this route fires room to finish instead of
// Vercel killing the function mid-flight, which would abandon their Postgres
// connections (they'd sit "active" on the server forever since nobody ever
// reads the response) and starve the connection pool for later requests.
export const maxDuration = 30;

// Postgres returns bigint ids as strings, so a raw `Number(body.x) === me.id`
// is always false and silently defeats these "is this me?" guards. Compare
// both sides as numbers.
const sameId = (a: unknown, b: unknown) => Number(a) === Number(b);

const validType = (type: unknown) => {
  if (type !== "airdrop" && type !== "party") throw Error("ประเภทไม่ถูกต้อง");
  return type;
};

async function activeParty(memberId: number) {
  return db
    .prepare("SELECT p.id,p.name,p.status FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.member_id=? AND p.status IN ('open','locked') LIMIT 1")
    .bind(memberId)
    .first<any>();
}

async function partyDetails(party: any) {
  if (!party) return null;
  const members = await db
    .prepare("SELECT m.id,m.display_name,m.role,CASE WHEN m.last_seen_at IS NOT NULL AND m.last_seen_at>=? THEN 1 ELSE 0 END AS online,pm.joined_at FROM party_members pm JOIN members m ON m.id=pm.member_id WHERE pm.party_id=? AND m.active=1 ORDER BY online DESC,pm.id")
    .bind(onlineSince(), party.id)
    .all();
  return { ...party, members: members.results };
}

// Which extra payload keys each view actually reads. Everything not listed
// here is "core" and ships on every request. The connection pool runs max: 1
// (the session pooler caps the project at 15), so these queries serialize —
// every query we skip is a round trip saved off the response time.
//
// NOTE: if a nav entry ever grows a badge count (e.g. "คำเชิญ (2)"), the key
// behind that count has to move into core, since it'd then be read from every
// view rather than only inside its own.
const VIEWS = ["airdrop", "party", "score", "admin", "leave", "log"] as const;
type View = (typeof VIEWS)[number];

export async function GET(request: Request) {
  try {
    const me = await requireMember(request), date = thaiDate();
    const requested = new URL(request.url).searchParams.get("view");
    const view: View = (VIEWS as readonly string[]).includes(requested || "")
      ? (requested as View)
      : "airdrop";
    const wants = {
      party: view === "party",
      admin: view === "admin" && me.role === "admin",
      leave: view === "leave",
      log: view === "log",
    };
    await db.prepare("UPDATE members SET last_seen_at=? WHERE id=?").bind(now(), me.id).run();
    const since = onlineSince();
    const empty = Promise.resolve({ results: [] as any[] });
    const [members, airdrops, parties, favorites, leaderboard, managed, partyBase, partyInvites, openParties, leaveRequests, submissionLog, score, pending] = await Promise.all([
      db.prepare("SELECT id,display_name,role,CASE WHEN last_seen_at IS NOT NULL AND last_seen_at>=? THEN 1 ELSE 0 END AS online FROM members WHERE active=1 ORDER BY online DESC,display_name").bind(since).all(),
      db.prepare("SELECT id,activity_date,round_time,status,image_key,created_at FROM airdrop_submissions WHERE member_id=? ORDER BY activity_date DESC,round_time DESC LIMIT 30").bind(me.id).all(),
      wants.party
        ? db.prepare("SELECT pa.id,pa.status,pa.image_key,pa.activity_date,pa.created_at,STRING_AGG(allm.display_name,' · ') AS members FROM party_activities pa JOIN party_activity_members mine ON mine.party_activity_id=pa.id AND mine.member_id=? JOIN party_activity_members allpam ON allpam.party_activity_id=pa.id JOIN members allm ON allm.id=allpam.member_id GROUP BY pa.id ORDER BY pa.created_at DESC LIMIT 30").bind(me.id).all()
        : empty,
      db.prepare("SELECT favorite_member_id FROM member_favorites WHERE owner_member_id=?").bind(me.id).all(),
      db.prepare("SELECT m.id,m.display_name,CASE WHEN m.last_seen_at>=? THEN 1 ELSE 0 END AS online,COALESCE(SUM(pl.points),0) AS score FROM members m LEFT JOIN point_ledger pl ON pl.member_id=m.id WHERE m.active=1 GROUP BY m.id ORDER BY score DESC,m.display_name LIMIT 100").bind(since).all(),
      wants.admin ? db.prepare("SELECT id,display_name,role,active,is_primary_admin FROM members ORDER BY active DESC,display_name").bind().all() : empty,
      db.prepare("SELECT p.id,p.name,p.status,p.owner_member_id,p.active,owner.display_name AS owner_name FROM parties p JOIN party_members mine ON mine.party_id=p.id AND mine.member_id=? LEFT JOIN members owner ON owner.id=p.owner_member_id WHERE p.status IN ('open','locked') ORDER BY p.id DESC LIMIT 1").bind(me.id).first(),
      wants.party
        ? db.prepare("SELECT i.id,i.party_id,i.created_at,p.name AS party_name,inviter.display_name AS inviter_name,COUNT(pm.id) AS member_count FROM party_invites i JOIN parties p ON p.id=i.party_id JOIN members inviter ON inviter.id=i.inviter_member_id LEFT JOIN party_members pm ON pm.party_id=i.party_id WHERE i.invitee_member_id=? AND i.status='pending' AND p.status='open' GROUP BY i.id,p.name,inviter.display_name").bind(me.id).all()
        : empty,
      wants.party
        ? db.prepare("SELECT p.id,p.name,p.owner_member_id,owner.display_name AS owner_name,COUNT(pm.id) AS member_count FROM parties p JOIN members owner ON owner.id=p.owner_member_id LEFT JOIN party_members pm ON pm.party_id=p.id WHERE p.status='open' AND p.active=1 GROUP BY p.id,p.name,p.owner_member_id,owner.display_name HAVING COUNT(pm.id)<5 ORDER BY p.id DESC LIMIT 20").bind().all()
        : empty,
      !wants.leave
        ? empty
        : me.role === "admin"
          ? db.prepare("SELECT l.id,l.leave_date,l.reason,l.created_at,m.display_name,creator.display_name AS created_by_name FROM leave_requests l JOIN members m ON m.id=l.member_id JOIN members creator ON creator.id=l.created_by ORDER BY l.leave_date DESC LIMIT 100").bind().all()
          : db.prepare("SELECT l.id,l.leave_date,l.reason,l.created_at,m.display_name,creator.display_name AS created_by_name FROM leave_requests l JOIN members m ON m.id=l.member_id JOIN members creator ON creator.id=l.created_by WHERE l.member_id=? ORDER BY l.leave_date DESC LIMIT 100").bind(me.id).all(),
      wants.log
        ? db.prepare("SELECT * FROM (SELECT 'airdrop' AS type,a.id,a.round_time AS detail,a.activity_date,a.status,a.created_at,a.image_key,m.display_name AS submitted_by,approver.display_name AS approved_by FROM airdrop_submissions a JOIN members m ON m.id=a.member_id LEFT JOIN members approver ON approver.id=a.approved_by UNION ALL SELECT 'party' AS type,pa.id,'ปาร์ตี้' AS detail,pa.activity_date,pa.status,pa.created_at,pa.image_key,submitter.display_name AS submitted_by,approver.display_name AS approved_by FROM party_activities pa LEFT JOIN members submitter ON submitter.id=pa.submitted_by_member_id LEFT JOIN members approver ON approver.id=pa.approved_by) x ORDER BY created_at DESC LIMIT 300").bind().all()
        : empty,
      db.prepare("SELECT COALESCE(SUM(points),0) AS total FROM point_ledger WHERE member_id=?").bind(me.id).first<any>(),
      wants.admin
        ? db.prepare("SELECT * FROM (SELECT 'airdrop' AS type,a.id,a.image_key,a.round_time AS detail,a.created_at,m.display_name AS submitted_by FROM airdrop_submissions a JOIN members m ON m.id=a.member_id WHERE a.status='pending' UNION ALL SELECT 'party' AS type,pa.id,pa.image_key,'ปาร์ตี้' AS detail,pa.created_at,submitter.display_name AS submitted_by FROM party_activities pa LEFT JOIN members submitter ON submitter.id=pa.submitted_by_member_id WHERE pa.status='pending') x ORDER BY created_at DESC LIMIT 200").bind().all()
        : empty,
    ]);
    // Dependent on partyBase.id, so it can't join the batch above. It stays on
    // every request because myParty is core chrome (MissionControl reads it).
    const party = await partyDetails(partyBase);
    // View-scoped keys are omitted (not sent as []) when they weren't asked
    // for, so the client can merge a response over what it already has
    // without a poll for one view wiping another view's loaded data.
    return json({
      view,
      me: { id: me.id, name: me.display_name, role: me.role, score: (score as any)?.total || 0 },
      date,
      members: members.results,
      airdrops: airdrops.results,
      favorites: favorites.results.map((x: any) => x.favorite_member_id),
      leaderboard: leaderboard.results,
      myParty: party,
      ...(wants.party && {
        parties: parties.results,
        partyInvites: partyInvites.results,
        openParties: openParties.results,
      }),
      ...(wants.admin && {
        managedMembers: managed.results,
        pending: pending.results,
      }),
      ...(wants.leave && { leaveRequests: leaveRequests.results }),
      ...(wants.log && { submissionLog: submissionLog.results }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ";
    return json({ error: message }, message.includes("เข้าสู่ระบบ") ? 401 : 500);
  }
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request), body = await request.json();
    if (body.action === "favorite") {
      const id = Number(body.memberId);
      if (!id || sameId(id, me.id)) throw Error("เลือกสมาชิกไม่ถูกต้อง");
      const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(id).first();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (body.enabled)
        await db.prepare("INSERT INTO member_favorites (owner_member_id,favorite_member_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING").bind(me.id, id, now()).run();
      else await db.prepare("DELETE FROM member_favorites WHERE owner_member_id=? AND favorite_member_id=?").bind(me.id, id).run();
      return json({ ok: true });
    }
    if (body.action === "approve") {
      const admin = await requireAdmin(request), type = validType(body.type), id = Number(body.id);
      const table = type === "party" ? "party_activities" : "airdrop_submissions", points = type === "party" ? 1 : 3;
      const updated = await db.prepare(`UPDATE ${table} SET status='approved',approved_by=? WHERE id=? AND status='pending' RETURNING image_key`).bind(admin.id, id).first<any>();
      if (!updated) throw Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
      const recipients = type === "party"
        ? await db.prepare("SELECT member_id FROM party_activity_members WHERE party_activity_id=?").bind(id).all<any>()
        : { results: [await db.prepare("SELECT member_id FROM airdrop_submissions WHERE id=?").bind(id).first<any>()] };
      await db.batch(
        recipients.results.filter(Boolean).map((r: any) =>
          db.prepare("INSERT INTO point_ledger (member_id,source,source_id,points,note,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING")
            .bind(r.member_id, type, id, points, type === "party" ? "ปาร์ตี้ตรวจผ่าน" : "แอร์ดรอปตรวจผ่าน", now())
        )
      );
      // Evidence is only needed until it's verified — delete it once approved
      // so storage doesn't fill up. Best-effort: never fail the approval over it.
      if (updated.image_key) await storage.delete(updated.image_key).catch(() => {});
      return json({ ok: true });
    }
    if (body.action === "reject") {
      const admin = await requireAdmin(request), type = validType(body.type), table = type === "party" ? "party_activities" : "airdrop_submissions";
      const r = await db.prepare(`UPDATE ${table} SET status='rejected',approved_by=? WHERE id=? AND status='pending'`).bind(admin.id, Number(body.id)).run();
      if (!r.meta.changes) throw Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
      return json({ ok: true });
    }
    if (body.action === "admin_access") {
      const sam = await requireSam(request), id = Number(body.memberId);
      if (!id || sameId(id, sam.id)) throw Error("ไม่สามารถเปลี่ยนสิทธิ์บัญชีเจ้าของแก๊งได้");
      const target = await db.prepare("SELECT id,active,is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target || !target.active) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (target.is_primary_admin) throw Error("บัญชีเจ้าของแก๊งไม่สามารถเปลี่ยนสิทธิ์ได้");
      await db.prepare("UPDATE members SET role=? WHERE id=? AND active=1").bind(body.enabled ? "admin" : "member", id).run();
      return json({ ok: true });
    }
    if (body.action === "leave_request") {
      const requestedId = Number(body.memberId) || Number(me.id);
      if (!sameId(requestedId, me.id)) await requireAdmin(request);
      const leaveDate = String(body.leaveDate || "").trim();
      const reason = String(body.reason || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) throw Error("เลือกวันที่ไม่ถูกต้อง");
      if (reason.length < 2 || reason.length > 200) throw Error("กรอกเหตุผลการลา 2–200 ตัวอักษร");
      const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(requestedId).first();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      await db.prepare(
        "INSERT INTO leave_requests (member_id,leave_date,reason,created_by,created_at) VALUES (?,?,?,?,?) ON CONFLICT (member_id,leave_date) DO UPDATE SET reason=EXCLUDED.reason,created_by=EXCLUDED.created_by,created_at=EXCLUDED.created_at"
      ).bind(requestedId, leaveDate, reason, me.id, now()).run();
      return json({ ok: true });
    }
    if (body.action === "member") {
      await requireAdmin(request);
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 60) throw Error("กรอกชื่อสมาชิก 2–60 ตัวอักษร");
      const exists = await db.prepare("SELECT id FROM members WHERE lower(display_name)=lower(?)").bind(name).first();
      if (exists) throw Error("มีชื่อสมาชิกนี้แล้ว");
      await db.prepare("INSERT INTO members (username,display_name,role,active,created_at) VALUES (?,?,'member',1,?)").bind(`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, name, now()).run();
      return json({ ok: true });
    }
    if (body.action === "member_update") {
      await requireAdmin(request);
      const id = Number(body.id), name = String(body.name || "").trim();
      if (!id || name.length < 2 || name.length > 60) throw Error("กรอกชื่อสมาชิก 2–60 ตัวอักษร");
      const target = await db.prepare("SELECT is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (target.is_primary_admin) throw Error("ไม่สามารถแก้ชื่อบัญชีเจ้าของแก๊งได้");
      const exists = await db.prepare("SELECT id FROM members WHERE lower(display_name)=lower(?) AND id<>?").bind(name, id).first();
      if (exists) throw Error("มีชื่อสมาชิกนี้แล้ว");
      const r = await db.prepare("UPDATE members SET display_name=? WHERE id=? AND active=1").bind(name, id).run();
      if (!r.meta.changes) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      return json({ ok: true });
    }
    if (body.action === "member_delete") {
      const admin = await requireAdmin(request), id = Number(body.id);
      if (!id || sameId(id, admin.id)) throw Error("ไม่สามารถเอาบัญชีแอดมินของตัวเองออกได้");
      const target = await db.prepare("SELECT is_primary_admin FROM members WHERE id=?").bind(id).first<any>();
      if (!target || target.is_primary_admin) throw Error("ไม่สามารถปิดใช้งานบัญชีเจ้าของแก๊งได้");
      const owned = await db.prepare("SELECT id FROM parties WHERE owner_member_id=? AND status IN ('open','locked')").bind(id).all<any>();
      const statements = [
        db.prepare("DELETE FROM party_members WHERE member_id=?").bind(id),
        db.prepare("DELETE FROM party_invites WHERE invitee_member_id=? OR inviter_member_id=?").bind(id, id),
        db.prepare("UPDATE members SET active=0 WHERE id=?").bind(id),
        db.prepare("DELETE FROM sessions WHERE member_id=?").bind(id),
      ];
      for (const row of owned.results) {
        const next = await db.prepare("SELECT member_id FROM party_members WHERE party_id=? AND member_id<>? ORDER BY id LIMIT 1").bind(row.id, id).first<any>();
        statements.push(
          next
            ? db.prepare("UPDATE parties SET owner_member_id=? WHERE id=?").bind(next.member_id, row.id)
            : db.prepare("UPDATE parties SET status='completed',active=0 WHERE id=?").bind(row.id)
        );
      }
      await db.batch(statements);
      return json({ ok: true });
    }
    if (body.action === "member_pin_reset") {
      const admin = await requireAdmin(request), id = Number(body.id);
      if (!id) throw Error("ไม่พบสมาชิก");
      const target = await db.prepare("SELECT id,is_primary_admin FROM members WHERE id=? AND active=1").bind(id).first<any>();
      if (!target) throw Error("ไม่พบสมาชิกที่ใช้งานอยู่");
      if (target.is_primary_admin && !sameId(id, admin.id)) throw Error("ไม่สามารถรีเซ็ต PIN บัญชีเจ้าของแก๊งได้");
      await db.prepare("UPDATE members SET pin_hash=NULL WHERE id=?").bind(id).run();
      return json({ ok: true });
    }
    if (body.action === "member_pin_reset_all") {
      await requireSam(request);
      await db.prepare("UPDATE members SET pin_hash=NULL WHERE active=1 AND is_primary_admin=0").bind().run();
      return json({ ok: true });
    }
    throw Error("คำสั่งไม่ถูกต้อง");
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, 400);
  }
}
