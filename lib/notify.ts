import { db } from "./db";

const SITE_URL = "https://airdrop-party-check-v2.vercel.app";

// Posts a line to the admins' Discord channel when DISCORD_WEBHOOK_URL is set.
// Best-effort by design: a slow or broken webhook must never fail or stall an
// upload, so it is capped at 3s and swallows every error.
export async function notifyAdmins(text: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const pending = await db
      .prepare("SELECT (SELECT COUNT(*) FROM airdrop_submissions WHERE status='pending')+(SELECT COUNT(*) FROM party_activities WHERE status='pending') AS n")
      .bind()
      .first<any>();
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `📥 ${text} · รอตรวจ ${Number(pending?.n || 0)} รายการ · ${SITE_URL}`,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Notification is optional; the upload already succeeded.
  }
}
