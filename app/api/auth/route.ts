import { db } from "@/lib/db";
import { now, makeToken, pinDigest, setSessionCookie, clearSessionCookie, currentMember } from "@/lib/auth";

export const maxDuration = 30;

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

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
    if (body.action === "change_pin") {
      const me = await currentMember(request);
      if (!me || !cookieToken) throw Error("กรุณาเข้าสู่ระบบก่อนเปลี่ยน PIN");
      const currentPin = String(body.currentPin || "").trim();
      const newPin = String(body.newPin || "").trim();
      if (!/^\d{6}$/.test(newPin)) throw Error("PIN ใหม่ต้องเป็นตัวเลข 6 หลัก");
      if (newPin === currentPin) throw Error("PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม");
      // A member with no PIN yet is already signed in as themselves, so there
      // is nothing to prove; everyone else must know the current one.
      if (me.pin_hash && me.pin_hash !== (await pinDigest(currentPin))) throw Error("PIN เดิมไม่ถูกต้อง");
      await db.batch([
        db.prepare("UPDATE members SET pin_hash=? WHERE id=?").bind(await pinDigest(newPin), me.id),
        // Sign out every other device on this account; keep this one.
        db.prepare("DELETE FROM sessions WHERE member_id=? AND token<>?").bind(me.id, cookieToken),
      ]);
      return Response.json({ ok: true });
    }
    const identifier = String(body.name || "").trim();
    const pin = String(body.pin || "").trim();
    if (identifier.length < 2 || identifier.length > 120) throw Error("กรุณาใส่ชื่อหรือรหัสสมาชิก");
    if (!/^\d{6}$/.test(pin)) throw Error("รหัสสมาชิกต้องเป็นตัวเลข 6 หลัก");
    const hashedPin = await pinDigest(pin);
    let known = await db
      .prepare("SELECT id,username,display_name,role,active,is_primary_admin,pin_hash,failed_logins,login_locked_until FROM members WHERE username=?")
      .bind(identifier)
      .first<any>();
    if (!known)
      known = await db
        .prepare("SELECT id,username,display_name,role,active,is_primary_admin,pin_hash,failed_logins,login_locked_until FROM members WHERE lower(display_name)=lower(?) ORDER BY active DESC,id LIMIT 1")
        .bind(identifier)
        .first<any>();
    if (known && !known.active) throw Error("สมาชิกนี้ถูกปิดใช้งาน โปรดติดต่อแอดมิน");
    // Sam is the primary owner and may sign in with the display name. Other admins use their member ID.
    if (known?.role === "admin" && known.username !== identifier && !known.is_primary_admin)
      throw Error("บัญชีแอดมินต้องเข้าสู่ระบบด้วยรหัสสมาชิกจากหน้าแอดมิน");
    // Brute-force guard: 5 wrong PINs lock the account for 15 minutes. A
    // signed-in member's existing session is unaffected by the lock.
    if (known?.login_locked_until && known.login_locked_until > now()) {
      const minutes = Math.ceil((Date.parse(known.login_locked_until) - Date.now()) / 60000);
      throw Error(`ใส่ PIN ผิดหลายครั้ง บัญชีนี้ถูกล็อกชั่วคราว ลองใหม่ในอีก ${minutes} นาที หรือเข้าด้วย Discord / ให้แอดมินรีเซ็ต PIN`);
    }
    if (known?.pin_hash && known.pin_hash !== hashedPin) {
      const lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
      const after = await db
        .prepare("UPDATE members SET failed_logins=CASE WHEN failed_logins+1>=? THEN 0 ELSE failed_logins+1 END, login_locked_until=CASE WHEN failed_logins+1>=? THEN ? ELSE login_locked_until END WHERE id=? RETURNING failed_logins,login_locked_until")
        .bind(MAX_FAILED, MAX_FAILED, lockUntil, known.id)
        .first<any>();
      if (after?.login_locked_until === lockUntil)
        throw Error(`ใส่ PIN ผิด ${MAX_FAILED} ครั้ง บัญชีนี้ถูกล็อก ${LOCK_MINUTES} นาที`);
      throw Error(`รหัสสมาชิกไม่ถูกต้อง (เหลือ ${MAX_FAILED - Number(after?.failed_logins || 0)} ครั้งก่อนถูกล็อก)`);
    }
    if (known && (Number(known.failed_logins) || known.login_locked_until))
      await db.prepare("UPDATE members SET failed_logins=0,login_locked_until=NULL WHERE id=?").bind(known.id).run();
    let member = known;
    if (!member) {
      const username = `5K-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      // Serialized and guarded so a double-tap on a brand-new name can't create
      // two accounts with the same display name (one of which could then
      // never log in, since the name lookup only ever finds one).
      const [, inserted] = await db.batch([
        db.prepare("SELECT pg_advisory_xact_lock(5001)").bind(),
        db
          .prepare("INSERT INTO members (username,display_name,role,active,pin_hash,created_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM members WHERE lower(display_name)=lower(?)) RETURNING id")
          .bind(username, identifier, "member", 1, hashedPin, now(), identifier),
      ]);
      if (!inserted.meta.changes) throw Error("ชื่อนี้เพิ่งถูกใช้สมัคร กดเข้าสู่ระบบอีกครั้ง");
      member = { id: inserted.meta.last_row_id, username, display_name: identifier, role: "member" };
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
