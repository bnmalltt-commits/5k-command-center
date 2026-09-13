const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#07080b"/><path d="M10 40 28 12h12L25 36h29l-8 9H18z" fill="#f43f4c"/><path d="M25 47h23l-7 8H18z" fill="#cbd5e1"/></svg>`;

export function GET() {
  return new Response(icon, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400",
    },
  });
}
