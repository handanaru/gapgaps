import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GapGaps Arbitrage Dashboard",
  description: "Crypto arbitrage monitoring dashboard"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
