import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { currentMember } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const member = await currentMember(request);
  if (!member) return new Response("Unauthorized", { status: 401 });
  const key = (await params).key.join("/");
  let allowed = member.role === "admin";
  if (!allowed && key.startsWith("airdrop/"))
    allowed = !!(await db.prepare("SELECT id FROM airdrop_submissions WHERE image_key=? AND member_id=?").bind(key, member.id).first());
  if (!allowed && key.startsWith("party/"))
    allowed = !!(await db.prepare("SELECT pa.id FROM party_activities pa JOIN party_activity_members pam ON pam.party_activity_id=pa.id WHERE pa.image_key=? AND pam.member_id=?").bind(key, member.id).first());
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const object = await storage.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" },
  });
}
