import { Client } from '@notionhq/client';

// These are the five German-learning databases you gave me.
// IDs are not secrets; the Notion token is the secret and stays server-side.
export const DEFAULT_SOURCES = [
  { key: 'verbs', label: 'Verbs', id: '86817998fa2a4f93994578332f43a28a' },
  { key: 'qa', label: 'Questions & Answers', id: '49b840d0124341ecb60eaa9771162c43' },
  { key: 'nouns', label: 'Nouns & Articles', id: 'a1034b47f85c4acc8f034bc9ea4e6620' },
  { key: 'opposites', label: 'Opposites', id: '04f5f69f149f49438f7d22c66e62d496' },
  { key: 'other', label: 'Other Key Vocabulary', id: 'cb2aea35c68547c2bea364b2571fafe3' },
];

function notion() {
  if (!process.env.NOTION_TOKEN) throw new Error('NOTION_TOKEN is missing in .env.local');
  return new Client({ auth: process.env.NOTION_TOKEN });
}

export function normalizeId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/([0-9a-f]{32})(?:[?#/]|$)/i);
  return match ? match[1] : raw.replace(/-/g, '');
}

export function getConfiguredSources(extraIds = []) {
  const envIds = String(process.env.NOTION_SOURCE_IDS || '')
    .split(',').map(x => x.trim()).filter(Boolean);

  const supplied = [...envIds, ...extraIds].map(normalizeId).filter(Boolean);
  const ids = [...DEFAULT_SOURCES.map(s => s.id), ...supplied];

  const byId = new Map(DEFAULT_SOURCES.map(s => [normalizeId(s.id), s]));
  return [...new Map(ids.map(id => {
    const known = byId.get(id);
    return [id, known || { key: `custom-${id.slice(0, 6)}`, label: 'Custom Notion source', id }];
  })).values()];
}

export async function syncAllNotion(extraIds = []) {
  const client = notion();
  const sources = getConfiguredSources(extraIds);
  const allItems = [];
  const sourceResults = [];
  const errors = [];

  for (const source of sources) {
    try {
      const result = await syncOneSource(client, source);
      allItems.push(...result.items);
      sourceResults.push({ key: source.key, label: result.label, id: source.id, count: result.items.length });
    } catch (error) {
      errors.push({ key: source.key, label: source.label, id: source.id, error: error.message });
    }
  }

  const unique = dedupe(allItems);
  return {
    totalItems: unique.length,
    items: unique,
    byType: groupByType(unique),
    sources: sourceResults,
    errors,
  };
}

// Backwards-compatible single-source function.
export async function syncNotion(rootId) {
  const sources = getConfiguredSources(rootId ? [rootId] : []);
  const client = notion();
  const allItems = [];
  for (const source of sources) {
    const result = await syncOneSource(client, source);
    allItems.push(...result.items);
  }
  const unique = dedupe(allItems);
  return { totalItems: unique.length, items: unique, byType: groupByType(unique), sources, errors: [] };
}

async function syncOneSource(client, source) {
  const id = normalizeId(source.id);
  let database;
  try {
    database = await client.databases.retrieve({ database_id: id });
  } catch (_) {
    const blocks = [];
    await collectBlocks(client, id, blocks);
    const items = extractLearningItems(blocks).map(x => ({ ...x, sourceGroup: source.key, sourceLabel: source.label }));
    await collectDatabaseBlocks(client, blocks, items, source);
    return { label: source.label, items };
  }

  if (database?.object !== 'database') throw new Error(`Notion ID is not a readable database/page: ${source.id}`);

  const items = [];
  await collectDatabaseRows(client, id, items, source);
  return { label: source.label, items };
}

async function collectDatabaseRows(client, databaseId, out, source) {
  let cursor;
  do {
    const res = await client.databases.query({
      database_id: databaseId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {})
    });
    for (const page of res.results) out.push(...extractDatabaseRow(page, source));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
}

function extractDatabaseRow(page, source) {
  const props = page.properties || {};
  const values = {};
  for (const [name, prop] of Object.entries(props)) values[name.toLowerCase().trim()] = getPropertyValue(prop);

  const sourceKey = source.key;
  const out = [];
  const sourcePageId = page.id;

  // Questions & Answers: these are intentionally treated as viva questions.
  const question = firstValue(values, ['question', 'frage']);
  const answer = firstValue(values, ['answer', 'antwort']);
  const english = firstValue(values, ['english', 'meaning', 'translation']);
  if (question && answer && (sourceKey === 'qa' || values.question)) {
    out.push({
      type: 'viva', prompt: question, answer, source: question,
      englishHint: english, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label,
      extra: english ? [english] : []
    });
  }

  const german = firstValue(values, ['verb', 'german', 'german word', 'word', 'term', 'noun']);
  const germanEnglish = firstValue(values, ['english', 'meaning', 'translation', 'definition']);
  const notes = firstValue(values, ['notes', 'note']);
  const article = firstValue(values, ['article', 'artikel']);
  const plural = firstValue(values, ['plural', 'plural form']);
  const opposite = firstValue(values, ['opposite', 'opposites', 'antonym', 'gegenteil']);
  const oppositeEnglish = firstValue(values, ['opposite english']);

  if (german && germanEnglish && sourceKey !== 'qa') {
    out.push({
      type: 'wordMeaning', prompt: `Was bedeutet „${german}“ auf Englisch?`, answer: germanEnglish,
      source: german, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label
    });
    out.push({
      type: 'englishToGerman', prompt: `Was ist „${germanEnglish}“ auf Deutsch?`, answer: german,
      source: germanEnglish, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label
    });
  }

  // Verb-specific conjugation practice from ich / du / er/sie/es columns.
  if (german && germanEnglish && (sourceKey === 'verbs' || values.verb)) {
    out.push({
      type: 'verb', prompt: `Was bedeutet das Verb „${german}“?`, answer: germanEnglish,
      source: german, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label,
      extra: notes ? [notes] : []
    });
    for (const person of ['ich', 'du', 'er/sie/es']) {
      const form = values[person];
      if (form) out.push({
        type: 'verbConjugation',
        prompt: `Wie lautet „${german}“ bei „${person}“?`,
        answer: form,
        source: german,
        person,
        sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label,
        extra: notes ? [notes] : []
      });
    }
  }

  if (german && article) {
    out.push({
      type: 'article', prompt: `Welcher Artikel passt zu „${german}“?`, answer: article,
      source: german, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label,
      extra: plural ? [plural] : []
    });
  }

  if (german && plural && sourceKey === 'nouns') {
    out.push({
      type: 'plural', prompt: `Wie ist der Plural von „${german}“?`, answer: plural,
      source: german, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label
    });
  }

  if (german && opposite) {
    out.push({
      type: 'opposite', prompt: `Was ist das Gegenteil von „${german}“?`, answer: opposite,
      source: german, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label,
      extra: oppositeEnglish ? [oppositeEnglish] : []
    });
  }

  // Other Key Vocabulary has German as title and English as text, plus category.
  if (sourceKey === 'other' && german && germanEnglish) {
    out.push({
      type: 'wordMeaning', prompt: `Was bedeutet „${german}“?`, answer: germanEnglish,
      source: german, sourcePageId, sourceGroup: sourceKey, sourceLabel: source.label
    });
  }

  return out;
}

function firstValue(values, names) {
  for (const name of names) {
    const value = values[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function getPropertyValue(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title': return richTextToString(prop.title);
    case 'rich_text': return richTextToString(prop.rich_text);
    case 'select': return prop.select?.name || '';
    case 'status': return prop.status?.name || '';
    case 'multi_select': return (prop.multi_select || []).map(x => x.name).join(', ');
    case 'number': return prop.number == null ? '' : String(prop.number);
    case 'checkbox': return prop.checkbox ? 'true' : 'false';
    case 'url': return prop.url || '';
    case 'email': return prop.email || '';
    case 'phone_number': return prop.phone_number || '';
    case 'formula': return getFormulaValue(prop.formula);
    case 'date': return prop.date?.start || '';
    case 'people': return (prop.people || []).map(x => x.name || x.person?.email || '').filter(Boolean).join(', ');
    case 'relation': return (prop.relation || []).map(x => x.id).join(', ');
    default: return '';
  }
}

function getFormulaValue(formula) {
  if (!formula) return '';
  if (formula.type === 'string') return formula.string || '';
  if (formula.type === 'number') return formula.number == null ? '' : String(formula.number);
  if (formula.type === 'boolean') return formula.boolean ? 'true' : 'false';
  if (formula.type === 'date') return formula.date?.start || '';
  return '';
}

async function collectDatabaseBlocks(client, blocks, out, source) {
  for (const block of blocks) {
    if (block.type === 'child_database' && block.id) {
      try { await collectDatabaseRows(client, block.id, out, source); } catch (_) {}
    }
  }
}

async function collectBlocks(client, blockId, out) {
  let cursor;
  do {
    const res = await client.blocks.children.list({ block_id: blockId, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    for (const block of res.results) {
      out.push(block);
      if (block.has_children) await collectBlocks(client, block.id, out);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
}

function richTextToString(arr = []) { return arr.map(x => x.plain_text || '').join('').trim(); }

function extractLearningItems(blocks) {
  const out = [];
  for (const b of blocks) {
    const text = getBlockText(b);
    if (!text) continue;
    const parsed = parseConvention(text.replace(/\s+/g, ' ').trim());
    if (parsed) out.push({ ...parsed, sourceBlockId: b.id });
  }
  return out;
}

function getBlockText(b) {
  const rich = b[b.type]?.rich_text;
  if (rich) return richTextToString(rich);
  if (b.type === 'image') return b.image?.type === 'external' ? b.image.external.url : b.image?.file?.url || '';
  return '';
}

function parseConvention(line) {
  const lower = line.toLowerCase();
  const sep = line.includes('|') ? '|' : line.includes('::') ? '::' : null;
  if (lower.startsWith('translation:') || lower.startsWith('translate:')) {
    const parts = split(line.split(':').slice(1).join(':')); return parts.length >= 2 ? { type: 'translation', prompt: parts[0], answer: parts[1] } : null;
  }
  if (lower.startsWith('opposite:')) { const parts = split(line.slice(9)); return parts.length >= 2 ? { type: 'opposite', prompt: `Was ist das Gegenteil von „${parts[0]}“?`, answer: parts[1], source: parts[0] } : null; }
  if (lower.startsWith('verb:')) { const parts = split(line.slice(5)); return parts.length >= 2 ? { type: 'verb', prompt: `Was bedeutet das Verb „${parts[0]}“?`, answer: parts[1], extra: parts.slice(2) } : null; }
  if (lower.startsWith('article:')) { const parts = split(line.slice(8)); return parts.length >= 2 ? { type: 'article', prompt: `Welcher Artikel passt zu „${parts[0]}“?`, answer: parts[1], source: parts[0], extra: parts.slice(2) } : null; }
  if (lower.startsWith('picture:')) { const parts = split(line.slice(8)); return parts.length >= 2 ? { type: 'picture', image: parts[0], prompt: 'Was ist das auf Deutsch?', answer: parts[1] } : null; }
  if (sep) { const parts = split(line); return parts.length >= 2 ? { type: 'wordMeaning', prompt: `Was bedeutet „${parts[0]}“?`, answer: parts[1], source: parts[0] } : null; }
  return null;
}

function split(s) { return s.split(/\||::/).map(x => x.trim()).filter(Boolean); }

function dedupe(items) {
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = JSON.stringify({ type: item.type, prompt: item.prompt, answer: item.answer, source: item.source });
    if (!seen.has(key)) { seen.add(key); unique.push(item); }
  }
  return unique;
}

function groupByType(items) {
  return items.reduce((acc, item) => { (acc[item.type] ||= []).push(item); return acc; }, {});
}
