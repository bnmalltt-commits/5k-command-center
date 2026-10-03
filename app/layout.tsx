import type { Metadata, Viewport } from "next";
import { Chakra_Petch, IBM_Plex_Sans_Thai } from "next/font/google";
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
// IBM Plex Sans Thai: a clean modern face for everything people read.
const plex = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://airdrop-party-check-v2.vercel.app"),
  title: "5K Fivethousand Command Center",
  description: "เช็คชื่อแอร์ดรอป ปาร์ตี้ และคะแนนแก๊ง 5K Fivethousand",
  // What a pasted link shows in Discord: the share card, name and a pitch.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "5K Fivethousand",
    title: "5K Command Center",
    description: "ส่งหลักฐานแอร์ดรอป งัดร้าน ลูป · ดูแต้มและอันดับประจำเดือนของแก๊ง 5K",
    locale: "th_TH",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "5K Fivethousand Command Center" }],
  },
  twitter: { card: "summary_large_image", title: "5K Command Center", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

// Discord tints a link's card with this colour.
export const viewport: Viewport = { themeColor: "#ff4655" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${chakra.variable} ${plex.variable}`}>
      <body className="antialiased"><CommandScene />{children}</body>
    </html>
  );
}
