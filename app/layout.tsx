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
const siteDescription = "그냥 마비노기 모바일 작곡 mml 고양이 건반 어쩌구...";

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
  verification: {
    google: "J__UMFOLO82I8VesZ8u-cGN4JRPvcTGOZRKqNAdjba4",
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
