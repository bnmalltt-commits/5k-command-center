import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (!await getChatGPTUser()) return new Response("Unauthorized", { status: 401 });
  const object = await env.BUCKET.get((await params).key.join("/"));
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, max-age=3600" } });
}
