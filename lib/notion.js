import { Client } from '@notionhq/client';
import { getProfileConfig } from './profiles';


/* =========================================================
   PROFILE / NOTION CLIENT
   ========================================================= */

function notionForProfile(profile) {
  const config = getProfileConfig(profile);

  if (!config.notionToken) {
    throw new Error(
      `${config.name}'s Notion token is missing. Add ${config.envPrefix}_NOTION_TOKEN to .env.local.`
    );
  }

  return {
    client: new Client({
      auth: config.notionToken
    }),
    config
  };
}


/* =========================================================
   NORMALIZE NOTION ID / URL
   ========================================================= */

export function normalizeId(value) {
  const raw = String(value || '').trim();

  if (!raw) return '';

  const match = raw.match(
    /([0-9a-f]{32})(?:[?#/]|$)/i
  );

  return match
    ? match[1]
    : raw.replace(/-/g, '');
}


/* =========================================================
   HELPERS
   ========================================================= */

function slugify(value) {
  return String(value || 'notion-source')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'notion-source';
}


function databaseTitle(database) {
  const title =
    richTextToString(
      database?.title || []
    );

  return title || 'Notion database';
}


/* =========================================================
   DISCOVER ACCESSIBLE DATABASES
   ========================================================= */

async function discoverAccessibleDatabases(client) {
  const results = [];

  let cursor;

  do {
    const response =
      await client.search({
        filter: {
          property: 'object',
          value: 'database'
        },

        page_size: 100,

        ...(cursor
          ? { start_cursor: cursor }
          : {})
      });


    for (
      const database of
      response.results || []
    ) {
      const id =
        normalizeId(database.id);

      if (!id) continue;

      const label =
        databaseTitle(database);

      results.push({
        key:
          `${slugify(label)}-${id.slice(0, 6)}`,

        label,

        id
      });
    }


    cursor =
      response.has_more
        ? response.next_cursor
        : undefined;

  } while (cursor);


  return dedupeSources(results);
}


/* =========================================================
   DETERMINE SOURCES FOR PROFILE
   ========================================================= */

async function configuredSources(
  client,
  profile,
  extraIds = []
) {
  const config =
    getProfileConfig(profile);


  const configured = [
    ...config.notionSourceIds,
    ...extraIds
  ]
    .map(normalizeId)
    .filter(Boolean);


  /*
    If explicit IDs are configured,
    use those exact databases/pages.

    THIS IS IMPORTANT FOR LEELA.

    Her learning material is mostly
    normal Notion pages containing
    Simple Tables.
  */

  if (configured.length) {
    const sources = [];


    for (
      const id of
      [...new Set(configured)]
    ) {
      let label =
        `Notion source ${id.slice(0, 6)}`;


      /*
        First try as database.
      */

      try {
        const database =
          await client.databases.retrieve({
            database_id: id
          });

        label =
          databaseTitle(database);

      } catch (_) {

        /*
          Otherwise try as normal page.
        */

        try {
          const page =
            await client.pages.retrieve({
              page_id: id
            });

          label =
            getPageTitle(page) ||
            `Notion page ${id.slice(0, 6)}`;

        } catch (_) {}
      }


      sources.push({
        key:
          `${slugify(label)}-${id.slice(0, 6)}`,

        label,

        id
      });
    }


    return dedupeSources(sources);
  }


  /*
    Dynamic mode for database-style users.

    Sandeep can leave source IDs blank
    if all German databases are shared
    with the integration.
  */

  return discoverAccessibleDatabases(
    client
  );
}


/* =========================================================
   SYNC ALL NOTION SOURCES
   ========================================================= */

export async function syncAllNotion(
  profile,
  extraIds = []
) {
  const {
    client,
    config
  } = notionForProfile(profile);


  const sources =
    await configuredSources(
      client,
      profile,

      Array.isArray(extraIds)
        ? extraIds
        : []
    );


  if (!sources.length) {
    throw new Error(
      `No Notion databases/pages are available for ${config.name}. Share German material with that integration or set ${config.envPrefix}_NOTION_SOURCE_IDS.`
    );
  }


  const allItems = [];

  const sourceResults = [];

  const errors = [];


  for (const source of sources) {
    try {
      const result =
        await syncOneSource(
          client,
          source
        );


      allItems.push(
        ...result.items
      );


      sourceResults.push({
        key: source.key,

        label: result.label,

        id: source.id,

        count:
          result.items.length
      });

    } catch (error) {

      errors.push({
        key: source.key,

        label: source.label,

        id: source.id,

        error:
          error.message
      });
    }
  }


  const unique =
    dedupe(allItems);


  return {
    profile:
      config.id,

    profileName:
      config.name,

    totalItems:
      unique.length,

    items:
      unique,

    byType:
      groupByType(unique),

    sources:
      sourceResults,

    errors
  };
}


/* =========================================================
   SYNC ONE SOURCE
   ========================================================= */

async function syncOneSource(
  client,
  source
) {
  const id =
    normalizeId(source.id);


  /*
    First try the source as a real
    Notion database.
  */

  try {
    const database =
      await client.databases.retrieve({
        database_id: id
      });


    if (
      database?.object ===
      'database'
    ) {
      const label =
        databaseTitle(database) ||
        source.label;


      const actualSource = {
        ...source,
        label
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
        items
      };
    }

  } catch (_) {

    /*
      If it isn't a database,
      continue and treat it as a page.
    */

  }


  /*
    LEELA'S STRUCTURE:

    Normal Notion page
           ↓
      headings
           ↓
      Simple Tables

    We recursively read all blocks.
  */

  const blocks = [];


  await collectBlocks(
    client,
    id,
    blocks
  );


  const label =
    source.label ||
    `Notion page ${id.slice(0, 6)}`;


  const actualSource = {
    ...source,
    label
  };


  const items =
    extractLearningItems(blocks)
      .map(item => ({
        ...item,

        sourceGroup:
          actualSource.key,

        sourceLabel:
          actualSource.label
      }));


  /*
    Pages can also contain embedded
    child databases.
  */

  await collectDatabaseBlocks(
    client,
    blocks,
    items,
    actualSource
  );


  return {
    label:
      actualSource.label,

    items
  };
}


/* =========================================================
   DATABASE ROW READER
   ========================================================= */

async function collectDatabaseRows(
  client,
  databaseId,
  out,
  source
) {
  let cursor;


  do {
    const response =
      await client.databases.query({
        database_id:
          databaseId,

        page_size: 100,

        ...(cursor
          ? {
              start_cursor:
                cursor
            }
          : {})
      });


    for (
      const page of
      response.results || []
    ) {
      out.push(
        ...extractDatabaseRow(
          page,
          source
        )
      );
    }


    cursor =
      response.has_more
        ? response.next_cursor
        : undefined;

  } while (cursor);
}


/* =========================================================
   DATABASE ROW → QUIZ ITEMS
   ========================================================= */

function extractDatabaseRow(
  page,
  source
) {
  const props =
    page.properties || {};


  const values = {};


  let titleValue = '';


  for (
    const [name, prop]
    of Object.entries(props)
  ) {
    const value =
      getPropertyValue(prop);


    values[
      name
        .toLowerCase()
        .trim()
    ] = value;


    if (
      prop?.type === 'title' &&
      value
    ) {
      titleValue = value;
    }
  }


  const out = [];


  const sourcePageId =
    page.id;


  /* =======================================================
     VIVA
     ======================================================= */

  const question =
    firstValue(values, [
      'question',
      'frage',
      'viva question',
      'question german'
    ])
    ||
    (
      looksLikeQuestion(
        titleValue
      )
      &&
      firstValue(
        values,
        [
          'answer',
          'antwort'
        ]
      )
        ? titleValue
        : ''
    );


  const answer =
    firstValue(values, [
      'answer',
      'antwort',
      'sample answer',
      'model answer'
    ]);


  const questionEnglish =
    firstValue(values, [
      'question english',
      'english question',
      'question translation'
    ]);


  const answerEnglish =
    firstValue(values, [
      'answer english',
      'english answer',
      'answer translation'
    ]);


  const genericEnglish =
    firstValue(values, [
      'english',
      'meaning',
      'translation',
      'definition',
      'bedeutung'
    ]);


  if (
    question &&
    answer
  ) {
    out.push({
      type:
        'viva',

      prompt:
        question,

      answer,

      source:
        question,

      englishHint:
        questionEnglish ||
        genericEnglish ||
        '',

      answerEnglish:
        answerEnglish || '',

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label,

      extra: [
        questionEnglish,
        answerEnglish
      ].filter(Boolean)
    });
  }


  /* =======================================================
     GERMAN / ENGLISH
     ======================================================= */

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
      'name'
    ])
    ||
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
      'english meaning'
    ]);


  const notes =
    firstValue(values, [
      'notes',
      'note',
      'hinweis'
    ]);


  const article =
    firstValue(values, [
      'article',
      'artikel',
      'gender'
    ]);


  const plural =
    firstValue(values, [
      'plural',
      'plural form',
      'mehrzahl'
    ]);


  const opposite =
    firstValue(values, [
      'opposite',
      'opposites',
      'antonym',
      'gegenteil'
    ]);


  const oppositeEnglish =
    firstValue(values, [
      'opposite english',
      'english opposite'
    ]);


  if (
    german &&
    english
  ) {
    out.push({
      type:
        'wordMeaning',

      prompt:
        `Was bedeutet „${german}“ auf Englisch?`,

      answer:
        english,

      source:
        german,

      englishHint:
        english,

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label
    });


    out.push({
      type:
        'englishToGerman',

      prompt:
        `Was ist „${english}“ auf Deutsch?`,

      answer:
        german,

      source:
        english,

      englishHint:
        english,

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label
    });


    out.push({
      type:
        'writing',

      prompt:
        `Schreiben Sie auf Deutsch: „${english}“`,

      answer:
        german,

      source:
        english,

      englishHint:
        english,

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label
    });
  }


  /* =======================================================
     VERB
     ======================================================= */

  const hasVerbColumns =
    Boolean(values.verb)
    ||
    Boolean(values.ich)
    ||
    Boolean(values.du)
    ||
    Boolean(
      values['er/sie/es']
    )
    ||
    Boolean(
      values['er / sie / es']
    );


  if (
    german &&
    english &&
    hasVerbColumns
  ) {
    out.push({
      type:
        'verb',

      prompt:
        `Was bedeutet das Verb „${german}“?`,

      answer:
        english,

      source:
        german,

      englishHint:
        english,

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label,

      extra:
        notes
          ? [notes]
          : []
    });


    const persons = [
      [
        'ich',
        values.ich
      ],

      [
        'du',
        values.du
      ],

      [
        'er/sie/es',
        values['er/sie/es']
        ||
        values['er / sie / es']
      ]
    ];


    for (
      const [person, form]
      of persons
    ) {
      if (!form) continue;


      out.push({
        type:
          'verbConjugation',

        prompt:
          `Wie lautet „${german}“ bei „${person}“?`,

        answer:
          form,

        source:
          german,

        person,

        sourcePageId,

        sourceGroup:
          source.key,

        sourceLabel:
          source.label,

        extra:
          notes
            ? [notes]
            : []
      });
    }
  }


  /* =======================================================
     ARTICLE
     ======================================================= */

  if (
    german &&
    article
  ) {
    out.push({
      type:
        'article',

      prompt:
        `Welcher Artikel passt zu „${german}“?`,

      answer:
        normalizeArticle(article),

      source:
        german,

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label,

      extra:
        plural
          ? [plural]
          : []
    });
  }


  /* =======================================================
     PLURAL
     ======================================================= */

  if (
    german &&
    plural
  ) {
    out.push({
      type:
        'plural',

      prompt:
        `Wie ist der Plural von „${german}“?`,

      answer:
        plural,

      source:
        german,

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label
    });
  }


  /* =======================================================
     OPPOSITES
     ======================================================= */

  if (
    german &&
    opposite
  ) {
    out.push({
      type:
        'opposite',

      prompt:
        `Was ist das Gegenteil von „${german}“?`,

      answer:
        opposite,

      source:
        german,

      englishHint:
        oppositeEnglish || '',

      sourcePageId,

      sourceGroup:
        source.key,

      sourceLabel:
        source.label,

      extra:
        oppositeEnglish
          ? [oppositeEnglish]
          : []
    });
  }


  return out;
}


