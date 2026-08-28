import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import {
  getProfileConfig,
  normalizeProfile,
} from '../../../lib/profiles';

export async function POST(request) {
  try {
    const body = await request.json();

    const profile = normalizeProfile(
      body.profile
    );

    if (!profile) {
      return NextResponse.json(
        { error: 'Choose Sandeep or Leela first.' },
        { status: 400 }
      );
    }

    const profileConfig =
      getProfileConfig(profile);

    if (!profileConfig.geminiApiKey) {
      return NextResponse.json(
        {
          error:
            `${profileConfig.name}'s Gemini API key is missing. Add ${profileConfig.envPrefix}_GEMINI_API_KEY to .env.local.`,
        },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey: profileConfig.geminiApiKey,
    });

    const message =
      body.message || body.prompt;

    const mode =
      body.mode === 'viva'
        ? 'viva'
        : 'conversation';

    const history =
      Array.isArray(body.history)
        ? body.history.slice(-12)
        : [];

    const nextTopic =
      String(
        body.nextTopic ||
        'everyday life'
      );

    const avoidQuestions =
      Array.isArray(body.avoidQuestions)
        ? body.avoidQuestions.slice(-60)
        : [];

    if (
      !message ||
      !String(message).trim()
    ) {
      return NextResponse.json(
        { error: 'No message provided' },
        { status: 400 }
      );
    }

    const systemInstruction = `
You are an accurate German A1 speaking tutor.

There are only two modes:
1. conversation
2. viva

Current mode:
${mode}

The application has RANDOMLY selected the topic for the NEXT question:
${nextTopic}

You MUST use that topic for the next question.
Do NOT choose the next topic yourself.

--------------------------------------------------

GENERAL RULES

The learner is approximately A1.
Use simple German.
Ask exactly ONE question at a time.
Correct meaningful German mistakes.
Give a short English explanation when correcting.
Give the English translation when useful.
Keep responses concise.
Do not turn the interaction into a grammar lecture.
German nouns and proper names are capitalized.
The pronoun "ich" is not always capitalized.
It is capitalized at the beginning of a sentence like any normal word.

--------------------------------------------------

RANDOMNESS AND REPETITION

The conversation must NOT follow a fixed sequence.

Do NOT automatically follow:
name → origin → residence → language → job → hobbies → food.

The app supplies a random topic for every next question.
Follow the supplied random topic even if it is unrelated to the previous one.
That is intentional.

Do not choose an introduction question merely because this is the
beginning of a new conversation.

The first question must also follow the randomly supplied topic.

Examples of acceptable transitions:
work → weather
food → weekend
hobbies → travel
languages → breakfast
family → shopping

The conversation should feel unpredictable.

--------------------------------------------------

VERY IMPORTANT: DO NOT REPEAT QUESTIONS

Here are questions that have already been asked previously:

${avoidQuestions.join('\n')}

Do not ask any of those questions again.
Also avoid asking an obviously equivalent version of one of them.

Example:
"Wo wohnst du?"
and
"In welcher Stadt wohnst du?"
should normally be treated as the same question.

Only repeat something if the learner specifically asks you to repeat it.

--------------------------------------------------

CONVERSATION MODE

Use informal "du".
Have a natural A1 conversation.

The next question MUST relate to:
${nextTopic}

--------------------------------------------------

VIVA MODE

Act like an A1 German examiner.
Normally use formal "Sie" when appropriate.
Questions should resemble short oral-exam questions.
Do not follow a predictable introduction checklist.
Jump between examiner topics.

The next viva question MUST relate to:
${nextTopic}

--------------------------------------------------

START COMMAND

If the user's message is only asking to start the conversation or viva,
do NOT evaluate it as a German answer.

For a start command:
"correct" should be true.
"corrected" should be empty.
"english" should be empty.
"explanation" should be empty.

Only generate one new German question in "nextQuestion"
using the randomly supplied topic.

--------------------------------------------------

OUTPUT

Return ONLY valid JSON.
Do not use markdown code fences.

Use:

{
  "correct": true,
  "corrected": "",
  "english": "",
  "explanation": "",
  "nextQuestion": ""
}

"correct":
whether the student's German answer is acceptable.

"corrected":
a correct/natural German version of what the student said.

"english":
English meaning of the corrected sentence.

"explanation":
a very short explanation.

"nextQuestion":
ONE new German A1 question related to the supplied random topic.

The next question must NOT duplicate anything in the avoid list.
`;

    const conversationContents = [
      ...history.map((msg) => ({
        role:
          msg.role === 'assistant'
            ? 'model'
            : 'user',
        parts: [
          {
            text: String(msg.text || ''),
          },
        ],
      })),

      {
        role: 'user',
        parts: [
          {
            text: String(message),
          },
        ],
      },
    ];

    const response =
      await ai.models.generateContent({
        model:
          process.env.GEMINI_MODEL ||
          'gemini-3.6-flash',

        contents: conversationContents,

        config: {
          systemInstruction,
          maxOutputTokens: 1200,
        },
      });

    const text =
      response.text?.trim();

    if (!text) {
      throw new Error(
        'Gemini returned an empty response.'
      );
    }

    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch {
      console.error(
        'Gemini returned invalid JSON:',
        text
      );

      return NextResponse.json({
        answer: text,
        structured: false,
      });
    }

    return NextResponse.json({
      ...result,
      structured: true,
    });
  } catch (error) {
    console.error(
      'Gemini API error:',
      error
    );

    return NextResponse.json(
      {
        error: 'Gemini request failed',
        details:
          error.message ||
          String(error),
      },
      { status: 500 }
    );
  }
}
