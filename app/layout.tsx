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
  title: "nyangnyang",
  description:
    "옥타브와 조성을 자유롭게 바꾸며 고양이와 함께 연주하는 멀티터치 웹 건반입니다.",
  openGraph: {
    title: "nyangnyang",
    description: "고양이와 함께 연주하는 멀티터치 웹 건반",
    type: "website",
    images: [{ url: "/og.png", width: 1080, height: 796, alt: "nyangnyang 고양이 발바닥 연주 앱" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "nyangnyang",
    description: "고양이와 함께 연주하는 멀티터치 웹 건반",
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
