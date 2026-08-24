'use client';

import { useMemo, useState } from 'react';

const TYPE_LABELS = {
  wordMeaning: 'German → English',
  englishToGerman: 'English → German',
  translation: 'Translation',
  opposite: 'Opposites',
  verb: 'Verb meaning',
  verbConjugation: 'Verb conjugation',
  article: 'Articles',
  plural: 'Plural',
  viva: '🎤 Viva questions',
  picture: 'Picture → German'
};

const SOURCE_COLORS = {};

export default function Home() {
  const [customIds, setCustomIds] = useState('');
  const [data, setData] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState(['wordMeaning','englishToGerman','opposite','verb','verbConjugation','article','plural','viva']);
  const [count, setCount] = useState(10);
  const [vivaMode, setVivaMode] = useState('mixed');
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const availableTypes = useMemo(() => {
    if (!data) return [];
    return Object.entries(TYPE_LABELS).filter(([key]) => (data.byType?.[key] || []).length > 0);
  }, [data]);

  async function syncNotion() {
    setLoading(true); setMessage(''); setQuiz(null); setSubmitted(false);
    try {
      const rootIds = customIds.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
      const res = await fetch('/api/notion/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootIds })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Notion sync failed');
      setData(json);
      setSelectedTypes(prev => prev.filter(t => (json.byType?.[t] || []).length));
      setMessage(`Synced ${json.totalItems} practice items from ${json.sources?.length || 0} Notion sources.`);
    } catch (e) { setMessage(e.message); }
    finally { setLoading(false); }
  }

  function toggleType(type) {
    setSelectedTypes(prev => prev.includes(type) ? prev.filter(x => x !== type) : [...prev, type]);
  }

  async function startQuiz() {
    if (!data) return setMessage('Sync Notion first.');
    if (!selectedTypes.length) return setMessage('Select at least one question type.');
    setLoading(true); setSubmitted(false); setAnswers({}); setMessage('');
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, count, types: selectedTypes, vivaMode })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Quiz generation failed');
      setQuiz(json.questions);
    } catch (e) { setMessage(e.message); }
    finally { setLoading(false); }
  }

  function score() {
    if (!quiz) return 0;
    return quiz.reduce((n, q) => n + (isCorrect(q) ? 1 : 0), 0);
  }
  function isCorrect(q) {
    if (q.viva) return answers[q.id] === 'correct';
    return normalize(answers[q.id]) === normalize(q.answer);
  }

  const result = submitted ? score() : 0;
  const wrong = submitted && quiz ? quiz.filter(q => !isCorrect(q)) : [];

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">GERMAN • A1 VIVA</p>
          <h1>Notion → Random German Practice</h1>
          <p className="sub">All five of your German databases are synced together: verbs, viva questions, nouns/articles, opposites and key vocabulary.</p>
        </div>
        <div className="badge">{data ? `${data.totalItems} items` : 'Not connected'}</div>
      </section>

      <section className="card setup">
        <h2>1. Sync all German material</h2>
        <p className="hint">The app already knows the five databases you gave me. Leave the box empty and click Sync All. Add IDs/URLs only if you want extra Notion sources.</p>
        <div className="row">
          <textarea value={customIds} onChange={e => setCustomIds(e.target.value)} placeholder="Optional extra Notion IDs or URLs — one per line" rows={2} />
          <button onClick={syncNotion} disabled={loading}>{loading ? 'Syncing…' : 'Sync All Notion'}</button>
        </div>
        {message && <p className="message">{message}</p>}
        {data?.sources?.length > 0 && <div className="sourceGrid">
          {data.sources.map(s => <div className="source" key={s.id}><strong>{s.label}</strong><span>{s.count} items</span></div>)}
        </div>}
        {data?.errors?.length > 0 && <div className="errorBox">Some sources could not be read: {data.errors.map(e => e.label).join(', ')}. Check that your integration has access to each database.</div>}
      </section>

      {data && <section className="card setup">
        <h2>2. Choose your practice</h2>
        <div className="typeGrid">
          {availableTypes.map(([key, label]) => <label key={key} className="check">
            <input type="checkbox" checked={selectedTypes.includes(key)} onChange={() => toggleType(key)} />
            <span>{label}<small>{data.byType[key].length} questions</small></span>
          </label>)}
        </div>
        <div className="row controls">
          <label>Questions <select value={count} onChange={e => setCount(Number(e.target.value))}><option>5</option><option>10</option><option>15</option><option>20</option><option>25</option></select></label>
          <label>Viva mix <select value={vivaMode} onChange={e => setVivaMode(e.target.value)}><option value="mixed">Mixed — about 30% viva</option><option value="viva-heavy">Viva-heavy — about 50%</option><option value="viva-only">Viva only</option></select></label>
          <button onClick={startQuiz} disabled={loading || !selectedTypes.length}>{loading ? 'Generating…' : 'Start random practice'}</button>
        </div>
      </section>}

      {quiz && <section className="card quiz">
        <div className="quizHead"><h2>3. Practice</h2><span>{quiz.length} questions</span></div>
        {quiz.map((q, i) => <Question key={q.id} q={q} index={i} value={answers[q.id]} setValue={v => setAnswers(a => ({ ...a, [q.id]: v }))} submitted={submitted} />)}
        <div className="submitRow">
          {!submitted ? <button onClick={() => setSubmitted(true)}>Finish practice</button> : <button onClick={startQuiz}>New random practice</button>}
        </div>
        {submitted && <div className="result">
          <div><span className="score">{result}/{quiz.length}</span><span className="percent">{Math.round(result / quiz.length * 100)}%</span></div>
          <p>{result === quiz.length ? 'Sehr gut! 🇩🇪' : result >= quiz.length * .7 ? 'Sehr gut! Keep practicing.' : 'Good start. Review your mistakes below.'}</p>
        </div>}
      </section>}

      {submitted && wrong.length > 0 && <section className="card wrong">
        <h2>Incorrect / needs practice</h2>
        {wrong.map((q, i) => <div className="wrongItem" key={q.id}>
          <strong>{i + 1}. {q.prompt}</strong>
          {q.viva ? <><div>Your self-check: <span className="bad">Needs practice / not marked correct</span></div><div>Expected answer: <span className="good">{q.answer}</span></div></> : <><div>Your answer: <span className="bad">{answers[q.id] || 'No answer'}</span></div><div>Correct answer: <span className="good">{q.answer}</span></div></>}
        </div>)}
      </section>}
    </main>
  );
}

