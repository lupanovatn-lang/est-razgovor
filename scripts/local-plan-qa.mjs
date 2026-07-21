/**
 * Local plan QA — loads .env.local and exercises /lib plan generation.
 * Run: node --experimental-strip-types scripts/local-plan-qa.mjs
 * or:  npx tsx scripts/local-plan-qa.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const text = readFileSync(resolve(root, ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const cases = [
  {
    id: "agree",
    topic: "Гаджеты и интернет",
    situation: "Сидит ночь за компом, утром еле встаёт в школу",
    goalKind: "agree",
    goalText: "",
    age: "12",
    reaction: "Спорит и защищается",
  },
  {
    id: "understand",
    topic: "Учёба",
    situation: "Получил двойку и сказал, что тройка",
    goalKind: "understand",
    goalText: "",
    age: "11",
    reaction: "Замыкается и молчит",
  },
  {
    id: "boundary",
    topic: "Правила дома",
    situation: "Не убирает комнату уже третью неделю, вещи везде",
    goalKind: "boundary",
    goalText: "",
    age: "14",
    reaction: "Злится",
  },
  {
    id: "announce",
    topic: "Учёба",
    situation: "Мы уже решили перевести ребёнка в другую школу с сентября",
    goalKind: "announce",
    goalText: "",
    age: "10",
    reaction: "Расстраивается",
  },
  {
    id: "support",
    topic: "Друзья",
    situation: "Поссорился с лучшим другом и весь вечер молчит, выглядит подавленно",
    goalKind: "support",
    goalText: "",
    age: "13",
    reaction: "Замыкается и молчит",
  },
  {
    id: "trust",
    topic: "Правила дома",
    situation: "Сказал что был у друга, а на самом деле гулял допоздна в парке",
    goalKind: "trust",
    goalText: "",
    age: "15",
    reaction: "Обвиняет меня",
  },
];

function scoreQuestions(steps) {
  const issues = [];
  const qs = [];
  for (const s of steps) {
    for (const q of s.questions || []) qs.push(String(q).toLowerCase());
  }
  for (let i = 1; i < qs.length; i++) {
    const a = new Set(qs[i - 1].replace(/\?/g, "").split(/\s+/));
    const b = new Set(qs[i].replace(/\?/g, "").split(/\s+/));
    const inter = [...a].filter((w) => b.has(w)).length;
    if (a.size && inter / Math.max(a.size, b.size) > 0.55) {
      issues.push(`near-dup Q: ${qs[i - 1].slice(0, 48)} ↔ ${qs[i].slice(0, 48)}`);
    }
  }
  const why = qs.filter((q) => q.includes("почему") || q.includes("чего") || q.includes("боял")).length;
  if (why >= 4) issues.push(`fear/why stack (${why})`);

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if ((s.questions || []).length && !(s.phrase || "").trim()) {
      issues.push(`s${i + 1}: questions without phrase`);
    }
  }

  // consecutive invite-like phrases
  const inviteRe = /поговори|расскаж|когда будет готов|если захочешь/i;
  for (let i = 1; i < steps.length; i++) {
    const a = `${steps[i - 1].title} ${steps[i - 1].phrase || ""}`;
    const b = `${steps[i].title} ${steps[i].phrase || ""}`;
    if (inviteRe.test(a) && inviteRe.test(b)) issues.push(`s${i}/${i + 1}: duplicate invite`);
  }

  return issues;
}

function dialogueScore(kind, steps) {
  const issues = scoreQuestions(steps);
  const titles = steps.map((s) => (s.title || "").toLowerCase()).join(" | ");
  if (kind === "announce" && /нужна ли|вместе решим перевести/.test(titles)) {
    issues.push("announce fake choice");
  }
  if (kind === "boundary" && /нужна ли граница|нужно ли убир/.test(titles)) {
    issues.push("boundary voted");
  }
  const verdict = issues.length === 0 ? "ok" : issues.length <= 2 ? "weak" : "bad";
  return { verdict, issues };
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY missing in .env.local");
    process.exit(1);
  }

  // Dynamic import of TS via node --experimental-strip-types / tsx
  const mod = await import(resolve(root, "lib/openai.ts"));
  const { PLAN_SYSTEM, planUserPrompt, openaiJson, normalizePlan } = mod;

  const outDir = resolve(root, ".local-qa");
  mkdirSync(outDir, { recursive: true });
  const results = [];

  for (const c of cases) {
    process.stdout.write(`\n=== ${c.id} ===\n`);
    const raw = await openaiJson({
      system: PLAN_SYSTEM,
      user: planUserPrompt(c),
      temperature: 0.4,
    });
    const plan = normalizePlan(raw, {
      situation: c.situation,
      topic: c.topic,
      goalKind: c.goalKind,
      goalText: c.goalText,
    });
    const { verdict, issues } = dialogueScore(c.id, plan.steps || []);
    const row = {
      id: c.id,
      title: plan.title,
      goal: plan.goal,
      nonNegotiable: plan.nonNegotiable,
      discussable: plan.discussable,
      verdict,
      issues,
      steps: (plan.steps || []).map((s) => ({
        title: s.title,
        phrase: s.phrase,
        phrases: s.phrases,
        questions: s.questions,
        reactions: s.reactions,
        mark: s.mark,
        discuss: s.discuss,
        note: s.note,
        avoid: s.avoid,
      })),
    };
    results.push(row);
    console.log("TITLE:", plan.title);
    console.log("GOAL:", plan.goal);
    for (let i = 0; i < row.steps.length; i++) {
      const s = row.steps[i];
      console.log(`\n${i + 1}. ${s.title}`);
      if (s.phrase) console.log("   P:", s.phrase);
      for (const q of s.questions || []) console.log("   Q:", q);
    }
    console.log("\nVERDICT:", verdict, issues.length ? issues : "—");
    writeFileSync(resolve(outDir, `${c.id}.json`), JSON.stringify(row, null, 2));
  }

  writeFileSync(resolve(outDir, "summary.json"), JSON.stringify(results, null, 2));
  console.log("\nDONE", Object.fromEntries(results.map((r) => [r.id, r.verdict])));
  console.log("Saved to", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
