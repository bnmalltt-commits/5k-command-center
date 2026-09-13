import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
