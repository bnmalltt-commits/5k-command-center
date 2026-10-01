import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { now, thaiDate, currentMember, discordLinked, NEEDS_DISCORD } from "@/lib/auth";
import { notifyEvidence } from "@/lib/notify";
import { KIND_LABEL, KIND_POINTS } from "@/lib/points";

export const maxDuration = 30;

const rules: Record<string, [string, number[]]> = {
  "image/jpeg": ["jpg", [255, 216, 255]],
  "image/png": ["png", [137, 80, 78, 71]],
  "image/webp": ["webp", [82, 73, 70, 70]],
};

async function image(file: File) {
  const rule = rules[file.type];
  // Vercel caps the whole request at 4.5 MB, so a larger limit here was never
  // reachable; the client shrinks big photos to fit before sending.
  if (!rule || file.size > 4.4 * 1024 * 1024) throw Error("ใช้ไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 4 MB");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!rule[1].every((n, i) => bytes[i] === n) || (file.type === "image/webp" && String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"))
    throw Error("ชนิดไฟล์รูปภาพไม่ถูกต้อง");
  return rule[0];
}

export async function POST(r: Request) {
  let key = "";
  try {
    const member = await currentMember(r);
    if (!member) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    if (!discordLinked(member)) return Response.json({ error: NEEDS_DISCORD }, { status: 403 });
    const form = await r.formData(), file = form.get("image"), type = String(form.get("type"));
    if (!(file instanceof File) || !file.size) throw Error("กรุณาเลือกรูปหลักฐาน");
    const ext = await image(file), today = thaiDate();
    // Exact-duplicate guard: the same file can't earn points twice. Hashes are
    // kept after approved images are deleted, so old evidence stays covered.
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const seen = await db.prepare("SELECT activity_date FROM airdrop_submissions WHERE image_hash=? UNION ALL SELECT activity_date FROM party_activities WHERE image_hash=? LIMIT 1").bind(hash, hash).first<any>();
    if (seen) throw Error(`รูปนี้เคยส่งแล้ว (${seen.activity_date}) ใช้รูปใหม่ที่ถ่ายหรือแคปตอนนี้`);

    if (type === "airdrop") {
      const round = String(form.get("round"));
      if (!["17:00", "20:00", "23:00", "01:00"].includes(round)) throw Error("เลือกรอบไม่ถูกต้อง");
      const old = await db.prepare("SELECT id,status,image_key FROM airdrop_submissions WHERE member_id=? AND activity_date=? AND round_time=?").bind(member.id, today, round).first<any>();
      if (old?.status === "approved") throw Error("หลักฐานที่ผ่านแล้วไม่สามารถแก้ไขได้");
      key = `airdrop/${member.id}/${Date.now()}.${ext}`;
      await storage.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      let evidenceId = old?.id;
      if (old) {
        const updated = await db.prepare("UPDATE airdrop_submissions SET image_key=?,image_hash=?,reject_reason=NULL,status='pending',approved_by=NULL,created_at=? WHERE id=? AND status<>'approved'").bind(key, hash, now(), old.id).run();
        if (!updated.meta.changes) throw Error("หลักฐานรายการนี้เพิ่งผ่านการตรวจ จึงแก้ไขไม่ได้");
      } else {
        evidenceId = (await db.prepare("INSERT INTO airdrop_submissions (member_id,activity_date,round_time,image_key,image_hash,status,created_at) VALUES (?,?,?,?,?, 'pending',?) RETURNING id").bind(member.id, today, round, key, hash, now()).first<any>())?.id;
      }
      if (old?.image_key) await storage.delete(old.image_key);
      await notifyEvidence({
        title: `${member.display_name} ${old ? "ส่งหลักฐานแอร์ดรอปใหม่" : "ส่งหลักฐานแอร์ดรอป"}`,
        lines: [
          ["ประเภท", "แอร์ดรอป"],
          ["รอบ", round],
          ["วันที่", today],
          ["สถานะ", old?.status === "rejected" ? "ส่งใหม่หลังไม่ผ่าน" : old ? "แก้ไขหลักฐาน" : "รอตรวจ"],
        ],
        image: file,
        ext,
        review: { type: "airdrop", id: evidenceId },
      });
    } else if (type === "party") {
      // Team evidence is a shop raid (งัดร้าน) or a loop (ลูป).
      const kind = form.get("kind") === "loop" ? "loop" : "shop";
      const ids = JSON.parse(String(form.get("memberIds") || "[]")).map(Number);
      // Postgres bigint columns come back as strings from this driver, so
      // member.id must be coerced before comparing against the numeric ids.
      const myId = Number(member.id);
      if (ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length) throw Error("เลือกสมาชิกปาร์ตี้ได้ 1 ถึง 5 คน");
      if (!ids.includes(myId)) throw Error("ต้องมีตัวคุณเองอยู่ในรายชื่อที่ส่ง");
      // The submitter can only claim points for people who are actually their
      // current teammates — otherwise anyone could name arbitrary members and
      // farm points for them once an admin approves the photo.
      const myParty = await db.prepare("SELECT p.id,p.name FROM parties p JOIN party_members pm ON pm.party_id=p.id WHERE pm.member_id=? AND p.status IN ('open','locked') LIMIT 1").bind(myId).first<any>();
      if (!myParty) throw Error("คุณยังไม่ได้อยู่ในปาร์ตี้");
      const roster = await db.prepare("SELECT member_id FROM party_members WHERE party_id=?").bind(myParty.id).all<any>();
      const rosterIds = new Set(roster.results.map((r: any) => Number(r.member_id)));
      if (!ids.every((id: number) => rosterIds.has(id))) throw Error("เลือกได้เฉพาะสมาชิกในปาร์ตี้ของคุณ");
      key = `party/${member.id}/${Date.now()}.${ext}`;
      await storage.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      const shopName = kind === "shop" ? String(form.get("shopName") || "").trim().slice(0, 60) || null : null;
      const party = await db.prepare("INSERT INTO parties (name,shop_name,active) VALUES (?,?,0) RETURNING id").bind(`กิจกรรม ${today} ${Date.now()}`, shopName).first<any>();
      const activity = await db.prepare("INSERT INTO party_activities (party_id,activity_date,image_key,image_hash,status,submitted_by_member_id,created_at,kind) VALUES (?,?,?,?,'pending',?,?,?) RETURNING id").bind(party.id, today, key, hash, member.id, now(), kind).first<any>();
      await db.batch(ids.map((id: number) => db.prepare("INSERT INTO party_activity_members (party_activity_id,member_id) VALUES (?,?)").bind(activity.id, id)));
      const names = await db.prepare("SELECT display_name FROM members WHERE id = ANY(?::bigint[]) ORDER BY display_name").bind(ids).all<any>();
      await notifyEvidence({
        title: `${member.display_name} ส่งหลักฐาน${KIND_LABEL[kind]}`,
        lines: [
          ["ประเภท", `${KIND_LABEL[kind]} · +${KIND_POINTS[kind]} แต้ม/คน`],
          ["ทีม", myParty.name],
          ...(kind === "shop" ? [["ร้าน", shopName || "ไม่ได้ระบุ"] as [string, unknown]] : []),
          ["จำนวน", `${ids.length} คน`],
          // One box per member so every name shows in full.
          ...names.results.map((r: any, i: number): [string, unknown] => [`สมาชิก ${i + 1}`, r.display_name]),
          ["วันที่", today],
          ["สถานะ", "รอตรวจ"],
        ],
        image: file,
        ext,
        review: { type: "party", id: activity.id },
      });
    } else throw Error("ประเภทไม่ถูกต้อง");

    return Response.json({ ok: true });
  } catch (e) {
    if (key) await storage.delete(key);
    return Response.json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }, { status: 400 });
  }
}
