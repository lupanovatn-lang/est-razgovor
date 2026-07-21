# Репетиция — временно скрыта

Скрыто из UI (нет ресурсов на проработку). Код экрана `Rehearsal` в `app/page.tsx` и API `/api/rehearse` сохранены.

## Продуктовое описание

- **Блок:** Потренировать
- **Описание:** Короткая репетиция первых фраз — чтобы не идти в разговор «в холодную».
- **Кнопка:** Начать

## Как вернуть

1. В `PlanView` снова показать блок:

```tsx
<aside className="rehearse-invite">
  <div className="rehearse-invite-copy">
    <h2>Потренировать</h2>
    <p>Короткая репетиция первых фраз — чтобы не идти в разговор «в холодную».</p>
  </div>
  <button type="button" className="rehearse-button" onClick={startRehearsal}>
    Начать
  </button>
</aside>
```

2. В корневом рендере снова маршрутизировать `view === "rehearsal"` на `Rehearsal()`.
