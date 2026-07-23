# Разговор по шагам

ИИ-помощник для родителей: описать ситуацию → получить план важного разговора с ребёнком по шагам.

Живой сервис: https://est-razgovor.onrender.com  
Репозиторий: https://github.com/lupanovatn-lang/est-razgovor

## Локально

```bash
npm install
cp .env.example .env.local   # добавьте OPENROUTER_API_KEY
npm run dev
```

Нужны Node.js `>=22.13.0` и ключ OpenRouter (или OpenAI-совместимый ключ в тех же переменных — см. `render.yaml`).

## Стек

- vinext / Next.js app router
- генерация плана: `/api/plan`
- репетиция (код сохранён, в UI сейчас скрыта): `/api/rehearse`
- деплой: Render (`render.yaml`)

## Важно

В этом репозитории — продукт **«Разговор по шагам»** (план разговора).  
Черновик отдельного режима «быстрая фраза» сюда не входит.
