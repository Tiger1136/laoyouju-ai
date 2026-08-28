import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "隐私政策",
  description: "上线前草案：首版不要求登录，不主动收集身份信息，私人问答不公开。",
};

export default function PrivacyPage() {
  return (
    <div className="container prose">
      <h1>隐私政策</h1>
      <p className="draft-badge">上线前草案</p>
      <p>本页面为上线前草案，正式上线前将根据实际功能完善。</p>
      <ul>
        <li>首版不要求登录，不主动收集姓名、身份证号、公司全称等身份信息；</li>
        <li>问答输入仅用于生成回答，私人问答结果不公开、不参与搜索收录；</li>
        <li>如后续功能需要收集信息，将在此页面更新说明并遵守适用法律。</li>
      </ul>
    </div>
  );
}
