import {
  ArrowDown,
  BarChart3,
  CheckCircle2,
  Loader2,
  Send,
  Sparkles,
  Vote
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

const slotLabels = {
  model_1: "模型 ①",
  model_2: "模型 ②",
  model_3: "模型 ③",
  model_4: "模型 ④"
};

const guideTags = [
  { label: "医疗", text: "我想用AI整合病历、影像和检查数据，提前发现疾病风险并优化诊疗流程。" },
  { label: "制造", text: "我想用AI重构工厂质检和设备维护，让产线从事后处理变成提前预测。" },
  { label: "教育", text: "我想用AI根据学生学习轨迹生成个性化训练路径，让教师更快发现薄弱点。" },
  { label: "农业", text: "我想用AI结合农田图像、气象和土壤数据，自动制定种植和防灾方案。" },
  { label: "政务", text: "我想用AI把群众诉求、部门工单和城市事件连接起来，提高基层治理效率。" },
  { label: "科研", text: "我想用AI阅读论文和实验数据，自动提出可验证的新假设，缩短科研试错周期。" }
];

const levelClasses = {
  1: "level-one",
  2: "level-two",
  3: "level-three"
};

function makeCards() {
  return Object.entries(slotLabels).map(([slot, label]) => ({
    slot,
    label,
    text: "",
    done: false,
    error: "",
    realName: "",
    modelKey: "",
    status: "waiting"
  }));
}

function getSessionId() {
  const existing = localStorage.getItem("ai_productivity_session_id");
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  localStorage.setItem("ai_productivity_session_id", sessionId);
  return sessionId;
}

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || "请求失败");
  }
  return data;
}

