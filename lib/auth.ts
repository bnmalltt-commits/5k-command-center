import { db } from "./db";

export const now = () => new Date().toISOString();
export const thaiDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
export const onlineSince = () => new Date(Date.now() - 2 * 60 * 1000).toISOString();
export const makeToken = () => crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
export const pinDigest = async (pin: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
export const randomPin = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return String(100000 + (buffer[0] % 900000));
};

// Postgres returns bigint ids as strings, so a raw `Number(body.x) === me.id`
// is always false and silently defeats "is this me?" guards. Compare both
// sides as numbers. This has bitten the upload, dashboard and party routes,
// so it lives here rather than being re-declared per route.
export const sameId = (a: unknown, b: unknown) => Number(a) === Number(b);

export const SESSION_COOKIE = "fivek_session";
export const setSessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; Max-Age=0`;

function sessionToken(request: Request) {
  return request.headers.get("cookie")?.match(/(?:^|;\s*)fivek_session=([^;\s]+)/)?.[1] ?? null;
}

export async function currentMember(request: Request) {
  const token = sessionToken(request);
  if (!token) return null;
  return db
    .prepare("SELECT m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token=? AND s.expires_at>? AND m.active=1")
    .bind(token, now())
    .first<any>();
}

export async function requireMember(request: Request) {
  const member = await currentMember(request);
  if (!member) throw Error("กรุณาเข้าสู่ระบบก่อนใช้งาน");
  return member;
}

export async function requireAdmin(request: Request) {
  const member = await requireMember(request);
  if (member.role !== "admin") throw Error("เฉพาะแอดมินเท่านั้น");
  return member;
}

export async function requireSam(request: Request) {
  const member = await requireAdmin(request);
  if (!member.is_primary_admin) throw Error("เฉพาะบัญชีเจ้าของแก๊งเท่านั้นที่จัดการสิทธิ์แอดมินได้");
  return member;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
