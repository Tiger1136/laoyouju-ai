import type { Metadata } from "next";
import { AskForm } from "@/components/AskForm";

export const metadata: Metadata = {
  title: "开始提问",
  description: "基于已收录的全国性法律与案例资料，由 AI 生成带可核验来源的参考信息；不构成法律意见。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AskPage() {
  return (
    <div className="container">
      <h1>开始提问</h1>
      <AskForm />
    </div>
  );
}