/* =========================================================
   ARTICLE HELPERS
   ========================================================= */

function normalizeArticle(value) {
  const article =
    String(value || '')
      .trim()
      .toLowerCase();


  const match =
    article.match(
      /\b(der|die|das)\b/i
    );


  return match
    ? match[1].toLowerCase()
    : value;
}


/* =========================================================
   DETECT GERMAN QUESTION
   ========================================================= */

function looksLikeQuestion(value) {
  const text =
    String(value || '')
      .trim();


  if (!text) {
    return false;
  }


  if (
    text.endsWith('?')
  ) {
    return true;
  }


  return /^(wer|was|wo|woher|wohin|wann|warum|wie|welch|kann|können|möchtest|möchten|hast|haben|bist|sind|arbeitest|arbeiten|wohnst|wohnen|kommst|kommen|sprichst|sprechen)\b/i
    .test(text);
}


/* =========================================================
   FIRST MATCHING PROPERTY
   ========================================================= */

function firstValue(
  values,
  names
) {
  for (
    const name of names
  ) {
    const value =
      values[name];


    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return String(value)
        .trim();
    }
  }


  return '';
}


/* =========================================================
   READ NOTION DATABASE PROPERTY
   ========================================================= */

function getPropertyValue(prop) {
  if (!prop) return '';


  switch (prop.type) {

    case 'title':
      return richTextToString(
        prop.title
      );


    case 'rich_text':
      return richTextToString(
        prop.rich_text
      );


    case 'select':
      return (
        prop.select?.name || ''
      );


    case 'status':
      return (
        prop.status?.name || ''
      );


    case 'multi_select':
      return (
        prop.multi_select || []
      )
        .map(
          item => item.name
        )
        .join(', ');


    case 'number':
      return (
        prop.number == null
          ? ''
          : String(prop.number)
      );


    case 'checkbox':
      return (
        prop.checkbox
          ? 'true'
          : 'false'
      );


    case 'url':
      return prop.url || '';


    case 'email':
      return prop.email || '';


    case 'phone_number':
      return (
        prop.phone_number || ''
      );


    case 'formula':
      return getFormulaValue(
        prop.formula
      );


    case 'date':
      return (
        prop.date?.start || ''
      );


    case 'people':
      return (
        prop.people || []
      )
        .map(
          person =>
            person.name ||
            person.person?.email ||
            ''
        )
        .filter(Boolean)
        .join(', ');


    case 'relation':
      return (
        prop.relation || []
      )
        .map(
          relation =>
            relation.id
        )
        .join(', ');


    default:
      return '';
  }
}