function Question({ q, index, value, setValue, submitted }) {
  const correct = q.viva ? value === 'correct' : normalize(value) === normalize(q.answer);
  return <div className="question">
    <div className="qmeta">{index + 1}. {TYPE_LABELS[q.type]}{q.sourceLabel ? ` • ${q.sourceLabel}` : ''}</div>
    <h3>{q.prompt}</h3>
    {q.englishHint && <p className="hint">Meaning / context: {q.englishHint}</p>}
    {q.viva ? <VivaControls value={value} setValue={setValue} submitted={submitted} answer={q.answer} /> : q.image ? <img className="quizImage" src={q.image} alt="German learning prompt" /> : q.options?.length ? <div className="options">{q.options.map(opt => <label key={opt}><input type="radio" name={q.id} checked={value === opt} onChange={() => setValue(opt)} disabled={submitted} /><span>{opt}</span></label>)}</div> : <input className="answer" value={value || ''} onChange={e => setValue(e.target.value)} disabled={submitted} placeholder="Type your answer…" />}
    {submitted && !q.viva && <div className={correct ? 'feedback good' : 'feedback bad'}>{correct ? 'Correct ✓' : `Correct: ${q.answer}`}</div>}
  </div>;
}

function VivaControls({ value, setValue, submitted, answer }) {
  const [show, setShow] = useState(false);
  return <div className="vivaBox">
    <p>Answer aloud first, like in your real viva.</p>
    <button className="secondary" onClick={() => setShow(x => !x)}>{show ? 'Hide answer' : 'Reveal answer'}</button>
    {show && <div className="vivaAnswer">{answer}</div>}
    <div className="vivaButtons">
      <button className={value === 'correct' ? 'self correct' : 'self'} onClick={() => setValue('correct')} disabled={submitted}>✓ I answered correctly</button>
      <button className={value === 'wrong' ? 'self selectedWrong' : 'self'} onClick={() => setValue('wrong')} disabled={submitted}>↻ I need practice</button>
    </div>
  </div>;
}

function normalize(v) { return String(v || '').trim().toLowerCase().replace(/[.!?]$/, '').replace(/\s+/g, ' '); }
