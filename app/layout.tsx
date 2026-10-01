import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Rajdhani } from "next/font/google";
import "./globals.css";
import CommandScene from "./command-scene-loader";

// Self-hosted via next/font instead of a CSS @import to fonts.googleapis.com,
// which sat inside the render-blocking stylesheet and chained two extra
// third-party round trips (googleapis -> gstatic) before first paint.
// Thai + Latin in one squared, esports-style face, for body text and numbers
// (its zero has no slash, unlike Orbitron's, which read like a "no" sign).
const chakra = Chakra_Petch({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});
const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://airdrop-party-check-v2.vercel.app"),
  title: "5K Fivethousand Command Center",
  description: "เช็คชื่อแอร์ดรอป ปาร์ตี้ และคะแนนแก๊ง 5K Fivethousand",
  // What a pasted link shows in Discord: logo, name and a one-line pitch.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "5K Fivethousand",
    title: "5K Command Center",
    description: "ส่งหลักฐานแอร์ดรอป งัดร้าน ลูป · ดูแต้มและอันดับประจำเดือนของแก๊ง 5K",
    locale: "th_TH",
    images: [{ url: "/5k-logo.png", alt: "5K Fivethousand" }],
  },
  twitter: { card: "summary", title: "5K Command Center", images: ["/5k-logo.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

// Discord tints a link's card with this colour.
export const viewport: Viewport = { themeColor: "#d00404" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${chakra.variable} ${rajdhani.variable}`}>
      <body className="antialiased"><CommandScene />{children}</body>
    </html>
  );
}
