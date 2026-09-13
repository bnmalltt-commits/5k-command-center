import { env } from "cloudflare:workers";

const date = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const now = () => new Date().toISOString();
export async function POST(request: Request) {
  try {
    const session = request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;]+)/); if (!session) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
    const me = await env.DB.prepare("SELECT members.* FROM sessions JOIN members ON members.id=sessions.member_id WHERE sessions.token=? AND sessions.expires_at>? AND members.active=1").bind(session[1], now()).first<any>(); if (!me) return Response.json({ error: "ไม่พบสมาชิก" }, { status: 403 });
    const form = await request.formData(); const file = form.get("image"); const type = String(form.get("type"));
    if (!(file instanceof File) || !file.size) throw new Error("กรุณาเลือกรูปหลักฐาน");
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) throw new Error("ใช้รูปภาพขนาดไม่เกิน 8 MB");
    const key = `${type}/${me.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
    if (type === "airdrop") { const round = String(form.get("round")); if (round !== "20:00" && round !== "22:00") throw new Error("เลือกรอบไม่ถูกต้อง"); await env.DB.prepare("INSERT INTO airdrop_submissions (member_id, activity_date, round_time, image_key, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").bind(me.id, date(), round, key, now()).run(); }
    else if (type === "party") { const ids = JSON.parse(String(form.get("memberIds") || "[]")).map(Number); if (ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length) throw new Error("เลือกสมาชิกปาร์ตี้ได้ 1 ถึง 5 คน"); const check = await env.DB.prepare(`SELECT id FROM members WHERE active = 1 AND id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all(); if (check.results.length !== ids.length) throw new Error("พบสมาชิกที่เลือกไม่ถูกต้อง"); const party = await env.DB.prepare("INSERT INTO parties (name, active) VALUES (?, 0)").bind(`กิจกรรม ${date()} ${Date.now()}`).run(); const activity = await env.DB.prepare("INSERT INTO party_activities (party_id, activity_date, image_key, status, created_at) VALUES (?, ?, ?, 'pending', ?)").bind(party.meta.last_row_id, date(), key, now()).run(); await env.DB.batch(ids.map((memberId:number) => env.DB.prepare("INSERT INTO party_activity_members (party_activity_id, member_id) VALUES (?, ?)").bind(activity.meta.last_row_id, memberId))); }
    else throw new Error("ประเภทไม่ถูกต้อง");
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ" }, { status: 400 }); }
}

