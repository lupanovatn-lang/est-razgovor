"use client";

import { useEffect, useMemo, useState } from "react";
import {
  goalLabel,
  goalOptions,
  suggestGoalKind,
  type ConversationPlan,
  type GoalKind,
  type PlanStep,
} from "../lib/plans";

type View = "compose" | "plan" | "rehearsal";

type ChatMessage = { role: "parent" | "child"; text: string };

type SavedConversation = {
  id: string;
  title: string;
  topic: string;
  situation: string;
  goalKind: GoalKind;
  goalText: string;
  age: string;
  reaction: string;
  plan: ConversationPlan;
  updatedAt: number;
};

const topics = ["Гаджеты и интернет", "Учёба", "Правила дома", "Друзья", "Деньги", "Другое"];
const reactions = [
  "Замыкается и молчит",
  "Спорит и защищается",
  "Злится",
  "Обвиняет меня",
  "Расстраивается",
  "Соглашается, но не делает",
];

const STORAGE_KEY = "est-razgovor-conversations";

const GENERATING_STEP_SLOTS = 4;

function GoalIcon({ kind }: { kind: GoalKind }) {
  // Always show a target for the conversation goal.
  void kind;
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="4.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

function loadSaved(): SavedConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedConversation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSaved(items: SavedConversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 30)));
}

