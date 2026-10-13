import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Sans_Thai, Kanit, Permanent_Marker } from "next/font/google";
import "./globals.css";
import CommandScene from "./command-scene-loader";

// Self-hosted via next/font instead of a CSS @import to fonts.googleapis.com,
// which sat inside the render-blocking stylesheet and chained two extra
// third-party round trips (googleapis -> gstatic) before first paint.
// Chakra Petch: the squared esports face, for headings and numbers.
const chakra = Chakra_Petch({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});
// Kanit heavy italic: the poster face for headings, after the brush 5000 logo.
const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-kanit",
  display: "swap",
});
// Permanent Marker: big numbers (points, ranks, counters), hand-painted
// like the digits of the 5000 logo. Digits and Latin only.
const marker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-brush",
  display: "swap",
});
// IBM Plex Sans Thai: a clean modern face for everything people read.
const plex = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://airdrop-party-check-v2.vercel.app"),
  title: "5000 Fivethousand",
  description: "เช็คชื่อแอร์ดรอป ปาร์ตี้ และคะแนนแก๊ง 5000 Fivethousand",
  // What a pasted link shows in Discord: the share card, name and a pitch.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "5000 Fivethousand",
    title: "5000 Fivethousand",
    description: "ส่งหลักฐานแอร์ดรอป งัดร้าน ลูป · ดูแต้มและอันดับประจำเดือนของแก๊ง 5000",
    locale: "th_TH",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "5000 Fivethousand" }],
  },
  twitter: { card: "summary_large_image", title: "5000 Fivethousand", images: ["/og.png"] },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "64x64", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/favicon.png",
    apple: "/icon-192.png",
  },
};

// Discord tints a link's card with this colour.
export const viewport: Viewport = { themeColor: "#e3141b" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${chakra.variable} ${plex.variable} ${kanit.variable} ${marker.variable}`}>
      <body className="antialiased"><CommandScene />{children}</body>
    </html>
  );
}
