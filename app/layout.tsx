import type { Metadata, Viewport } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-sans",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["cyrillic", "latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "План сложного разговора с ребёнком",
  description: "ИИ-помощник: план и фразы для сложного разговора с ребёнком.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${manrope.variable} ${sourceSerif.variable}`}>
      <body className={manrope.className}>{children}</body>
    </html>
  );
}
