// Discord sends the implicit-grant token back in the URL fragment, which never
// reaches a server, so this returns a tiny page that reads it, hands it to
// POST /api/auth/discord, and goes back to the app with the outcome.
const PAGE = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>กำลังเข้าสู่ระบบ…</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0d0d;color:#f2f2f2;font-family:system-ui,sans-serif;padding:16px;text-align:center}a{color:#ff8f8f}</style></head>
<body><p id="m">กำลังเข้าสู่ระบบด้วย Discord…</p>
<script>
(async () => {
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname);
  const err = new URLSearchParams(location.search).get("error");
  const done = (msg) => { location.replace("/" + (msg ? "?discord=" + encodeURIComponent(msg) : "")); };
  if (err || !p.get("access_token")) return done(err === "access_denied" ? "ยกเลิกการเข้าสู่ระบบด้วย Discord" : "เข้าสู่ระบบด้วย Discord ไม่สำเร็จ");
  try {
    const r = await fetch("/api/auth/discord", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessToken: p.get("access_token"), state: p.get("state") }) });
    const x = await r.json();
    if (x.claim) return location.replace("/?claim=1");
    done(x.error || x.message || "");
  } catch { done("เข้าสู่ระบบด้วย Discord ไม่สำเร็จ"); }
})();
</script></body></html>`;

export function GET() {
  return new Response(PAGE, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}
