import type { ConversationPlan, GoalKind } from "./plans";
import { goalLabel } from "./plans";

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
  openingPhrase: string;
  messages: { role: "parent" | "child"; text: string }[];
  parentReply: string;
};

export type RehearseResponse = {
  childMessage: string;
  coachTip: string;
  tryPhrase: string;
  signals: string[];
  feedback?: string;
};

export const PLAN_SYSTEM = `Ты помощник продукта «Есть разговор» для родителей.
Составь план разговора с ребёнком на русском языке.
Главный принцип: структура плана зависит от ЦЕЛИ, а не только от темы.
План: от 3 до 6 шагов. Без драматичных формулировок вроде «борьба за власть», если родитель так не писал.

Важно про заголовок (title):
- title отражает ТЕМУ / предмет разговора по ситуации, а НЕ цель.
- Цель уже показывается отдельно, поэтому не начинай title с «Как договориться…», «Как понять…», «Как обозначить…», «Как поддержать…», «Как сообщить…», «Как восстановить…».
- Формулируй коротко и по-человечески: о чём разговор.
- Примеры хороших title: «Домашние обязанности», «Телефон перед сном», «Скрытая оценка», «Компьютер по ночам», «Конфликт с друзьями», «Смена школы».
- Примеры плохих title: «Как договориться о распределении домашних обязанностей», «Как обозначить границу: со мной так нельзя».

Верни ТОЛЬКО JSON:
{
  "title": string, // тема разговора, без повторения цели
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

Правила по целям:
- understand: сначала факт без обвинения и версия ребёнка; НЕ начинай с наказания/правила/исправления оценки
- agree: совместные варианты + обязательная граница + пробный срок
- boundary / announce: не создавай видимость совместного выбора там, где решение уже принято; не используй «давайте вместе найдём решение»
- support: сначала выслушать, советы — только по запросу
- trust: факт без ярлыков → версия → причина → влияние на доверие → исправление → договорённость о правде`;

export function planUserPrompt(input: PlanRequest) {
  return `Тема: ${input.topic}
Возраст ребёнка: ${input.age || "не указан"} лет
Ситуация: ${input.situation}
Тип цели: ${input.goalKind} (${goalLabel(input.goalKind)})
Цель своими словами: ${input.goalText || goalLabel(input.goalKind)}
Привычная реакция ребёнка: ${input.reaction}

Заголовок плана (title) должен назвать тему/предмет разговора по ситуации, а не пересказывать цель.`;
}

export function normalizePlan(raw: ConversationPlan): ConversationPlan {
  const steps = (raw.steps || []).slice(0, 6).map((s) => ({
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
  }));

  return {
    title: sanitizePlanTitle(String(raw.title || "План разговора").trim()),
    reminder: String(raw.reminder || "").trim(),
    nonNegotiable: raw.nonNegotiable
      ? String(raw.nonNegotiable).trim()
      : undefined,
    discussable: raw.discussable ? String(raw.discussable).trim() : undefined,
    steps: steps.filter((s) => s.title && s.action),
  };
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

export const REHEARSE_SYSTEM = `Ты ведёшь репетицию разговора родителя с ребёнком для продукта «Есть разговор».
Отвечай на русском. Ребёнок говорит как сверстник своего возраста, без карикатуры.
Учитывай цель родителя: не уводи разговор в наказание, если цель — понять; не делай вид, что всё обсуждаемо, если цель — граница/решение.

Верни ТОЛЬКО JSON:
{
  "childMessage": string, // следующая реплика ребёнка
  "coachTip": string, // короткая подсказка родителю (видит только он)
  "tryPhrase": string, // пример ответа родителя
  "signals": string[], // 3 пункта «что тренируем»
  "feedback": string | null // краткая ОС после нескольких реплик, иначе null
}`;

export function rehearseUserPrompt(input: RehearseRequest) {
  const history = input.messages
    .map((m) => `${m.role === "parent" ? "Родитель" : "Ребёнок"}: ${m.text}`)
    .join("\n");
  return `Контекст:
Тема: ${input.topic}
Возраст: ${input.age}
Ситуация: ${input.situation}
Цель: ${input.goalKind} — ${input.goalText}
Привычная реакция: ${input.reaction}
План: ${input.planTitle}
Стартовая фраза родителя: ${input.openingPhrase}

История:
${history || "(только стартовая фраза)"}

Новый ответ родителя: ${input.parentReply}

Сгенерируй реакцию ребёнка и подсказку тренера.`;
}
