import type { ConversationPlan, GoalKind } from "./plans";
import { deriveSituationGoal, goalLabel, isGenericGoalText } from "./plans";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL =
  process.env.OPENROUTER_MODEL ||
  process.env.OPENAI_MODEL ||
  "openai/gpt-4.1-mini";

export function getOpenAIKey() {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

export async function openaiJson<T>(args: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<T> {
  const key = getOpenAIKey();
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://est-razgovor.onrender.com",
      "X-Title": "Est Razgovor",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: args.temperature ?? 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenRouter response");
  return JSON.parse(content) as T;
}

export type PlanRequest = {
  topic: string;
  situation: string;
  goalKind: GoalKind;
  goalText: string;
  age: string;
  reaction: string;
};

export type RehearseRequest = {
  topic: string;
  situation: string;
  goalKind: GoalKind;
  goalText: string;
  age: string;
  reaction: string;
  planTitle: string;
  planSteps: { title: string; action?: string }[];
  openingPhrase: string;
  messages: { role: "parent" | "child"; text: string }[];
  parentReply: string;
  /** Current 1-based step in the automatic checklist */
  currentStep?: number;
};

export type RehearseResponse = {
  childMessage: string;
  coachTip: string;
  tryPhrase: string;
  /** 1-based index of the plan step this tip is for; null if unclear */
  activeStep: number | null;
  signals: string[];
  feedback?: string;
};

export const PLAN_SYSTEM = `Ты помощник продукта «Есть разговор» для родителей.
Составь план разговора с ребёнком на русском языке.
Главный принцип: структура плана зависит от ЦЕЛИ, а не только от темы.
План: от 3 до 6 шагов. Без драматичных формулировок вроде «борьба за власть», если родитель так не писал.

Важно про заголовок (title):
- title берётся из описания ситуации («Что случилось»), а НЕ копируется из поля «Тема» (Гаджеты и интернет / Учёба / …).
- title отражает предмет конкретной ситуации коротко и по-человечески.
- Цель уже показывается отдельно, поэтому не начинай title с «Как договориться…», «Как понять…», «Как обозначить…», «Как поддержать…», «Как сообщить…», «Как восстановить…».
- Примеры хороших title: «Ночи за компьютером», «Телефон до утра», «Скрытая двойка», «Домашние обязанности», «Опоздания из‑за игр».
- Примеры плохих title: «Гаджеты и интернет», «Учёба», «Правила дома», «Как договориться о телефоне».

Важно про цель (goal):
- goal — конкретная формулировка желаемого результата ЭТОГО разговора.
- Если родитель написал результат своими словами — уточни и сделай короткой ясной целью, не копируй длинный абзац.
- Если родитель выбрал только базовый тип цели («Обозначить границу», «Договориться о правиле…» и т.п.) и не дописал свой текст — сформулируй цель из ситуации + типа цели.
- Не возвращай голые базовые ярлыки вроде «Обозначить границу» без конкретики.
- Примеры: «Обозначить границу: без телефона после 22:00», «Договориться убирать гаджеты до сна», «Понять, почему скрыл двойку».

Верни ТОЛЬКО JSON:
{
  "title": string, // тема разговора, без повторения цели
  "goal": string, // конкретная цель разговора по ситуации
  "reminder": string, // короткое напоминание под цель
  "nonNegotiable": string | null, // что не обсуждается; null если не нужно
  "discussable": string | null, // что можно решить вместе; null если не нужно
  "steps": [
    {
      "title": string,
      "why": string, // зачем шаг в этой ситуации
      "action": string, // как действовать — пояснение без карточки
      "phrase": string | null, // можно сказать
      "questions": string[] | null, // можно спросить; только если уместны
      "reactions": [{"child": string, "parent": string}] | null,
      "avoid": string | null, // лучше не говорить
      "outcome": string | null // к чему прийти в этом шаге; null если не нужно
    }
  ]
}

Правила по целям — структура шагов РАЗНАЯ. Не копируй один и тот же сценарий под все цели.
Ориентиры (адаптируй под ситуацию, 3–6 шагов, мягкое повелительное в title):

- understand — цель понять, НЕ договариваться и НЕ наказывать:
  «Начните с того, что вы заметили» → «Скажите, что хотите сначала понять» → «Спросите версию ребёнка» → «Уточните, чего он боялся» → при необходимости «Договоритесь о следующем маленьком шаге» (только маленький шаг поддержки/продолжения, НЕ правило и НЕ наказание).
  Не начинай с правила, наказания или «как исправить оценку». Последний шаг не превращай в большой договор о честности навсегда.

- agree — цель совместное правило:
  «Начните с того, что вы заметили» → «Спросите, как ребёнок видит ситуацию» → «Объясните, почему вам это важно» → «Вместе найдите подходящий вариант» → «Договоритесь о правиле и попробуйте его соблюдать».
  Сначала услышьте ребёнка, потом правило. nonNegotiable и финальная phrase про одно и то же время/условие — без противоречий.

- boundary — граница уже ваша, не голосование:
  «Коротко скажите, о чём речь» → «Скажите границу и почему она вам нужна» → «Выслушайте реакцию» → «Предложите обсудить только детали» → «Скажите, что будет при нарушении».
  Не открывайте разговор вопросом «как ты к этому относишься?» до того, как граница названа. Не пиши «давайте вместе решим, нужна ли граница».

- announce — решение уже принято:
  «Скажите решение прямо» → «Объясните, почему вы так решили» → «Признайте чувства» → «Ответьте на вопросы» → «Предложите помощь с изменением».
  Не создавай видимость выбора по самому решению.

- support — сначала контакт, без повестки «решить конфликт»:
  «Начните с того, что вы заметили» (без допроса) → «Предложите рассказать, когда будет готово» → «Выслушайте без советов» → «Спросите, какая помощь нужна» → опционально маленький шаг только если ребёнок хочет.
  Не делайте два шага подряд «хочешь поговорить?» / «расскажи когда удобно». В шаге «выслушайте» не сыпьте вопросами как на интервью. Не навязывайте «прогулку для настроения» как обязательный итог.

- trust — восстановление доверия, без дублей:
  «Начните с факта без ярлыков» → «Спросите версию ребёнка» → «Уточните причину обмана» (это другой шаг, не повтор версии) → «Расскажите, как это повлияло на доверие» → «Вместе найдите, как исправить» → «Договоритесь, как говорить правду в следующий раз».
  Не склеивайте «версия» и «причина» в два одинаковых расспроса.

- other — держись одной конкретной цели родителя; не склеивай understand+agree+boundary в один план.

Важно про логику диалога (часто ломается):
- Каждый следующий шаг двигает разговор вперёд. Не повторяйте смысл двух соседних шагов разными словами.
- steps[].title обращается к родителю на «вы». Никогда не пиши в title «как ты видишь» про родителя.
- phrase и questions работают вместе: если есть вопросы — дай короткую phrase-открытие («Расскажи, как это было…»), не оставляй phrase: null.
- reactions — реакция именно на реплику ЭТОГО шага (на phrase/вопрос шага), а не общий шаблон. 0–2 пары, только где конфликт вероятен.
- action — что сделать родителю здесь и сейчас; не пересказывай title канцелярски.
- nonNegotiable / discussable / финальная договорённость в phrase должны быть согласованы между собой.

Важно про заголовки шагов (steps[].title) и тон:
- Это сопровождение родителя, не методичка для специалиста.
- Мягкое повелительное: «Начните…», «Спросите…», «Выслушайте…», «Предложите…», «Договоритесь…».
- Без инфинитивов («Выбрать момент», «Назвать факт», «Зафиксировать договорённость») и без канцелярита («Назовите факт», «Обозначьте правило», «Добейтесь договорённости»).
- title и phrase совпадают по смыслу; если фраза с наблюдения — title тоже про наблюдение.
- Фразы короткие и естественные, но логика шагов важнее красивости формулировок.`;

export function planUserPrompt(input: PlanRequest) {
  const customGoal = input.goalText.trim() && !isGenericGoalText(input.goalText);
  return `Тема: ${input.topic}
Возраст ребёнка: ${input.age || "не указан"} лет
Ситуация: ${input.situation}
Тип цели (базовый): ${input.goalKind} (${goalLabel(input.goalKind)})
Результат своими словами: ${customGoal ? input.goalText.trim() : "не указан — сформулируй goal сама по ситуации и типу цели"}
Привычная реакция ребёнка: ${input.reaction}

Заголовок плана (title) сформулируй по тексту ситуации («Что случилось»), а не копируй категорию темы.
Поле goal — конкретная цель разговора: из ситуации + типа цели${customGoal ? ", опираясь на формулировку родителя" : ""}. Не копируй базовый ярлык цели.
Структуру steps строй строго под цель «${input.goalKind}», а не под универсальный сценарий. Заголовки шагов — мягкое повелительное, без инфинитивов; title совпадает с phrase.`;
}

const TOPIC_CATEGORIES = [
  "Гаджеты и интернет",
  "Учёба",
  "Правила дома",
  "Друзья",
  "Деньги",
  "Другое",
];

export function deriveSituationTitle(situation: string, topic = ""): string {
  const raw = situation.trim().replace(/\s+/g, " ");
  const lower = raw.toLowerCase();

  if (/телефон/.test(lower) && /(ноч|допоздн|утра|спать|сн)/.test(lower)) {
    return "Телефон по ночам";
  }
  if (/(комп|компьютер|игр)/.test(lower) && /(ноч|допоздн|утра)/.test(lower)) {
    return "Ночи за компьютером";
  }
  if (/телефон|гаджет/.test(lower)) return "Телефон и экранное время";
  if (/двойк|тройк|оценк/.test(lower) && /(скрыл|соврал|сказал)/.test(lower)) {
    return "Скрытая оценка";
  }
  if (/обязан|уборк/.test(lower)) return "Домашние обязанности";
  if (/опозда/.test(lower)) return "Опоздания";
  if (/друг|друз/.test(lower)) return "Конфликт с друзьями";
  if (/школ/.test(lower) && /смен|перев|друг/.test(lower)) return "Смена школы";

  let short = raw.split(/[.!?\n]/)[0]?.trim() || raw;
  short = short
    .replace(/^(у\s+меня\s+)?(сын|дочь|ребёнок|ребенок|он|она)\s+/i, "")
    .replace(/^(что|просто)\s+/i, "");
  if (short.length > 52) {
    short = `${short.slice(0, 49).replace(/\s+\S*$/, "")}…`;
  }
  if (!short || TOPIC_CATEGORIES.some((t) => t.toLowerCase() === short.toLowerCase())) {
    return topic && topic !== "Другое" ? `Разговор про ${topic.toLowerCase()}` : "Сложный разговор";
  }
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function finalizePlanTitle(
  title: string,
  situation: string,
  topic: string,
): string {
  let next = sanitizePlanTitle(title);
  const isCategory =
    TOPIC_CATEGORIES.some((t) => t.toLowerCase() === next.toLowerCase()) ||
    next.toLowerCase() === topic.toLowerCase();
  if (!next || isCategory || next.length < 3) {
    next = deriveSituationTitle(situation, topic);
  }
  return next;
}

export function finalizePlanGoal(
  goal: string | undefined,
  situation: string,
  goalKind: GoalKind,
  goalText: string,
): string {
  const raw = String(goal || "").trim().replace(/\s+/g, " ");
  if (raw && !isGenericGoalText(raw) && raw.length >= 8) return raw;
  return deriveSituationGoal(situation, goalKind, goalText);
}

export function normalizePlan(
  raw: ConversationPlan,
  ctx?: {
    situation?: string;
    topic?: string;
    goalKind?: GoalKind;
    goalText?: string;
  },
): ConversationPlan {
  const steps = (raw.steps || [])
    .slice(0, 6)
    .map((s) => repairStepDialogue({
      title: String(s.title || "").trim(),
      why: String(s.why || "").trim(),
      action: String(s.action || "").trim(),
      phrase: s.phrase ? String(s.phrase).trim() : undefined,
      questions:
        Array.isArray(s.questions) && s.questions.length > 0
          ? s.questions.map(String)
          : undefined,
      reactions:
        Array.isArray(s.reactions) && s.reactions.length > 0
          ? s.reactions.map((r) => ({
              child: String(r.child),
              parent: String(r.parent),
            }))
          : undefined,
      avoid: s.avoid ? String(s.avoid).trim() : undefined,
      outcome: s.outcome ? String(s.outcome).trim() : undefined,
    }))
    .filter((s) => s.title && s.action);

  const rawTitle = String(raw.title || "План разговора").trim();
  const title = ctx
    ? finalizePlanTitle(rawTitle, ctx.situation || "", ctx.topic || "")
    : sanitizePlanTitle(rawTitle);

  const goal = ctx?.goalKind
    ? finalizePlanGoal(
        raw.goal,
        ctx.situation || "",
        ctx.goalKind,
        ctx.goalText || "",
      )
    : String(raw.goal || "").trim() || undefined;

  return {
    title,
    goal,
    reminder: String(raw.reminder || "").trim(),
    nonNegotiable: raw.nonNegotiable
      ? String(raw.nonNegotiable).trim()
      : undefined,
    discussable: raw.discussable ? String(raw.discussable).trim() : undefined,
    steps: dedupeInviteSteps(steps, ctx?.goalKind),
  };
}

type NormStep = ConversationPlan["steps"][number];

/** Keep dialogue cards usable and titles addressed to the parent. */
function repairStepDialogue(step: NormStep): NormStep {
  let title = step.title
    .replace(/\bкак ты\b/gi, "как ребёнок")
    .replace(/\bчто ты думаешь\b/gi, "что думает ребёнок")
    .replace(/\bрасскажи,? как ты\b/gi, "спросите, как ребёнок");

  let questions = step.questions;
  const isListen = /выслуша|слушайте без/i.test(title);
  if (isListen && questions && questions.length > 1) {
    questions = questions.slice(0, 1);
  }

  let phrase = step.phrase;
  if (!phrase && questions?.[0]) {
    const q = questions[0].trim().replace(/\?+$/, "");
    phrase = /^(как|что|почему|зачем|чего|когда|где)/i.test(q)
      ? `${q}?`
      : `Расскажи: ${q}?`;
  }

  return { ...step, title, phrase, questions };
}

/** Support plans often double-invite; drop a redundant second invite. */
function dedupeInviteSteps(steps: NormStep[], goalKind?: GoalKind): NormStep[] {
  if (goalKind !== "support" || steps.length < 3) return steps;
  const isInvite = (s: NormStep) =>
    /поговори|рассказ|когда будет готов|если захочешь/i.test(
      `${s.title} ${s.phrase || ""}`,
    );
  const out: NormStep[] = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (prev && isInvite(prev) && isInvite(s)) continue;
    out.push(s);
  }
  return out.length >= 3 ? out : steps;
}

/** Strip goal-style openings so title stays about the topic. */
export function sanitizePlanTitle(title: string) {
  const cleaned = title
    .replace(
      /^как\s+(договориться|понять|обозначить|сообщить|поддержать|восстановить|подготовиться)[^.?!:]{0,40}[:—-]?\s*/i,
      "",
    )
    .replace(/^разговор\s+о\s+/i, "")
    .trim();
  if (!cleaned) return title;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const REHEARSE_SYSTEM = `Ты ведёшь короткую репетицию разговора родителя с ребёнком («Есть разговор»).
Отвечай на русском. Ребёнок — сверстник своего возраста, без карикатуры.
Учитывай цель: не уводи в наказание, если цель — понять; не делай вид, что всё обсуждаемо, если цель — граница.

Тренажёр должен быть лёгким: одна короткая подсказка к одному шагу плана + одна готовая фраза.
Чеклист шагов автоматический: ты сама двигаешь activeStep вперёд, когда родитель уже прошёл предыдущий шаг в диалоге.
Не откатывай activeStep назад. Можно остаться на том же шаге или перейти к следующему.

Важно про обращение:
- coachTip — совет родителю на «Вы» (Выразите…, Скажите…, Спокойно назовите…). Без «ты/тебе» к родителю.
- tryPhrase — реплика родителя ребёнку: к ребёнку можно на «ты».

Верни ТОЛЬКО JSON:
{
  "childMessage": string,
  "coachTip": string, // 1 короткая подсказка родителю на «Вы» (макс ~12 слов, не повторяй название шага)
  "tryPhrase": string, // готовая реплика родителя ребёнку
  "activeStep": number, // номер текущего шага с 1; >= текущего, без отката
  "signals": string[],
  "feedback": null
}`;

export function rehearseUserPrompt(input: RehearseRequest) {
  const history = input.messages
    .map((m) => `${m.role === "parent" ? "Родитель" : "Ребёнок"}: ${m.text}`)
    .join("\n");
  const steps = (input.planSteps || [])
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join("\n");
  const current = input.currentStep && input.currentStep >= 1 ? input.currentStep : 1;
  return `Контекст:
Тема: ${input.topic}
Возраст: ${input.age}
Ситуация: ${input.situation}
Цель: ${input.goalKind} — ${input.goalText}
Реакция ребёнка: ${input.reaction}
План: ${input.planTitle}
Шаги:
${steps || "(нет)"}
Сейчас родитель на шаге: ${current}

История:
${history || "(пусто)"}

Ответ родителя: ${input.parentReply || "(ещё нет)"}

Дай реплику ребёнка, activeStep (>= ${current}), coachTip родителю на «Вы» (не копируй название шага) и tryPhrase.`;
}