export default function Home() {
  const [view, setView] = useState<View>("compose");
  const [topic, setTopic] = useState("Гаджеты и интернет");
  const [age, setAge] = useState("");
  const [situation, setSituation] = useState("");
  const [goalKind, setGoalKind] = useState<GoalKind>("agree");
  const [goalText, setGoalText] = useState("");
  const [goalTouched, setGoalTouched] = useState(false);
  const [reaction, setReaction] = useState("Спорит и защищается");
  const [plan, setPlan] = useState<ConversationPlan | null>(null);
  const [planSource, setPlanSource] = useState<"openai" | "fallback" | null>(null);
  const [planWarning, setPlanWarning] = useState("");
  const [planError, setPlanError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [savedList, setSavedList] = useState<SavedConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [openPlanStep, setOpenPlanStep] = useState("01");
  const [moreReactions, setMoreReactions] = useState<Record<string, boolean>>({});
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coachTip, setCoachTip] = useState("");
  const [tryPhrase, setTryPhrase] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [rehearseLoading, setRehearseLoading] = useState(false);
  const [rehearseError, setRehearseError] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);

  const childName = age ? `${age} лет` : "ребёнок";
  const suggested = useMemo(
    () => suggestGoalKind(situation, topic),
    [situation, topic],
  );

  useEffect(() => {
    setSavedList(loadSaved());
  }, []);

  useEffect(() => {
    if (!goalTouched) setGoalKind(suggested);
  }, [suggested, goalTouched]);

  useEffect(() => {
    if (!generating) {
      setStatusIndex(0);
      return;
    }
    setStatusIndex(0);
    const id = window.setInterval(() => {
      setStatusIndex((i) => Math.min(i + 1, GENERATING_STEP_SLOTS));
    }, 900);
    return () => window.clearInterval(id);
  }, [generating]);

  const resetNew = () => {
    setActiveId(null);
    setTopic("Гаджеты и интернет");
    setAge("");
    setSituation("");
    setGoalKind("agree");
    setGoalText("");
    setGoalTouched(false);
    setReaction("Спорит и защищается");
    setPlan(null);
    setPlanSource(null);
    setPlanWarning("");
    setPlanError("");
    setOpenPlanStep("01");
    setMoreReactions({});
    setMessages([]);
    setReply("");
    setCoachTip("");
    setTryPhrase("");
    setSignals([]);
    setFeedback("");
    setRehearseError("");
    setView("compose");
  };

  const selectGoal = (kind: GoalKind) => {
    setGoalTouched(true);
    setGoalKind(kind);
    if (!goalText.trim() || goalOptions.some((g) => g.label === goalText)) {
      setGoalText(goalLabel(kind));
    }
  };

  const generatePlan = async () => {
    if (!situation.trim()) {
      setPlanError("Опишите ситуацию");
      return;
    }
    setGenerating(true);
    setPlanError("");
    setPlanWarning("");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          situation,
          goalKind,
          goalText,
          age,
          reaction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось составить план");
      setPlan(data.plan as ConversationPlan);
      setPlanSource(
        data.source === "openai" || data.source === "openrouter" ? "openai" : "fallback",
      );
      setPlanWarning(data.warning || "");
      setOpenPlanStep("01");
      setMoreReactions({});
      setView("plan");
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setGenerating(false);
    }
  };

  const saveConversation = () => {
    if (!plan) return;
    const item: SavedConversation = {
      id: activeId || crypto.randomUUID(),
      title: plan.title,
      topic,
      situation,
      goalKind,
      goalText,
      age,
      reaction,
      plan,
      updatedAt: Date.now(),
    };
    const next = [item, ...savedList.filter((x) => x.id !== item.id)];
    setSavedList(next);
    persistSaved(next);
    setActiveId(item.id);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  };

  const openSaved = (item: SavedConversation) => {
    setActiveId(item.id);
    setTopic(item.topic);
    setSituation(item.situation);
    setGoalKind(item.goalKind);
    setGoalText(item.goalText);
    setGoalTouched(true);
    setAge(item.age);
    setReaction(item.reaction);
    setPlan(item.plan);
    setPlanSource("openai");
    setPlanWarning("");
    setOpenPlanStep("01");
    setMessages([]);
    setView("plan");
  };

  const copyPlan = async () => {
    if (!plan) return;
    const lines = [
      plan.title,
      "",
      `Цель: ${goalText || goalLabel(goalKind)}`,
      `Тема: ${topic}`,
      `Возраст: ${childName}`,
      "",
      ...plan.steps.map(
        (s, i) =>
          `${i + 1}. ${s.title}\nЗачем: ${s.why}\nЧто сделать: ${s.action}${
            s.phrase ? `\nФраза: ${s.phrase}` : ""
          }`,
      ),
    ];
    if (plan.nonNegotiable) lines.push("", `Что не обсуждается: ${plan.nonNegotiable}`);
    if (plan.discussable) lines.push(`Что можно решить вместе: ${plan.discussable}`);
    await navigator.clipboard?.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const openingPhrase =
    plan?.steps.find((s) => s.phrase)?.phrase ||
    "Я хочу спокойно поговорить. Мне важно услышать тебя.";

  const startRehearsal = async () => {
    if (!plan) return;
    setView("rehearsal");
    setMessages([{ role: "parent", text: openingPhrase }]);
    setCoachTip("");
    setTryPhrase("");
    setSignals([]);
    setFeedback("");
    setRehearseError("");
    setRehearseLoading(true);
    try {
      const res = await fetch("/api/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          situation,
          goalKind,
          goalText,
          age,
          reaction,
          planTitle: plan.title,
          openingPhrase,
          messages: [{ role: "parent", text: openingPhrase }],
          parentReply: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось начать репетицию");
      setMessages([
        { role: "parent", text: openingPhrase },
        { role: "child", text: data.childMessage },
      ]);
      setCoachTip(data.coachTip || "");
      setTryPhrase(data.tryPhrase || "");
      setSignals(data.signals || []);
      setFeedback(data.feedback || "");
    } catch (e) {
      setRehearseError(e instanceof Error ? e.message : "Ошибка репетиции");
    } finally {
      setRehearseLoading(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !plan || rehearseLoading) return;
    const parentText = reply.trim();
    setReply("");
    const nextHistory: ChatMessage[] = [...messages, { role: "parent", text: parentText }];
    setMessages(nextHistory);
    setRehearseLoading(true);
    setRehearseError("");
    try {
      const res = await fetch("/api/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          situation,
          goalKind,
          goalText,
          age,
          reaction,
          planTitle: plan.title,
          openingPhrase,
          messages: nextHistory,
          parentReply: parentText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось получить ответ");
      setMessages([...nextHistory, { role: "child", text: data.childMessage }]);
      setCoachTip(data.coachTip || "");
      setTryPhrase(data.tryPhrase || "");
      setSignals(data.signals || []);
      setFeedback(data.feedback || "");
    } catch (e) {
      setRehearseError(e instanceof Error ? e.message : "Ошибка репетиции");
    } finally {
      setRehearseLoading(false);
    }
  };

  function SettingsPanel() {
    return (
      <aside className="settings-panel">
        <div className="settings-scroll">
          <h2>Параметры разговора</h2>
          <p className="settings-lead">
            Опишите ситуацию и цель — справа появится план.
          </p>

          {savedList.length > 0 && (
            <div className="settings-saved">
              <span className="field-label">Сохранённые</span>
              <div className="saved-pills">
                {savedList.slice(0, 5).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={activeId === item.id ? "saved-pill active" : "saved-pill"}
                    onClick={() => openSaved(item)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="field-label" htmlFor="topic">
            Тема
          </label>
          <div className="select-wrap">
            <select
              id="topic"
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value);
                setGoalTouched(false);
              }}
            >
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <label className="field-label" htmlFor="situation">
            Что случилось?
          </label>
          <textarea
            id="situation"
            className="settings-input"
            value={situation}
            onChange={(e) => {
              setSituation(e.target.value);
              setGoalTouched(false);
            }}
            rows={4}
            placeholder="Кратко опишите ситуацию"
          />

          <label className="field-label" htmlFor="goalKind">
            Цель разговора
          </label>
          <div className="select-wrap">
            <select
              id="goalKind"
              value={goalKind}
              onChange={(e) => selectGoal(e.target.value as GoalKind)}
            >
              {goalOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          {!goalTouched && situation.trim() && (
            <p className="settings-hint">
              Предложили по описанию: {goalLabel(suggested)}. Можно изменить.
            </p>
          )}

          <label className="field-label" htmlFor="goal">
            Результат своими словами
          </label>
          <textarea
            id="goal"
            className="settings-input"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            rows={2}
            placeholder="Например: договориться о телефоне после 22:30"
          />

          <div className="settings-row">
            <div>
              <label className="field-label" htmlFor="age">
                Возраст
              </label>
              <div className="age-row compact">
                <input
                  id="age"
                  className="age settings-input"
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="13"
                />
                <span>лет</span>
              </div>
            </div>
          </div>

          <label className="field-label" htmlFor="reaction">
            Как обычно реагирует
          </label>
          <div className="select-wrap">
            <select
              id="reaction"
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
            >
              {reactions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {planError && <div className="form-error">{planError}</div>}
        </div>

        <div className="settings-footer">
          <button
            type="button"
            className="generate-btn"
            disabled={generating || !situation.trim()}
            onClick={() => void generatePlan()}
          >
            {generating ? "Составляем…" : plan ? "Обновить план" : "+ Составить план"}
          </button>
          <p className="settings-privacy">
            Описание используется только для составления плана
          </p>
        </div>
      </aside>
    );
  }

  function EmptyState() {
    return (
      <div className="empty-plan">
        <div className="empty-plan-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="10" y="8" width="28" height="34" rx="6" stroke="#b8b6ef" strokeWidth="2" />
            <path d="M18 18h12M18 24h12M18 30h8" stroke="#b8b6ef" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1>Здесь появится план разговора</h1>
        <p>
          Заполните параметры слева и нажмите «Составить план». Структура шагов подстроится
          под вашу цель.
        </p>
      </div>
    );
  }

  function GeneratingState() {
    const filled = Math.min(GENERATING_STEP_SLOTS, statusIndex);
    const titleReady = statusIndex > 0;

    return (
      <section className="plan-wrap generating-plan" aria-live="polite" aria-busy="true">
        <header className="plan-header">
          {titleReady ? (
            <h1 className="generating-title">Составляем план…</h1>
          ) : (
            <div className="skeleton-title shimmer" aria-hidden="true" />
          )}
          <div className="goal-badge">
            <span className="goal-badge-icon">
              <GoalIcon kind={goalKind} />
            </span>
            <span>
              <span className="goal-badge-label">Цель разговора</span>
              {goalText || goalLabel(goalKind)}
            </span>
          </div>
        </header>

        <div className="plan-flow" aria-hidden="true">
          {Array.from({ length: GENERATING_STEP_SLOTS }, (_, i) => {
            const state =
              i < filled - 1 ? "done" : i === filled - 1 ? "writing" : "wait";
            return (
              <article key={i} className={`plan-step skeleton-row ${state}`}>
                <div className="plan-step-head">
                  <span className="plan-number">{i + 1}</span>
                  <span className="plan-step-copy">
                    <span className="skeleton-line shimmer title-line" />
                    <span className="skeleton-line shimmer short" />
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function PlanView() {
    if (!plan) return null;

    const focusSettings = () => {
      const el = document.getElementById("situation");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    };

    return (
      <section className="plan-wrap">
        <header className="plan-header">
          <h1>{plan.title}</h1>
          <div className="goal-badge">
            <span className="goal-badge-icon">
              <GoalIcon kind={goalKind} />
            </span>
            <span>
              <span className="goal-badge-label">Цель разговора</span>
              {goalText || goalLabel(goalKind)}
            </span>
          </div>
          {planWarning && <p className="plan-warning">{planWarning}</p>}
        </header>

        <div className="plan-flow">
          {plan.steps.map((s, i) => {
            const n = String(i + 1).padStart(2, "0");
            return <PlanItem key={n} n={n} title={s.title} preview={s.why} step={s} />;
          })}
        </div>

        <div className="plan-bottom-actions">
          <button type="button" className="text-action" onClick={focusSettings}>
            Изменить запрос
          </button>
          <button type="button" className="text-action" onClick={saveConversation}>
            {savedFlash ? "Сохранено" : "Сохранить"}
          </button>
          <button type="button" className="text-action" onClick={copyPlan}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
          <button
            type="button"
            className="rehearse-button"
            onClick={() => void startRehearsal()}
          >
            Потренироваться
          </button>
        </div>
      </section>
    );
  }

  function PlanItem({
    n,
    title,
    preview,
    step: planStep,
  }: {
    n: string;
    title: string;
    preview: string;
    step: PlanStep;
  }) {
    const open = openPlanStep === n;
    const reactionsList = planStep.reactions ?? [];
    const primaryReaction = reactionsList[0];
    const extraReactions = reactionsList.slice(1);
    const showExtras = !!moreReactions[n];
    const hasScenario =
      !!planStep.phrase ||
      (planStep.questions && planStep.questions.length > 0) ||
      reactionsList.length > 0;

    return (
      <article className={open ? "plan-step open" : "plan-step"}>
        <button
          className="plan-step-head"
          aria-expanded={open}
          onClick={() => setOpenPlanStep(open ? "" : n)}
        >
          <span className="plan-number">{Number(n)}</span>
          <span className="plan-step-copy">
            <b>{title}</b>
            <small>{preview}</small>
          </span>
          <span className="plan-more">
            {open ? "Свернуть" : "Подробнее"}
            <img className={open ? "caret open" : "caret"} src="/caret-ref.png" alt="" />
          </span>
        </button>
        {open && (
          <div className="plan-step-body">
            {planStep.action && <p className="step-instruction">{planStep.action}</p>}

            {hasScenario && (
              <div className="scenario-card">
                <div className="scenario-card-title">Как может пройти разговор</div>
                <div className="scenario-flow">
                  {planStep.phrase && (
                    <div className="scenario-turn parent">
                      <span>Вы</span>
                      <p>«{planStep.phrase}»</p>
                    </div>
                  )}
                  {planStep.questions?.map((q) => (
                    <div className="scenario-turn parent" key={q}>
                      <span>Вопрос</span>
                      <p>{q}</p>
                    </div>
                  ))}
                  {primaryReaction && (
                    <div className="scenario-exchange">
                      <div className="scenario-turn child">
                        <span>Ребёнок</span>
                        <p>{primaryReaction.child}</p>
                      </div>
                      <div className="scenario-turn parent">
                        <span>Можно ответить</span>
                        <p>{primaryReaction.parent}</p>
                      </div>
                    </div>
                  )}
                  {showExtras &&
                    extraReactions.map((r) => (
                      <div className="scenario-exchange" key={`${r.child}-${r.parent}`}>
                        <div className="scenario-turn child">
                          <span>Ребёнок</span>
                          <p>{r.child}</p>
                        </div>
                        <div className="scenario-turn parent">
                          <span>Можно ответить</span>
                          <p>{r.parent}</p>
                        </div>
                      </div>
                    ))}
                </div>
                {extraReactions.length > 0 && (
                  <button
                    type="button"
                    className="scenario-more"
                    onClick={() =>
                      setMoreReactions((prev) => ({ ...prev, [n]: !prev[n] }))
                    }
                  >
                    {showExtras
                      ? "Скрыть другие реакции"
                      : `Другие возможные реакции · ${extraReactions.length}`}
                  </button>
                )}
              </div>
            )}

            {planStep.avoid && (
              <div className="avoid-line">
                <span className="avoid-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3.2 4.2h6.2c.7 0 1.2.6 1.1 1.3l-.5 3.2c-.1.7-.7 1.2-1.4 1.2H4.8c-.7 0-1.3-.5-1.4-1.2l-.5-3.2c-.1-.7.4-1.3 1.1-1.3Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M5 4.1V3.4c0-.8.6-1.4 1.4-1.4h.8c.8 0 1.4.6 1.4 1.4v.7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M2.2 11.8 11.8 2.2"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <p>
                  <b>Не стоит:</b> {planStep.avoid}
                </p>
              </div>
            )}

            {planStep.outcome && <p className="step-outcome">{planStep.outcome}</p>}
          </div>
        )}
      </article>
    );
  }

  function Rehearsal() {
    return (
      <section className="rehearsal-wrap">
        <button className="back rehearsal-back" onClick={() => setView("plan")}>
          Вернуться к плану
        </button>
        <div className="rehearsal-grid">
          <div className="chat-card">
            <div className="chat-head">
              <div>
                <div className="live">Репетиция</div>
                <h1>{plan?.title || "Разговор"}</h1>
              </div>
            </div>
            <div className="scenario">
              ИИ отвечает за ребёнка с учётом возраста, цели и привычной реакции.
            </div>
            <div className="messages">
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={m.role === "parent" ? "message parent" : "message child"}
                >
                  <small>{m.role === "parent" ? "Вы" : "Ребёнок"}</small>
                  {m.text}
                </div>
              ))}
              {rehearseLoading && (
                <div className="message child">
                  <small>Ребёнок</small>
                  печатает…
                </div>
              )}
            </div>
            {rehearseError && <div className="form-error rehearse-error">{rehearseError}</div>}
            <div className="composer">
              <textarea
                rows={2}
                placeholder="Ответьте своими словами…"
                value={reply}
                disabled={rehearseLoading}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
              />
              <button
                onClick={() => void sendReply()}
                aria-label="Отправить"
                disabled={rehearseLoading || !reply.trim()}
              >
                ↑
              </button>
            </div>
            <div className="composer-note">Enter — отправить · Здесь нет идеальных ответов</div>
          </div>
          <aside className="coach-card">
            <div className="coach-title">
              <span>✦</span>
              <div>
                <b>Подсказка помощника</b>
                <small>видите только вы</small>
              </div>
            </div>
            <p>
              {coachTip ||
                "Отправьте реплику — появится подсказка под текущий момент разговора."}
            </p>
            {tryPhrase && (
              <div className="try">
                <span>Можно попробовать</span>
                <p>«{tryPhrase}»</p>
              </div>
            )}
            {signals.length > 0 && (
              <div className="signals">
                <b>Что тренируем</b>
                {signals.map((s, i) => (
                  <div key={s}>
                    <span>{i === 0 ? "✓" : "○"}</span>
                    {s}
                  </div>
                ))}
              </div>
            )}
            {feedback && (
              <div className="feedback">
                <b>Короткая обратная связь</b>
                <p>{feedback}</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    );
  }

  const showSettings = view !== "rehearsal";

  return (
    <div className={showSettings ? "app-shell" : "app-shell rehearsal-mode"}>
      <header className="app-header">
        <button type="button" className="brand" onClick={resetNew}>
          <img src="/conversation-mark.png" alt="" />
          <span className="brand-copy">
            <b>Есть разговор</b>
            <small>Подготовка к сложному разговору с ребёнком</small>
          </span>
        </button>
        <button type="button" className="header-new" onClick={resetNew}>
          <img src="/plus.svg" alt="" />
          Новый разговор
        </button>
      </header>

      <div className="app-body">
        {showSettings && SettingsPanel()}
        <section className="workspace">
          <main>
            {view === "rehearsal"
              ? Rehearsal()
              : generating
                ? GeneratingState()
                : view === "plan" && plan
                  ? PlanView()
                  : EmptyState()}
          </main>
          <footer>
            <p>ИИ может ошибаться. В кризисной ситуации обратитесь к специалисту.</p>
            <div>Конфиденциально</div>
          </footer>
        </section>
      </div>
    </div>
  );
}
