import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { now, thaiDate, currentMember } from "@/lib/auth";

export const maxDuration = 30;

const rules: Record<string, [string, number[]]> = {
  "image/jpeg": ["jpg", [255, 216, 255]],
  "image/png": ["png", [137, 80, 78, 71]],
  "image/webp": ["webp", [82, 73, 70, 70]],
};

async function image(file: File) {
  const rule = rules[file.type];
  if (!rule || file.size > 8 * 1024 * 1024) throw Error("ใช้ไฟล์ JPG, PNG หรือ WebP ขนาดไม่เกิน 8 MB");
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
    const form = await r.formData(), file = form.get("image"), type = String(form.get("type"));
    if (!(file instanceof File) || !file.size) throw Error("กรุณาเลือกรูปหลักฐาน");
    const ext = await image(file), today = thaiDate();

    if (type === "airdrop") {
      const round = String(form.get("round"));
      if (!["17:00", "20:00", "23:00", "01:00"].includes(round)) throw Error("เลือกรอบไม่ถูกต้อง");
      const old = await db.prepare("SELECT id,status,image_key FROM airdrop_submissions WHERE member_id=? AND activity_date=? AND round_time=?").bind(member.id, today, round).first<any>();
      if (old?.status === "approved") throw Error("หลักฐานที่ผ่านแล้วไม่สามารถแก้ไขได้");
      key = `airdrop/${member.id}/${Date.now()}.${ext}`;
      await storage.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      if (old) {
        const updated = await db.prepare("UPDATE airdrop_submissions SET image_key=?,status='pending',approved_by=NULL,created_at=? WHERE id=? AND status<>'approved'").bind(key, now(), old.id).run();
        if (!updated.meta.changes) throw Error("หลักฐานรายการนี้เพิ่งผ่านการตรวจ จึงแก้ไขไม่ได้");
      } else {
        await db.prepare("INSERT INTO airdrop_submissions (member_id,activity_date,round_time,image_key,status,created_at) VALUES (?,?,?,?, 'pending',?)").bind(member.id, today, round, key, now()).run();
      }
      if (old?.image_key) await storage.delete(old.image_key);
    } else if (type === "party") {
      const ids = JSON.parse(String(form.get("memberIds") || "[]")).map(Number);
      if (ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length) throw Error("เลือกสมาชิกปาร์ตี้ได้ 1 ถึง 5 คน");
      const check = await db.prepare(`SELECT id FROM members WHERE active=1 AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
      if (check.results.length !== ids.length) throw Error("พบสมาชิกที่เลือกไม่ถูกต้อง");
      key = `party/${member.id}/${Date.now()}.${ext}`;
      await storage.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      const party = await db.prepare("INSERT INTO parties (name,active) VALUES (?,0) RETURNING id").bind(`กิจกรรม ${today} ${Date.now()}`).first<any>();
      const activity = await db.prepare("INSERT INTO party_activities (party_id,activity_date,image_key,status,submitted_by_member_id,created_at) VALUES (?,?,?,'pending',?,?) RETURNING id").bind(party.id, today, key, member.id, now()).first<any>();
      await db.batch(ids.map((id: number) => db.prepare("INSERT INTO party_activity_members (party_activity_id,member_id) VALUES (?,?)").bind(activity.id, id)));
    } else throw Error("ประเภทไม่ถูกต้อง");

    return Response.json({ ok: true });
  } catch (e) {
    if (key) await storage.delete(key);
    return Response.json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }, { status: 400 });
  }
}
