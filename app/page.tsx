"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deriveSituationGoal,
  goalLabel,
  goalOptions,
  isGenericGoalText,
  suggestGoalKind,
  type ConversationPlan,
  type GoalKind,
  type PlanStep,
} from "../lib/plans";

type View = "compose" | "plan" | "rehearsal" | "saved";

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

const GENERATING_STAGES = [
  { label: "Тема", text: "Разбираю тему и параметры" },
  { label: "Ситуация", text: "Считываю, что случилось" },
  { label: "Цель", text: "Уточняю желаемый результат" },
  { label: "Структура", text: "Подбираю структуру разговора" },
  { label: "Шаги", text: "Формулирую шаги плана" },
  { label: "Фразы", text: "Пишу спокойные формулировки" },
  { label: "Реакции", text: "Готовлю возможные ответы ребёнка" },
  { label: "Сборка", text: "Собираю план целиком" },
];

const GENERATING_WAIT_LINES = [
  { label: "Тон", text: "Проверяю, чтобы тон оставался спокойным" },
  { label: "Границы", text: "Сверяю шаги с вашей целью" },
  { label: "Связки", text: "Связываю шаги между собой" },
  { label: "Детали", text: "Уточняю детали по ситуации" },
  { label: "Почти", text: "Ещё чуть-чуть — почти готово" },
];

function DoneCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 7.2 5.8 10 11 3.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoalIcon({ kind }: { kind: GoalKind }) {
  // Always show a target for the conversation goal.
  void kind;
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
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
  const [openedFromLibrary, setOpenedFromLibrary] = useState(false);
  const [paramsUnlocked, setParamsUnlocked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openPlanStep, setOpenPlanStep] = useState("");
  const [moreReactions, setMoreReactions] = useState<Record<string, boolean>>({});
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coachTip, setCoachTip] = useState("");
  const [coachActiveStep, setCoachActiveStep] = useState<number | null>(null);
  const [tryPhrase, setTryPhrase] = useState("");
  const [rehearseLoading, setRehearseLoading] = useState(false);
  const [rehearseError, setRehearseError] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [waitTick, setWaitTick] = useState(0);
  const [formAttempted, setFormAttempted] = useState(false);

  const childName = age ? `${age} лет` : "ребёнок";
  const formValid = Boolean(
    topic.trim() &&
      situation.trim() &&
      goalKind &&
      age.trim() &&
      reaction.trim(),
  );
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
      setWaitTick(0);
      return;
    }
    setStatusIndex(0);
    setWaitTick(0);
    // Advance through stages, then rotate wait copy until the API responds.
    const lastStage = GENERATING_STAGES.length - 1;
    const id = window.setInterval(() => {
      setStatusIndex((i) => {
        if (i < lastStage) return i + 1;
        setWaitTick((t) => t + 1);
        return i;
      });
    }, 1100);
    return () => window.clearInterval(id);
  }, [generating]);

  const resetNew = () => {
    setActiveId(null);
    setOpenedFromLibrary(false);
    setParamsUnlocked(false);
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
    setOpenPlanStep("");
    setMoreReactions({});
    setMessages([]);
    setReply("");
    setCoachTip("");
    setCoachActiveStep(null);
    setTryPhrase("");
    setRehearseError("");
    setCopied(false);
    setFormAttempted(false);
    setView("compose");
  };

  const selectGoal = (kind: GoalKind) => {
    setGoalTouched(true);
    setGoalKind(kind);
    // Don't copy the base goal label into the custom field.
    if (isGenericGoalText(goalText)) setGoalText("");
  };

  const resolvedGoal =
    plan?.goal || deriveSituationGoal(situation, goalKind, goalText);
  const paramsLocked = openedFromLibrary && !paramsUnlocked;

  const requestUnlockParams = () => {
    if (!paramsLocked) return true;
    const ok = window.confirm(
      "Вы уверены, что хотите изменить параметры сохранённого плана?",
    );
    if (ok) setParamsUnlocked(true);
    return ok;
  };

  const generatePlan = async () => {
    if (paramsLocked) return;
    setFormAttempted(true);
    if (!formValid) {
      setPlanError("Заполните обязательные поля со звёздочкой");
      const missing = !situation.trim()
        ? "situation"
        : !age.trim()
          ? "age"
          : null;
      if (missing) {
        window.setTimeout(() => {
          document.getElementById(missing)?.focus();
        }, 0);
      }
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
      const nextPlan = data.plan as ConversationPlan;
      if (nextPlan.goal && isGenericGoalText(goalText)) {
        setGoalText(nextPlan.goal);
      }
      setOpenPlanStep("");
      setFormAttempted(false);
      setMoreReactions({});
      setCopied(false);
      if (activeId) {
        const savedGoal =
          nextPlan.goal || goalText || deriveSituationGoal(situation, goalKind, goalText);
        const item: SavedConversation = {
          id: activeId,
          title: nextPlan.title,
          topic,
          situation,
          goalKind,
          goalText: savedGoal,
          age,
          reaction,
          plan: nextPlan,
          updatedAt: Date.now(),
        };
        const next = [item, ...savedList.filter((x) => x.id !== item.id)];
        setSavedList(next);
        persistSaved(next);
        setParamsUnlocked(false);
      }
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
      goalText: plan.goal || goalText || deriveSituationGoal(situation, goalKind, goalText),
      age,
      reaction,
      plan,
      updatedAt: Date.now(),
    };
    const next = [item, ...savedList.filter((x) => x.id !== item.id)];
    setSavedList(next);
    persistSaved(next);
    setActiveId(item.id);
    setParamsUnlocked(false);
  };

  const openSaved = (item: SavedConversation) => {
    setActiveId(item.id);
    setOpenedFromLibrary(true);
    setParamsUnlocked(false);
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
    setOpenPlanStep("");
    setMessages([]);
    setView("plan");
  };

  const removeSaved = (id: string) => {
    const next = savedList.filter((x) => x.id !== id);
    setSavedList(next);
    persistSaved(next);
    if (activeId === id) {
      setActiveId(null);
      setOpenedFromLibrary(false);
      setParamsUnlocked(false);
    }
  };

  const formatSavedDate = (ts: number) => {
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ts));
    } catch {
      return "";
    }
  };

  const copyPlan = async () => {
    if (!plan) return;
    const lines = [
      plan.title,
      "",
      `Цель: ${resolvedGoal}`,
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
  };

  const openingPhrase =
    plan?.steps.find((s) => s.phrase)?.phrase ||
    "Я хочу спокойно поговорить. Мне важно услышать тебя.";

  const startRehearsal = () => {
    if (!plan) return;
    setView("rehearsal");
    setMessages([]);
    setReply("");
    setRehearseError("");
    setRehearseLoading(false);
    setCoachTip("");
    setCoachActiveStep(1);
    setTryPhrase("");
  };

  const sendReply = async (preset?: string) => {
    const parentText = (preset ?? reply).trim();
    if (!parentText || !plan || rehearseLoading) return;
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
          planSteps: plan.steps.map((s) => ({
            title: s.title,
            action: s.action || s.why,
          })),
          openingPhrase,
          messages: nextHistory,
          parentReply: parentText,
          currentStep: coachActiveStep ?? 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Не удалось получить ответ");
      setMessages([...nextHistory, { role: "child", text: data.childMessage }]);
      setCoachTip(data.coachTip || "");
      const stepCount = plan.steps.length;
      const parsed = Number(data.activeStep);
      const nextActive = Number.isFinite(parsed)
        ? Math.min(stepCount, Math.max(1, Math.round(parsed)))
        : (coachActiveStep ?? 1);
      setCoachActiveStep((prev) => Math.max(prev ?? 1, nextActive));
      setTryPhrase(data.tryPhrase || "");
    } catch (e) {
      setRehearseError(e instanceof Error ? e.message : "Ошибка репетиции");
    } finally {
      setRehearseLoading(false);
    }
  };

  function SettingsPanel() {
    return (
      <aside className={paramsLocked ? "settings-panel locked" : "settings-panel"}>
        <div className="settings-scroll">
          <h2>Параметры разговора</h2>
          {!paramsLocked && (
            <p className="settings-lead">
              {openedFromLibrary
                ? "Измените параметры, затем нажмите «Обновить план»."
                : "Опишите ситуацию и цель — появится план разговора."}
            </p>
          )}

          <fieldset className="settings-fields" disabled={paramsLocked}>
          <label className="field-label" htmlFor="topic">
            Тема <span className="field-req">обяз.</span>
          </label>
          <div className="select-wrap">
            <select
              id="topic"
              value={topic}
              required
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
            Что случилось? <span className="field-req">обяз.</span>
          </label>
          <textarea
            id="situation"
            className={
              formAttempted && !situation.trim()
                ? "settings-input invalid"
                : "settings-input"
            }
            value={situation}
            required
            aria-required="true"
            onChange={(e) => {
              setSituation(e.target.value);
              setGoalTouched(false);
              if (planError) setPlanError("");
            }}
            rows={4}
            placeholder="Кратко опишите ситуацию"
          />
          {formAttempted && !situation.trim() && (
            <p className="field-error">Обязательное поле</p>
          )}

          <label className="field-label" htmlFor="goalKind">
            Цель разговора <span className="field-req">обяз.</span>
          </label>
          <div className="select-wrap">
            <select
              id="goalKind"
              value={goalKind}
              required
              onChange={(e) => selectGoal(e.target.value as GoalKind)}
            >
              {goalOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          {!paramsLocked && !goalTouched && situation.trim() && (
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
            placeholder="Необязательно — если пусто, сформулируем по ситуации"
          />

          <div className="settings-row">
            <div>
              <label className="field-label" htmlFor="age">
                Возраст <span className="field-req">обяз.</span>
              </label>
              <div className="age-row compact">
                <input
                  id="age"
                  className={
                    formAttempted && !age.trim()
                      ? "age settings-input invalid"
                      : "age settings-input"
                  }
                  value={age}
                  required
                  aria-required="true"
                  onChange={(e) => {
                    setAge(e.target.value.replace(/\D/g, "").slice(0, 2));
                    if (planError) setPlanError("");
                  }}
                  placeholder="13"
                />
                <span>лет</span>
              </div>
              {formAttempted && !age.trim() && (
                <p className="field-error">Обязательное поле</p>
              )}
            </div>
          </div>

          <label className="field-label" htmlFor="reaction">
            Как обычно реагирует <span className="field-req">обяз.</span>
          </label>
          <div className="select-wrap">
            <select
              id="reaction"
              value={reaction}
              required
              onChange={(e) => setReaction(e.target.value)}
            >
              {reactions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          </fieldset>

          {planError && <div className="form-error">{planError}</div>}
        </div>

        <div className="settings-footer">
          {paramsLocked ? (
            <button
              type="button"
              className="generate-btn locked-action"
              onClick={requestUnlockParams}
            >
              Изменить параметры
            </button>
          ) : (
            <button
              type="button"
              className="generate-btn"
              disabled={generating}
              onClick={() => void generatePlan()}
            >
              {generating
                ? "Составляем…"
                : plan
                  ? "Обновить план"
                  : "+ Составить план"}
            </button>
          )}
          <p className="settings-privacy">
            {paramsLocked
              ? "Сначала подтвердите изменение, потом сможете обновить план"
              : "Поля с меткой «обяз.» нужно заполнить"}
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
          Заполните параметры и нажмите «Составить план». Структура шагов подстроится
          под вашу цель.
        </p>
      </div>
    );
  }

  function GeneratingState() {
    const lastStage = GENERATING_STAGES.length - 1;
    const waiting = statusIndex >= lastStage;
    const waitLine =
      GENERATING_WAIT_LINES[waitTick % GENERATING_WAIT_LINES.length] ??
      GENERATING_WAIT_LINES[0];
    const stage = waiting
      ? waitTick > 0
        ? waitLine
        : (GENERATING_STAGES[lastStage] ?? GENERATING_STAGES[0])
      : (GENERATING_STAGES[statusIndex] ?? GENERATING_STAGES[0]);
    const total = GENERATING_STAGES.length;
    const step = Math.min(statusIndex + 1, total);
    const progress = waiting
      ? Math.min(94, 78 + Math.min(waitTick, 8) * 2)
      : Math.round((step / total) * 78);

    return (
      <section className="generating-progress" aria-live="polite" aria-busy="true">
        <div className="generating-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <p className="generating-status">{stage.text}</p>
        <div
          className={waiting ? "generating-bar waiting" : "generating-bar"}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label={stage.text}
        >
          <span style={waiting ? undefined : { width: `${progress}%` }} />
        </div>
        <div className="generating-meta">
          <span>
            {step} / {total}
          </span>
          <span className="generating-stage">{stage.label}</span>
        </div>
      </section>
    );
  }

  function PlanView() {
    if (!plan) return null;

    const focusSettings = () => {
      if (paramsLocked && !requestUnlockParams()) return;
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
              {resolvedGoal}
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
          {!openedFromLibrary && (
            <button type="button" className="text-action" onClick={focusSettings}>
              Изменить запрос
            </button>
          )}
          {!openedFromLibrary &&
            (activeId ? (
              <span className="plan-done-mark">
                <DoneCheck />
                Сохранено
              </span>
            ) : (
              <button type="button" className="text-action" onClick={saveConversation}>
                Сохранить
              </button>
            ))}
          {openedFromLibrary || !copied ? (
            <button type="button" className="text-action" onClick={copyPlan}>
              Копировать
            </button>
          ) : (
            <span className="plan-done-mark">
              <DoneCheck />
              Скопировано
            </span>
          )}
        </div>

        <aside className="rehearse-invite">
          <div className="rehearse-invite-copy">
            <h2>Потренируйте разговор</h2>
            <p>Проиграйте первые фразы с ИИ до настоящего разговора.</p>
          </div>
          <button
            type="button"
            className="rehearse-button"
            onClick={startRehearsal}
          >
            Начать репетицию
          </button>
        </aside>
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
            {!open && <small>{preview}</small>}
          </span>
          <span className="plan-more">
            {open ? "Свернуть" : "Подробнее"}
            <img className={open ? "caret open" : "caret"} src="/caret-ref.png" alt="" />
          </span>
        </button>
        {open && (
          <div className="plan-step-body">
            {hasScenario ? (
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
            ) : (
              planStep.action && <p className="step-instruction">{planStep.action}</p>
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
          </div>
        )}
      </article>
    );
  }

  function Rehearsal() {
    const steps = plan?.steps ?? [];
    const total = steps.length;
    const focusIndex = Math.min(
      total - 1,
      Math.max(0, (coachActiveStep ?? 1) - 1),
    );
    const focusStep = total > 0 ? steps[focusIndex] : undefined;
    const tipPhrase =
      tryPhrase ||
      (messages.length === 0 ? focusStep?.phrase || "" : "") ||
      "";
    const tipText = coachTip.trim();
    const avoid = focusStep?.avoid?.trim() || "";

    return (
      <section className="rehearsal-wrap">
        <div className="rehearsal-grid">
          <div className="chat-card">
            <div className="chat-head">
              <div>
                <h1>{plan?.title || "Разговор"}</h1>
                <div className="chat-goal">
                  <span className="goal-badge-label">Цель разговора</span>
                  <p>{resolvedGoal}</p>
                </div>
              </div>
              <button
                type="button"
                className="text-action chat-to-plan"
                onClick={() => setView("plan")}
              >
                К плану
              </button>
            </div>
            <div className="messages">
              {messages.length === 0 && !rehearseLoading && (
                <div className="messages-empty">
                  <p className="messages-empty-kicker">Репетиция</p>
                  <p>
                    Здесь отвечает ИИ в роли ребёнка. Начните своими словами или
                    скажите готовую фразу справа.
                  </p>
                </div>
              )}
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
                placeholder="Ваша реплика…"
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
            <div className="composer-note">Enter — отправить · Можно ошибаться</div>
          </div>

          <aside className="coach-card">
            <div className="coach-title">
              <div>
                <b>Подсказка тренера</b>
                <small>
                  Шаг {total ? focusIndex + 1 : 0} из {total}
                </small>
              </div>
            </div>

            {total > 0 ? (
              <ol className="coach-dots" aria-label="Прогресс по плану">
                {steps.map((step, i) => {
                  const done = i < focusIndex;
                  const current = i === focusIndex;
                  return (
                    <li
                      key={`${step.title}-${i}`}
                      className={[
                        "coach-dot",
                        done ? "done" : "",
                        current ? "current" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={step.title}
                    >
                      <span>{done ? "✓" : i + 1}</span>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {focusStep ? (
              <div className="coach-now">
                <p className="coach-now-title">{focusStep.title}</p>
                {tipText ? <p className="coach-now-tip">{tipText}</p> : null}

                {tipPhrase ? (
                  <div className="coach-say">
                    <p>«{tipPhrase}»</p>
                    <button
                      type="button"
                      className="coach-say-btn"
                      disabled={rehearseLoading}
                      onClick={() => void sendReply(tipPhrase)}
                    >
                      Сказать это
                    </button>
                    <button
                      type="button"
                      className="coach-say-edit"
                      disabled={rehearseLoading}
                      onClick={() => setReply(tipPhrase)}
                    >
                      Подправить в чате
                    </button>
                  </div>
                ) : (
                  <p className="coach-now-tip">
                    Напишите реплику своими словами в чате.
                  </p>
                )}

                {avoid ? <p className="coach-avoid">Лучше не: {avoid}</p> : null}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    );
  }

  function SavedPlansView() {
    return (
      <section className="saved-page">
        <header className="saved-page-header">
          <h1>Мои планы</h1>
          <p>Сохранённые планы разговоров на этом устройстве</p>
        </header>

        {savedList.length === 0 ? (
          <div className="saved-empty">
            <p>Пока нет сохранённых планов.</p>
            <button type="button" className="header-new" onClick={resetNew}>
              <img src="/plus.svg" alt="" />
              Новый план
            </button>
          </div>
        ) : (
          <ul className="saved-page-list">
            {savedList.map((item) => (
              <li key={item.id} className={activeId === item.id ? "active" : ""}>
                <button
                  type="button"
                  className="saved-page-card"
                  onClick={() => openSaved(item)}
                >
                  <span className="saved-page-meta">
                    <span>{item.topic}</span>
                    <span>{formatSavedDate(item.updatedAt)}</span>
                  </span>
                  <b>{item.title}</b>
                  <small>{item.goalText || goalLabel(item.goalKind)}</small>
                </button>
                <button
                  type="button"
                  className="saved-page-remove"
                  aria-label="Удалить план"
                  onClick={() => removeSaved(item.id)}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const showSettings = view !== "rehearsal" && view !== "saved";

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
        <div className="header-actions">
          <button
            type="button"
            className={view === "saved" ? "header-saved-btn open" : "header-saved-btn"}
            onClick={() => setView("saved")}
          >
            Мои планы
            {savedList.length > 0 && (
              <span className="header-saved-count">{savedList.length}</span>
            )}
          </button>
          <button type="button" className="header-new" onClick={resetNew}>
            <img src="/plus.svg" alt="" />
            Новый план
          </button>
        </div>
      </header>

      <div className="app-body">
        {showSettings && SettingsPanel()}
        <section className="workspace">
          <main>
            {view === "rehearsal"
              ? Rehearsal()
              : view === "saved"
                ? SavedPlansView()
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
