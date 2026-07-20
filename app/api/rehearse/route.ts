import {
  getOpenAIKey,
  openaiJson,
  REHEARSE_SYSTEM,
  rehearseUserPrompt,
  type RehearseRequest,
  type RehearseResponse,
} from "../../../lib/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RehearseRequest;
    if (!body?.parentReply?.trim() && !(body.messages?.length > 0)) {
      // initial child reaction after opening is allowed with empty parentReply
    }

    if (!getOpenAIKey()) {
      return Response.json(
        {
          error:
            "OPENROUTER_API_KEY не задан на сервере. Добавьте ключ в переменные окружения Render.",
        },
        { status: 503 },
      );
    }

    const planSteps = Array.isArray(body.planSteps)
      ? body.planSteps
          .map((s) => ({
            title: String(s?.title || "").trim(),
            action: s?.action ? String(s.action).trim() : undefined,
          }))
          .filter((s) => s.title)
      : [];

    const input: RehearseRequest = {
      topic: body.topic || "",
      situation: body.situation || "",
      goalKind: body.goalKind,
      goalText: body.goalText || "",
      age: body.age || "",
      reaction: body.reaction || "",
      planTitle: body.planTitle || "",
      planSteps,
      openingPhrase: body.openingPhrase || "",
      messages: Array.isArray(body.messages) ? body.messages : [],
      parentReply: body.parentReply?.trim() || "",
    };

    const raw = await openaiJson<RehearseResponse>({
      system: REHEARSE_SYSTEM,
      user: rehearseUserPrompt(input),
      temperature: 0.7,
    });

    const stepCount = planSteps.length;
    const parsedStep = Number(raw.activeStep);
    const activeStep =
      stepCount > 0 && Number.isFinite(parsedStep)
        ? Math.min(stepCount, Math.max(1, Math.round(parsedStep)))
        : null;

    return Response.json({
      childMessage: String(raw.childMessage || "").trim(),
      coachTip: String(raw.coachTip || "").trim(),
      tryPhrase: String(raw.tryPhrase || "").trim(),
      activeStep,
      signals: Array.isArray(raw.signals)
        ? raw.signals.map(String).slice(0, 4)
        : [],
      feedback: raw.feedback ? String(raw.feedback).trim() : undefined,
    } satisfies RehearseResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка репетиции";
    return Response.json({ error: message }, { status: 500 });
  }
}
