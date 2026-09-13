import { env } from "cloudflare:workers";

const thaiDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const now = () => new Date().toISOString();
const json = (data: unknown, status = 200) => Response.json(data, { status });

async function currentMember(request: Request) {
  const c=request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;]+)/); if(!c)return null;
  const member=await env.DB.prepare("SELECT * FROM sessions JOIN members ON members.id=sessions.member_id WHERE sessions.token=? AND sessions.expires_at>? AND members.active=1").bind(c[1],now()).first<any>();
  if(member){const admins=await env.DB.prepare("SELECT COUNT(*) AS total FROM members WHERE role='admin' AND active=1").first<any>();if(Number(admins?.total||0)===0 || String(member.display_name).trim().toLowerCase()==="sam"){await env.DB.prepare("UPDATE members SET role='admin' WHERE id=?").bind(member.id).run();member.role="admin";}}
  return member;
  /*
  const existing = await env.DB.prepare("SELECT * FROM members WHERE external_user_id = ?").bind(user.userId).first<any>();
  if (existing) {
    if (!existing.email) await env.DB.prepare("UPDATE members SET email = ? WHERE id = ?").bind(user.email.toLowerCase(), existing.id).run();
    return existing;
  }
  const invited = await env.DB.prepare("SELECT * FROM members WHERE lower(email) = lower(?) AND external_user_id IS NULL").bind(user.email).first<any>();
  if (invited) {
    await env.DB.prepare("UPDATE members SET external_user_id = ? WHERE id = ?").bind(user.userId, invited.id).run();
    return { ...invited, external_user_id: user.userId };
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM members").first<{ total: number }>();
  const username = (user.email.split("@")[0] || "member").slice(0, 30);
  const suffix = user.userId.slice(-6);
  if ((count?.total || 0) > 0) throw new Error("แอดมินยังไม่ได้เพิ่มอีเมลนี้เป็นสมาชิก");
  await env.DB.prepare("INSERT INTO members (username, external_user_id, email, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 'admin', 1, ?)")
    .bind(`${username}-${suffix}`, user.userId, user.email.toLowerCase(), user.fullName || user.displayName, now()).run();
  return env.DB.prepare("SELECT * FROM members WHERE external_user_id = ?").bind(user.userId).first<any>();*/
}

async function requireMember(request: Request) {
  const member = await currentMember(request);
  if (!member) throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน");
  return member;
}
async function requireAdmin(request: Request) { const member = await requireMember(request); if (member.role !== "admin") throw new Error("เฉพาะแอดมินเท่านั้น"); return member; }

