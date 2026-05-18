import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Panini WC2026",
  description: "World Cup 2026 Sticker Collection Tracker",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
