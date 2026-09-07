"use client";

import { useState } from "react";
import type { AskSuccessResponse, SourceCitation } from "@laoyouju/shared";
import { EXAMPLE_QUESTIONS, submitQuestion, type AskUiState } from "@/lib/api";
import {
  CLARIFICATION_FOLLOWUP_HINT,
  COVERAGE_NOTE,
  answerSections,
  citationView,
  clarificationSections,
  groupSources,
  similarCasesOrPlaceholder,
} from "@/lib/present";

const MAX_LENGTH = 500;
const MIN_LENGTH = 2;

/** 输入是否包含实质文字/数字（空白、纯标点不算可提交内容）。 */
function hasContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function AskForm() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskUiState>({ status: "idle" });
  const trimmed = question.trim();
  const validLength = trimmed.length >= MIN_LENGTH && trimmed.length <= MAX_LENGTH;
  const validContent = hasContent(trimmed);
  const canSubmit = validLength && validContent && state.status !== "loading";
  const showInputHint = question.length > 0 && !validContent;

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setState({ status: "loading" });
    const next = await submitQuestion(trimmed);
    setState(next);
  }

  function fillExample(value: string) {
    setQuestion(value);
  }

  return (
    <div className="ask-form">
      <div className="ask-panel">
      <label htmlFor="question-input" className="ask-label">
        描述你的劳动问题
      </label>
      <textarea
        id="question-input"
        className="ask-input"
        value={question}
        onChange={(event) => setQuestion(event.target.value.slice(0, MAX_LENGTH))}
        placeholder="例如：公司以我未完成任务为由解除劳动合同，我该怎么办？"
        rows={6}
        maxLength={MAX_LENGTH}
        aria-describedby="question-hint"
      />
      <p id="question-hint" className="ask-count" aria-live="polite">
        {question.length} / {MAX_LENGTH} 字
        {showInputHint ? " · 请输入包含文字内容的问题（空白或纯标点无法识别）" : ""}
      </p>
      <button
        type="button"
        className="ask-submit"
        onClick={handleSubmit}
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
      >
        {state.status === "loading" ? "正在分析…" : "提交问题"}
      </button>
      {state.status === "loading" ? (
        <p className="ask-loading" aria-live="polite">
          正在检索权威依据并生成分析，请稍候…
        </p>
      ) : null}
      <p className="ask-note">
        请勿输入姓名、身份证号、手机号、公司商业秘密等敏感信息；本回答由 AI 生成，仅供参考，不构成法律意见。
      </p>
      <p className="ask-privacy" aria-live="polite">
        你的问题仅用于本次提问，服务端日志不会记录问题原文。
      </p>
      </div>

      {state.status === "answered" && state.data ? (
        <AnswerResult data={state.data} />
      ) : state.status === "needs_clarification" && state.data ? (
        <ClarificationResult data={state.data} />
      ) : state.status === "out_of_scope" && state.data ? (
        <OutOfScopeResult data={state.data} onExample={fillExample} />
      ) : state.status === "error" ? (
        <div className="ask-error" role="alert">
          <p>{state.errorMessage}</p>
        </div>
      ) : null}

      <div className="ask-examples">
        <p className="ask-examples-title">问题示例</p>
        <ul>
          {EXAMPLE_QUESTIONS.map((q) => (
            <li key={q}>
              <button
                type="button"
                className="example-button"
                onClick={() => fillExample(q)}
                disabled={state.status === "loading"}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AnswerResult({ data }: { data: AskSuccessResponse }) {
  const answer = data.answer;
  if (answer === null) {
    return null;
  }
  const sections = answerSections(data);
  const similarCases = similarCasesOrPlaceholder(answer);
  return (
    <section className="answer-result answered" aria-live="polite">
      <p className="ai-identity">AI 生成 · 仅供参考，不构成法律意见</p>
      {sections.map((section) =>
        section.items === null ? (
          section.key === "similarCases" ? (
            <div key={section.key}>
              <h3>{section.heading}</h3>
              <p className="answer-empty">{similarCases[0]}</p>
            </div>
          ) : null
        ) : (
          <div key={section.key}>
            <h3>{section.heading}</h3>
            <ul>
              {section.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ),
      )}

      <h3>覆盖范围说明</h3>
      <p className="answer-coverage">{COVERAGE_NOTE}</p>
      <p className="answer-coverage-source">
        来源分级：A 级·全国性法律依据 / B 级·官方案例参考（类案参考，无普遍约束力） / C 级·地方裁审参考（仅山东省，非全国统一规则）；每张来源卡片均带分级文字标签。
      </p>

      {data.sources.length > 0 && (
        <>
          <h3>可核验来源（按类型分组）</h3>
          <GroupedSources sources={data.sources} />
        </>
      )}

      <p className="answer-ai-notice">{answer.aiNotice}</p>
    </section>
  );
}

function ClarificationResult({ data }: { data: AskSuccessResponse }) {
  const sections = clarificationSections(data);
  if (sections.framework.length === 0 && sections.conclusions.length === 0) {
    return null;
  }
  return (
    <section className="answer-result clarification" aria-live="polite">
      <p className="ai-identity">AI 生成 · 仅供参考，不构成法律意见</p>
      <h3>已能确定的法律框架</h3>
      <ul>
        {sections.framework.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h3>可能存在的不同结论及条件</h3>
      <ul>
        {sections.conclusions.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h3>决定结论所需的关键事实</h3>
      <ul>
        {sections.keyFacts.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h3>建议你准备的证据</h3>
      <ul>
        {sections.evidence.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <p className="answer-followup">{CLARIFICATION_FOLLOWUP_HINT}</p>

      {data.sources.length > 0 && (
        <>
          <h3>可核验来源（按类型分组）</h3>
          <GroupedSources sources={data.sources} />
        </>
      )}

      <p className="answer-ai-notice">{data.clarification?.aiNotice}</p>
    </section>
  );
}

function OutOfScopeResult({ data, onExample }: { data: AskSuccessResponse; onExample: (q: string) => void }) {
  const { outOfScope } = data;
  if (!outOfScope) {
    return null;
  }
  return (
    <section className="answer-result out-of-scope" role="status" aria-live="polite">
      <p className="out-of-scope-message">{outOfScope.message}</p>
      {outOfScope.suggestedTopics.length > 0 && (
        <>
          <h3>你可以这样提问</h3>
          <ul className="suggested-topics">
            {outOfScope.suggestedTopics.map((item, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="example-button"
                  onClick={() => onExample(item)}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="answer-ai-notice">{outOfScope.aiNotice}</p>
    </section>
  );
}

function GroupedSources({ sources }: { sources: SourceCitation[] }) {
  const groups = groupSources(sources);
  return (
    <div className="source-groups">
      {groups.map((g) => (
        <div key={g.group} className="source-group">
          <h4>{g.label}</h4>
          <ul className="source-list">
            {g.items.map((s) => (
              <CitationItem key={s.citationRef} source={s} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CitationItem({ source }: { source: SourceCitation }) {
  const v = citationView(source);
  return (
    <li className={"source-item source-" + (source.sourceLevel ?? "").toLowerCase()}>
      <a href={v.url} target="_blank" rel="noopener noreferrer">
        [{v.ref}] {v.title}
      </a>
      {v.locator ? <span className="source-locator">（{v.locator}）</span> : null}
      <span className="source-meta">
        {v.sourceLevelLabel} · {v.sourceTypeLabel} · {v.authority} · {v.jurisdiction} · {v.validityStatusLabel} · {v.reviewLabel}
      </span>
      {v.excerpt ? <p className="source-excerpt">{v.excerpt}</p> : null}
      <p className="source-link">
        <a href={v.url} target="_blank" rel="noopener noreferrer">查看官方来源</a>
        {v.publishedDate ? `（${v.publishedDate}）` : ""}
      </p>
    </li>
  );
}