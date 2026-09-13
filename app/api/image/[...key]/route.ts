import { env } from "cloudflare:workers";
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const cookie=_.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;]+)/); if(!cookie) return new Response("Unauthorized", { status: 401 });
  const member=await env.DB.prepare("SELECT member_id FROM sessions WHERE token=? AND expires_at>? ").bind(cookie[1],new Date().toISOString()).first(); if(!member) return new Response("Unauthorized", { status: 401 });
  const object = await env.BUCKET.get((await params).key.join("/"));
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } });
}
