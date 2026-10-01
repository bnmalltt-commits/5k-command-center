import { db } from "@/lib/db";
import { currentMember, makeToken, now, setSessionCookie } from "@/lib/auth";

export const maxDuration = 30;

// "Sign in with Discord" without a client secret: Discord's implicit grant
// hands the browser an access token, the browser passes it here, and we ask
// Discord who it belongs to. Two checks make that safe: the state value must
// match the httpOnly cookie set when the flow started (no forged callbacks),
// and Discord must report the token was issued to *our* application, so a
// token minted for some other app can't be replayed to log in here.
const STATE_COOKIE = "fivek_discord_state";
const SITE_URL = "https://airdrop-party-check-v2.vercel.app";
const REDIRECT_URI = `${SITE_URL}/api/auth/discord/callback`;
const discordKey = (id: string) => `discord:${id}`;

const cookieValue = (request: Request, name: string) =>
  request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;\\s]+)`))?.[1];

// Start: ?mode=login (default) or ?mode=link (attach Discord to the signed-in member).
export async function GET(request: Request) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return Response.redirect(`${SITE_URL}/?discord=unavailable`, 302);
  const mode = new URL(request.url).searchParams.get("mode") === "link" ? "link" : "login";
  const state = `${crypto.randomUUID().replaceAll("-", "")}.${mode}`;
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("response_type", "token");
  authorize.searchParams.set("redirect_uri", REDIRECT_URI);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "set-cookie": `${STATE_COOKIE}=${state}; Path=/api/auth/discord; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

// Finish: { accessToken, state } from the callback page, or { action: "unlink" }.
export async function POST(request: Request) {
  const clearState = `${STATE_COOKIE}=; Path=/api/auth/discord; Max-Age=0`;
  try {
    const body = await request.json();
    if (body.action === "unlink") {
      const me = await currentMember(request);
      if (!me) throw Error("กรุณาเข้าสู่ระบบก่อน");
      await db.prepare("UPDATE members SET external_user_id=NULL,discord_avatar=NULL WHERE id=? AND external_user_id LIKE 'discord:%'").bind(me.id).run();
      return Response.json({ ok: true });
    }

    const state = String(body.state || "");
    if (!state || state !== cookieValue(request, STATE_COOKIE)) throw Error("ลิงก์เข้าสู่ระบบหมดอายุ ลองกดเข้าสู่ระบบด้วย Discord ใหม่อีกครั้ง");
    const mode = state.endsWith(".link") ? "link" : "login";

    const who = await fetch("https://discord.com/api/v10/oauth2/@me", {
      headers: { authorization: `Bearer ${String(body.accessToken || "")}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!who.ok) throw Error("Discord ไม่ยืนยันตัวตน ลองใหม่อีกครั้ง");
    const info: any = await who.json();
    if (!process.env.DISCORD_CLIENT_ID || info?.application?.id !== process.env.DISCORD_CLIENT_ID || !info?.user?.id)
      throw Error("Discord ไม่ยืนยันตัวตน ลองใหม่อีกครั้ง");
    const key = discordKey(info.user.id);
    // Avatar hash (or null for Discord's default); refreshed on every link/login.
    const avatar = /^(a_)?[0-9a-f]{32}$/.test(String(info.user.avatar || "")) ? info.user.avatar : null;
    const discordName = info.user.global_name || info.user.username;

    if (mode === "link") {
      const me = await currentMember(request);
      if (!me) throw Error("กรุณาเข้าสู่ระบบด้วยชื่อและ PIN ก่อน แล้วค่อยกดเชื่อม Discord");
      const taken = await db.prepare("SELECT id FROM members WHERE external_user_id=? AND id<>?").bind(key, me.id).first();
      if (taken) throw Error("บัญชี Discord นี้เชื่อมกับสมาชิกคนอื่นอยู่แล้ว");
      await db.prepare("UPDATE members SET external_user_id=?,discord_avatar=? WHERE id=?").bind(key, avatar, me.id).run();
      return Response.json({ ok: true, message: `เชื่อม Discord (${discordName}) แล้ว ครั้งหน้ากดเข้าสู่ระบบด้วย Discord ได้เลย` }, { headers: { "set-cookie": clearState } });
    }

    const member = await db.prepare("SELECT id FROM members WHERE external_user_id=? AND active=1").bind(key).first<any>();
    if (!member) throw Error(`Discord (${discordName}) ยังไม่ได้เชื่อมกับบัญชีในแก๊ง เข้าสู่ระบบด้วยชื่อและ PIN ก่อน แล้วกด เพิ่มเติม → เชื่อม Discord`);
    await db.prepare("UPDATE members SET discord_avatar=? WHERE id=?").bind(avatar, member.id).run();
    const token = makeToken();
    await db.prepare("INSERT INTO sessions (token,member_id,expires_at,created_at) VALUES (?,?,?,?)")
      .bind(token, member.id, new Date(Date.now() + 2592000000).toISOString(), now()).run();
    const headers = new Headers();
    headers.append("set-cookie", setSessionCookie(token));
    headers.append("set-cookie", clearState);
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบด้วย Discord ไม่สำเร็จ" }, { status: 400, headers: { "set-cookie": clearState } });
  }
}
