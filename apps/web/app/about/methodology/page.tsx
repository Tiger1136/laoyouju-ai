import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "回答如何形成（方法说明）",
  description: "劳有据 AI 的回答基于检索资料生成：检索只依据已核对的官方资料，source_id 由程序校验；事实不足时追问关键事实并给出已确定的法律框架，不拒绝作答。",
};

export default function MethodologyPage() {
  return (
    <div className="container prose">
      <h1>回答如何形成</h1>
      <ol>
        <li>
          <strong>回答基于检索资料</strong>：每个回答只依据已与官方来源核对的资料生成，不凭空作答。
        </li>
        <li>
          <strong>DeepSeek 负责生成</strong>：生成模型负责组织语言与结构，不引入资料之外的事实。
        </li>
        <li>
          <strong>source_id 由程序校验</strong>：回答引用的每个来源编号都必须存在于本次检索结果中，校验不通过不会展示；出现异常引用时会改为基于真实证据的追问。
        </li>
        <li>
          <strong>事实不足时追问关键信息</strong>：个案事实不完整时，返回“已能确定的法律框架 + 可能结论及条件 + 需要你补充的事实 + 建议准备的证据”，请用户补充后重新提问，不会给出无依据的结论。
        </li>
        <li>
          <strong>非劳动问题不处理</strong>：明确非劳动争议问题（做饭、天气、股票、写作等）会返回固定领域引导并给出可改问的劳动问题示例。
        </li>
        <li>
          <strong>当前不覆盖地方规则</strong>：首版只覆盖全国性规则；依赖地区规则的问题会提示并引导核验地方官方来源。
        </li>
      </ol>
    </div>
  );
}
