import { db } from "@/lib/db";
import { now, makeToken, pinDigest, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export const maxDuration = 30;

const publicUser = (member: any) =>
  member ? { id: member.id, display_name: member.display_name, role: member.role } : null;

export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;\s]+)/)?.[1];
  if (!token) return Response.json({ user: null });
  const user = await db
    .prepare("SELECT m.id,m.display_name,m.role FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token=? AND s.expires_at>? AND m.active=1")
    .bind(token, now())
    .first<any>();
  return Response.json({ user: publicUser(user) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cookieToken = request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;\s]+)/)?.[1];
    if (body.action === "logout") {
      if (cookieToken) await db.prepare("DELETE FROM sessions WHERE token=?").bind(cookieToken).run();
      return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie() } });
    }
    const identifier = String(body.name || "").trim();
    const pin = String(body.pin || "").trim();
    if (identifier.length < 2 || identifier.length > 120) throw Error("กรุณาใส่ชื่อหรือรหัสสมาชิก");
    if (!/^\d{6}$/.test(pin)) throw Error("รหัสสมาชิกต้องเป็นตัวเลข 6 หลัก");
    const hashedPin = await pinDigest(pin);
    let known = await db
      .prepare("SELECT id,username,display_name,role,active,is_primary_admin,pin_hash FROM members WHERE username=?")
      .bind(identifier)
      .first<any>();
    if (!known)
      known = await db
        .prepare("SELECT id,username,display_name,role,active,is_primary_admin,pin_hash FROM members WHERE lower(display_name)=lower(?)")
        .bind(identifier)
        .first<any>();
    if (known && !known.active) throw Error("สมาชิกนี้ถูกปิดใช้งาน โปรดติดต่อแอดมิน");
    // Sam is the primary owner and may sign in with the display name. Other admins use their member ID.
    if (known?.role === "admin" && known.username !== identifier && !known.is_primary_admin)
      throw Error("บัญชีแอดมินต้องเข้าสู่ระบบด้วยรหัสสมาชิกจากหน้าแอดมิน");
    if (known?.pin_hash && known.pin_hash !== hashedPin) throw Error("รหัสสมาชิกไม่ถูกต้อง");
    let member = known;
    if (!member) {
      const username = `5K-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const inserted = await db
        .prepare("INSERT INTO members (username,display_name,role,active,pin_hash,created_at) VALUES (?,?,?,?,?,?) RETURNING id")
        .bind(username, identifier, "member", 1, hashedPin, now())
        .first<any>();
      member = { id: inserted.id, username, display_name: identifier, role: "member" };
    } else if (!member.pin_hash) {
      await db.prepare("UPDATE members SET pin_hash=? WHERE id=?").bind(hashedPin, member.id).run();
    }
    const token = makeToken();
    await db
      .prepare("INSERT INTO sessions (token,member_id,expires_at,created_at) VALUES (?,?,?,?)")
      .bind(token, member.id, new Date(Date.now() + 2592000000).toISOString(), now())
      .run();
    return Response.json({ user: publicUser(member) }, { headers: { "set-cookie": setSessionCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" }, { status: 400 });
  }
}
