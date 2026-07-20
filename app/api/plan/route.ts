import {
  buildPlan,
  type ConversationPlan,
  type GoalKind,
} from "../../../lib/plans";
import {
  getOpenAIKey,
  normalizePlan,
  openaiJson,
  PLAN_SYSTEM,
  planUserPrompt,
  type PlanRequest,
} from "../../../lib/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlanRequest;
    if (!body?.situation?.trim()) {
      return Response.json({ error: "Опишите ситуацию" }, { status: 400 });
    }
    if (!body.goalKind) {
      return Response.json({ error: "Выберите цель" }, { status: 400 });
    }

    const input: PlanRequest = {
      topic: body.topic || "Другое",
      situation: body.situation.trim(),
      goalKind: body.goalKind as GoalKind,
      goalText: body.goalText?.trim() || "",
      age: body.age || "",
      reaction: body.reaction || "",
    };

    if (!getOpenAIKey()) {
      return Response.json({
        plan: buildPlan(input.goalKind, input),
        source: "fallback",
        warning: "OPENROUTER_API_KEY не задан — показан шаблонный план",
      });
    }

    const raw = await openaiJson<ConversationPlan>({
      system: PLAN_SYSTEM,
      user: planUserPrompt(input),
      temperature: 0.55,
    });

    const plan = normalizePlan(raw, {
      situation: input.situation,
      topic: input.topic,
    });
    if (plan.steps.length < 3) {
      return Response.json({
        plan: buildPlan(input.goalKind, input),
        source: "fallback",
        warning: "Модель вернула слишком короткий план — использован шаблон",
      });
    }

    return Response.json({ plan, source: "openai" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка генерации";
    return Response.json({ error: message }, { status: 500 });
  }
}
