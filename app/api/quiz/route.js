import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { data, count = 10, types = [], vivaMode = 'mixed' } = await req.json();
    if (!data?.items?.length) return NextResponse.json({ error: 'No synced items found.' }, { status: 400 });

    const requested = new Set(types);
    const normal = data.items.filter(x => x?.type && requested.has(x.type));
    const viva = data.items.filter(x => x?.type === 'viva');

    let pool = [...normal];
    if (requested.has('viva')) {
      if (vivaMode === 'viva-heavy') {
        const target = Math.max(1, Math.ceil(count * 0.5));
        pool = [...shuffle(viva).slice(0, target), ...shuffle(normal)];
      } else if (vivaMode === 'viva-only') {
        pool = shuffle(viva);
      } else {
        pool = [...normal, ...shuffle(viva).slice(0, Math.max(1, Math.ceil(count * 0.3)))];
      }
    }

    if (!pool.length) return NextResponse.json({ error: 'No items match the selected question types.' }, { status: 400 });

    // For every wordMeaning item, meaning→German is also available when requested.
    if (requested.has('englishToGerman')) {
      for (const x of data.items.filter(i => i.type === 'wordMeaning')) {
        pool.push({ ...x, type: 'englishToGerman', prompt: `Was ist „${x.answer}“ auf Deutsch?`, answer: x.source });
      }
    }

    // Keep source/type diversity where possible.
    const selected = diversifyAndShuffle(pool, count);
    const questions = selected.map((item, i) => buildQuestion(item, pool, i));
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function buildQuestion(item, pool, i) {
  const q = { ...item, id: `q-${Date.now()}-${i}` };
  if (item.type === 'wordMeaning' || item.type === 'verb' || item.type === 'englishToGerman') {
    q.options = optionsFor(item, pool, x => x.answer);
  }
  if (item.type === 'article') q.options = ['der', 'die', 'das'];
  if (item.type === 'translation') q.prompt = `Übersetzen Sie ins Deutsche: „${item.prompt}“`;
  if (item.type === 'plural') q.options = optionsFor(item, pool, x => x.answer);
  if (item.type === 'opposite') q.options = optionsFor(item, pool, x => x.answer);
  if (item.type === 'verbConjugation') q.options = optionsFor(item, pool, x => x.answer);
  if (item.type === 'viva') q.viva = true;
  return q;
}

function optionsFor(item, pool, fn) {
  const sameType = pool.filter(x => x !== item && x.type === item.type);
  const fallback = pool.filter(x => x !== item && typeof fn(x) === 'string');
  const candidates = [...sameType, ...fallback].sort(() => Math.random() - 0.5);
  const answers = [fn(item), ...candidates.map(fn)].filter(Boolean);
  return [...new Set(answers)].slice(0, 4).sort(() => Math.random() - 0.5);
}

function diversifyAndShuffle(pool, count) {
  const shuffled = shuffle(pool);
  const selected = [];
  const seen = new Set();
  for (const item of shuffled) {
    const key = `${item.type}|${item.prompt}|${item.answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= count) break;
  }
  return selected;
}

function shuffle(arr) { return [...arr].sort(() => Math.random() - 0.5); }
