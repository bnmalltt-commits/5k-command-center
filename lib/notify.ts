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
async function postCard(url: string, {
  title,
  lines,
  color,
  image,
}: {
  title: string;
  lines: Line[];
  color: number;
  image?: { blob: Blob; ext: string };
}) {
  try {
    const filename = image ? `evidence.${image.ext}` : "";
    const form = new FormData();
    form.append(
      "payload_json",
      JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: clean(title),
            url: SITE_URL,
            color,
            // One code box per line, like the gang's other bot cards.
            description: lines.map(([label, value]) => "```" + `${clean(label)} : ${clean(value)}` + "```").join("\n"),
            ...(image && { image: { url: `attachment://${filename}` } }),
            footer: { text: "5K Command Center", icon_url: `${SITE_URL}/5k-logo.png` },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );
    if (image) form.append("files[0]", image.blob, filename);
    await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
  } catch {
    // Notification is optional; the action that triggered it already succeeded.
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
export async function notifyEvidence({
  title,
  lines,
  image,
  ext,
}: {
  title: string;
  lines: Line[];
  image: Blob;
  ext: string;
}) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  await postCard(url, {
    title,
    lines: [...lines, ["คิวรอตรวจ", `${await pendingCount().catch(() => 0)} รายการ`]],
    color: 0xd00404,
    image: { blob: image, ext },
  });
}

// An approval that just credited points: each member's total before and after.
export async function notifyApproval({
  kind,
  approvedBy,
  points,
  memberIds,
  loadImage,
}: {
  kind: string;
  approvedBy: string;
  points: number;
  memberIds: unknown[];
  // Called only when the points channel is configured, so an approval never
  // downloads the evidence just to throw it away.
  loadImage: () => Promise<{ blob: Blob; ext: string } | null>;
}) {
  const url = process.env.DISCORD_POINTS_WEBHOOK_URL;
  if (!url || !memberIds.length) return;
  try {
    const totals = await db
      .prepare("SELECT m.display_name,COALESCE(SUM(pl.points),0) AS total FROM members m LEFT JOIN point_ledger pl ON pl.member_id=m.id WHERE m.id = ANY(?::bigint[]) GROUP BY m.id ORDER BY m.display_name")
      .bind(memberIds.map(Number))
      .all<any>();
    const people = totals.results;
    const lines: Line[] =
      people.length === 1
        ? [
            ["รายการ", kind],
            ["ตรวจโดย", approvedBy],
            ["คะแนนเดิม", `${Number(people[0].total) - points} แต้ม`],
            ["เพิ่มขึ้น", `+${points} แต้ม`],
            ["คะแนนรวม", `${Number(people[0].total)} แต้ม`],
          ]
        : [
            ["รายการ", kind],
            ["ตรวจโดย", approvedBy],
            ["เพิ่มขึ้น", `+${points} แต้ม ต่อคน`],
            ...people.map((p: any): Line => [
              p.display_name,
              `${Number(p.total) - points} → ${Number(p.total)} แต้ม`,
            ]),
          ];
    const image = await loadImage().catch(() => null);
    await postCard(url, {
      title: people.length === 1 ? `${people[0].display_name} ทำคะแนนเพิ่ม` : `ทีม ${people.length} คน ทำคะแนนเพิ่ม`,
      lines,
      color: 0x4ade80,
      ...(image && { image }),
    });
  } catch {
    // Notification is optional; the approval already succeeded.
  }
}