/* =========================================================
   FORMULA
   ========================================================= */

function getFormulaValue(
  formula
) {
  if (!formula) return '';


  if (
    formula.type === 'string'
  ) {
    return (
      formula.string || ''
    );
  }


  if (
    formula.type === 'number'
  ) {
    return (
      formula.number == null
        ? ''
        : String(
            formula.number
          )
    );
  }


  if (
    formula.type === 'boolean'
  ) {
    return (
      formula.boolean
        ? 'true'
        : 'false'
    );
  }


  if (
    formula.type === 'date'
  ) {
    return (
      formula.date?.start || ''
    );
  }


  return '';
}


/* =========================================================
   PAGE TITLE
   ========================================================= */

function getPageTitle(page) {
  const properties =
    page?.properties || {};


  for (
    const prop of
    Object.values(properties)
  ) {
    if (
      prop?.type === 'title'
    ) {
      const value =
        getPropertyValue(prop);


      if (value) {
        return value;
      }
    }
  }


  return '';
}


/* =========================================================
   CHILD DATABASE BLOCKS
   ========================================================= */

async function collectDatabaseBlocks(
  client,
  blocks,
  out,
  source
) {
  for (
    const block of blocks
  ) {
    if (
      block.type ===
        'child_database'
      &&
      block.id
    ) {
      try {
        const database =
          await client
            .databases
            .retrieve({
              database_id:
                block.id
            });


        const childSource = {
          key:
            `${slugify(
              databaseTitle(database)
            )}-${normalizeId(
              block.id
            ).slice(0, 6)}`,

          label:
            databaseTitle(database),

          id:
            block.id
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


/* =========================================================
   RECURSIVELY READ PAGE BLOCKS
   ========================================================= */

async function collectBlocks(
  client,
  blockId,
  out
) {
  let cursor;


  do {
    const response =
      await client
        .blocks
        .children
        .list({
          block_id:
            blockId,

          page_size: 100,

          ...(cursor
            ? {
                start_cursor:
                  cursor
              }
            : {})
        });


    for (
      const block of
      response.results || []
    ) {

      /*
        Keep parent ID.

        Simple Table rows need this
        so we know which table each
        row belongs to.
      */

      out.push({
        ...block,

        __parentBlockId:
          blockId
      });


      /*
        Tables and toggles can have
        children.

        Recursively enter them.
      */

      if (
        block.has_children
      ) {
        await collectBlocks(
          client,
          block.id,
          out
        );
      }
    }


    cursor =
      response.has_more
        ? response.next_cursor
        : undefined;

  } while (cursor);
}


/* =========================================================
   RICH TEXT
   ========================================================= */

function richTextToString(
  arr = []
) {
  return arr
    .map(
      item =>
        item.plain_text || ''
    )
    .join('')
    .trim();
}


/* =========================================================
   EXTRACT LEARNING ITEMS FROM NORMAL PAGE
   ========================================================= */

function extractLearningItems(
  blocks
) {
  const out = [];


  /*
    NEW IMPORTANT PART:

    Leela uses Notion Simple Tables.

    Example:

    German | English
    Hallo  | Hello

    These are NOT databases.

    Parse those first.
  */

  out.push(
    ...extractSimpleTableItems(
      blocks
    )
  );


  /*
    Keep support for older/plain-text
    convention blocks too.
  */

  for (
    const block of blocks
  ) {

    /*
      Table data was already handled.
    */

    if (
      block.type === 'table'
      ||
      block.type === 'table_row'
    ) {
      continue;
    }


    const text =
      getBlockText(block);


    if (!text) continue;


    const parsed =
      parseConvention(
        text
          .replace(
            /\s+/g,
            ' '
          )
          .trim()
      );


    if (parsed) {
      out.push({
        ...parsed,

        sourceBlockId:
          block.id
      });
    }
  }


  return out;
}


/* =========================================================
   READ SIMPLE TABLE BLOCKS
   ========================================================= */

function extractSimpleTableItems(
  blocks
) {
  const tables =
    new Map();


  /*
    Group table rows by their
    parent table block.
  */

  for (
    const block of blocks
  ) {
    if (
      block.type !== 'table_row'
    ) {
      continue;
    }


    const tableId =
      block.__parentBlockId ||
      'unknown-table';


    if (
      !tables.has(tableId)
    ) {
      tables.set(
        tableId,
        []
      );
    }


    const cells =
      (
        block.table_row?.cells ||
        []
      )
        .map(
          richTextToString
        );


    if (
      cells.some(
        cell =>
          String(
            cell || ''
          ).trim()
      )
    ) {
      tables
        .get(tableId)
        .push({
          id:
            block.id,

          cells
        });
    }
  }


  const out = [];


  for (
    const rows of
    tables.values()
  ) {

    /*
      Must have header + at least
      one data row.
    */

    if (
      rows.length < 2
    ) {
      continue;
    }


    const header =
      rows[0]
        .cells
        .map(
          normalizeTableHeader
        );


    const dataRows =
      rows.slice(1);


    out.push(
      ...parseSimpleTableRows(
        header,
        dataRows
      )
    );
  }


  return out;
}


/* =========================================================
   PARSE SIMPLE TABLE
   ========================================================= */

function parseSimpleTableRows(
  header,
  rows
) {
  const out = [];


  const germanIndex =
    findHeaderIndex(
      header,
      [
        'german',
        'deutsch',
        'wort',
        'word',
        'verb',
        'noun',
        'term'
      ]
    );


  const englishIndex =
    findHeaderIndex(
      header,
      [
        'english',
        'meaning',
        'translation',
        'definition',
        'bedeutung',
        'english meaning'
      ]
    );


  const articleIndex =
    findHeaderIndex(
      header,
      [
        'article',
        'artikel',
        'gender'
      ]
    );


  const pluralIndex =
    findHeaderIndex(
      header,
      [
        'plural',
        'plural form',
        'mehrzahl'
      ]
    );


  const oppositeIndex =
    findHeaderIndex(
      header,
      [
        'opposite',
        'opposites',
        'antonym',
        'gegenteil'
      ]
    );


  const questionIndex =
    findHeaderIndex(
      header,
      [
        'question',
        'frage',
        'viva question',
        'question german'
      ]
    );


  const answerIndex =
    findHeaderIndex(
      header,
      [
        'answer',
        'antwort',
        'sample answer',
        'model answer'
      ]
    );


  /* =======================================================
     GERMAN | ENGLISH TABLE
     ======================================================= */

  /*
    Examples from Leela:

    German | English

    German | English | Article

    German | English | Note
  */

  if (
    germanIndex >= 0 &&
    englishIndex >= 0
  ) {
    for (
      const row of rows
    ) {
      const german =
        cleanTableCell(
          row.cells[
            germanIndex
          ]
        );


      const english =
        cleanTableCell(
          row.cells[
            englishIndex
          ]
        );


      if (
        !german ||
        !english
      ) {
        continue;
      }


      /*
        Automatically create:

        German → English
        English → German
        Writing
      */

      addGermanEnglishItems(
        out,
        german,
        english,
        row.id
      );


      /*
        Article column
      */

      let article =
        articleIndex >= 0
          ? cleanArticleCell(
              row.cells[
                articleIndex
              ]
            )
          : '';


      /*
        Detect article embedded
        inside German text:

        der Geburtstag

        das Frühstück

        Stadt (die)
      */

      const embedded =
        extractEmbeddedArticle(
          german
        );


      if (
        !article &&
        embedded.article
      ) {
        article =
          embedded.article;
      }


      const articleWord =
        embedded.word ||
        german;


      if (
        article &&
        isSingleArticle(
          article
        )
      ) {
        out.push({
          type:
            'article',

          prompt:
            `Welcher Artikel passt zu „${articleWord}“?`,

          answer:
            article,

          source:
            articleWord,

          sourceBlockId:
            row.id
        });
      }


      /*
        Optional plural column
      */

      if (
        pluralIndex >= 0
      ) {
        const plural =
          cleanTableCell(
            row.cells[
              pluralIndex
            ]
          );


        if (plural) {
          out.push({
            type:
              'plural',

            prompt:
              `Wie ist der Plural von „${articleWord}“?`,

            answer:
              plural,

            source:
              articleWord,

            sourceBlockId:
              row.id
          });
        }
      }


      /*
        Optional opposite column
      */

      if (
        oppositeIndex >= 0
      ) {
        const opposite =
          cleanTableCell(
            row.cells[
              oppositeIndex
            ]
          );


        if (opposite) {
          out.push({
            type:
              'opposite',

            prompt:
              `Was ist das Gegenteil von „${german}“?`,

            answer:
              opposite,

            source:
              german,

            sourceBlockId:
              row.id
          });
        }
      }
    }


    return out;
  }


  /* =======================================================
     QUESTION | ANSWER TABLE
     ======================================================= */

  if (
    questionIndex >= 0 &&
    answerIndex >= 0
  ) {
    for (
      const row of rows
    ) {
      const question =
        cleanTableCell(
          row.cells[
            questionIndex
          ]
        );


      const answer =
        cleanTableCell(
          row.cells[
            answerIndex
          ]
        );


      if (
        !question ||
        !answer
      ) {
        continue;
      }


      out.push({
        type:
          'viva',

        prompt:
          question,

        answer,

        source:
          question,

        sourceBlockId:
          row.id
      });
    }


    return out;
  }


  /* =======================================================
     ARTICLES TO MEMORIZE TABLE
     ======================================================= */

  /*
    Leela has tables like:

    der (masculine)
    |
    die (feminine)
    |
    das (neuter)

    with words underneath.
  */

  const articleColumns =
    header.map(
      articleFromHeader
    );


  if (
    articleColumns
      .some(Boolean)
  ) {
    for (
      const row of rows
    ) {
      articleColumns
        .forEach(
          (
            article,
            index
          ) => {

            if (!article) {
              return;
            }


            const word =
              cleanTableCell(
                row.cells[
                  index
                ]
              );


            if (!word) {
              return;
            }


            out.push({
              type:
                'article',

              prompt:
                `Welcher Artikel passt zu „${word}“?`,

              answer:
                article,

              source:
                word,

              sourceBlockId:
                row.id
            });
          }
        );
    }


    return out;
  }


  /* =======================================================
     VERB CONJUGATION TABLE
     ======================================================= */

  /*
    Example:

    Pronoun | sollen

    ich     | soll
    du      | sollst
    er/sie/es | soll
    wir     | sollen
  */

  const pronounIndex =
    findHeaderIndex(
      header,
      [
        'pronoun',
        'person',
        'personal pronoun'
      ]
    );


  if (
    pronounIndex >= 0 &&
    header.length >= 2
  ) {
    const verbIndex =
      header.findIndex(
        (_, index) =>
          index !==
          pronounIndex
      );


    const verb =
      cleanTableCell(
        header[
          verbIndex
        ]
      );


    if (verb) {
      for (
        const row of rows
      ) {
        const person =
          cleanTableCell(
            row.cells[
              pronounIndex
            ]
          );


        const form =
          cleanTableCell(
            row.cells[
              verbIndex
            ]
          );


        if (
          !person ||
          !form
        ) {
          continue;
        }


        out.push({
          type:
            'verbConjugation',

          prompt:
            `Wie lautet „${verb}“ bei „${person}“?`,

          answer:
            form,

          source:
            verb,

          person,

          sourceBlockId:
            row.id
        });
      }
    }
  }


  return out;
}


/* =========================================================
   ADD GERMAN / ENGLISH PRACTICE ITEMS
   ========================================================= */

function addGermanEnglishItems(
  out,
  german,
  english,
  sourceBlockId
) {
  /*
    German → English
  */

  out.push({
    type:
      'wordMeaning',

    prompt:
      `Was bedeutet „${german}“ auf Englisch?`,

    answer:
      english,

    source:
      german,

    englishHint:
      english,

    sourceBlockId
  });


  /*
    English → German
  */

  out.push({
    type:
      'englishToGerman',

    prompt:
      `Was ist „${english}“ auf Deutsch?`,

    answer:
      german,

    source:
      english,

    englishHint:
      english,

    sourceBlockId
  });


  /*
    Typed writing practice
  */

  out.push({
    type:
      'writing',

    prompt:
      `Schreiben Sie auf Deutsch: „${english}“`,

    answer:
      german,

    source:
      english,

    englishHint:
      english,

    sourceBlockId
  });
}


/* =========================================================
   TABLE HEADER HELPERS
   ========================================================= */

function normalizeTableHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );
}


function findHeaderIndex(
  header,
  names
) {
  const wanted =
    names.map(
      normalizeTableHeader
    );


  return header.findIndex(
    value =>
      wanted.some(
        name =>
          value === name
          ||
          value.startsWith(
            `${name} `
          )
          ||
          value.startsWith(
            `${name} (`
          )
      )
  );
}


/* =========================================================
   CLEAN TABLE CELL
   ========================================================= */

function cleanTableCell(value) {
  const text =
    String(value || '')
      .trim();


  if (!text) {
    return '';
  }


  if (
    /^(—|–|-|n\/a|na)$/i
      .test(text)
  ) {
    return '';
  }


  return text;
}


/* =========================================================
   ARTICLE CELL
   ========================================================= */

function cleanArticleCell(value) {
  const text =
    cleanTableCell(value)
      .toLowerCase();


  if (!text) {
    return '';
  }


  const matches =
    text.match(
      /\b(der|die|das)\b/gi
    )
    || [];


  const unique = [
    ...new Set(
      matches.map(
        value =>
          value.toLowerCase()
      )
    )
  ];


  /*
    If the cell is something like:

    der / die

    don't make a single-answer
    article question.
  */

  return (
    unique.length === 1
      ? unique[0]
      : ''
  );
}


function isSingleArticle(value) {
  return /^(der|die|das)$/i
    .test(
      String(value || '')
        .trim()
    );
}


/* =========================================================
   ARTICLE FROM TABLE HEADER
   ========================================================= */

function articleFromHeader(value) {
  const match =
    String(value || '')
      .trim()
      .match(
        /^(der|die|das)\b/i
      );


  return match
    ? match[1]
        .toLowerCase()
    : '';
}


/* =========================================================
   ARTICLE EMBEDDED IN WORD
   ========================================================= */

function extractEmbeddedArticle(value) {
  const text =
    String(value || '')
      .trim();


  /*
    der Geburtstag
    die Prüfung
    das Frühstück
  */

  let match =
    text.match(
      /^(der|die|das)\s+(.+)$/i
    );


  if (match) {
    return {
      article:
        match[1]
          .toLowerCase(),

      word:
        match[2]
          .trim()
    };
  }


  /*
    Stadt (die)
    Bett (das)
  */

  match =
    text.match(
      /^(.+?)\s*\((der|die|das)\)\s*$/i
    );


  if (match) {
    return {
      article:
        match[2]
          .toLowerCase(),

      word:
        match[1]
          .trim()
    };
  }


  return {
    article: '',
    word: text
  };
}


/* =========================================================
   TEXT FROM NORMAL NOTION BLOCK
   ========================================================= */

function getBlockText(block) {
  const rich =
    block[
      block.type
    ]?.rich_text;


  if (rich) {
    return richTextToString(
      rich
    );
  }


  /*
    Image support from older app.
  */

  if (
    block.type === 'image'
  ) {
    return (
      block.image?.type ===
        'external'

        ? block.image
            .external
            .url

        : block.image
            ?.file
            ?.url || ''
    );
  }


  return '';
}


/* =========================================================
   PLAIN-TEXT CONVENTION PARSER
   ========================================================= */

function parseConvention(line) {
  const lower =
    line.toLowerCase();


  const sep =
    line.includes('|')
      ? '|'

      : line.includes('::')
        ? '::'

        : null;


  /* =======================================================
     TRANSLATION
     ======================================================= */

  if (
    lower.startsWith(
      'translation:'
    )
    ||
    lower.startsWith(
      'translate:'
    )
  ) {
    const parts =
      split(
        line
          .split(':')
          .slice(1)
          .join(':')
      );


    return (
      parts.length >= 2

        ? {
            type:
              'translation',

            prompt:
              parts[0],

            answer:
              parts[1]
          }

        : null
    );
  }


  /* =======================================================
     OPPOSITE
     ======================================================= */

  if (
    lower.startsWith(
      'opposite:'
    )
  ) {
    const parts =
      split(
        line.slice(9)
      );


    return (
      parts.length >= 2

        ? {
            type:
              'opposite',

            prompt:
              `Was ist das Gegenteil von „${parts[0]}“?`,

            answer:
              parts[1],

            source:
              parts[0]
          }

        : null
    );
  }


  /* =======================================================
     VERB
     ======================================================= */

  if (
    lower.startsWith(
      'verb:'
    )
  ) {
    const parts =
      split(
        line.slice(5)
      );


    return (
      parts.length >= 2

        ? {
            type:
              'verb',

            prompt:
              `Was bedeutet das Verb „${parts[0]}“?`,

            answer:
              parts[1],

            extra:
              parts.slice(2)
          }

        : null
    );
  }


  /* =======================================================
     ARTICLE
     ======================================================= */

  if (
    lower.startsWith(
      'article:'
    )
  ) {
    const parts =
      split(
        line.slice(8)
      );


    return (
      parts.length >= 2

        ? {
            type:
              'article',

            prompt:
              `Welcher Artikel passt zu „${parts[0]}“?`,

            answer:
              parts[1],

            source:
              parts[0],

            extra:
              parts.slice(2)
          }

        : null
    );
  }


  /* =======================================================
     PICTURE
     ======================================================= */

  if (
    lower.startsWith(
      'picture:'
    )
  ) {
    const parts =
      split(
        line.slice(8)
      );


    return (
      parts.length >= 2

        ? {
            type:
              'picture',

            image:
              parts[0],

            prompt:
              'Was ist das auf Deutsch?',

            answer:
              parts[1]
          }

        : null
    );
  }


  /* =======================================================
     GENERIC WORD | MEANING
     ======================================================= */

  if (sep) {
    const parts =
      split(line);


    return (
      parts.length >= 2

        ? {
            type:
              'wordMeaning',

            prompt:
              `Was bedeutet „${parts[0]}“?`,

            answer:
              parts[1],

            source:
              parts[0]
          }

        : null
    );
  }


  return null;
}


/* =========================================================
   SPLIT PLAIN TEXT
   ========================================================= */

function split(value) {
  return value
    .split(/\||::/)
    .map(
      item =>
        item.trim()
    )
    .filter(Boolean);
}


/* =========================================================
   REMOVE DUPLICATE QUESTIONS
   ========================================================= */

function dedupe(items) {
  const unique = [];

  const seen =
    new Set();


  for (
    const item of items
  ) {
    const key =
      JSON.stringify({
        type:
          item.type,

        prompt:
          item.prompt,

        answer:
          item.answer,

        source:
          item.source
      });


    if (
      !seen.has(key)
    ) {
      seen.add(key);

      unique.push(item);
    }
  }


  return unique;
}


/* =========================================================
   REMOVE DUPLICATE SOURCES
   ========================================================= */

function dedupeSources(
  sources
) {
  const byId =
    new Map();


  for (
    const source of sources
  ) {
    const id =
      normalizeId(
        source.id
      );


    if (!id) continue;


    if (
      !byId.has(id)
    ) {
      byId.set(
        id,
        {
          ...source,
          id
        }
      );
    }
  }


  return [
    ...byId.values()
  ];
}


/* =========================================================
   GROUP QUESTIONS BY TYPE
   ========================================================= */

function groupByType(items) {
  return items.reduce(
    (
      accumulator,
      item
    ) => {

      (
        accumulator[
          item.type
        ] ||= []
      )
        .push(item);


      return accumulator;

    },
    {}
  );
}