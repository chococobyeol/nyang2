import type { Metadata, Viewport } from "next";
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

const siteUrl = "https://nyang2.pages.dev";
const siteTitle = "냥냥";
const siteDescription =
  "발바닥 건반으로 연주하고 MML로 작곡하는 멀티터치 웹 음악 앱입니다.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "냥냥",
  description: siteDescription,
  applicationName: "냥냥",
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: "냥냥",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 512,
        height: 512,
        alt: "냥냥 발바닥 마크",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteTitle,
    description: siteDescription,
    images: ["/og.png"],
  },
  icons: {
    icon: "/assets/themes/default/pawpad.svg",
    shortcut: "/assets/themes/default/pawpad.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "냥냥",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f2e8",
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
