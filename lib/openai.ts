import type { ConversationPlan, GoalKind, PlanStep } from "./plans";
import {
  deriveSituationGoal,
  goalLabel,
  isGenericGoalText,
  reactionWhenLabel,
  actionAddsDetail,
} from "./plans";

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

export const PLAN_SYSTEM = `Ты помощник продукта «Разговор по шагам» для родителей.
Составь план разговора с ребёнком на русском языке.

Главное: НЕ используй один универсальный шаблон на все ситуации.
Сначала опирайся на цель родителя. От цели зависят логика, число шагов (3–6), названия, содержание и то, нужны ли вопросы, договорённость, граница или поддержка.

Важно про заголовок плана (title):
- название ситуации, НЕ инструкция родителю;
- без повелительного наклонения («Выясните…», «Спросите…», «Поймите…», «Договоритесь…»);
- коротко и по-человечески: «Ночи за компьютером», «Скрытая двойка», «Правда о прогулке»;
- не начинай с «Как договориться… / Как понять…».

Важно про цель (goal):
- конкретный результат ЭТОГО разговора по ситуации + типу цели;
- не голый ярлык вроде «Обозначить границу» без конкретики.

Верни ТОЛЬКО JSON:
{
  "title": string,
  "goal": string,
  "reminder": string,
  "nonNegotiable": string | null,
  "discussable": string | null,
  "steps": [
    {
      "title": string,
      "why": string,
      "action": string,
      "phrases": string[] | null,
      "questions": string[] | null,
      "reactions": [{"when": string | null, "child": string, "parent": string}] | null,
      "mark": string | null,
      "discuss": string | null,
      "note": string | null,
      "avoid": string | null,
      "outcome": string | null
    }
  ]
}

Смысл полей шага (включай ТОЛЬКО нужные; остальные null / не дублируй пустым):
- phrases — «Можно сказать»: 1–2 естественные фразы-варианты, не обязательный текст для заучивания;
- questions — «Можно спросить»: без обвинения и без заранее заданного вывода; не в каждом шаге;
- reactions — «Если ребёнок…» + «Можно ответить»: только если родитель указал привычную реакцию. when и реплика ребёнка ОБЯЗАНЫ опираться на неё (не подставляй «молчит» по умолчанию). when — коротко: «молчит», «спорит», «злится», «обвиняет», «расстраивается», «соглашается, но не делает». 0–2 шт., только где вероятно. Если реакция не указана — reactions не добавляй;
- mark — «Важно обозначить»: правило, решение или граница;
- discuss — «Обсудите вместе»: варианты, детали реализации, следующий шаг;
- note — «Обратите внимание»: ориентир родителю;
- avoid — «Лучше избегать»: нежелательные слова/ходы;
- action — только если даёт конкретику сверх title (куда, когда, на чём сделать акцент). Не пересказывай title другими словами — тогда null;
- why — зачем шаг.

Логика по целям (разная последовательность, не копируй одну на все):

1) understand — сначала узнать, что произошло и почему. Не переходи к правилам, последствиям и решениям, пока позиция ребёнка не прояснена.
   Типичные блоки: phrases, questions, reactions (под привычную реакцию родителя), avoid. Без mark-правила и без «наказания».

2) agree — услышать → вместе найти вариант → правило + пробный период.
   Вопросы сначала про взгляд ребёнка, потом про варианты. mark/discuss уместны ближе к концу.
   Важно: если время/число/конкретное правило ещё обсуждается с ребёнком — НЕ вписывай готовое «в 22:00» / «в 23:00» как уже решённое.
   В финальных фразах используй слот: «во сколько договоримся», «в [время, которое выберете вместе]», «так, как решим сейчас».
   Конкретное время можно назвать только если родитель сам указал его в ситуации или в результате своими словами.

3) boundary — ясно сообщить позицию. Несогласие и эмоции можно. Обсуждается НЕ сама граница, а детали реализации (discuss только про детали).
   Нужны mark + phrases; не предлагай совместно выбирать, нужна ли граница.

4) announce — спокойно сообщить уже принятое решение, объяснить, помочь с реакцией. Совместный поиск решения не обязателен.
   phrases, note, reactions под привычную реакцию. Без «давайте решим, делать ли это».

5) support — быть рядом, выслушать, признать переживания, спросить какую помощь нужно.
   phrases, questions, note. Правило/договорённость могут отсутствовать. Не превращай в поиск решения конфликта.

6) trust — факт → причины → влияние на доверие → как быть честнее дальше.
   Не склеивай «версию» и «причину» в два одинаковых «почему».

7) other — одна конкретная цель родителя; не склеивай типы.

Дисциплина диалога:
- каждый шаг — отдельная функция; следующий шаг не предполагает ответы, которых ещё не было;
- вопросы по плану нарастают, без повтора одного и того же «почему/чего боялся»;
- не обещай, что разговор пройдёт по сценарию; формулируй как варианты;
- title — мягкое повелительное к родителю на «вы» («Начните…», «Спросите…»);
- если есть questions — дай хотя бы одну phrase-открытие;
- nonNegotiable / discussable / mark / финальная договорённость согласованы;
- если в шаге есть reactions, первая пара должна соответствовать привычной реакции родителя из запроса;
- не подставляй конкретные часы, дни или цифры «как будто уже договорились», если по логике плана они ещё выбираются вместе.`;

