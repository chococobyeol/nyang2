import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 냥냥",
  description: "냥냥 웹 건반의 개인정보 처리와 마이크 권한 안내입니다.",
};

export default function PrivacyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
