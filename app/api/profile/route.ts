import { json, requireMember, thaiDate } from "@/lib/auth";
import { buildProfile } from "@/lib/profile";

export const maxDuration = 30;

// GET /api/profile?id=<member id> (defaults to yourself): any signed-in
// member can see anyone's profile, like the ranking.
export async function GET(request: Request) {
  try {
    const me = await requireMember(request);
    const raw = new URL(request.url).searchParams.get("id");
    const id = raw ? Number(raw) : Number(me.id);
    if (!Number.isInteger(id) || id <= 0) throw Error("ไม่พบสมาชิกนี้");
    return json(await buildProfile(id, thaiDate()));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "เปิดโปรไฟล์ไม่สำเร็จ" }, 400);
  }
}