export function planUserPrompt(input: PlanRequest) {
  const customGoal = input.goalText.trim() && !isGenericGoalText(input.goalText);
  const when = reactionWhenLabel(input.reaction);
  return `Тема: ${input.topic.trim() || "не указана"}
Возраст ребёнка: ${input.age || "не указан"} лет
Ситуация: ${input.situation}
Тип цели (базовый): ${input.goalKind} (${goalLabel(input.goalKind)})
Результат своими словами: ${customGoal ? input.goalText.trim() : "не указан — сформулируй goal сама по ситуации и типу цели"}
Привычная реакция ребёнка: ${input.reaction || "не указана"}
${when
    ? `Для блоков reactions используй when «${when}» (и реплику ребёнка в этом ключе). Не заменяй на «молчит», если родитель выбрал другое.`
    : "Реакция не указана — не добавляй блоки reactions в шаги."}

Заголовок плана — короткое название ситуации без повелительного наклонения (не «Выясните…»). Goal — конкретный результат.
Структуру и набор блоков в steps строй строго под цель «${input.goalKind}».
Не используй универсальные 5 шагов. Включай только нужные блоки (phrases/questions/reactions/mark/discuss/note/avoid).
Если цель agree и детали (время, срок, число) ещё выбираются вместе — в phrases не фиксируй выдуманные часы вроде «22:00» или «23:00»; пиши через слот «во сколько договоримся» / «[время, которое выберете вместе]».`;
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

  if (/прогулк|дворе|улиц/.test(lower) && /(правд|соврал|скрыл|врал|обманул)/.test(lower)) {
    return "Правда о прогулке";
  }
  if (/прогулк/.test(lower)) return "Разговор о прогулке";
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
  const looksLikeInstruction =
    /^(начните|скажите|спросите|выслушайте|предложите|договоритесь|объясните|обратите|признайте|уточните|поговорите|поддержите|выясните|узнайте|обсудите|обозначьте|сообщите|подготовьтесь|выберите|ответьте|расскажите|поймите|разберитесь|спокойно|чётко|коротко)(?![а-яё])/i.test(
      next,
    ) ||
    /^(как\s+(понять|договориться|выяснить|узнать|поговорить|обозначить))(?![а-яё])/i.test(
      next,
    ) ||
    /^(понять|установить|договориться|поддержать|сообщить|восстановить)(?![а-яё])/i.test(
      next,
    );
  if (!next || isCategory || next.length < 3 || looksLikeInstruction) {
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
    reaction?: string;
  },
): ConversationPlan {
  const preferredWhen = reactionWhenLabel(ctx?.reaction || "");
  const steps = (raw.steps || [])
    .slice(0, 6)
    .map((s) => {
      const phrasesRaw = Array.isArray((s as PlanStep).phrases)
        ? ((s as PlanStep).phrases as string[]).map(String)
        : [];
      const legacyPhrase = s.phrase ? String(s.phrase).trim() : "";
      const phrases = [
        ...phrasesRaw.map((p) => p.trim()).filter(Boolean),
        ...(legacyPhrase && !phrasesRaw.some((p) => p.trim() === legacyPhrase)
          ? [legacyPhrase]
          : []),
      ];

      let reactions =
        Array.isArray(s.reactions) && s.reactions.length > 0
          ? s.reactions.map((r) => ({
              when: r.when ? String(r.when).trim() : undefined,
              child: String(r.child),
              parent: String(r.parent),
            }))
          : undefined;

      if (!preferredWhen) {
        reactions = undefined;
      } else if (reactions?.length) {
        // Primary «Если ребёнок…» must match the form's typical reaction.
        reactions = [
          { ...reactions[0], when: preferredWhen },
          ...reactions.slice(1),
        ];
      }

      return repairStepDialogue({
        title: String(s.title || "").trim(),
        why: String(s.why || "").trim(),
        action: String(s.action || "").trim(),
        phrases: phrases.length ? phrases : undefined,
        phrase: phrases[0],
        questions:
          Array.isArray(s.questions) && s.questions.length > 0
            ? s.questions.map(String)
            : undefined,
        reactions,
        mark: (s as PlanStep).mark
          ? String((s as PlanStep).mark).trim()
          : undefined,
        discuss: (s as PlanStep).discuss
          ? String((s as PlanStep).discuss).trim()
          : undefined,
        note: (s as PlanStep).note
          ? String((s as PlanStep).note).trim()
          : undefined,
        avoid: s.avoid ? String(s.avoid).trim() : undefined,
        outcome: s.outcome ? String(s.outcome).trim() : undefined,
      });
    })
    .filter((s) => s.title);

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

  let phrases = step.phrases?.length
    ? step.phrases
    : step.phrase
      ? [step.phrase]
      : undefined;

  if ((!phrases || !phrases.length) && questions?.[0]) {
    const q = questions[0].trim().replace(/\?+$/, "");
    const opener = /^(как|что|почему|зачем|чего|когда|где)/i.test(q)
      ? `${q}?`
      : `Расскажи: ${q}?`;
    phrases = [opener];
  }

  return {
    ...step,
    title,
    action: actionAddsDetail(title, step.action) ? step.action : undefined,
    phrases,
    phrase: phrases?.[0],
    questions,
  };
}

/** Support plans often double-invite; drop a redundant second invite. */
function dedupeInviteSteps(steps: NormStep[], goalKind?: GoalKind): NormStep[] {
  if (goalKind !== "support" || steps.length < 3) return steps;
  const isInvite = (s: NormStep) =>
    /поговори|рассказ|когда будет готов|если захочешь/i.test(
      `${s.title} ${(s.phrases || []).join(" ")} ${s.phrase || ""}`,
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
      /^как\s+(договориться|понять|обозначить|сообщить|поддержать|восстановить|подготовиться|выяснить|узнать)[^.?!:]{0,40}[:—-]?\s*/i,
      "",
    )
    .replace(
      /^(выясните|узнайте|поймите|спросите|скажите|начните|договоритесь|обсудите|обозначьте)[^.?!:]{0,60}[:—-]?\s*/i,
      "",
    )
    .replace(/^разговор\s+о\s+/i, "")
    .trim();
  if (!cleaned) return title;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export const REHEARSE_SYSTEM = `Ты ведёшь короткую репетицию разговора родителя с ребёнком.
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
