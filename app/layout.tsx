import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NYANG KEYS — 길어지는 고양이 건반",
  description:
    "옥타브와 조성을 자유롭게 바꾸며 고양이와 함께 연주하는 멀티터치 웹 건반입니다.",
  openGraph: {
    title: "NYANG KEYS",
    description: "PLAY · STRETCH · MEOW — 길어지는 고양이 건반",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "NYANG KEYS 고양이 건반" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NYANG KEYS",
    description: "PLAY · STRETCH · MEOW — 길어지는 고양이 건반",
    images: ["/og.png"],
  },
  icons: {
    icon: "/assets/themes/default/pawpad.svg",
    shortcut: "/assets/themes/default/pawpad.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
