import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 内容提示",
  description: "本站内容由 AI 辅助生成；正式上线前将落实适用的生成内容标识要求。",
};

export default function AiNoticePage() {
  return (
    <div className="container prose">
      <h1>AI 内容提示</h1>
      <p className="page-lead">
        本站内容由 AI 辅助生成：回答基于已与官方来源核对的资料，由生成模型组织语言与结构。
      </p>
      <ul>
        <li>回答可能包含不准确或不完整的信息，请以官方发布的法律文本为准并核验来源；</li>
        <li>正式上线前，本站将落实适用的生成内容标识要求（如法律法规对 AI 生成内容标识的规定）；</li>
        <li>本站不提供律师服务，不承诺案件结果。</li>
      </ul>
    </div>
  );
}
