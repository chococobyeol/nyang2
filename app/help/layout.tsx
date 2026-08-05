import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "도움말 | 냥냥",
  description: "냥냥 건반 연주와 MML 작곡 기능을 화면으로 설명하는 사용 안내입니다.",
};

export default function HelpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
