import { getOpenAIKey } from "../../../lib/openai";

const TTS_URL = "https://openrouter.ai/api/v1/audio/speech";
const TTS_MODEL =
  process.env.OPENROUTER_TTS_MODEL?.trim() || "openai/gpt-4o-mini-tts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; age?: string };
    const text = String(body.text || "").trim();
    if (!text) {
      return Response.json({ error: "Нет текста для озвучки" }, { status: 400 });
    }
    if (text.length > 800) {
      return Response.json({ error: "Слишком длинный текст" }, { status: 400 });
    }

    const key = getOpenAIKey();
    if (!key) {
      return Response.json(
        { error: "OPENROUTER_API_KEY не задан на сервере" },
        { status: 503 },
      );
    }

    const ageNum = Number(String(body.age || "").replace(/\D/g, ""));
    const ageLabel =
      Number.isFinite(ageNum) && ageNum >= 5 && ageNum <= 17
        ? `${ageNum} лет`
        : "подростка";

    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://est-razgovor.onrender.com",
        "X-Title": "Est Razgovor",
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        voice: "coral",
        response_format: "mp3",
        speed: 1,
        // gpt-4o-mini-tts supports style instructions
        instructions: `Speak in natural Russian as a real child around ${ageLabel}: warm, lively, a bit emotional, not an adult announcer and not a robot. Slightly higher childlike pitch, conversational, short pauses like a kid talking to a parent.`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: `TTS error ${res.status}: ${detail.slice(0, 300)}` },
        { status: 502 },
      );
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка озвучки";
    return Response.json({ error: message }, { status: 500 });
  }
}
