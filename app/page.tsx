"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  deriveSituationGoal,
  goalLabel,
  goalOptions,
  isGenericGoalText,
  actionAddsDetail,
  stepPhrases,
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
  const [topic, setTopic] = useState("");
  const [age, setAge] = useState("");
  const [situation, setSituation] = useState("");
  const [goalKind, setGoalKind] = useState<GoalKind | "">("");
  const [goalText, setGoalText] = useState("");
  const [reaction, setReaction] = useState("");
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
  const copiedTimer = useRef<number | null>(null);
  const [openPlanStep, setOpenPlanStep] = useState("");
  const [stepTab, setStepTab] = useState<Record<string, string>>({});
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coachTip, setCoachTip] = useState("");
  const [coachActiveStep, setCoachActiveStep] = useState<number | null>(null);
  const [tryPhrase, setTryPhrase] = useState("");
  const [showCoachPhrase, setShowCoachPhrase] = useState(false);
  const [rehearseLoading, setRehearseLoading] = useState(false);
  const [rehearseError, setRehearseError] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [waitTick, setWaitTick] = useState(0);
  const [formAttempted, setFormAttempted] = useState(false);
  const [mobileParamsOpen, setMobileParamsOpen] = useState(false);
  const planStartRef = useRef<HTMLElement | null>(null);

  const childName = age ? `${age} лет` : "ребёнок";
  const formValid = Boolean(
    topic.trim() && situation.trim() && goalKind && age.trim(),
  );
  useEffect(() => {
    setSavedList(loadSaved());
  }, []);

  useEffect(() => {
    if (view !== "plan" || !plan) return;
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const behavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
      const planStart = planStartRef.current;
      const main = planStart?.closest("main");
      main?.scrollTo({ top: 0, behavior });
      planStart?.scrollIntoView({ behavior, block: "start" });
      planStart?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, plan]);

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
    setTopic("");
    setAge("");
    setSituation("");
    setGoalKind("");
    setGoalText("");
    setReaction("");
    setPlan(null);
    setPlanSource(null);
    setPlanWarning("");
    setPlanError("");
    setOpenPlanStep("");
    setStepTab({});
    setMessages([]);
    setReply("");
    setCoachTip("");
    setCoachActiveStep(null);
    setTryPhrase("");
    setRehearseError("");
    setCopied(false);
    setFormAttempted(false);
    setMobileParamsOpen(false);
    setView("compose");
  };

  const selectGoal = (kind: GoalKind) => {
    setGoalKind(kind);
    // Don't copy the base goal label into the custom field.
    if (isGenericGoalText(goalText)) setGoalText("");
  };

  const resolvedGoal =
    plan?.goal ||
    (goalKind ? deriveSituationGoal(situation, goalKind, goalText) : goalText.trim());
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
    if (!formValid || !goalKind) {
      setPlanError("Заполните обязательные поля со звёздочкой");
      const missing = !topic.trim()
        ? "topic"
        : !situation.trim()
          ? "situation"
          : !goalKind
            ? "goalKind"
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
      setOpenPlanStep("01");
      setFormAttempted(false);
      setStepTab({});
      setCopied(false);
      setMobileParamsOpen(false);
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
    if (!plan || !goalKind) return;
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
    setAge(item.age);
    setReaction(item.reaction);
    setPlan(item.plan);
    setPlanSource("openai");
    setPlanWarning("");
    setOpenPlanStep("01");
    setStepTab({});
    setMessages([]);
    setMobileParamsOpen(false);
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

  useEffect(() => {
    return () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

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
            stepPhrases(s)[0] ? `\nФраза: ${stepPhrases(s)[0]}` : ""
          }`,
      ),
    ];
    if (plan.nonNegotiable) lines.push("", `Что не обсуждается: ${plan.nonNegotiable}`);
    if (plan.discussable) lines.push(`Что можно решить вместе: ${plan.discussable}`);
    await navigator.clipboard?.writeText(lines.join("\n"));
    setCopied(true);
    if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => {
      setCopied(false);
      copiedTimer.current = null;
    }, 2000);
  };

  const openingPhrase =
    plan?.steps.map(stepPhrases).find((p) => p.length)?.[0] ||
    "Я хочу спокойно поговорить. Мне важно услышать тебя.";

  // Paused in UI — product copy + restore steps: product-notes/rehearsal-paused.md
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
    setShowCoachPhrase(false);
  };

  const returnToPlan = () => {
    setMobileParamsOpen(false);
    setView("plan");
  };

  const openMobileSettings = () => {
    setMobileParamsOpen(true);
    window.setTimeout(() => {
      const el = document.getElementById("situation");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 0);
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
      const childText = String(data.childMessage || "").trim();
      setMessages([...nextHistory, { role: "child", text: childText }]);
      setCoachTip(data.coachTip || "");
      const stepCount = plan.steps.length;
      const parsed = Number(data.activeStep);
      const nextActive = Number.isFinite(parsed)
        ? Math.min(stepCount, Math.max(1, Math.round(parsed)))
        : (coachActiveStep ?? 1);
      setCoachActiveStep((prev) => Math.max(prev ?? 1, nextActive));
      setTryPhrase(data.tryPhrase || "");
      setShowCoachPhrase(false);
    } catch (e) {
      setRehearseError(e instanceof Error ? e.message : "Ошибка репетиции");
    } finally {
      setRehearseLoading(false);
    }
  };

  function SettingsPanel() {
    const collapsedOnMobile = view === "plan" && !!plan && !mobileParamsOpen;
    return (
      <aside
        className={`${paramsLocked ? "settings-panel locked" : "settings-panel"}${
          collapsedOnMobile ? " mobile-collapsed" : ""
        }`}
      >
        {collapsedOnMobile && (
          <button
            type="button"
            className="mobile-settings-summary"
            onClick={openMobileSettings}
          >
            <span>
              <b>Параметры разговора</b>
              <small>{topic} · {age} лет</small>
            </span>
            <span>Изменить</span>
          </button>
        )}
        <div className="settings-scroll">
          <h2>Параметры разговора</h2>
          {!paramsLocked && (
            <p className="settings-lead">
              {openedFromLibrary
                ? "Измените параметры, затем нажмите «Обновить»."
                : "Опишите ситуацию и цель — подготовьте разговор по шагам."}
            </p>
          )}

          <fieldset className="settings-fields" disabled={paramsLocked}>
          <label className="field-label" htmlFor="topic">
            Тема <span className="field-req">*</span>
          </label>
          <div className="select-wrap">
            <select
              id="topic"
              value={topic}
              required
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="" disabled>
                Выберите тему
              </option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <label className="field-label" htmlFor="situation">
            Что случилось? <span className="field-req">*</span>
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
              if (planError) setPlanError("");
            }}
            rows={4}
            placeholder="Кратко опишите ситуацию"
          />
          {formAttempted && !situation.trim() && (
            <p className="field-error">Обязательное поле</p>
          )}

          <label className="field-label" htmlFor="goalKind">
            Цель разговора <span className="field-req">*</span>
          </label>
          <div className="select-wrap">
            <select
              id="goalKind"
              value={goalKind}
              required
              onChange={(e) => selectGoal(e.target.value as GoalKind)}
            >
              <option value="" disabled>
                Выберите цель
              </option>
              {goalOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

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
                Возраст <span className="field-req">*</span>
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
            Как обычно реагирует на серьёзные разговоры?
          </label>
          <div className="select-wrap">
            <select
              id="reaction"
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
            >
              <option value="">Не указано</option>
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
                ? "Готовим…"
                : plan
                  ? "Обновить"
                  : "Подготовить разговор"}
            </button>
          )}
          <p className="settings-privacy">
            {paramsLocked
              ? "Сначала подтвердите изменение, потом сможете обновить план"
              : "Поля со звёздочкой обязательны · описание только для плана"}
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
          Заполните параметры и нажмите «Подготовить разговор». Структура шагов
          подстроится под вашу цель.
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
      openMobileSettings();
    };

    const steps = plan.steps;
    const total = steps.length;
    const activeIndex = Math.min(
      total - 1,
      Math.max(0, (Number(openPlanStep) || 1) - 1),
    );
    const activeStep = steps[activeIndex];
    const activeN = String(activeIndex + 1).padStart(2, "0");

    const goTo = (index: number) => {
      const next = Math.min(total - 1, Math.max(0, index));
      setOpenPlanStep(String(next + 1).padStart(2, "0"));
      setStepTab((prev) => {
        const copy = { ...prev };
        delete copy[activeN];
        return copy;
      });
    };

    return (
      <section
        ref={planStartRef}
        className="plan-wrap"
        tabIndex={-1}
        aria-labelledby="plan-title"
      >
        <header className="plan-header">
          <h1 id="plan-title">{plan.title}</h1>
          <div className="plan-goal">
            <span className="plan-goal-label">Цель разговора</span>
            <p className="plan-goal-text">
              {goalKind ? goalLabel(goalKind) : "Цель разговора"}
            </p>
          </div>
          {planWarning && <p className="plan-warning">{planWarning}</p>}
        </header>

        <div className="plan-split">
          <section className="plan-overview-card" aria-label="Общий план">
            <div className="plan-overview-head">
              <span className="plan-card-kicker">План</span>
              <span className="plan-overview-count">
                {total}{" "}
                {total === 1 ? "шаг" : total < 5 ? "шага" : "шагов"}
              </span>
            </div>
            <ol className="plan-overview-list">
              {steps.map((s, i) => {
                const selected = i === activeIndex;
                return (
                  <li key={`${s.title}-${i}`}>
                    <button
                      type="button"
                      className={
                        selected
                          ? "plan-overview-item active"
                          : "plan-overview-item"
                      }
                      aria-current={selected ? "step" : undefined}
                      onClick={() => goTo(i)}
                    >
                      <span className="plan-overview-num">{i + 1}</span>
                      <span className="plan-overview-text">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="plan-detail">
            {activeStep && (
              <StepFocusCard
                key={activeN}
                n={activeN}
                index={activeIndex}
                total={total}
                step={activeStep}
                onPrev={() => goTo(activeIndex - 1)}
                onNext={() => goTo(activeIndex + 1)}
              />
            )}
          </div>
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
          {!copied ? (
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
      </section>
    );
  }

  function StepFocusCard({
    n,
    index,
    total,
    step: planStep,
    onPrev,
    onNext,
  }: {
    n: string;
    index: number;
    total: number;
    step: PlanStep;
    onPrev: () => void;
    onNext: () => void;
  }) {
    const say = stepPhrases(planStep);
    const primaryPhrase = say[0];
    const extraPhrases = say.slice(1);
    const questions = planStep.questions ?? [];
    const primaryQuestion = questions[0];
    const extraQuestions = questions.slice(1);
    const reactionsList = planStep.reactions ?? [];

    type TipTab = {
      id: string;
      label: string;
      render: () => ReactNode;
    };

    const reactionTitle = (when?: string) =>
      when?.trim()
        ? /^если\s/i.test(when.trim())
          ? when.trim()
          : `Если ребёнок ${when.trim()}`
        : "Если ребёнок…";

    const showChildLine = (text?: string) => {
      const t = (text || "").trim();
      if (!t) return false;
      if (/^[-–—.•…]+$/.test(t)) return false;
      if (/^(молчит|тишина|ничего|…|\.\.\.)$/i.test(t)) return false;
      return true;
    };

    const tipTabs: TipTab[] = [];
    if (reactionsList.length > 0 && reaction.trim()) {
      tipTabs.push({
        id: "reaction",
        label: "Если ответит",
        render: () => (
          <>
            {reactionsList.map((r) => (
              <div className="step-block" key={`${r.when}-${r.child}-${r.parent}`}>
                <div className="step-block-label">{reactionTitle(r.when)}</div>
                {showChildLine(r.child) && (
                  <div className="step-chip muted">{r.child}</div>
                )}
                {r.parent?.trim() && (
                  <>
                    <div className="step-block-label nest">Можно ответить</div>
                    <div className="step-chip">{r.parent}</div>
                  </>
                )}
              </div>
            ))}
          </>
        ),
      });
    }
    if (planStep.mark) {
      tipTabs.push({
        id: "mark",
        label: "Важно",
        render: () => (
          <div className="step-block">
            <div className="step-block-label">Важно обозначить</div>
            <div className="step-chip">{planStep.mark}</div>
          </div>
        ),
      });
    }
    if (planStep.discuss) {
      tipTabs.push({
        id: "discuss",
        label: "Вместе",
        render: () => (
          <div className="step-block">
            <div className="step-block-label">Обсудите вместе</div>
            <p className="step-block-text">{planStep.discuss}</p>
          </div>
        ),
      });
    }
    if (planStep.note) {
      tipTabs.push({
        id: "note",
        label: "Заметка",
        render: () => (
          <div className="step-block">
            <div className="step-block-label">Обратите внимание</div>
            <p className="step-block-text">{planStep.note}</p>
          </div>
        ),
      });
    }
    if (extraPhrases.length > 0 || extraQuestions.length > 0) {
      tipTabs.push({
        id: "extra",
        label: "Ещё фразы",
        render: () => (
          <div className="step-chip-stack">
            {extraPhrases.map((p) => (
              <div className="step-chip" key={p}>
                «{p}»
              </div>
            ))}
            {extraQuestions.map((q) => (
              <div className="step-chip" key={q}>
                {q}
              </div>
            ))}
          </div>
        ),
      });
    }
    if (planStep.avoid) {
      tipTabs.push({
        id: "avoid",
        label: "Не стоит",
        render: () => (
          <div className="avoid-line">
            <span className="avoid-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M7 4.2v3.2"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
                <circle cx="7" cy="9.6" r="0.7" fill="currentColor" />
              </svg>
            </span>
            <p>
              <b>Лучше избегать:</b> {planStep.avoid}
            </p>
          </div>
        ),
      });
    }

    const activeTabId = tipTabs.some((t) => t.id === stepTab[n])
      ? stepTab[n]
      : "";
    const activeTab = tipTabs.find((t) => t.id === activeTabId);

    return (
      <section className="plan-focus-card" aria-label={`Шаг ${index + 1}`}>
        <div className="plan-focus-top">
          <div className="plan-card-kicker">
            Шаг {index + 1} из {total}
          </div>
          <div className="plan-focus-nav">
            <button
              type="button"
              className="plan-nav-btn"
              onClick={onPrev}
              disabled={index <= 0}
            >
              Назад
            </button>
            <button
              type="button"
              className="plan-nav-btn"
              onClick={onNext}
              disabled={index >= total - 1}
            >
              Дальше
            </button>
          </div>
        </div>

        <div className="plan-focus-body">
          {actionAddsDetail(planStep.title, planStep.action) && (
            <p className="step-instruction">{planStep.action}</p>
          )}

          {primaryPhrase && (
            <div className="step-block">
              <div className="step-block-label">Можно сказать</div>
              <div className="step-chip">«{primaryPhrase}»</div>
            </div>
          )}

          {primaryQuestion && (
            <div className="step-block">
              <div className="step-block-label">Можно спросить</div>
              <div className="step-chip">{primaryQuestion}</div>
            </div>
          )}

          {tipTabs.length > 0 && (
            <div className="step-tip-tabs" role="tablist" aria-label="Дополнительные подсказки">
              {tipTabs.map((tab) => {
                const selected = activeTabId === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={selected ? "step-tip-tab active" : "step-tip-tab"}
                    onClick={() =>
                      setStepTab((prev) => ({
                        ...prev,
                        [n]: selected ? "" : tab.id,
                      }))
                    }
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {activeTab && (
            <div className="step-tip-panel" role="tabpanel">
              {activeTab.render()}
            </div>
          )}
        </div>
      </section>
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
      (messages.length === 0 && focusStep
        ? stepPhrases(focusStep)[0] || ""
        : "") ||
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
                onClick={returnToPlan}
              >
                К плану
              </button>
            </div>
            <div className="messages">
              {messages.length === 0 && !rehearseLoading && (
                <div className="messages-empty">
                  <p className="messages-empty-kicker">Репетиция</p>
                  <p>
                    Здесь отвечает ИИ в роли ребёнка. Напишите первую фразу или
                    возьмите подсказку справа.
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
                  думает…
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
                <p className="coach-now-tip">
                  {tipText ||
                    (messages.length === 0
                      ? "Напишите первую реплику своими словами — или откройте фразу-подсказку."
                      : "Продолжите своими словами — при необходимости откройте фразу-подсказку.")}
                </p>

                {tipPhrase ? (
                  <div className="coach-hint">
                    {!showCoachPhrase ? (
                      <button
                        type="button"
                        className="coach-hint-toggle"
                        onClick={() => setShowCoachPhrase(true)}
                      >
                        Фраза-подсказка
                      </button>
                    ) : (
                      <div className="coach-say">
                        <div className="coach-say-head">
                          <span>Фраза-подсказка</span>
                          <button
                            type="button"
                            className="coach-hint-hide"
                            onClick={() => setShowCoachPhrase(false)}
                          >
                            Скрыть
                          </button>
                        </div>
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
                    )}
                  </div>
                ) : null}

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

  const showSettings =
    view !== "rehearsal" &&
    view !== "saved" &&
    !(view === "plan" && plan && !mobileParamsOpen);

  return (
    <div className={showSettings ? "app-shell" : "app-shell rehearsal-mode"}>
      <header className="app-header">
        <button type="button" className="brand" onClick={resetNew}>
          <span className="brand-mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect
                x="4"
                y="5"
                width="20"
                height="18"
                rx="5"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M9 11.5h10M9 16h6.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-copy">
            <b>Разговор по шагам</b>
            <small>План важного разговора с ребёнком</small>
          </span>
        </button>
        <div className="header-actions">
          <button
            type="button"
            className={view === "saved" ? "header-saved-btn open" : "header-saved-btn"}
            onClick={() => setView("saved")}
            aria-label="Мои планы"
          >
            <span className="desktop-label">Мои планы</span>
            <span className="mobile-label">Планы</span>
            {savedList.length > 0 && (
              <span className="header-saved-count">{savedList.length}</span>
            )}
          </button>
          <button type="button" className="header-new" onClick={resetNew} aria-label="Новый план">
            <img src="/plus.svg" alt="" />
            <span className="desktop-label">Новый план</span>
            <span className="mobile-label">Новый</span>
          </button>
        </div>
      </header>

      <div className="app-body">
        {showSettings && SettingsPanel()}
        <section className="workspace">
          <main>
            {view === "saved"
              ? SavedPlansView()
              : generating
                ? GeneratingState()
                : view === "plan" && plan
                  ? PlanView()
                  : view === "rehearsal" && plan
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
