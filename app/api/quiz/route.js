import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const {
      data,
      count = 10,
      types = [],
      vivaMode = 'mixed',
    } = await req.json();

    if (!data?.items?.length) {
      return NextResponse.json(
        { error: 'No synced items found.' },
        { status: 400 }
      );
    }

    const requested = new Set(types);

    const normal = data.items.filter(
      (item) =>
        item?.type &&
        item.type !== 'viva' &&
        requested.has(item.type)
    );

    const viva = data.items.filter(
      (item) => item?.type === 'viva'
    );

    let pool = [...normal];

    if (requested.has('viva')) {
      if (vivaMode === 'viva-only') {
        pool = shuffle(viva);
      } else if (vivaMode === 'viva-heavy') {
        const target = Math.max(
          1,
          Math.ceil(count * 0.5)
        );

        pool = [
          ...shuffle(viva).slice(0, target),
          ...shuffle(pool),
        ];
      } else {
        const target = Math.max(
          1,
          Math.ceil(count * 0.3)
        );

        pool = [
          ...shuffle(pool),
          ...shuffle(viva).slice(0, target),
        ];
      }
    }

    if (!pool.length) {
      return NextResponse.json(
        {
          error:
            'No items match the selected question types.',
        },
        { status: 400 }
      );
    }

    const selected = diversifyAndShuffle(
      pool,
      count
    );

    const questions = selected.map(
      (item, index) =>
        buildQuestion(
          item,
          pool,
          index
        )
    );

    return NextResponse.json({
      questions,
    });
  } catch (error) {
    console.error(
      'Quiz generation error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error.message ||
          'Quiz generation failed.',
      },
      { status: 500 }
    );
  }
}

function buildQuestion(
  item,
  pool,
  index
) {
  const question = {
    ...item,
    id: `q-${Date.now()}-${index}`,
  };

  if (
    item.type === 'wordMeaning' ||
    item.type === 'verb' ||
    item.type === 'englishToGerman'
  ) {
    question.options = optionsFor(
      item,
      pool,
      (candidate) => candidate.answer
    );
  }

  if (item.type === 'writing') {
    delete question.options;
  }

  if (item.type === 'article') {
    question.options = [
      'der',
      'die',
      'das',
    ];
  }

  if (item.type === 'translation') {
    question.prompt =
      `Übersetzen Sie ins Deutsche: „${item.prompt}“`;
    delete question.options;
  }

  if (
    item.type === 'plural' ||
    item.type === 'opposite' ||
    item.type === 'verbConjugation'
  ) {
    question.options = optionsFor(
      item,
      pool,
      (candidate) => candidate.answer
    );
  }

  if (item.type === 'viva') {
    question.viva = true;
  }

  return question;
}

function optionsFor(
  item,
  pool,
  getAnswer
) {
  const sameType = pool.filter(
    (candidate) =>
      candidate !== item &&
      candidate.type === item.type
  );

  const fallback = pool.filter(
    (candidate) =>
      candidate !== item &&
      typeof getAnswer(candidate) === 'string'
  );

  const candidates = shuffle([
    ...sameType,
    ...fallback,
  ]);

  const answers = [
    getAnswer(item),
    ...candidates.map(getAnswer),
  ].filter(Boolean);

  return shuffle(
    [...new Set(answers)].slice(0, 4)
  );
}

function diversifyAndShuffle(
  pool,
  count
) {
  const shuffled = shuffle(pool);
  const selected = [];
  const seen = new Set();

  for (const item of shuffled) {
    const key =
      `${item.type}|${item.prompt}|${item.answer}`;

    if (seen.has(key)) continue;

    seen.add(key);
    selected.push(item);

    if (selected.length >= count) {
      break;
    }
  }

  return selected;
}

function shuffle(array) {
  return [...array].sort(
    () => Math.random() - 0.5
  );
}
