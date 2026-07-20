type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported() {
  return !!getRecognitionCtor();
}

export function createRecognition() {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "ru-RU";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
}

function clearAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakBrowserChild(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ru-RU";
  // Higher pitch ≈ closer to a child; browser voices are still limited.
  utter.pitch = 1.45;
  utter.rate = 1.08;
  const voices = window.speechSynthesis.getVoices();
  const ru =
    voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith("ru") &&
        /milena|irina|katya|tanya|alena|elena|female|girl/i.test(v.name),
    ) || voices.find((v) => v.lang.toLowerCase().startsWith("ru"));
  if (ru) utter.voice = ru;
  window.speechSynthesis.speak(utter);
}

/** Speak as the child: prefer API TTS, fall back to browser voice. */
export async function speakChild(text: string, age?: string) {
  if (typeof window === "undefined") return;
  const clean = text.trim();
  if (!clean) return;
  clearAudio();

  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, age: age || "" }),
    });
    if (!res.ok) {
      speakBrowserChild(clean);
      return;
    }
    const blob = await res.blob();
    if (!blob.size) {
      speakBrowserChild(clean);
      return;
    }
    const url = URL.createObjectURL(blob);
    currentObjectUrl = url;
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => clearAudio();
    audio.onerror = () => {
      clearAudio();
      speakBrowserChild(clean);
    };
    await audio.play();
  } catch {
    speakBrowserChild(clean);
  }
}

export function stopSpeaking() {
  clearAudio();
}

/** @deprecated use speakChild */
export function speakRu(text: string) {
  void speakChild(text);
}
