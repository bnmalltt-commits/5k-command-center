import { db } from "./db";

const SITE_URL = "https://airdrop-party-check-v2.vercel.app";

// Keeps member-supplied text from closing the ``` box it is shown in.
const clean = (text: unknown) => String(text ?? "").replace(/`/g, "'").slice(0, 200);

type Line = [label: string, value: unknown];

// Two channels: evidence waiting for review goes to DISCORD_WEBHOOK_URL, and
// points credited on approval go to DISCORD_POINTS_WEBHOOK_URL. Each card type
// is skipped while its webhook is unset, so they never mix in one channel.
//
// Posts one card to a Discord webhook. Best-effort by design: a slow or broken webhook must never fail or
// stall the upload/approval that triggered it, so it is time-capped and
// swallows every error.
// Discord CDN avatar for a member, or null if they haven't linked Discord.
export function discordAvatarUrl(externalId: unknown, avatarHash: unknown) {
  const id = discordUserId(externalId);
  if (!id) return null;
  if (avatarHash) return `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png?size=64`;
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> BigInt(22)) % BigInt(6))}.png`;
}

// "discord:123" -> "123"; anything else (unlinked, legacy ids) -> null.
export const discordUserId = (externalId: unknown) => {
  const m = String(externalId ?? "").match(/^discord:([0-9]+)$/);
  return m ? m[1] : null;
};

// Discord review buttons for a piece of evidence (handled by
// app/api/discord/interactions). Only a bot's own messages can carry them.
export const reviewButtons = (type: "airdrop" | "party", id: unknown) => [
  {
    type: 1,
    components: [
      { type: 2, style: 3, label: "ผ่าน", emoji: { name: "✅" }, custom_id: `review:approve:${type}:${id}` },
      { type: 2, style: 4, label: "ไม่ผ่าน", emoji: { name: "❌" }, custom_id: `review:reject:${type}:${id}` },
    ],
  },
];