export default function App() {
  const [sessionId] = useState(getSessionId);
  const [idea, setIdea] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [ideaId, setIdeaId] = useState(null);
  const [phase, setPhase] = useState("input");
  const [cards, setCards] = useState(makeCards);
  const [submitError, setSubmitError] = useState("");
  const [streamError, setStreamError] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [distribution, setDistribution] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const streamRef = useRef(null);
  const resultRef = useRef(null);

  const allDone = cards.every((card) => card.done || card.error);
  const hasSelectableCard = cards.some((card) => card.done && !card.error);
  const selectedCard = cards.find((card) => card.slot === selectedSlot);

  const distributionByModel = useMemo(() => {
    return new Map(distribution.map((item) => [item.model, item]));
  }, [distribution]);

  function scrollTo(ref) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyTag(tag) {
    setSelectedTag(tag.label);
    setIdea(tag.text);
    inputRef.current?.focus();
  }

  async function submitIdea(event) {
    event.preventDefault();
    const content = idea.trim();
    if (content.length < 10) {
      setSubmitError("再多说几句，让 AI 更好地理解你的想法");
      return;
    }

    setSubmitError("");
    setStreamError("");
    setSelectedSlot("");
    setDistribution([]);
    setRevealed(false);
    setResult(null);
    setResultError("");
    setCards(makeCards());
    setPhase("submitting");

    try {
      const data = await readJson(
        await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            content,
            tag: selectedTag || null
          })
        })
      );
      setIdeaId(data.idea_id);
      setPhase("streaming");
      setTimeout(() => scrollTo(streamRef), 80);
      startStream(data.idea_id);
    } catch (error) {
      setPhase("input");
      setSubmitError(error.message);
    }
  }

  function startStream(nextIdeaId) {
    const source = new EventSource(`/api/stream-responses?idea_id=${nextIdeaId}`);
    let completed = false;

    source.addEventListener("meta", (event) => {
      const data = JSON.parse(event.data);
      setCards((previous) =>
        previous.map((card) => {
          const slot = data.slots?.find((item) => item.slot === card.slot);
          return slot ? { ...card, label: slot.label } : card;
        })
      );
    });

    source.addEventListener("chunk", (event) => {
      const data = JSON.parse(event.data);
      setCards((previous) =>
        previous.map((card) =>
          card.slot === data.model
            ? { ...card, text: `${card.text}${data.text}`, status: "streaming" }
            : card
        )
      );
    });

    source.addEventListener("model_error", (event) => {
      const data = JSON.parse(event.data);
      setCards((previous) =>
        previous.map((card) =>
          card.slot === data.model
            ? { ...card, error: data.message || "该模型暂时无法响应", status: "error" }
            : card
        )
      );
    });

    source.addEventListener("done", (event) => {
      const data = JSON.parse(event.data);
      setCards((previous) =>
        previous.map((card) =>
          card.slot === data.model ? { ...card, done: true, status: card.error ? "error" : "done" } : card
        )
      );
    });

    source.addEventListener("fatal", (event) => {
      const data = JSON.parse(event.data);
      setStreamError(data.message || "流式连接失败");
      completed = true;
      source.close();
    });

    source.addEventListener("all_done", () => {
      completed = true;
      source.close();
      setPhase("ready_to_vote");
    });

    source.onerror = () => {
      if (!completed) {
        setStreamError("连接中断，请刷新后重试");
        setPhase("ready_to_vote");
      }
      source.close();
    };
  }

  async function voteFor(slot) {
    if (!ideaId || selectedSlot) return;

    setSelectedSlot(slot);
    try {
      const data = await readJson(
        await fetch("/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idea_id: ideaId,
            session_id: sessionId,
            slot
          })
        })
      );

      setDistribution(data.distribution || []);
      setCards((previous) =>
        previous.map((card) => {
          const reveal = data.reveal?.find((item) => item.slot === card.slot);
          return reveal
            ? {
                ...card,
                realName: reveal.display_name,
                modelKey: reveal.model,
                status: reveal.status
              }
            : card;
        })
      );
      setRevealed(true);
      setPhase("voted");
    } catch (error) {
      setSelectedSlot("");
      setStreamError(error.message);
    }
  }

  async function loadResults() {
    if (!ideaId || !selectedSlot) return;
    setPhase("results");
    setResultLoading(true);
    setResultError("");
    setTimeout(() => scrollTo(resultRef), 80);

    try {
      const data = await readJson(await fetch(`/api/results?idea_id=${ideaId}`));
      setResult(data);
    } catch (error) {
      setResultError(error.message);
    } finally {
      setResultLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="section hero-section">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={16} />
              互动体验页
            </div>
            <h1>AI × 新质生产力</h1>
            <p>
              写下一个方向，让四个模型匿名提出方案，投票后看到你的想法处在哪一层。
            </p>
            <button className="primary-button" onClick={() => scrollTo(inputRef)}>
              <ArrowDown size={18} />
              开始
            </button>
          </div>
          <div className="signal-board" aria-hidden="true">
            <div className="signal-card gradient-a">
              <span>流程重构</span>
              <strong>72</strong>
            </div>
            <div className="signal-card gradient-b">
              <span>能力涌现</span>
              <strong>91</strong>
            </div>
            <div className="signal-card gradient-c">
              <span>思想共振</span>
              <strong>18</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section input-section" ref={inputRef}>
        <div className="section-heading">
          <span>01</span>
          <h2>输入你的想法</h2>
        </div>

        <form className="input-panel" onSubmit={submitIdea}>
          <div className="tag-row">
            {guideTags.map((tag) => (
              <button
                className={selectedTag === tag.label ? "tag-chip active" : "tag-chip"}
                key={tag.label}
                type="button"
                onClick={() => applyTag(tag)}
              >
                {tag.label}
              </button>
            ))}
          </div>
          <textarea
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="例如：用 AI 连接病历、影像和检查数据，提前发现疾病风险，并重构诊疗流程。"
            maxLength={1000}
          />
          <div className="form-footer">
            <span className={idea.trim().length < 10 ? "hint warn" : "hint"}>
              {idea.trim().length}/1000
            </span>
            <button className="primary-button" disabled={phase === "submitting"} type="submit">
              {phase === "submitting" ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              生成四个方案
            </button>
          </div>
          {submitError && <p className="error-text">{submitError}</p>}
        </form>
      </section>

      <section className="section stream-section" ref={streamRef}>
        <div className="section-heading">
          <span>02</span>
          <h2>四模型匿名 PK</h2>
        </div>

        <div className="model-grid">
          {cards.map((card) => {
            const voteStats = card.modelKey ? distributionByModel.get(card.modelKey) : null;
            const canVote = allDone && card.done && !card.error && !selectedSlot;
            const isSelected = selectedSlot === card.slot;
            return (
              <article
                className={[
                  "model-card",
                  isSelected ? "selected" : "",
                  card.error ? "failed" : "",
                  revealed ? "revealed" : ""
                ].join(" ")}
                key={card.slot}
              >
                <header>
                  <div className="flip-label">
                    <span>{revealed && card.realName ? card.realName : card.label}</span>
                  </div>
                  {card.done && !card.error ? <CheckCircle2 size={17} /> : null}
                </header>
                <div className="model-output">
                  {card.error ? (
                    <p className="muted">{card.error}</p>
                  ) : card.text ? (
                    <p>{card.text}</p>
                  ) : phase === "streaming" ? (
                    <p className="muted">等待响应...</p>
                  ) : (
                    <p className="muted">提交想法后开始</p>
                  )}
                </div>
                <footer>
                  {!revealed ? (
                    <button className="vote-button" disabled={!canVote} onClick={() => voteFor(card.slot)}>
                      <Vote size={16} />
                      选它
                    </button>
                  ) : (
                    <div className="vote-result">
                      <div className="vote-meta">
                        <span>{card.realName}</span>
                        <strong>{voteStats?.percent || 0}%</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          className={isSelected ? "bar-fill active" : "bar-fill"}
                          style={{ width: `${voteStats?.percent || 0}%` }}
                        />
                      </div>
                      <span className="vote-count">{voteStats?.count || 0} 票</span>
                    </div>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        <div className="stream-actions">
          {phase === "streaming" && (
            <span className="live-status">
              <Loader2 className="spin" size={16} />
              生成中
            </span>
          )}
          {streamError && <p className="error-text">{streamError}</p>}
          {phase === "ready_to_vote" && hasSelectableCard && (
            <p className="muted center">选择你认为最有启发的方案</p>
          )}
          {phase === "voted" && (
            <button className="secondary-button" onClick={loadResults}>
              <BarChart3 size={17} />
              查看你的结果
            </button>
          )}
        </div>
      </section>

      <section className="section result-section" ref={resultRef}>
        <div className="section-heading">
          <span>03</span>
          <h2>结果卡片</h2>
        </div>

        {!selectedSlot ? (
          <div className="locked-panel">
            <Vote size={20} />
            <p>投票后解锁</p>
          </div>
        ) : resultLoading ? (
          <div className="locked-panel">
            <Loader2 className="spin" size={22} />
            <p>正在生成结果</p>
          </div>
        ) : resultError ? (
          <div className="locked-panel">
            <p>{resultError}</p>
            <button className="secondary-button" onClick={loadResults}>
              重试
            </button>
          </div>
        ) : result ? (
          <div className="result-layout">
            <article className="resonance-card">
              <span className="card-kicker">思想共振</span>
              {result.resonance.total_same_direction ? (
                <>
                  <h3>
                    有 {result.resonance.total_same_direction} 人和你关注了同一方向：
                    {result.resonance.direction}
                  </h3>
                  <div className="similar-list">
                    {result.resonance.similar_ideas.map((item) => (
                      <p key={item}>{item}</p>
                    ))}
                  </div>
                </>
              ) : (
                <h3>你是最早的探路者之一，等更多人参与后回来看看谁和你想法一致</h3>
              )}
            </article>

            <article className={`evaluation-card ${levelClasses[result.evaluation.level]}`}>
              <span className="card-kicker">AI 评判</span>
              <div className="level-badge">
                第{result.evaluation.level}层：{result.evaluation.level_name}
              </div>
              <blockquote>{result.evaluation.comment}</blockquote>
              <div className="score-row">
                <div>
                  <span>得分</span>
                  <strong>{result.evaluation.score}</strong>
                </div>
                <div>
                  <span>百分位</span>
                  <strong>
                    {result.evaluation.percentile === null
                      ? "首位"
                      : `${result.evaluation.percentile}%`}
                  </strong>
                </div>
              </div>
              <p className="surpass">
                {result.evaluation.percentile === null
                  ? "你是第一位参与者"
                  : `你超越了 ${result.evaluation.percentile}% 的参与者`}
              </p>
              {selectedCard?.realName && <p className="chosen-model">你选择了 {selectedCard.realName}</p>}
            </article>
          </div>
        ) : (
          <div className="locked-panel">
            <BarChart3 size={20} />
            <p>点击上方按钮查看</p>
          </div>
        )}
      </section>
    </main>
  );
}