export async function GET(request: Request) {
  try {
    const me = await requireMember(request);
    const date = thaiDate();
    const [members, airdrops, partyActivities, favorites, leaderboard] = await Promise.all([
      env.DB.prepare("SELECT id, display_name, email, role, active FROM members ORDER BY active DESC, display_name").all(),
      env.DB.prepare("SELECT id, round_time, status, image_key, created_at FROM airdrop_submissions WHERE member_id = ? ORDER BY activity_date DESC, round_time DESC LIMIT 30").bind(me.id).all(),
      env.DB.prepare("SELECT pa.id, pa.status, pa.image_key, pa.activity_date, pa.created_at, GROUP_CONCAT(m.display_name, ' · ') AS members FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id = pa.id JOIN members m ON m.id = pam.member_id WHERE pam.member_id = ? GROUP BY pa.id ORDER BY pa.created_at DESC LIMIT 30").bind(me.id).all(),
      env.DB.prepare("SELECT favorite_member_id FROM member_favorites WHERE owner_member_id = ?").bind(me.id).all(),
      env.DB.prepare("SELECT m.id, m.display_name, COALESCE(SUM(pl.points), 0) AS score FROM members m LEFT JOIN point_ledger pl ON pl.member_id = m.id WHERE m.active = 1 GROUP BY m.id ORDER BY score DESC, m.display_name LIMIT 25").all(),
    ]);
    const pending = me.role === "admin" ? await env.DB.prepare("SELECT 'airdrop' AS type, id, image_key, round_time AS detail, created_at FROM airdrop_submissions WHERE status = 'pending' UNION ALL SELECT 'party' AS type, id, image_key, 'ปาร์ตี้ 5 คน' AS detail, created_at FROM party_activities WHERE status = 'pending' ORDER BY created_at DESC").all() : { results: [] };
    const score = await env.DB.prepare("SELECT COALESCE(SUM(points),0) AS total FROM point_ledger WHERE member_id = ?").bind(me.id).first<{total:number}>();
    return json({ me: { id: me.id, name: me.display_name, role: me.role, score: score?.total || 0 }, date, members: members.results, airdrops: airdrops.results, parties: partyActivities.results, favorites: favorites.results.map((f:any) => f.favorite_member_id), leaderboard: leaderboard.results, pending: pending.results });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ" }, 401); }
}

export async function POST(request: Request) {
  try {
    const me = await requireMember(request);
    const body = await request.json<any>();
    if (body.action === "favorite") {
      const id = Number(body.memberId); if (!id || id === me.id) throw new Error("เลือกสมาชิกไม่ถูกต้อง");
      if (body.enabled) await env.DB.prepare("INSERT OR IGNORE INTO member_favorites (owner_member_id, favorite_member_id, created_at) VALUES (?, ?, ?)").bind(me.id, id, now()).run();
      else await env.DB.prepare("DELETE FROM member_favorites WHERE owner_member_id = ? AND favorite_member_id = ?").bind(me.id, id).run();
      return json({ ok: true });
    }
    if (body.action === "approve") {
      await requireAdmin(request); const id = Number(body.id); const points = body.type === "party" ? 1 : 3;
      const table = body.type === "party" ? "party_activities" : "airdrop_submissions";
      const target = await env.DB.prepare(`SELECT id, status FROM ${table} WHERE id = ?`).bind(id).first<any>();
      if (!target || target.status !== "pending") throw new Error("รายการนี้ตรวจไปแล้วหรือไม่พบข้อมูล");
      const recipients = body.type === "party" ? await env.DB.prepare("SELECT member_id FROM party_activity_members WHERE party_activity_id = ?").bind(id).all<any>() : { results: [await env.DB.prepare("SELECT member_id FROM airdrop_submissions WHERE id = ?").bind(id).first<any>()] };
      const statements = [env.DB.prepare(`UPDATE ${table} SET status = 'approved', approved_by = ? WHERE id = ?`).bind(me.id, id), ...recipients.results.filter(Boolean).map((r:any) => env.DB.prepare("INSERT OR IGNORE INTO point_ledger (member_id, source, source_id, points, note, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(r.member_id, body.type, id, points, body.type === "party" ? "ปาร์ตี้ตรวจผ่าน" : "แอร์ดรอปตรวจผ่าน", now()))];
      await env.DB.batch(statements); return json({ ok: true });
    }
    if (body.action === "reject") { const admin = await requireAdmin(request); const table = body.type === "party" ? "party_activities" : "airdrop_submissions"; await env.DB.prepare(`UPDATE ${table} SET status = 'rejected', approved_by = ? WHERE id = ? AND status = 'pending'`).bind(admin.id, Number(body.id)).run(); return json({ ok: true }); }
    if (body.action === "member") { await requireAdmin(request); const name = String(body.name || "").trim(); const email = String(body.email || "").trim().toLowerCase(); if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("กรอกชื่อและอีเมลสมาชิกให้ถูกต้อง"); const username = email.split("@")[0].replace(/[^a-z0-9]+/g,"-") + "-" + Date.now().toString().slice(-5); await env.DB.prepare("INSERT INTO members (username, email, display_name, role, active, created_at) VALUES (?, ?, ?, 'member', 1, ?)").bind(username, email, name, now()).run(); return json({ ok: true }); }
    if (body.action === "member_update") { await requireAdmin(request); const id=Number(body.id); const name=String(body.name||"").trim(); if(!id||!name) throw new Error("กรอกชื่อสมาชิก"); await env.DB.prepare("UPDATE members SET display_name=? WHERE id=? AND active=1").bind(name,id).run(); return json({ok:true}); }
    if (body.action === "member_delete") { const admin=await requireAdmin(request); const id=Number(body.id); if(!id||id===admin.id) throw new Error("ไม่สามารถปิดใช้งานบัญชีแอดมินตัวเอง"); await env.DB.prepare("UPDATE members SET active=0 WHERE id=?").bind(id).run(); await env.DB.prepare("DELETE FROM sessions WHERE member_id=?").bind(id).run(); return json({ok:true}); }
    throw new Error("คำสั่งไม่ถูกต้อง");
  } catch (error) { return json({ error: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ" }, 400); }
}

