"use client";

import { useState } from "react";

type Step = "brief" | "context" | "plan" | "rehearsal";

const topics = ["Гаджеты и интернет", "Учёба", "Правила дома", "Друзья", "Деньги", "Другое"];
const reactions = ["Замыкается и молчит", "Спорит и защищается", "Злится", "Обвиняет меня", "Расстраивается", "Соглашается, но не делает"];
const goalStarters = ["Мы договоримся о…", "Я лучше пойму, почему…", "Ребёнок поймёт, почему важно…", "Мы решим, что делать дальше…"];

export default function Home() {
  const [step, setStep] = useState<Step>("brief");
  const [topic, setTopic] = useState("Гаджеты и интернет");
  const [age, setAge] = useState("13");
  const [situation, setSituation] = useState("Сын всё чаще сидит в телефоне допоздна. Утром не может встать, стал опаздывать в школу. Когда я прошу убрать телефон — раздражается.");
  const [goal, setGoal] = useState("Договориться, что телефон остаётся на кухне после 22:30");
  const [reaction, setReaction] = useState("Спорит и защищается");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openPlanStep, setOpenPlanStep] = useState("02");
  const [reply, setReply] = useState("");
  const [turns, setTurns] = useState<string[]>([]);

  const progress = step === "brief" ? 1 : step === "context" ? 2 : 3;
  const childName = age ? `${age} лет` : "подросток";

  const copyPlan = async () => {
    await navigator.clipboard?.writeText(`План разговора\n\nЦель: ${goal}\nПервая фраза: Я вижу, что утром тебе тяжело вставать, когда накануне ты допоздна сидишь в телефоне. Я хочу поговорить не для того, чтобы отобрать телефон, а чтобы вместе найти решение.\nДоговорённость: телефон остаётся на кухне после 22:30. Проверяем через неделю.`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const sendReply = () => {
    if (!reply.trim()) return;
    setTurns((t) => [...t, reply.trim()]);
    setReply("");
  };

  function Form() {
    const context = step === "context";
    return (
      <section className="form-card">
        <div className="eyebrow">{context ? "Шаг 2 из 2" : "Шаг 1 из 2"}</div>
        <h1>{context ? "Расскажите немного о ребёнке" : "Расскажите о предстоящем разговоре с ребёнком"}</h1>
        <p className="lead">{context ? "Возраст и привычная реакция помогут подобрать подходящий тон и вопросы." : "Не нужно подбирать идеальные слова, достаточно коротко описать ситуацию."}</p>

        {!context ? <>
          <label>О чём вы хотите поговорить?</label>
          <div className="chips">{topics.map((x) => <button key={x} className={topic === x ? "chip active" : "chip"} onClick={() => setTopic(x)}>{x}</button>)}</div>
          <label htmlFor="situation">Что случилось или происходит сейчас?</label>
          <textarea id="situation" value={situation} onChange={(e) => setSituation(e.target.value)} rows={5}/>
          <div className="hint"><span>✦</span><p><b>Можно коротко.</b> Например: что случилось, что вас беспокоит и что уже пробовали.</p></div>
          <label htmlFor="goal">Что должно измениться после разговора?</label>
          <textarea id="goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}/>
          <div className="hint"><span>✦</span><p>Хорошая цель — один реалистичный результат, который зависит от вас обоих. Например, понять причину или договориться о следующем шаге.</p></div>
          <div style={{margin:"11px 0 8px", color:"#7c8983", fontSize:11}}>После разговора…</div>
          <div style={{display:"flex", flexWrap:"wrap", gap:7}}>{goalStarters.map((x) => <button key={x} onClick={() => setGoal(x)} style={{display:"flex", alignItems:"center", gap:6, border:"1px solid #d9e0dc", background:"#fff", borderRadius:9, padding:"8px 10px", fontSize:11, color:"#52675e", cursor:"pointer"}}>{x}</button>)}</div>
        </> : <>
          <label>Сколько лет ребёнку?</label>
          <div className="age-row"><input className="age" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0,2))} aria-label="Возраст ребёнка"/><span>лет</span></div>
          <label>Как ребёнок обычно реагирует?</label>
          <div className="reaction-list">{reactions.map((x) => <button key={x} className={reaction === x ? "reaction selected" : "reaction"} onClick={() => setReaction(x)}><span className="radio">{reaction === x ? "•" : ""}</span>{x}</button>)}</div>
          <div className="summary"><span className="summary-icon">⌁</span><div><b>Мы учтём контекст</b><p>{childName} · {topic.toLowerCase()} · {reaction.toLowerCase()}</p></div></div>
        </>}

        <div className="form-actions">
          {context && <button className="back" onClick={() => setStep("brief")}>Назад</button>}
          <button className="primary" onClick={() => setStep(context ? "plan" : "context")}>{context ? "Составить план" : "Продолжить"}</button>
        </div>
        <div className="privacy"><img src="/lock.svg" alt=""/>Ваше описание используется только для составления плана</div>
      </section>
    );
  }

  function Plan() {
    return (
      <section className="plan-wrap">
        <header className="plan-header">
          <div><button className="plan-back" onClick={() => setStep("context")}>К описанию ситуации</button><h1>Разговор о телефоне без борьбы за власть</h1><p>План из пяти шагов · ребёнку {childName}</p></div>
          <div className="plan-actions"><button className={saved ? "icon-btn saved" : "icon-btn"} onClick={() => setSaved(!saved)}><img src="/bookmark-ref.png" alt=""/>{saved ? "Сохранено" : "Сохранить"}</button><button className="icon-btn" onClick={copyPlan}><img src="/copy-ref.png" alt=""/>{copied ? "Скопировано" : "Копировать"}</button></div>
        </header>
        <div className="plan-layout">
          <div className="plan-flow">
            <PlanItem n="01" title="Выбрать спокойный момент" preview="Не сразу после конфликта и не поздно вечером."><p>Подойдёт спокойное время после ужина, когда никто не спешит. Не начинайте со слов «Нам надо серьёзно поговорить».</p></PlanItem>
            <PlanItem n="02" title="Начать с наблюдения" preview="Назвать конкретный факт и объяснить цель разговора."><blockquote>«Я вижу, что утром тебе тяжело вставать, потому что накануне ты допоздна сидишь в телефоне. Я хочу поговорить не для того, чтобы отобрать телефон, а чтобы вместе найти решение».</blockquote><p>После этой фразы сделайте паузу и дайте ребёнку ответить.</p></PlanItem>
            <PlanItem n="03" title="Задать вопросы и выслушать" preview="Узнать мнение ребёнка, не перебивая и не споря."><div className="question-list"><p>«Что тебя так затягивает в телефоне по вечерам?»</p><p>«Какое правило кажется тебе справедливым?»</p><p>«Что помогло бы тебе вовремя остановиться?»</p></div></PlanItem>
            <PlanItem n="04" title="Спокойно обозначить границу" preview="Отделить обязательное от того, что можно решить вместе."><p>«Я готов обсуждать время и место для телефона. Но в учебные дни важно, чтобы ты высыпался — это условие менять не будем».</p></PlanItem>
            <PlanItem n="05" title="Зафиксировать договорённость" preview="Выбрать конкретное правило и срок проверки."><p>Пробуем одну неделю: телефон остаётся на кухне после 22:30. В воскресенье обсуждаем, что получилось, и при необходимости меняем детали.</p></PlanItem>
          </div>
          <aside className="plan-cheatsheet">
            <h2>Подготовка к разговору</h2>
            <div className="prep-meta"><div><span>Тема</span><p>{topic}</p></div><div><span>Возраст ребёнка</span><p>{childName}</p></div><div><span>Цель разговора</span><p>{goal}</p></div><div><span>План</span><p>5 шагов</p></div></div>
            <div className="prep-reminder"><span>Напоминание</span><p>Спокойный тон, без угроз и сравнения. Слушайте до конца.</p></div>
            <button className="edit-plan-button" onClick={() => setStep("brief")}><img src="/pencil-ref.png" alt=""/>Редактировать план</button>
            <button className="rehearse-button" onClick={() => setStep("rehearsal")}>Потренироваться</button>
          </aside>
        </div>
      </section>
    );
  }

  function PlanItem({n,title,preview,children}:{n:string;title:string;preview:string;children:React.ReactNode}) {
    const open = openPlanStep === n;
    return <article className={open ? "plan-step open" : "plan-step"}><button className="plan-step-head" aria-expanded={open} onClick={() => setOpenPlanStep(open ? "" : n)}><span className="plan-number">{Number(n)}</span><span className="plan-step-copy"><b>{title}</b><small>{preview}</small></span><span className="plan-more">{open ? "Свернуть" : "Подробнее"}<img className={open ? "caret open" : "caret"} src="/caret-ref.png" alt=""/></span></button>{open && <div className="plan-step-body">{children}</div>}</article>;
  }

  function Rehearsal() {
    const childResponses = [
      "Ну конечно. Ты опять хочешь всё запретить. У всех телефон в комнате, почему мне нельзя?",
      "Я и так нормально встаю. Один раз опоздал — и ты уже делаешь из этого катастрофу.",
      "Ладно, допустим. Но в 22:30 слишком рано. Можно хотя бы в одиннадцать?"
    ];
    return <section className="rehearsal-wrap">
      <button className="back rehearsal-back" onClick={() => setStep("plan")}>Вернуться к плану</button>
      <div className="rehearsal-grid">
        <div className="chat-card">
          <div className="chat-head"><div><div className="live"><i/> Репетиция</div><h1>Разговор о телефоне</h1></div><button className="more">•••</button></div>
          <div className="scenario">Вы начали с фразы из плана. Ребёнок сразу защищается и спорит.</div>
          <div className="messages">
            <div className="message parent"><small>Вы</small>Я вижу, что утром тебе тяжело вставать, когда накануне ты допоздна сидишь в телефоне. Я хочу поговорить не для того, чтобы отобрать телефон, а чтобы вместе найти решение.</div>
            {turns.map((t,i) => <div className="turn-pair" key={i}><div className="message child"><small>Ребёнок</small>{childResponses[Math.min(i, childResponses.length-1)]}</div><div className="message parent"><small>Вы</small>{t}</div></div>)}
            <div className="message child"><small>Ребёнок</small>{childResponses[Math.min(turns.length, childResponses.length-1)]}</div>
          </div>
          <div className="composer"><textarea rows={2} placeholder="Ответьте своими словами…" value={reply} onChange={(e)=>setReply(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendReply();}}}/><button onClick={sendReply} aria-label="Отправить">↑</button></div>
          <div className="composer-note">Enter — отправить · Здесь нет идеальных ответов</div>
        </div>
        <aside className="coach-card"><div className="coach-title"><span>✦</span><div><b>Подсказка помощника</b><small>видите только вы</small></div></div><p>Сейчас ребёнок слышит угрозу своей самостоятельности. Не спорьте с «у всех». Сначала покажите, что услышали его.</p><div className="try"><span>Можно попробовать</span><p>«Понимаю, что тебе это кажется несправедливым. Я не хочу решать за тебя — давай обсудим время, которое устроит нас обоих».</p></div><div className="signals"><b>Что тренируем</b><div><span>✓</span>Сначала сохранить контакт</div><div><span>○</span>Затем вернуть границу</div><div><span>○</span>Прийти к договорённости</div></div>{turns.length >= 2 && <div className="feedback"><b>Короткая обратная связь</b><p>Вы не вошли в спор и вернули разговор к цели. Теперь обозначьте, что время можно обсудить, а сам ночной отдых — нет.</p></div>}</aside>
      </div>
    </section>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>setStep("brief")}><img src="/conversation-mark.png" alt=""/><span className="brand-copy"><b>Есть разговор</b><small>ИИ-помощник для подготовки к сложным разговорам с ребёнком</small></span></button>
      <button className="new-conversation" onClick={()=>setStep("brief")}><img src="/plus.svg" alt=""/>Новый разговор</button>
      <div className="conversations-list">
        <button className="history-item active">Телефон перед сном</button>
        <button className="history-item">Разговор об оценках за четверть</button>
        <button className="history-item">Возвращение домой позже обычного</button>
        <button className="history-item">Как обсудить карманные деньги</button>
        <button className="history-item">Ребёнок не хочет делать уроки</button>
        <button className="history-item">Ссора с близким другом</button>
        <button className="history-item">Слишком много времени в играх</button>
        <button className="history-item">Как поговорить о домашних обязанностях</button>
        <button className="history-item">Поддержать перед важным экзаменом</button>
        <button className="history-item">Ребёнок стал часто раздражаться</button>
      </div>
    </aside>
    <section className="workspace">
      <div className="progress"><i style={{width:`${progress * 33.33}%`}}/></div>
      <main>{step === "plan" ? Plan() : step === "rehearsal" ? Rehearsal() : Form()}</main>
      <footer><p>ИИ может ошибаться. В кризисной ситуации обратитесь к специалисту.</p><div>Конфиденциальность</div></footer>
    </section>
  </div>;
}
