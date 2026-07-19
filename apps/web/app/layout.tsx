import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Karla, Space_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT", "WONK"],
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

export const metadata: Metadata = {
  title: "WatchMe AI",
  description: "AI work reflection engine — understand how you actually work.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${karla.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
