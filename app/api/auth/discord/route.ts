import { db } from "@/lib/db";
import { currentMember, makeToken, now, setSessionCookie } from "@/lib/auth";
import { discordAvatarUrl, postCard } from "@/lib/notify";

export const maxDuration = 30;

// Discord is the only way in. It runs without a client secret: Discord's
// implicit grant hands the browser an access token, the browser passes it here,
// and we ask Discord who it belongs to. Two checks make that safe: the state
// value must match the httpOnly cookie set when the flow started (no forged
// callbacks), and Discord must report the token was issued to *our*
// application, so a token minted for some other app can't be replayed here.
//
// A Discord account not yet tied to a member gets a short-lived claim: the
// token waits in an httpOnly cookie while the person picks their own name from
// the members still without Discord (or registers a new one). Every claim is
// re-verified with Discord and announced in the admin channel, and an admin can
// undo a wrong pick from the members tab.
const STATE_COOKIE = "fivek_discord_state";
const CLAIM_COOKIE = "fivek_discord_claim";
const COOKIE_PATH = "/api/auth/discord";
const SITE_URL = "https://airdrop-party-check-v2.vercel.app";
const REDIRECT_URI = `${SITE_URL}/api/auth/discord/callback`;
const discordKey = (id: string) => `discord:${id}`;

const cookieValue = (request: Request, name: string) =>
  request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;\\s]+)`))?.[1];
const clearCookie = (name: string) => `${name}=; Path=${COOKIE_PATH}; Max-Age=0`;

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
      "set-cookie": `${STATE_COOKIE}=${state}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

