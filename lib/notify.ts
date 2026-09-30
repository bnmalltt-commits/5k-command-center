import { db } from "./db";

const SITE_URL = "https://airdrop-party-check-v2.vercel.app";

// Keeps member-supplied text from closing the ``` box it is shown in.
const clean = (text: unknown) => String(text ?? "").replace(/`/g, "'").slice(0, 200);

// Posts an evidence card (embed + the photo itself) to the admins' Discord
// channel when DISCORD_WEBHOOK_URL is set. Best-effort by design: a slow or
// broken webhook must never fail or stall an upload, so it is time-capped and
// swallows every error.
export async function notifyEvidence({
  title,
  lines,
  image,
  ext,
}: {
  title: string;
  lines: [label: string, value: unknown][];
  image: Blob;
  ext: string;
}) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    const pending = await db
      .prepare("SELECT (SELECT COUNT(*) FROM airdrop_submissions WHERE status='pending')+(SELECT COUNT(*) FROM party_activities WHERE status='pending') AS n")
      .bind()
      .first<any>();
    const filename = `evidence.${ext}`;
    const rows: [string, unknown][] = [...lines, ["คิวรอตรวจ", `${Number(pending?.n || 0)} รายการ`]];
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: clean(title),
            url: SITE_URL,
            color: 0xd00404,
            // One code box per line, like the reference card.
            description: rows.map(([label, value]) => "```" + `${clean(label)} : ${clean(value)}` + "```").join("\n"),
            image: { url: `attachment://${filename}` },
            footer: { text: "5K Command Center", icon_url: `${SITE_URL}/5k-logo.png` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );
    form.append("files[0]", image, filename);
    await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
  } catch {
    // Notification is optional; the upload already succeeded.
  }
}