// `url` is a webhook URL, or "bot:<channel id>" to post as the bot (needed
// for buttons; uses DISCORD_BOT_TOKEN).
export async function postCard(url: string, {
  title,
  lines,
  color,
  image,
  mention = [],
  mentionRoles = [],
  components,
}: {
  title: string;
  lines: Line[];
  color: number;
  image?: { blob: Blob; ext: string };
  // Discord user ids to tag. Mentions only notify from message content (not
  // from inside an embed), and allowed_mentions limits pings to exactly these.
  mention?: string[];
  // Discord role ids to tag instead of listing every member.
  mentionRoles?: string[];
  // Message components (buttons); only honoured on bot messages.
  components?: unknown[];
}) {
  try {
    const filename = image ? `evidence.${image.ext}` : "";
    // Discord rejects the whole message past 2000 characters of content or
    // 4096 of embed description, so trim to fit rather than fail every retry.
    const tags = [...mentionRoles.map((id) => `<@&${id}>`), ...mention.map((id) => `<@${id}>`)];
    let content = "";
    for (const tag of tags) {
      if (content.length + tag.length + 1 > 1990) break;
      content += (content ? " " : "") + tag;
    }
    const boxes = lines.map(([label, value]) => "```" + `${clean(label)} : ${clean(value)}` + "```");
    let description = "";
    for (let i = 0; i < boxes.length; i++) {
      const more = "```… และอีก " + (boxes.length - i) + " รายการ (ดูในเว็บ)```";
      if (description.length + boxes[i].length + more.length + 2 > 4000) {
        description += "\n" + more;
        break;
      }
      description += (description ? "\n" : "") + boxes[i];
    }
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({
        ...(content && { content }),
        allowed_mentions: { parse: [], users: mention.slice(0, 100), roles: mentionRoles.slice(0, 100) },
        ...(components && { components }),
        embeds: [
          {
            title: clean(title),
            url: SITE_URL,
            color,
            // One code box per line, like the gang's other bot cards.
            description,
            ...(image && { image: { url: `attachment://${filename}` } }),
            footer: { text: "5K Command Center", icon_url: `${SITE_URL}/5k-logo.png` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );
    if (image) form.append("files[0]", image.blob, filename);
    const bot = url.startsWith("bot:");
    if (bot && !process.env.DISCORD_BOT_TOKEN) return false;
    const res = await fetch(bot ? `https://discord.com/api/v10/channels/${url.slice(4)}/messages` : url, {
      method: "POST",
      body: form,
      headers: bot ? { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } : undefined,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    // Notification is optional; the action that triggered it already succeeded.
    return false;
  }
}

async function pendingCount() {
  const row = await db
    .prepare("SELECT (SELECT COUNT(*) FROM airdrop_submissions WHERE status='pending')+(SELECT COUNT(*) FROM party_activities WHERE status='pending') AS n")
    .bind()
    .first<any>();
  return Number(row?.n || 0);
}

// New evidence waiting for review, with the photo attached.
// With a bot set up (DISCORD_BOT_TOKEN + DISCORD_EVIDENCE_CHANNEL_ID) the card
// is posted by the bot with ✅/❌ review buttons; otherwise (or if that fails)
// through the evidence webhook as before.
export async function notifyEvidence({
  title,
  lines,
  image,
  ext,
  review,
}: {
  title: string;
  lines: Line[];
  image: Blob;
  ext: string;
  review?: { type: "airdrop" | "party"; id: unknown };
}) {
  const card = {
    title,
    lines: [...lines, ["คิวรอตรวจ", `${await pendingCount().catch(() => 0)} รายการ`]] as Line[],
    color: 0xd00404,
    image: { blob: image, ext },
  };
  const channel = process.env.DISCORD_EVIDENCE_CHANNEL_ID;
  if (review && channel && process.env.DISCORD_BOT_TOKEN) {
    if (await postCard(`bot:${channel}`, { ...card, components: reviewButtons(review.type, review.id) })) return;
  }
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (url) await postCard(url, card);
}

// An approval that just credited points: each member's total before and after.
export async function notifyApproval({
  kind,
  approvedBy,
  month,
  people,
  loadImage,
}: {
  kind: string;
  approvedBy: string;
  // Totals are this month's points (they reset each month), e.g. "ตุลาคม 2569".
  month: string;
  people: { name: string; before: number; after: number; discordId?: string | null }[];
  // Called only when the points channel is configured, so an approval never
  // downloads the evidence just to throw it away.
  loadImage: () => Promise<{ blob: Blob; ext: string } | null>;
}) {
  const url = process.env.DISCORD_POINTS_WEBHOOK_URL;
  if (!url || !people.length) return;
  try {
    const gain = (p: { before: number; after: number }) => {
      const d = p.after - p.before;
      return `${d >= 0 ? "+" : ""}${d} แต้ม`;
    };
    const lines: Line[] =
      people.length === 1
        ? [
            ["รายการ", kind],
            ["ตรวจโดย", approvedBy],
            ["นับแต้มเดือน", month],
            ["คะแนนเดิม", `${people[0].before} แต้ม`],
            ["เพิ่มขึ้น", gain(people[0])],
            ["คะแนนรวม", `${people[0].after} แต้ม`],
          ]
        : [
            ["รายการ", kind],
            ["ตรวจโดย", approvedBy],
            ["นับแต้มเดือน", month],
            ...people.map((p): Line => [p.name, `${p.before} → ${p.after} แต้ม (${gain(p)})`]),
          ];
    const image = await loadImage().catch(() => null);
    await postCard(url, {
      title: people.length === 1 ? `${people[0].name} ทำคะแนนเพิ่ม` : `ทีม ${people.length} คน ทำคะแนนเพิ่ม`,
      lines,
      color: 0x4ade80,
      ...(image && { image }),
      mention: people.map((p) => p.discordId).filter(Boolean) as string[],
    });
  } catch {
    // Notification is optional; the approval already succeeded.
  }
}

// A rejected submission: tells the member (tagged) to resend, in the points
// channel where they'll see it, since otherwise they only find out by
// opening the site.
export async function notifyRejection({
  kind,
  rejectedBy,
  reason,
  people,
}: {
  kind: string;
  rejectedBy: string;
  // Why it failed, so the member knows what to fix (optional).
  reason?: string | null;
  people: { name: string; discordId: string | null }[];
}) {
  const url = process.env.DISCORD_POINTS_WEBHOOK_URL;
  if (!url || !people.length) return;
  await postCard(url, {
    title: people.length === 1 ? `${people[0].name} หลักฐานไม่ผ่าน` : `ทีม ${people.length} คน หลักฐานไม่ผ่าน`,
    lines: [
      ["รายการ", kind],
      ["ตรวจโดย", rejectedBy],
      ...(reason ? [["เหตุผล", reason] as Line] : []),
      ...(people.length > 1 ? people.map((p, i): Line => [`สมาชิก ${i + 1}`, p.name]) : []),
      ["ทำต่อ", "ส่งหลักฐานใหม่ได้ที่เว็บ"],
    ],
    color: 0xf59e0b,
    mention: people.map((p) => p.discordId).filter(Boolean) as string[],
  });
}
