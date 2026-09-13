import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airdrop Party Check",
  description: "เช็คชื่อแอร์ดรอปและแต้มปาร์ตี้ของแก๊ง",
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
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
