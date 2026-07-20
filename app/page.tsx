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

type Step = "brief" | "context" | "plan" | "rehearsal";

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
  const [step, setStep] = useState<Step>("brief");
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
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coachTip, setCoachTip] = useState("");
  const [tryPhrase, setTryPhrase] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [rehearseLoading, setRehearseLoading] = useState(false);
  const [rehearseError, setRehearseError] = useState("");

  const progress = step === "brief" ? 1 : step === "context" ? 2 : 3;
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
    setMessages([]);
    setReply("");
    setCoachTip("");
    setTryPhrase("");
    setSignals([]);
    setFeedback("");
    setRehearseError("");
    setStep("brief");
  };

  const selectGoal = (kind: GoalKind) => {
    setGoalTouched(true);
    setGoalKind(kind);
    if (!goalText.trim() || goalOptions.some((g) => g.label === goalText)) {
      setGoalText(goalLabel(kind));
    }
  };

  const generatePlan = async () => {
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
      setPlanSource(data.source === "openai" || data.source === "openrouter" ? "openai" : "fallback");
      setPlanWarning(data.warning || "");
      setOpenPlanStep("01");
      setStep("plan");
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
    setStep("plan");
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
    setStep("rehearsal");
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

  function Form() {
    const context = step === "context";
    return (
      <section className="form-card">
        <div className="eyebrow">{context ? "Шаг 2 из 2" : "Шаг 1 из 2"}</div>
        <h1>
          {context
            ? "Расскажите немного о ребёнке"
            : "Расскажите о предстоящем разговоре с ребёнком"}
        </h1>
        <p className="lead">
          {context
            ? "Возраст и привычная реакция помогут подобрать подходящий тон и вопросы."
            : "Не нужно подбирать идеальные слова, достаточно коротко описать ситуацию."}
        </p>

        {!context ? (
          <>
            <label>О чём вы хотите поговорить?</label>
            <div className="chips">
              {topics.map((x) => (
                <button
                  key={x}
                  className={topic === x ? "chip active" : "chip"}
                  onClick={() => {
                    setTopic(x);
                    setGoalTouched(false);
                  }}
                >
                  {x}
                </button>
              ))}
            </div>

            <label htmlFor="situation">Что случилось или происходит сейчас?</label>
            <textarea
              id="situation"
              value={situation}
              onChange={(e) => {
                setSituation(e.target.value);
                setGoalTouched(false);
              }}
              rows={5}
              placeholder="Кратко опишите ситуацию"
            />
            <div className="hint">
              <span>✦</span>
              <p>
                <b>Можно коротко.</b> Например: что случилось, что вас беспокоит и что уже
                пробовали.
              </p>
            </div>

            <label>Что вы хотите получить в результате разговора?</label>
            <p className="field-hint">
              Например: понять причину поступка, сообщить решение, установить границу,
              поддержать ребёнка или договориться о дальнейших действиях.
            </p>
            <div className="chips goal-chips">
              {goalOptions.map((g) => (
                <button
                  key={g.id}
                  className={goalKind === g.id ? "chip active" : "chip"}
                  onClick={() => selectGoal(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {!goalTouched && situation.trim() && (
              <div className="goal-suggest">
                <span>✦</span>
                <p>
                  Мы предложили цель по описанию ситуации: <b>{goalLabel(suggested)}</b>. Вы
                  можете подтвердить её или выбрать другую.
                </p>
              </div>
            )}

            <label htmlFor="goal">Опишите желаемый результат своими словами</label>
            <textarea
              id="goal"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              rows={3}
              placeholder="Например: понять, почему он скрыл оценку"
            />
          </>
        ) : (
          <>
            <label>Сколько лет ребёнку?</label>
            <div className="age-row">
              <input
                className="age"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="Возраст ребёнка"
                placeholder="13"
              />
              <span>лет</span>
            </div>
            <label>Как ребёнок обычно реагирует?</label>
            <div className="reaction-list">
              {reactions.map((x) => (
                <button
                  key={x}
                  className={reaction === x ? "reaction selected" : "reaction"}
                  onClick={() => setReaction(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            <div className="summary">
              <div>
                <b>Мы учтём контекст</b>
                <p>
                  {childName} · {topic.toLowerCase()} · {goalLabel(goalKind).toLowerCase()} ·{" "}
                  {reaction.toLowerCase()}
                </p>
              </div>
            </div>
            {planError && <div className="form-error">{planError}</div>}
          </>
        )}

        <div className="form-actions">
          {context && (
            <button className="back" onClick={() => setStep("brief")} disabled={generating}>
              Назад
            </button>
          )}
          <button
            className="primary"
            disabled={generating || (!context && !situation.trim())}
            onClick={() => {
              if (!context) {
                setStep("context");
                return;
              }
              void generatePlan();
            }}
          >
            {context
              ? generating
                ? "Составляем план…"
                : "Составить план"
              : "Продолжить"}
          </button>
        </div>
        <div className="privacy">
          <img src="/lock.svg" alt="" />
          Ваше описание используется только для составления плана
        </div>
      </section>
    );
  }

  function PlanView() {
    if (!plan) return null;
    const stepWord =
      plan.steps.length === 1 ? "шаг" : plan.steps.length < 5 ? "шага" : "шагов";

    return (
      <section className="plan-wrap">
        <header className="plan-header">
          <div>
            <button className="plan-back" onClick={() => setStep("context")}>
              К описанию ситуации
            </button>
            <h1>{plan.title}</h1>
            <p>
              План из {plan.steps.length} {stepWord} · ребёнку {childName}
              {planSource === "fallback" ? " · шаблон" : ""}
            </p>
            {planWarning && <p className="plan-warning">{planWarning}</p>}
          </div>
          <div className="plan-actions">
            <button
              className={savedFlash ? "icon-btn saved" : "icon-btn"}
              onClick={saveConversation}
            >
              <img src="/bookmark-ref.png" alt="" />
              {savedFlash ? "Сохранено" : "Сохранить"}
            </button>
            <button className="icon-btn" onClick={copyPlan}>
              <img src="/copy-ref.png" alt="" />
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        </header>

        {(plan.nonNegotiable || plan.discussable) && (
          <div className="boundary-split">
            {plan.nonNegotiable && (
              <div>
                <span>Что не обсуждается</span>
                <p>{plan.nonNegotiable}</p>
              </div>
            )}
            {plan.discussable && (
              <div>
                <span>Что можно решить вместе</span>
                <p>{plan.discussable}</p>
              </div>
            )}
          </div>
        )}

        <div className="plan-layout">
          <div className="plan-flow">
            {plan.steps.map((s, i) => {
              const n = String(i + 1).padStart(2, "0");
              return <PlanItem key={n} n={n} title={s.title} preview={s.why} step={s} />;
            })}
          </div>
          <aside className="plan-cheatsheet">
            <h2>Подготовка к разговору</h2>
            <div className="prep-meta">
              <div>
                <span>Тема</span>
                <p>{topic}</p>
              </div>
              <div>
                <span>Возраст ребёнка</span>
                <p>{childName}</p>
              </div>
              <div>
                <span>Цель разговора</span>
                <p>{goalText || goalLabel(goalKind)}</p>
              </div>
              <div>
                <span>План</span>
                <p>
                  {plan.steps.length} {stepWord}
                </p>
              </div>
            </div>
            <div className="prep-reminder">
              <span>Напоминание</span>
              <p>{plan.reminder}</p>
            </div>
            <button className="edit-plan-button" onClick={() => setStep("brief")}>
              <img src="/pencil-ref.png" alt="" />
              Редактировать план
            </button>
            <button className="rehearse-button" onClick={() => void startRehearsal()}>
              Потренироваться
            </button>
          </aside>
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
            <div className="step-modules">
              {planStep.action && (
                <div className="step-module">
                  <h3>Как действовать</h3>
                  <p className="step-prose">{planStep.action}</p>
                </div>
              )}

              {planStep.phrase && (
                <div className="step-module">
                  <h3>Можно сказать</h3>
                  <div className="quote-card">«{planStep.phrase}»</div>
                </div>
              )}

              {planStep.questions && planStep.questions.length > 0 && (
                <div className="step-module">
                  <h3>Можно спросить</h3>
                  <div className="quote-stack">
                    {planStep.questions.map((q) => (
                      <div className="quote-card" key={q}>
                        {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {planStep.reactions && planStep.reactions.length > 0 && (
                <div className="dialog-pairs">
                  {planStep.reactions.map((r) => (
                    <div className="dialog-pair" key={`${r.child}-${r.parent}`}>
                      <div className="step-module">
                        <h3>Возможная реакция ребёнка</h3>
                        <div className="quote-card">{r.child}</div>
                      </div>
                      <div className="step-module">
                        <h3>Можно ответить</h3>
                        <div className="quote-card">{r.parent}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {planStep.avoid && (
                <div className="step-module">
                  <h3>Лучше не говорить</h3>
                  <div className="warn-chip">{planStep.avoid}</div>
                </div>
              )}

              {planStep.outcome && (
                <div className="step-module">
                  <h3>К чему прийти</h3>
                  <p className="step-prose">{planStep.outcome}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    );
  }

  function Rehearsal() {
    return (
      <section className="rehearsal-wrap">
        <button className="back rehearsal-back" onClick={() => setStep("plan")}>
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
            <p>{coachTip || "Отправьте реплику — появится подсказка под текущий момент разговора."}</p>
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={resetNew}>
          <img src="/conversation-mark.png" alt="" />
          <span className="brand-copy">
            <b>Есть разговор</b>
            <small>ИИ-помощник для подготовки к сложным разговорам с ребёнком</small>
          </span>
        </button>
        <button className="new-conversation" onClick={resetNew}>
          <img src="/plus.svg" alt="" />
          Новый разговор
        </button>
        <div className="conversations-list">
          {savedList.length === 0 ? (
            <p className="empty-history">Сохранённых разговоров пока нет</p>
          ) : (
            savedList.map((item) => (
              <button
                key={item.id}
                className={activeId === item.id ? "history-item active" : "history-item"}
                onClick={() => openSaved(item)}
              >
                {item.title}
              </button>
            ))
          )}
        </div>
      </aside>
      <section className="workspace">
        <div className="progress">
          <i style={{ width: `${progress * 33.33}%` }} />
        </div>
        <main>
          {step === "plan" ? PlanView() : step === "rehearsal" ? Rehearsal() : Form()}
        </main>
        <footer>
          <p>ИИ может ошибаться. В кризисной ситуации обратитесь к специалисту.</p>
          <div>Конфиденциальность</div>
        </footer>
      </section>
    </div>
  );
}
