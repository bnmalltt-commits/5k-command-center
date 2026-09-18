import { db } from "@/lib/db";
import { now, requireMember, json } from "@/lib/auth";

async function activeParty(memberId: number) {
  return db
    .prepare("SELECT p.id,p.name,p.status,p.owner_member_id FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.member_id=? AND p.status IN ('open','locked') LIMIT 1")
    .bind(memberId)
    .first<any>();
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request), body = await request.json();

    if (body.action === "party_create") {
      const name = String(body.name || "").trim();
      const memberIds: number[] = [...new Set<number>((Array.isArray(body.memberIds) ? body.memberIds : []).map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id !== me.id))];
      if (name.length < 2 || name.length > 40) throw Error("ชื่อปาร์ตี้ต้องมี 2–40 ตัวอักษร");
      if (memberIds.length > 4) throw Error("เลือกสมาชิกได้สูงสุด 4 คน");
      if (await activeParty(me.id)) throw Error("คุณอยู่ในปาร์ตี้ที่กำลังใช้งานอยู่แล้ว");
      for (const memberId of memberIds) {
        const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(memberId).first();
        if (!target || (await activeParty(memberId))) throw Error("สมาชิกที่เลือกบางคนอยู่ในปาร์ตี้อื่นหรือใช้งานไม่ได้");
      }
      const party = await db.prepare("INSERT INTO parties (name,owner_member_id,status,active) VALUES (?,?,?,1) RETURNING id").bind(name, me.id, "open").first<any>();
      const partyId = Number(party.id);
      await db.batch([
        db.prepare("INSERT INTO party_members (party_id,member_id,joined_at) VALUES (?,?,?)").bind(partyId, me.id, now()),
        ...memberIds.map((memberId) => db.prepare("INSERT INTO party_invites (party_id,inviter_member_id,invitee_member_id,status,created_at) VALUES (?,?,?,?,?)").bind(partyId, me.id, memberId, "pending", now())),
      ]);
      return json({ ok: true });
    }

    if (body.action === "party_update") {
      const partyId = Number(body.partyId), name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 40) throw Error("ชื่อปาร์ตี้ต้องมี 2–40 ตัวอักษร");
      const party = await db.prepare("SELECT id,owner_member_id,status,active FROM parties WHERE id=?").bind(partyId).first<any>();
      if (!party || !party.active || party.status !== "open" || (party.owner_member_id !== me.id && me.role !== "admin")) throw Error("แก้ไขได้เฉพาะหัวหน้าปาร์ตี้หรือแอดมินก่อนล็อกทีม");
      await db.prepare("UPDATE parties SET name=? WHERE id=? AND status='open'").bind(name, partyId).run();
      return json({ ok: true });
    }

    if (body.action === "party_invite") {
      const partyId = Number(body.partyId), memberId = Number(body.memberId);
      const party = await db.prepare("SELECT id,owner_member_id,status FROM parties WHERE id=? AND active=1").bind(partyId).first<any>();
      if (!party || party.owner_member_id !== me.id || party.status !== "open") throw Error("เฉพาะหัวหน้าปาร์ตี้ที่เปิดรับสมาชิกเท่านั้น");
      const count = await db.prepare("SELECT COUNT(*) AS total FROM party_members WHERE party_id=?").bind(partyId).first<any>();
      if (Number(count?.total || 0) >= 5) throw Error("ปาร์ตี้เต็มแล้ว");
      const target = await db.prepare("SELECT id FROM members WHERE id=? AND active=1").bind(memberId).first();
      if (!target || memberId === me.id) throw Error("ไม่พบสมาชิกที่เลือก");
      if (await activeParty(memberId)) throw Error("สมาชิกคนนี้อยู่ในปาร์ตี้อื่นแล้ว");
      const existing = await db.prepare("SELECT id,status FROM party_invites WHERE party_id=? AND invitee_member_id=?").bind(partyId, memberId).first<any>();
      if (existing) await db.prepare("UPDATE party_invites SET inviter_member_id=?,status='pending',created_at=?,responded_at=NULL WHERE id=?").bind(me.id, now(), existing.id).run();
      else await db.prepare("INSERT INTO party_invites (party_id,inviter_member_id,invitee_member_id,status,created_at) VALUES (?,?,?,'pending',?)").bind(partyId, me.id, memberId, now()).run();
      return json({ ok: true });
    }

    if (body.action === "party_respond") {
      const inviteId = Number(body.inviteId);
      const invite = await db.prepare("SELECT i.id,i.party_id,p.status FROM party_invites i JOIN parties p ON p.id=i.party_id WHERE i.id=? AND i.invitee_member_id=? AND i.status='pending'").bind(inviteId, me.id).first<any>();
      if (!invite) throw Error("ไม่พบคำเชิญหรือคำเชิญหมดอายุแล้ว");
      if (body.accept) {
        const joined = await db.prepare(
          "INSERT INTO party_members (party_id,member_id,joined_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM party_invites i JOIN parties p ON p.id=i.party_id WHERE i.id=? AND i.invitee_member_id=? AND i.status='pending' AND p.status='open' AND p.active=1) AND (SELECT COUNT(*) FROM party_members WHERE party_id=?)<5 AND NOT EXISTS (SELECT 1 FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.member_id=? AND p.status IN ('open','locked'))"
        ).bind(invite.party_id, me.id, now(), inviteId, me.id, invite.party_id, me.id).run();
        if (!joined.meta.changes) throw Error("ปาร์ตี้นี้เต็ม ปิดรับสมาชิกแล้ว หรือคุณอยู่ในทีมอื่น");
        await db.prepare("UPDATE party_invites SET status='accepted',responded_at=? WHERE id=? AND status='pending'").bind(now(), inviteId).run();
      } else {
        await db.prepare("UPDATE party_invites SET status='rejected',responded_at=? WHERE id=? AND status='pending'").bind(now(), inviteId).run();
      }
      return json({ ok: true });
    }

    if (body.action === "party_join") {
      const partyId = Number(body.partyId);
      if (await activeParty(me.id)) throw Error("คุณอยู่ในปาร์ตี้ที่กำลังใช้งานอยู่แล้ว");
      const joined = await db.prepare(
        "INSERT INTO party_members (party_id,member_id,joined_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM parties WHERE id=? AND status='open' AND active=1) AND (SELECT COUNT(*) FROM party_members WHERE party_id=?)<5 AND NOT EXISTS (SELECT 1 FROM party_members pm JOIN parties p ON p.id=pm.party_id WHERE pm.member_id=? AND p.status IN ('open','locked'))"
      ).bind(partyId, me.id, now(), partyId, partyId, me.id).run();
      if (!joined.meta.changes) throw Error("ปาร์ตี้นี้เต็ม ปิดรับสมาชิกแล้ว หรือคุณอยู่ในทีมอื่น");
      return json({ ok: true });
    }

    if (body.action === "party_lock") {
      const party = await db.prepare("SELECT id,owner_member_id FROM parties WHERE id=? AND active=1").bind(Number(body.partyId)).first<any>();
      if (!party || party.owner_member_id !== me.id) throw Error("เฉพาะหัวหน้าปาร์ตี้เท่านั้น");
      const status = body.locked ? "locked" : "open";
      await db.prepare("UPDATE parties SET status=? WHERE id=?").bind(status, party.id).run();
      return json({ ok: true });
    }

    if (body.action === "party_dissolve") {
      const party = await db.prepare("SELECT id,owner_member_id,status,active FROM parties WHERE id=?").bind(Number(body.partyId)).first<any>();
      if (!party || !party.active || !["open", "locked"].includes(party.status) || party.owner_member_id !== me.id) throw Error("เฉพาะหัวหน้าปาร์ตี้ของทีมที่กำลังใช้งานเท่านั้น");
      await db.batch([
        db.prepare("UPDATE parties SET status='completed',active=0 WHERE id=?").bind(party.id),
        db.prepare("DELETE FROM party_members WHERE party_id=?").bind(party.id),
      ]);
      return json({ ok: true });
    }

    if (body.action === "party_leave") {
      const party = await db.prepare("SELECT p.id,p.owner_member_id FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.member_id=? AND p.status IN ('open','locked') LIMIT 1").bind(me.id).first<any>();
      if (!party) throw Error("คุณไม่ได้อยู่ในปาร์ตี้");
      const next = party.owner_member_id === me.id ? await db.prepare("SELECT member_id FROM party_members WHERE party_id=? AND member_id<>? ORDER BY id LIMIT 1").bind(party.id, me.id).first<any>() : null;
      const statements = [db.prepare("DELETE FROM party_members WHERE party_id=? AND member_id=?").bind(party.id, me.id)];
      if (next) statements.push(db.prepare("UPDATE parties SET owner_member_id=? WHERE id=?").bind(next.member_id, party.id));
      else if (party.owner_member_id === me.id) statements.push(db.prepare("UPDATE parties SET status='completed',active=0 WHERE id=?").bind(party.id));
      await db.batch(statements);
      return json({ ok: true });
    }

    if (body.action === "party_remove_member") {
      const party = await activeParty(me.id);
      if (!party || party.owner_member_id !== me.id) throw Error("เฉพาะหัวหน้าปาร์ตี้เท่านั้น");
      const memberId = Number(body.memberId);
      if (memberId === me.id) throw Error("หัวหน้าต้องใช้ปุ่มออกจากปาร์ตี้");
      await db.prepare("DELETE FROM party_members WHERE party_id=? AND member_id=?").bind(party.id, memberId).run();
      return json({ ok: true });
    }

    throw Error("คำสั่งปาร์ตี้ไม่ถูกต้อง");
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "บันทึกปาร์ตี้ไม่สำเร็จ" }, 400);
  }
}
