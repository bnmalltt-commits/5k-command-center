import type { Metadata } from "next";
import { Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";
import CommandScene from "./command-scene-loader";

// Self-hosted via next/font instead of a CSS @import to fonts.googleapis.com,
// which sat inside the render-blocking stylesheet and chained two extra
// third-party round trips (googleapis -> gstatic) before first paint.
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-orbitron",
  display: "swap",
});
const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  title: "5K Fivethousand Command Center",
  description: "เช็คชื่อแอร์ดรอป ปาร์ตี้ และคะแนนแก๊ง 5K Fivethousand",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${orbitron.variable} ${rajdhani.variable}`}>
      <body className="antialiased"><CommandScene />{children}</body>
    </html>
  );
}
