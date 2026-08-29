import { Client } from '@notionhq/client';
import { getProfileConfig } from './profiles';

function notionForProfile(profile) {
  const config = getProfileConfig(profile);

  if (!config.notionToken) {
    throw new Error(
      `${config.name}'s Notion token is missing. Add ${config.envPrefix}_NOTION_TOKEN to .env.local.`
    );
  }

  return {
    client: new Client({ auth: config.notionToken }),
    config,
  };
}

export function normalizeId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/([0-9a-f]{32})(?:[?#/]|$)/i);
  return match ? match[1] : raw.replace(/-/g, '');
}

function slugify(value) {
  return String(value || 'notion-source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'notion-source';
}

function databaseTitle(database) {
  const title = richTextToString(database?.title || []);
  return title || 'Notion database';
}

async function discoverAccessibleDatabases(client) {
  const results = [];
  let cursor;

  do {
    const response = await client.search({
      filter: {
        property: 'object',
        value: 'database',
      },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const database of response.results || []) {
      const id = normalizeId(database.id);
      if (!id) continue;

      const label = databaseTitle(database);
      results.push({
        key: `${slugify(label)}-${id.slice(0, 6)}`,
        label,
        id,
      });
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return dedupeSources(results);
}

async function configuredSources(client, profile, extraIds = []) {
  const config = getProfileConfig(profile);

  const configured = [
    ...config.notionSourceIds,
    ...extraIds,
  ]
    .map(normalizeId)
    .filter(Boolean);

  // If IDs are explicitly configured, use those exact sources.
  if (configured.length) {
    const sources = [];

    for (const id of [...new Set(configured)]) {
      let label = `Notion source ${id.slice(0, 6)}`;

      try {
        const database = await client.databases.retrieve({
          database_id: id,
        });
        label = databaseTitle(database);
      } catch (_) {
        // The ID may be a page containing child databases.
        try {
          const page = await client.pages.retrieve({ page_id: id });
          label =
            getPageTitle(page) ||
            `Notion page ${id.slice(0, 6)}`;
        } catch (_) {}
      }

      sources.push({
        key: `${slugify(label)}-${id.slice(0, 6)}`,
        label,
        id,
      });
    }

    return dedupeSources(sources);
  }

  // Dynamic mode:
  // every database explicitly shared with this integration is discovered.
  return discoverAccessibleDatabases(client);
}

export async function syncAllNotion(profile, extraIds = []) {
  const { client, config } = notionForProfile(profile);
  const sources = await configuredSources(
    client,
    profile,
    Array.isArray(extraIds) ? extraIds : []
  );

  if (!sources.length) {
    throw new Error(
      `No Notion databases are available for ${config.name}. Share at least one German database with that Notion integration, or set ${config.envPrefix}_NOTION_SOURCE_IDS.`
    );
  }

  const allItems = [];
  const sourceResults = [];
  const errors = [];

  for (const source of sources) {
    try {
      const result = await syncOneSource(client, source);

      allItems.push(...result.items);

      sourceResults.push({
        key: source.key,
        label: result.label,
        id: source.id,
        count: result.items.length,
      });
    } catch (error) {
      errors.push({
        key: source.key,
        label: source.label,
        id: source.id,
        error: error.message,
      });
    }
  }

  const unique = dedupe(allItems);

  return {
    profile: config.id,
    profileName: config.name,
    totalItems: unique.length,
    items: unique,
    byType: groupByType(unique),
    sources: sourceResults,
    errors,
  };
}

async function syncOneSource(client, source) {
  const id = normalizeId(source.id);

  try {
    const database = await client.databases.retrieve({
      database_id: id,
    });

    if (database?.object === 'database') {
      const label = databaseTitle(database) || source.label;
      const actualSource = {
        ...source,
        label,
      };

      const items = [];
      await collectDatabaseRows(
        client,
        id,
        items,
        actualSource
      );

      return {
        label,
        items,
      };
    }
  } catch (_) {
    // Fall through and try the ID as a page/block.
  }

  // A supplied source can also be a page containing child databases
  // or simple text blocks using the supported conventions.
  const blocks = [];
  await collectBlocks(client, id, blocks);

  const label =
    source.label ||
    `Notion page ${id.slice(0, 6)}`;

  const actualSource = {
    ...source,
    label,
  };

  const items = extractLearningItems(blocks).map(
    (item) => ({
      ...item,
      sourceGroup: actualSource.key,
      sourceLabel: actualSource.label,
    })
  );

  await collectDatabaseBlocks(
    client,
    blocks,
    items,
    actualSource
  );

  return {
    label: actualSource.label,
    items,
  };
}

async function collectDatabaseRows(
  client,
  databaseId,
  out,
  source
) {
  let cursor;

  do {
    const response = await client.databases.query({
      database_id: databaseId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of response.results || []) {
      out.push(
        ...extractDatabaseRow(page, source)
      );
    }

    cursor = response.has_more
      ? response.next_cursor
      : undefined;
  } while (cursor);
}

function extractDatabaseRow(page, source) {
  const props = page.properties || {};
  const values = {};
  let titleValue = '';

  for (const [name, prop] of Object.entries(props)) {
    const value = getPropertyValue(prop);
    values[name.toLowerCase().trim()] = value;

    if (prop?.type === 'title' && value) {
      titleValue = value;
    }
  }

  const out = [];
  const sourcePageId = page.id;

  const question =
    firstValue(values, [
      'question',
      'frage',
      'viva question',
      'question german',
    ]) ||
    (
      looksLikeQuestion(titleValue) &&
      firstValue(values, ['answer', 'antwort'])
        ? titleValue
        : ''
    );

  const answer = firstValue(values, [
    'answer',
    'antwort',
    'sample answer',
    'model answer',
  ]);

  const questionEnglish = firstValue(values, [
    'question english',
    'english question',
    'question translation',
  ]);

  const answerEnglish = firstValue(values, [
    'answer english',
    'english answer',
    'answer translation',
  ]);

  const genericEnglish = firstValue(values, [
    'english',
    'meaning',
    'translation',
    'definition',
    'bedeutung',
  ]);

  if (question && answer) {
    out.push({
      type: 'viva',
      prompt: question,
      answer,
      source: question,
      englishHint:
        questionEnglish ||
        genericEnglish ||
        '',
      answerEnglish:
        answerEnglish || '',
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
      extra: [
        questionEnglish,
        answerEnglish,
      ].filter(Boolean),
    });
  }

  const german =
    firstValue(values, [
      'verb',
      'german',
      'german word',
      'word',
      'term',
      'noun',
      'deutsch',
      'wort',
      'name',
    ]) ||
    (
      !question
        ? titleValue
        : ''
    );

  const english =
    firstValue(values, [
      'english',
      'meaning',
      'translation',
      'definition',
      'bedeutung',
      'english meaning',
    ]);

  const notes = firstValue(values, [
    'notes',
    'note',
    'hinweis',
  ]);

  const article = firstValue(values, [
    'article',
    'artikel',
    'gender',
  ]);

  const plural = firstValue(values, [
    'plural',
    'plural form',
    'mehrzahl',
  ]);

  const opposite = firstValue(values, [
    'opposite',
    'opposites',
    'antonym',
    'gegenteil',
  ]);

  const oppositeEnglish = firstValue(values, [
    'opposite english',
    'english opposite',
  ]);

  if (german && english) {
    out.push({
      type: 'wordMeaning',
      prompt: `Was bedeutet „${german}“ auf Englisch?`,
      answer: english,
      source: german,
      englishHint: english,
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
    });

    out.push({
      type: 'englishToGerman',
      prompt: `Was ist „${english}“ auf Deutsch?`,
      answer: german,
      source: english,
      englishHint: english,
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
    });

    // Writing uses the same Notion material but requires typed German.
    out.push({
      type: 'writing',
      prompt: `Schreiben Sie auf Deutsch: „${english}“`,
      answer: german,
      source: english,
      englishHint: english,
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
    });
  }

  const hasVerbColumns =
    Boolean(values.verb) ||
    Boolean(values.ich) ||
    Boolean(values.du) ||
    Boolean(values['er/sie/es']) ||
    Boolean(values['er / sie / es']);

  if (german && english && hasVerbColumns) {
    out.push({
      type: 'verb',
      prompt: `Was bedeutet das Verb „${german}“?`,
      answer: english,
      source: german,
      englishHint: english,
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
      extra: notes ? [notes] : [],
    });

    const persons = [
      ['ich', values.ich],
      ['du', values.du],
      [
        'er/sie/es',
        values['er/sie/es'] ||
          values['er / sie / es'],
      ],
    ];

    for (const [person, form] of persons) {
      if (!form) continue;

      out.push({
        type: 'verbConjugation',
        prompt: `Wie lautet „${german}“ bei „${person}“?`,
        answer: form,
        source: german,
        person,
        sourcePageId,
        sourceGroup: source.key,
        sourceLabel: source.label,
        extra: notes ? [notes] : [],
      });
    }
  }

  if (german && article) {
    out.push({
      type: 'article',
      prompt: `Welcher Artikel passt zu „${german}“?`,
      answer: normalizeArticle(article),
      source: german,
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
      extra: plural ? [plural] : [],
    });
  }

  if (german && plural) {
    out.push({
      type: 'plural',
      prompt: `Wie ist der Plural von „${german}“?`,
      answer: plural,
      source: german,
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
    });
  }

  if (german && opposite) {
    out.push({
      type: 'opposite',
      prompt: `Was ist das Gegenteil von „${german}“?`,
      answer: opposite,
      source: german,
      englishHint: oppositeEnglish || '',
      sourcePageId,
      sourceGroup: source.key,
      sourceLabel: source.label,
      extra: oppositeEnglish
        ? [oppositeEnglish]
        : [],
    });
  }

  return out;
}

function normalizeArticle(value) {
  const article = String(value || '').trim().toLowerCase();
  const match = article.match(/\b(der|die|das)\b/i);
  return match ? match[1].toLowerCase() : value;
}

function looksLikeQuestion(value) {
  const text = String(value || '').trim();
  if (!text) return false;

  if (text.endsWith('?')) return true;

  return /^(wer|was|wo|woher|wohin|wann|warum|wie|welch|kann|können|möchtest|möchten|hast|haben|bist|sind|arbeitest|arbeiten|wohnst|wohnen|kommst|kommen|sprichst|sprechen)\b/i.test(
    text
  );
}

function firstValue(values, names) {
  for (const name of names) {
    const value = values[name];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(value).trim();
    }
  }

  return '';
}

function getPropertyValue(prop) {
  if (!prop) return '';

  switch (prop.type) {
    case 'title':
      return richTextToString(prop.title);

    case 'rich_text':
      return richTextToString(prop.rich_text);

    case 'select':
      return prop.select?.name || '';

    case 'status':
      return prop.status?.name || '';

    case 'multi_select':
      return (prop.multi_select || [])
        .map((item) => item.name)
        .join(', ');

    case 'number':
      return prop.number == null
        ? ''
        : String(prop.number);

    case 'checkbox':
      return prop.checkbox
        ? 'true'
        : 'false';

    case 'url':
      return prop.url || '';

    case 'email':
      return prop.email || '';

    case 'phone_number':
      return prop.phone_number || '';

    case 'formula':
      return getFormulaValue(prop.formula);

    case 'date':
      return prop.date?.start || '';

    case 'people':
      return (prop.people || [])
        .map(
          (person) =>
            person.name ||
            person.person?.email ||
            ''
        )
        .filter(Boolean)
        .join(', ');

    case 'relation':
      return (prop.relation || [])
        .map((relation) => relation.id)
        .join(', ');

    default:
      return '';
  }
}

function getFormulaValue(formula) {
  if (!formula) return '';

  if (formula.type === 'string') {
    return formula.string || '';
  }

  if (formula.type === 'number') {
    return formula.number == null
      ? ''
      : String(formula.number);
  }

  if (formula.type === 'boolean') {
    return formula.boolean
      ? 'true'
      : 'false';
  }

  if (formula.type === 'date') {
    return formula.date?.start || '';
  }

  return '';
}

function getPageTitle(page) {
  const properties = page?.properties || {};

  for (const prop of Object.values(properties)) {
    if (prop?.type === 'title') {
      const value = getPropertyValue(prop);
      if (value) return value;
    }
  }

  return '';
}

async function collectDatabaseBlocks(
  client,
  blocks,
  out,
  source
) {
  for (const block of blocks) {
    if (
      block.type === 'child_database' &&
      block.id
    ) {
      try {
        const database = await client.databases.retrieve({
          database_id: block.id,
        });

        const childSource = {
          key: `${slugify(databaseTitle(database))}-${normalizeId(block.id).slice(0, 6)}`,
          label: databaseTitle(database),
          id: block.id,
        };

        await collectDatabaseRows(
          client,
          block.id,
          out,
          childSource
        );
      } catch (_) {}
    }
  }
}

async function collectBlocks(
  client,
  blockId,
  out
) {
  let cursor;

  do {
    const response =
      await client.blocks.children.list({
        block_id: blockId,
        page_size: 100,
        ...(cursor
          ? { start_cursor: cursor }
          : {}),
      });

    for (const block of response.results || []) {
      out.push(block);

      if (block.has_children) {
        await collectBlocks(
          client,
          block.id,
          out
        );
      }
    }

    cursor = response.has_more
      ? response.next_cursor
      : undefined;
  } while (cursor);
}

function richTextToString(arr = []) {
  return arr
    .map((item) => item.plain_text || '')
    .join('')
    .trim();
}

function extractLearningItems(blocks) {
  const out = [];

  for (const block of blocks) {
    const text = getBlockText(block);
    if (!text) continue;

    const parsed = parseConvention(
      text.replace(/\s+/g, ' ').trim()
    );

    if (parsed) {
      out.push({
        ...parsed,
        sourceBlockId: block.id,
      });
    }
  }

  return out;
}

function getBlockText(block) {
  const rich =
    block[block.type]?.rich_text;

  if (rich) {
    return richTextToString(rich);
  }

  if (block.type === 'image') {
    return block.image?.type === 'external'
      ? block.image.external.url
      : block.image?.file?.url || '';
  }

  return '';
}

function parseConvention(line) {
  const lower = line.toLowerCase();
  const sep = line.includes('|')
    ? '|'
    : line.includes('::')
      ? '::'
      : null;

  if (
    lower.startsWith('translation:') ||
    lower.startsWith('translate:')
  ) {
    const parts = split(
      line.split(':').slice(1).join(':')
    );

    return parts.length >= 2
      ? {
          type: 'translation',
          prompt: parts[0],
          answer: parts[1],
        }
      : null;
  }

  if (lower.startsWith('opposite:')) {
    const parts = split(line.slice(9));

    return parts.length >= 2
      ? {
          type: 'opposite',
          prompt: `Was ist das Gegenteil von „${parts[0]}“?`,
          answer: parts[1],
          source: parts[0],
        }
      : null;
  }

  if (lower.startsWith('verb:')) {
    const parts = split(line.slice(5));

    return parts.length >= 2
      ? {
          type: 'verb',
          prompt: `Was bedeutet das Verb „${parts[0]}“?`,
          answer: parts[1],
          extra: parts.slice(2),
        }
      : null;
  }

  if (lower.startsWith('article:')) {
    const parts = split(line.slice(8));

    return parts.length >= 2
      ? {
          type: 'article',
          prompt: `Welcher Artikel passt zu „${parts[0]}“?`,
          answer: parts[1],
          source: parts[0],
          extra: parts.slice(2),
        }
      : null;
  }

  if (lower.startsWith('picture:')) {
    const parts = split(line.slice(8));

    return parts.length >= 2
      ? {
          type: 'picture',
          image: parts[0],
          prompt: 'Was ist das auf Deutsch?',
          answer: parts[1],
        }
      : null;
  }

  if (sep) {
    const parts = split(line);

    return parts.length >= 2
      ? {
          type: 'wordMeaning',
          prompt: `Was bedeutet „${parts[0]}“?`,
          answer: parts[1],
          source: parts[0],
        }
      : null;
  }

  return null;
}

function split(value) {
  return value
    .split(/\||::/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function dedupe(items) {
  const unique = [];
  const seen = new Set();

  for (const item of items) {
    const key = JSON.stringify({
      type: item.type,
      prompt: item.prompt,
      answer: item.answer,
      source: item.source,
    });

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

function dedupeSources(sources) {
  const byId = new Map();

  for (const source of sources) {
    const id = normalizeId(source.id);
    if (!id) continue;

    if (!byId.has(id)) {
      byId.set(id, {
        ...source,
        id,
      });
    }
  }

  return [...byId.values()];
}

function groupByType(items) {
  return items.reduce((acc, item) => {
    (acc[item.type] ||= []).push(item);
    return acc;
  }, {});
}
