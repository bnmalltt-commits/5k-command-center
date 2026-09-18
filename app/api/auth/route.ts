import { env } from "cloudflare:workers";

const iso = () => new Date().toISOString();
const makeToken = () => crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
const pinDigest = async (pin: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://bnmalltt-commits.github.io",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  Vary: "Origin",
};
const setCookie = (token: string) =>
  `fivek_session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=2592000`;
const publicUser = (member: any) =>
  member ? { id: member.id, display_name: member.display_name, role: member.role } : null;
const requestToken = (request: Request) => request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;]+)/)?.[1] || null;

export function OPTIONS() { return new Response(null, { status: 204, headers: corsHeaders }); }

export async function GET(request: Request) {
  const token = requestToken(request);
  if (!token) return Response.json({ user: null }, { headers: corsHeaders });
  const user = await env.DB.prepare("SELECT m.id,m.display_name,m.role FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token=? AND s.expires_at>? AND m.active=1").bind(token, iso()).first<any>();
  return Response.json({ user: publicUser(user) }, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json<any>();
    const tokenFromRequest = requestToken(request);
    if (body.action === "logout") {
      if (tokenFromRequest) await env.DB.prepare("DELETE FROM sessions WHERE token=?").bind(tokenFromRequest).run();
      return new Response(null, { status: 204, headers: { ...corsHeaders, "set-cookie": "fivek_session=; Path=/; Max-Age=0" } });
    }
    const identifier = String(body.name || "").trim();
    const pin = String(body.pin || "").trim();
    if (identifier.length < 2 || identifier.length > 120) throw Error("กรุณาใส่ชื่อหรือรหัสสมาชิก");
    if (!/^\d{6}$/.test(pin)) throw Error("รหัสสมาชิกต้องเป็นตัวเลข 6 หลัก");
    const hashedPin = await pinDigest(pin);
    let known = await env.DB.prepare("SELECT id,username,display_name,role,active,is_primary_admin,pin_hash FROM members WHERE username=?").bind(identifier).first<any>();
    if (!known) known = await env.DB.prepare("SELECT id,username,display_name,role,active,is_primary_admin,pin_hash FROM members WHERE lower(display_name)=lower(?)").bind(identifier).first<any>();
    if (known && !known.active) throw Error("สมาชิกนี้ถูกปิดใช้งาน โปรดติดต่อแอดมิน");
    // Sam is the primary owner and may sign in with the display name. Other admins use their member ID.
    if (known?.role === "admin" && known.username !== identifier && !known.is_primary_admin) throw Error("บัญชีแอดมินต้องเข้าสู่ระบบด้วยรหัสสมาชิกจากหน้าแอดมิน");
    if (known?.pin_hash && known.pin_hash !== hashedPin) throw Error("รหัสสมาชิกไม่ถูกต้อง");
    let member = known;
    if (!member) {
      const username = `5K-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const result = await env.DB.prepare("INSERT INTO members (username,display_name,role,active,pin_hash,created_at) VALUES (?,?,?,?,?,?)").bind(username, identifier, "member", 1, hashedPin, iso()).run();
      member = { id: result.meta.last_row_id, username, display_name: identifier, role: "member" };
    } else if (!member.pin_hash) {
      await env.DB.prepare("UPDATE members SET pin_hash=? WHERE id=?").bind(hashedPin, member.id).run();
    }
    const token = makeToken();
    await env.DB.prepare("INSERT INTO sessions (token,member_id,expires_at,created_at) VALUES (?,?,?,?)").bind(token, member.id, new Date(Date.now() + 2592000000).toISOString(), iso()).run();
    return Response.json({ user: publicUser(member), token }, { headers: { ...corsHeaders, "set-cookie": setCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" }, { status: 400, headers: corsHeaders });
  }
}
