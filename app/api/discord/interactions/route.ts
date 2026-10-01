import { after } from "next/server";
import { createPublicKey, verify } from "node:crypto";
import { db } from "@/lib/db";
import { approveEvidence, rejectEvidence, validType } from "@/lib/review";

export const maxDuration = 30;

// Discord calls this when an admin presses ✅ / ❌ on an evidence card the bot
// posted (see reviewButtons in lib/notify.ts), and when they submit the
// rejection-reason form. Set as "Interactions Endpoint URL" in the Discord
// Developer Portal. Every request is checked against the app's public key, so
// nobody else can approve evidence through this URL; on top of that the
// person pressing must be an admin who linked this Discord account.
const API = "https://discord.com/api/v10";
// DER header that turns a raw 32-byte Ed25519 key into an SPKI public key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verified(body: string, signature: string | null, timestamp: string | null) {
  const key = process.env.DISCORD_PUBLIC_KEY || "";
  if (!/^[0-9a-f]{64}$/i.test(key) || !signature || !timestamp) return false;
  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(key, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), publicKey, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const reply = (data: unknown) => Response.json(data);
// A message only the person who pressed sees.
const privately = (content: string) => reply({ type: 4, data: { content, flags: 64 } });
// The card's buttons, replaced by one disabled button saying what happened.
const doneRow = (label: string, style: number) => [
  { type: 1, components: [{ type: 2, style, label: label.slice(0, 80), custom_id: "review:done", disabled: true }] },
];

async function editOriginal(token: string, payload: unknown) {
  await fetch(`${API}/webhooks/${process.env.DISCORD_CLIENT_ID}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}
async function followUp(token: string, content: string) {
  await fetch(`${API}/webhooks/${process.env.DISCORD_CLIENT_ID}/${token}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, flags: 64 }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!verified(body, request.headers.get("x-signature-ed25519"), request.headers.get("x-signature-timestamp")))
    return new Response("invalid request signature", { status: 401 });
  const interaction = JSON.parse(body);
  if (interaction.type === 1) return reply({ type: 1 }); // Discord's endpoint check (PING)

  const [scope, action, typeText, idText] = String(interaction.data?.custom_id || "").split(":");
  if (scope !== "review" || !["approve", "reject", "reason"].includes(action)) return privately("ปุ่มนี้ใช้ไม่ได้แล้ว");
  let type: "airdrop" | "party";
  try {
    type = validType(typeText);
  } catch {
    return privately("ปุ่มนี้ใช้ไม่ได้แล้ว");
  }
  const id = Number(idText);
  const discordId = String(interaction.member?.user?.id || interaction.user?.id || "");
  const admin = /^[0-9]+$/.test(discordId)
    ? await db.prepare("SELECT id,display_name FROM members WHERE external_user_id=? AND active=1 AND role='admin'").bind(`discord:${discordId}`).first<any>()
    : null;
  if (!admin) return privately("เฉพาะแอดมินที่ผูก Discord กับเว็บแล้วเท่านั้นที่ตรวจหลักฐานได้");
  const token = String(interaction.token);

  // ❌ opens a short form for the reason; the review happens when it's sent.
  if (interaction.type === 3 && action === "reject")
    return reply({
      type: 9,
      data: {
        custom_id: `review:reason:${type}:${id}`,
        title: "หลักฐานไม่ผ่าน",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "reason",
                style: 1,
                label: "เหตุผล (สมาชิกจะเห็น)",
                placeholder: "เช่น รูปไม่ชัด / ไม่ใช่รอบนี้ / คนไม่ครบ / รูปเก่า",
                required: false,
                max_length: 120,
              },
            ],
          },
        ],
      },
    });

  if ((interaction.type === 3 && action === "approve") || (interaction.type === 5 && action === "reason")) {
    const reason = interaction.data?.components?.[0]?.components?.[0]?.value;
    // Acknowledge now (Discord allows 3 seconds), do the review right after.
    after(async () => {
      try {
        if (action === "approve") {
          const result = await approveEvidence(admin, type, id);
          await editOriginal(token, { components: doneRow(`✅ ผ่านแล้ว +${result.points} · ${admin.display_name}`, 3) });
        } else {
          await rejectEvidence(admin, type, id, reason);
          await editOriginal(token, { components: doneRow(`❌ ไม่ผ่าน · ${admin.display_name}`, 4) });
        }
      } catch (error) {
        await editOriginal(token, { components: doneRow("ตรวจไปแล้ว", 2) });
        await followUp(token, error instanceof Error ? error.message : "ตรวจไม่สำเร็จ ลองในเว็บแทน");
      }
    });
    return reply({ type: 6 }); // deferred update of the card
  }
  return privately("ปุ่มนี้ใช้ไม่ได้แล้ว");
}
