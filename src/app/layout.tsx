import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DXB Invest Terminal",
  description: "UAE borsaları, NASDAQ/NYSE, ETF’ler, UAE tahvilleri ve Binance kripto için çoklu varlık takip paneli",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#131722" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