// Who an access token belongs to, provided it was issued to this app.
async function discordUser(accessToken: string) {
  const who = await fetch("https://discord.com/api/v10/oauth2/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!who.ok) throw Error("Discord ไม่ยืนยันตัวตน ลองใหม่อีกครั้ง");
  const info: any = await who.json();
  if (!process.env.DISCORD_CLIENT_ID || info?.application?.id !== process.env.DISCORD_CLIENT_ID || !/^[0-9]+$/.test(String(info?.user?.id || "")))
    throw Error("Discord ไม่ยืนยันตัวตน ลองใหม่อีกครั้ง");
  return {
    key: discordKey(info.user.id),
    // Avatar hash (or null for Discord's default); refreshed on every sign-in.
    avatar: /^(a_)?[0-9a-f]{32}$/.test(String(info.user.avatar || "")) ? info.user.avatar : null,
    name: String(info.user.global_name || info.user.username || "").slice(0, 40),
  };
}

const startSession = async (memberId: unknown, extra: string[] = []) => {
  const token = makeToken();
  await db.prepare("INSERT INTO sessions (token,member_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(token, memberId, new Date(Date.now() + 2592000000).toISOString(), now()).run();
  const headers = new Headers();
  headers.append("set-cookie", setSessionCookie(token));
  for (const cookie of extra) headers.append("set-cookie", cookie);
  return headers;
};

// Members a newcomer may claim: active, not yet on Discord, and not an admin
// (an admin account is never handed to whoever picks it first).
const CLAIMABLE = "active=1 AND role<>'admin' AND (external_user_id IS NULL OR external_user_id NOT LIKE 'discord:%')";

export async function POST(request: Request) {
  const clearState = clearCookie(STATE_COOKIE);
  try {
    const body = await request.json();

    if (body.action === "claim_options" || body.action === "claim") {
      const token = cookieValue(request, CLAIM_COOKIE);
      if (!token) throw Error("หมดเวลาเลือกชื่อ กดเข้าสู่ระบบด้วย Discord ใหม่อีกครั้ง");
      const user = await discordUser(decodeURIComponent(token));
      const existing = await db.prepare("SELECT id FROM members WHERE external_user_id=? AND active=1").bind(user.key).first<any>();
      if (existing) {
        // Already claimed (e.g. a second tab): just sign in.
        return Response.json({ ok: true }, { headers: await startSession(existing.id, [clearCookie(CLAIM_COOKIE)]) });
      }
      if (body.action === "claim_options") {
        const members = (await db.prepare(`SELECT id,display_name FROM members WHERE ${CLAIMABLE} ORDER BY display_name`).bind().all<any>()).results;
        return Response.json({ discordName: user.name, avatar: discordAvatarUrl(user.key, user.avatar), members });
      }
      let memberId: unknown;
      let claimedName: string;
      if (body.memberId) {
        const row = await db.prepare(`UPDATE members SET external_user_id=?,discord_avatar=? WHERE id=? AND ${CLAIMABLE} RETURNING id,display_name`)
          .bind(user.key, user.avatar, Number(body.memberId)).first<any>();
        if (!row) throw Error("ชื่อนี้ถูกคนอื่นเลือกไปแล้ว หรือเลือกไม่ได้ ลองรีเฟรชแล้วเลือกใหม่");
        memberId = row.id;
        claimedName = row.display_name;
      } else {
        const name = String(body.newName || "").trim().replace(/\s+/g, " ");
        if (name.length < 2 || name.length > 40) throw Error("ชื่อต้องยาว 2–40 ตัวอักษร");
        const username = `5K-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        // Serialized so two people can't register the same name at once.
        const [, inserted] = await db.batch([
          db.prepare("SELECT pg_advisory_xact_lock(5001)").bind(),
          db.prepare("INSERT INTO members (username,display_name,role,active,external_user_id,discord_avatar,created_at) SELECT ?,?,'member',1,?,?,? WHERE NOT EXISTS (SELECT 1 FROM members WHERE lower(display_name)=lower(?)) RETURNING id")
            .bind(username, name, user.key, user.avatar, now(), name),
        ]);
        if (!inserted.meta.changes) throw Error("มีชื่อนี้ในแก๊งแล้ว ถ้าเป็นชื่อคุณให้เลือกจากรายชื่อด้านบน ถ้าเลือกไม่ได้ให้ติดต่อแอดมิน");
        memberId = inserted.meta.last_row_id;
        claimedName = name;
      }
      // Audit trail so a wrong pick is noticed and an admin can undo it.
      if (process.env.DISCORD_WEBHOOK_URL)
        await postCard(process.env.DISCORD_WEBHOOK_URL, {
          title: body.memberId ? "🔗 สมาชิกผูก Discord" : "🆕 สมาชิกใหม่เข้าแก๊งด้วย Discord",
          lines: [
            ["ชื่อในแก๊ง", claimedName],
            ["Discord", user.name],
            ["ถ้าผิดคน", "จัดการแก๊ง → สมาชิก → ยกเลิกผูก Discord"],
          ],
          color: 0x5865f2,
        });
      return Response.json({ ok: true }, { headers: await startSession(memberId, [clearCookie(CLAIM_COOKIE)]) });
    }

    const state = String(body.state || "");
    if (!state || state !== cookieValue(request, STATE_COOKIE)) throw Error("ลิงก์เข้าสู่ระบบหมดอายุ ลองกดเข้าสู่ระบบด้วย Discord ใหม่อีกครั้ง");
    const mode = state.endsWith(".link") ? "link" : "login";
    const accessToken = String(body.accessToken || "");
    const user = await discordUser(accessToken);

    if (mode === "link") {
      const me = await currentMember(request);
      if (!me) throw Error("กรุณาเข้าสู่ระบบก่อน แล้วค่อยกดเชื่อม Discord");
      const taken = await db.prepare("SELECT id FROM members WHERE external_user_id=? AND id<>?").bind(user.key, me.id).first();
      if (taken) throw Error("บัญชี Discord นี้เชื่อมกับสมาชิกคนอื่นอยู่แล้ว ติดต่อแอดมินให้ยกเลิกผูกก่อน");
      await db.prepare("UPDATE members SET external_user_id=?,discord_avatar=? WHERE id=?").bind(user.key, user.avatar, me.id).run();
      return Response.json({ ok: true, message: `เชื่อม Discord (${user.name}) แล้ว ครั้งหน้ากดเข้าสู่ระบบด้วย Discord ได้เลย` }, { headers: { "set-cookie": clearState } });
    }

    const member = await db.prepare("SELECT id,active FROM members WHERE external_user_id=?").bind(user.key).first<any>();
    if (member && !Number(member.active)) throw Error("บัญชีนี้ถูกปิดใช้งาน ติดต่อแอดมิน");
    if (!member) {
      // First visit: hold the token briefly so the claim step can re-verify it.
      return Response.json({ claim: true }, {
        headers: [
          ["set-cookie", clearState],
          ["set-cookie", `${CLAIM_COOKIE}=${encodeURIComponent(accessToken)}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=900`],
        ],
      });
    }
    await db.prepare("UPDATE members SET discord_avatar=? WHERE id=?").bind(user.avatar, member.id).run();
    return Response.json({ ok: true }, { headers: await startSession(member.id, [clearState]) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "เข้าสู่ระบบด้วย Discord ไม่สำเร็จ" }, { status: 400, headers: { "set-cookie": clearState } });
  }
}
