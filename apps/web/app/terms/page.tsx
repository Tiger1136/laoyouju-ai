import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使用条款",
  description: "上线前草案：本站不是律师，不提供诉讼代理，不保证案件结果。",
};

export default function TermsPage() {
  return (
    <div className="container prose">
      <h1>使用条款</h1>
      <p className="draft-badge">上线前草案</p>
      <ul>
        <li>本站是劳动争议法律信息检索与行动辅助工具，不是律师，不提供诉讼代理服务；</li>
        <li>本站内容由 AI 辅助生成，不构成法律意见，不保证案件结果；</li>
        <li>本站不输出胜诉率，不承诺任何案件的处理结果；</li>
        <li>涉及具体案件时，建议咨询执业律师或当地法律援助机构。</li>
      </ul>
    </div>
  );
}
