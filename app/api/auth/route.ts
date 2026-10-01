import { db } from "@/lib/db";
import { now, clearSessionCookie } from "@/lib/auth";

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

// Signing in is Discord-only (see ./discord); this route just signs out.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cookieToken = request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;\s]+)/)?.[1];
    if (body.action === "logout") {
      if (cookieToken) await db.prepare("DELETE FROM sessions WHERE token=?").bind(cookieToken).run();
      return new Response(null, { status: 204, headers: { "set-cookie": clearSessionCookie() } });
    }
    throw Error("เข้าสู่ระบบด้วย Discord เท่านั้น");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ" }, { status: 400 });
  }
}
