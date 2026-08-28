'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';

const PROFILE_META = {
  sandeep: {
    name: 'Sandeep',
    icon: '👨',
  },
  leela: {
    name: 'Leela:)',
    icon: '👩',
  },
};

const TYPE_LABELS = {
  wordMeaning: 'German → English',
  englishToGerman: 'English → German',
  writing: '✍️ Writing practice',
  translation: 'Translation',
  opposite: 'Opposites',
  verb: 'Verb meaning',
  verbConjugation: 'Verb conjugation',
  article: 'Articles',
  plural: 'Plural',
  viva: '🎤 Viva questions',
  picture: 'Picture → German',
};

const CONVERSATION_TOPICS = [
  'weekend',
  'breakfast',
  'favorite food',
  'drinks',
  'drawing and art',
  'music',
  'movies',
  'sports',
  'friends',
  'family',
  'siblings',
  'work day',
  'morning routine',
  'evening routine',
  'transport',
  'bus or train',
  'weather',
  'shopping',
  'clothes',
  'home',
  'bedroom',
  'city',
  'restaurants',
  'cooking',
  'holidays',
  'travel',
  'Germany',
  'languages',
  'learning German',
  'birthday',
  'pets',
  'weekend plans',
  'favorite day',
  'favorite season',
  'favorite place',
  'free time',
  'computer games',
  'phone use',
  'coffee and tea',
  'yesterday',
  'today',
  'tomorrow',
  'what the student can do',
  'what the student wants to do',
  'things the student likes',
  'things the student dislikes',
];

const VIVA_TOPICS = [
  'name',
  'spell your name',
  'age',
  'birthday',
  'nationality',
  'country of origin',
  'current city',
  'occupation',
  'workplace',
  'languages',
  'hobbies',
  'family',
  'siblings',
  'phone number',
  'daily routine',
  'food',
  'drinks',
  'free time',
  'weekend',
  'können question',
  'möchten question',
  'brauchen question',
  'haben question',
  'sein question',
  'W-Frage',
  'Ja-Nein-Frage',
  'simple personal preference',
  'simple travel question',
  'simple shopping question',
  'simple time question',
  'simple family question',
  'simple work question',
];

function emptyAiMemory() {
  return {
    conversation: {
      questions: [],
      topics: [],
    },
    viva: {
      questions: [],
      topics: [],
    },
  };
}

function chooseRandomAITopic(
  mode,
  previousTopics = []
) {
  const source =
    mode === 'viva'
      ? VIVA_TOPICS
      : CONVERSATION_TOPICS;

  const recent = new Set(
    previousTopics.slice(-8)
  );

  let available = source.filter(
    (topic) => !recent.has(topic)
  );

  if (!available.length) {
    available = [...source];
  }

  return available[
    Math.floor(
      Math.random() * available.length
    )
  ];
}

export default function Home() {
  /* ----------------------------
     PROFILE
  ---------------------------- */

  const [profile, setProfile] =
    useState(null);

  const [profileLoaded, setProfileLoaded] =
    useState(false);

  /* ----------------------------
     NOTION QUIZ
  ---------------------------- */

  const [customIds, setCustomIds] =
    useState('');

  const [data, setData] =
    useState(null);

  const [
    selectedTypes,
    setSelectedTypes,
  ] = useState(
    Object.keys(TYPE_LABELS)
  );

  const [count, setCount] =
    useState(10);

  const [vivaMode, setVivaMode] =
    useState('mixed');

  const [quiz, setQuiz] =
    useState(null);

  const [answers, setAnswers] =
    useState({});

  const [submitted, setSubmitted] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState('');

  /* ----------------------------
     AI TUTOR
  ---------------------------- */

  const [aiInput, setAiInput] =
    useState('');

  const [aiMessages, setAiMessages] =
    useState([]);

  const [aiLoading, setAiLoading] =
    useState(false);

  const [aiMode, setAiMode] =
    useState('conversation');

  const [aiMemory, setAiMemory] =
    useState(emptyAiMemory());

  const [
    aiMemoryLoaded,
    setAiMemoryLoaded,
  ] = useState(false);

  /* ----------------------------
     LOAD LAST PROFILE
  ---------------------------- */

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          'german-active-profile-v1'
        );

      if (
        saved &&
        PROFILE_META[saved]
      ) {
        setProfile(saved);
      }
    } catch (error) {
      console.error(
        'Could not load active profile:',
        error
      );
    }

    setProfileLoaded(true);
  }, []);

  /* ----------------------------
     LOAD AI MEMORY FOR PROFILE
  ---------------------------- */

  useEffect(() => {
    if (!profile) {
      setAiMemory(emptyAiMemory());
      setAiMemoryLoaded(false);
      return;
    }

    setAiMemoryLoaded(false);

    try {
      const saved =
        localStorage.getItem(
          `german-ai-memory-v2-${profile}`
        );

      if (saved) {
        const parsed =
          JSON.parse(saved);

        setAiMemory({
          conversation: {
            questions:
              parsed?.conversation
                ?.questions || [],
            topics:
              parsed?.conversation
                ?.topics || [],
          },

          viva: {
            questions:
              parsed?.viva
                ?.questions || [],
            topics:
              parsed?.viva
                ?.topics || [],
          },
        });
      } else {
        setAiMemory(
          emptyAiMemory()
        );
      }
    } catch (error) {
      console.error(
        'Could not load AI memory:',
        error
      );

      setAiMemory(
        emptyAiMemory()
      );
    }

    setAiMemoryLoaded(true);
  }, [profile]);

  /* ----------------------------
     SAVE AI MEMORY FOR PROFILE
  ---------------------------- */

  useEffect(() => {
    if (
      !profile ||
      !aiMemoryLoaded
    ) {
      return;
    }

    try {
      localStorage.setItem(
        `german-ai-memory-v2-${profile}`,
        JSON.stringify(aiMemory)
      );
    } catch (error) {
      console.error(
        'Could not save AI memory:',
        error
      );
    }
  }, [
    profile,
    aiMemory,
    aiMemoryLoaded,
  ]);

  const availableTypes = useMemo(
    () => {
      if (!data) return [];

      return Object.entries(
        TYPE_LABELS
      ).filter(
        ([key]) =>
          (
            data.byType?.[key] || []
          ).length > 0
      );
    },
    [data]
  );

  function resetPracticeState() {
    setCustomIds('');
    setData(null);
    setQuiz(null);
    setAnswers({});
    setSubmitted(false);
    setLoading(false);
    setMessage('');
    setAiInput('');
    setAiMessages([]);
    setAiLoading(false);
    setAiMode('conversation');
  }

  function selectProfile(
    nextProfile
  ) {
    if (!PROFILE_META[nextProfile]) {
      return;
    }

    resetPracticeState();
    setProfile(nextProfile);

    try {
      localStorage.setItem(
        'german-active-profile-v1',
        nextProfile
      );
    } catch (_) {}
  }

  function switchUser() {
    resetPracticeState();

    try {
      localStorage.removeItem(
        'german-active-profile-v1'
      );
    } catch (_) {}

    setProfile(null);
  }

  async function syncNotion() {
    if (!profile) return;

    setLoading(true);
    setMessage('');
    setQuiz(null);
    setSubmitted(false);

    try {
      const rootIds =
        customIds
          .split(/[\n,]+/)
          .map(
            (value) =>
              value.trim()
          )
          .filter(Boolean);

      const response =
        await fetch(
          '/api/notion/sync',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              profile,
              rootIds,
            }),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            'Notion sync failed'
        );
      }

      setData(json);

      const typesWithData =
        Object.keys(TYPE_LABELS)
          .filter(
            (type) =>
              (
                json.byType?.[type] ||
                []
              ).length > 0
          );

      setSelectedTypes(
        typesWithData
      );

      setMessage(
        `Synced ${json.totalItems} practice items from ${json.sources?.length || 0} Notion sources for ${json.profileName || PROFILE_META[profile].name}.`
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleType(type) {
    setSelectedTypes(
      (previous) =>
        previous.includes(type)
          ? previous.filter(
              (item) =>
                item !== type
            )
          : [
              ...previous,
              type,
            ]
    );
  }

  async function startQuiz() {
    if (!data) {
      return setMessage(
        'Sync Notion first.'
      );
    }

    if (!selectedTypes.length) {
      return setMessage(
        'Select at least one question type.'
      );
    }

    setLoading(true);
    setSubmitted(false);
    setAnswers({});
    setMessage('');

    try {
      const response =
        await fetch(
          '/api/quiz',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              data,
              count,
              types:
                selectedTypes,
              vivaMode,
            }),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            'Quiz generation failed'
        );
      }

      setQuiz(json.questions);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendToTutor(
    customMessage = null
  ) {
    if (!profile) return;

    const text =
      customMessage ||
      aiInput.trim();

    if (
      !text ||
      aiLoading
    ) {
      return;
    }

    const previousMessages =
      [...aiMessages];

    const currentMemory =
      aiMemory[aiMode] || {
        questions: [],
        topics: [],
      };

    const nextTopic =
      chooseRandomAITopic(
        aiMode,
        currentMemory.topics
      );

    const userMessage = {
      role: 'user',
      text,
    };

    setAiMessages(
      (previous) => [
        ...previous,
        userMessage,
      ]
    );

    setAiInput('');
    setAiLoading(true);

    try {
      const response =
        await fetch(
          '/api/gemini',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              profile,
              message: text,
              mode: aiMode,
              nextTopic,
              history:
                previousMessages
                  .slice(-12),
              avoidQuestions:
                currentMemory
                  .questions
                  .slice(-60),
            }),
          }
        );

      const json =
        await response.json();

      if (!response.ok) {
        const errorText =
          json.details ||
          json.error ||
          'Tutor request failed';

        if (
          String(errorText)
            .includes(
              '"code":429'
            ) ||
          String(errorText)
            .toLowerCase()
            .includes('quota')
        ) {
          throw new Error(
            `${PROFILE_META[profile].name}'s Gemini quota is reached for now. The saved question history will still be here later.`
          );
        }

        throw new Error(
          errorText
        );
      }

      let tutorText = '';

      if (json.structured) {
        const hasEvaluation =
          Boolean(
            json.corrected ||
              json.english ||
              json.explanation
          );

        if (
          hasEvaluation &&
          json.correct === true
        ) {
          tutorText +=
            '✅ Sehr gut!\n\n';
        }

        if (
          hasEvaluation &&
          json.correct === false
        ) {
          tutorText +=
            '❌ Almost!\n\n';
        }

        if (json.corrected) {
          tutorText +=
            `🇩🇪 ${json.corrected}\n\n`;
        }

        if (json.english) {
          tutorText +=
            `🇬🇧 ${json.english}\n\n`;
        }

        if (
          json.explanation
        ) {
          tutorText +=
            `💡 ${json.explanation}\n\n`;
        }

        if (
          json.nextQuestion
        ) {
          tutorText +=
            `❓ ${json.nextQuestion}`;
        }

        if (
          json.nextQuestion
        ) {
          setAiMemory(
            (previous) => {
              const oldMode =
                previous[aiMode] ||
                {
                  questions: [],
                  topics: [],
                };

              return {
                ...previous,

                [aiMode]: {
                  questions: [
                    ...oldMode.questions,
                    json.nextQuestion,
                  ].slice(-150),

                  topics: [
                    ...oldMode.topics,
                    nextTopic,
                  ].slice(-80),
                },
              };
            }
          );
        }
      } else {
        tutorText =
          json.answer ||
          'The tutor did not return an answer.';
      }

      setAiMessages(
        (previous) => [
          ...previous,
          {
            role:
              'assistant',
            text: tutorText,
          },
        ]
      );
    } catch (error) {
      setAiMessages(
        (previous) => [
          ...previous,
          {
            role:
              'assistant',
            text:
              `⚠️ ${error.message}`,
          },
        ]
      );
    } finally {
      setAiLoading(false);
    }
  }

  function score() {
    if (!quiz) return 0;

    return quiz.reduce(
      (total, question) =>
        total +
        (
          isCorrect(question)
            ? 1
            : 0
        ),
      0
    );
  }

  function isCorrect(question) {
    if (question.viva) {
      return (
        answers[
          question.id
        ] === 'correct'
      );
    }

    return (
      normalize(
        answers[
          question.id
        ]
      ) ===
      normalize(
        question.answer
      )
    );
  }

  const result =
    submitted
      ? score()
      : 0;

  const wrong =
    submitted && quiz
      ? quiz.filter(
          (question) =>
            !isCorrect(question)
        )
      : [];

  if (!profileLoaded) {
    return (
      <main className="page">
        <section className="card profileLoading">
          Loading…
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <ProfilePicker
        onSelect={selectProfile}
      />
    );
  }

  const activeProfile =
    PROFILE_META[profile];

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">
            GERMAN • A1 PRACTICE
          </p>

          <h1>
            Notion → Random German Practice
          </h1>

          <p className="sub">
            Each profile uses its own Notion integration,
            accessible databases, Gemini API key and saved
            AI question history.
          </p>
        </div>

        <div className="heroActions">
          <div className="profilePill">
            <span>
              {activeProfile.icon}
            </span>

            <div>
              <small>
                Practicing as
              </small>

              <strong>
                {activeProfile.name}
              </strong>
            </div>
          </div>

          <button
            className="secondary"
            onClick={switchUser}
          >
            Switch user
          </button>

          <div className="badge">
            {data
              ? `${data.totalItems} items`
              : 'Not connected'}
          </div>
        </div>
      </section>

      <section className="card setup">
        <h2>
          1. Sync {activeProfile.name}&apos;s Notion
        </h2>

        <p className="hint">
          If this profile&apos;s source list is blank in
          <code> .env.local </code>, the app automatically
          discovers every Notion database shared with that
          profile&apos;s integration. The two profiles can
          therefore have completely different numbers and
          types of databases.
        </p>

        <div className="row">
          <textarea
            value={customIds}
            onChange={
              (event) =>
                setCustomIds(
                  event.target.value
                )
            }
            placeholder="Optional extra Notion IDs or URLs — one per line"
            rows={2}
          />

          <button
            onClick={syncNotion}
            disabled={loading}
          >
            {loading
              ? 'Syncing…'
              : `Sync ${activeProfile.name}'s Notion`}
          </button>
        </div>

        {message && (
          <p className="message">
            {message}
          </p>
        )}

        {data?.sources?.length >
          0 && (
          <div className="sourceGrid">
            {data.sources.map(
              (source) => (
                <div
                  className="source"
                  key={source.id}
                >
                  <strong>
                    {source.label}
                  </strong>

                  <span>
                    {source.count}{' '}
                    items
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {data?.errors?.length >
          0 && (
          <div className="errorBox">
            Some sources could
            not be read:{' '}
            {data.errors
              .map(
                (error) =>
                  error.label
              )
              .join(', ')}
            . Check that this
            profile&apos;s Notion
            integration has access.
          </div>
        )}
      </section>

      {data && (
        <section className="card setup">
          <h2>
            2. Choose your practice
          </h2>

          <p className="hint">
            Only question types actually found in
            {` ${activeProfile.name}'s `}
            synced Notion data are shown.
          </p>

          <div className="typeGrid">
            {availableTypes.map(
              ([key, label]) => (
                <label
                  key={key}
                  className="check"
                >
                  <input
                    type="checkbox"
                    checked={
                      selectedTypes.includes(
                        key
                      )
                    }
                    onChange={() =>
                      toggleType(key)
                    }
                  />

                  <span>
                    {label}

                    <small>
                      {
                        data.byType[
                          key
                        ].length
                      }{' '}
                      questions
                    </small>
                  </span>
                </label>
              )
            )}
          </div>

          <div className="row controls">
            <label>
              Questions

              <select
                value={count}
                onChange={
                  (event) =>
                    setCount(
                      Number(
                        event.target.value
                      )
                    )
                }
              >
                <option>
                  5
                </option>
                <option>
                  10
                </option>
                <option>
                  15
                </option>
                <option>
                  20
                </option>
                <option>
                  25
                </option>
              </select>
            </label>

            {(
              data.byType?.viva ||
              []
            ).length > 0 && (
              <label>
                Viva mix

                <select
                  value={vivaMode}
                  onChange={
                    (event) =>
                      setVivaMode(
                        event.target.value
                      )
                  }
                >
                  <option value="mixed">
                    Mixed — about
                    30% viva
                  </option>

                  <option value="viva-heavy">
                    Viva-heavy —
                    about 50%
                  </option>

                  <option value="viva-only">
                    Viva only
                  </option>
                </select>
              </label>
            )}

            <button
              onClick={startQuiz}
              disabled={
                loading ||
                !selectedTypes.length
              }
            >
              {loading
                ? 'Generating…'
                : 'Start random practice'}
            </button>
          </div>
        </section>
      )}

      {quiz && (
        <section className="card quiz">
          <div className="quizHead">
            <h2>
              3. Practice
            </h2>

            <span>
              {quiz.length}{' '}
              questions
            </span>
          </div>

          {quiz.map(
            (
              question,
              index
            ) => (
              <Question
                key={question.id}
                q={question}
                index={index}
                value={
                  answers[
                    question.id
                  ]
                }
                setValue={
                  (value) =>
                    setAnswers(
                      (
                        previous
                      ) => ({
                        ...previous,
                        [question.id]:
                          value,
                      })
                    )
                }
                submitted={
                  submitted
                }
              />
            )
          )}

          <div className="submitRow">
            {!submitted ? (
              <button
                onClick={() =>
                  setSubmitted(
                    true
                  )
                }
              >
                Finish practice
              </button>
            ) : (
              <button
                onClick={
                  startQuiz
                }
              >
                New random practice
              </button>
            )}
          </div>

          {submitted && (
            <div className="result">
              <div>
                <span className="score">
                  {result}/
                  {quiz.length}
                </span>

                <span className="percent">
                  {Math.round(
                    (
                      result /
                      quiz.length
                    ) * 100
                  )}
                  %
                </span>
              </div>

              <p>
                {result ===
                quiz.length
                  ? 'Sehr gut! 🇩🇪'
                  : result >=
                      quiz.length *
                        0.7
                    ? 'Sehr gut! Keep practicing.'
                    : 'Good start. Review your mistakes below.'}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="card aiTutor">
        <div className="quizHead">
          <div>
            <h2>
              🤖 AI German Tutor
            </h2>

            <p className="hint">
              {activeProfile.name}
              &apos;s tutor uses
              {` ${activeProfile.name}'s `}
              own Gemini API key.
            </p>
          </div>

          <span>
            AI
          </span>
        </div>

        <div className="aiModes">
          <button
            className={
              aiMode ===
              'conversation'
                ? 'mode active'
                : 'mode'
            }
            onClick={() => {
              setAiMode(
                'conversation'
              );
              setAiMessages([]);
              setAiInput('');
            }}
          >
            💬 Conversation
          </button>

          <button
            className={
              aiMode ===
              'viva'
                ? 'mode active'
                : 'mode'
            }
            onClick={() => {
              setAiMode(
                'viva'
              );
              setAiMessages([]);
              setAiInput('');
            }}
          >
            🎤 Viva
          </button>

          {aiMessages.length >
            0 && (
            <button
              className="mode"
              onClick={() => {
                setAiMessages(
                  []
                );
                setAiInput('');
              }}
            >
              ↻ New session
            </button>
          )}
        </div>

        {aiMessages.length ===
          0 && (
          <div className="aiWelcome">
            <div className="aiRobot">
              🇩🇪
            </div>

            <h3>
              Hallo{' '}
              {
                activeProfile.name
              }
              !
            </h3>

            <p>
              {aiMode ===
              'viva'
                ? 'Practice unpredictable A1 viva questions.'
                : 'Have a random A1 German conversation.'}
            </p>

            <button
              onClick={() =>
                sendToTutor(
                  aiMode ===
                  'viva'
                    ? 'Start a random German A1 viva.'
                    : 'Start a random German A1 conversation.'
                )
              }
              disabled={
                aiLoading
              }
            >
              {aiMode ===
              'viva'
                ? 'Start random viva'
                : 'Start random conversation'}
            </button>
          </div>
        )}

        <div className="aiChat">
          {aiMessages.map(
            (
              chatMessage,
              index
            ) => (
              <div
                key={index}
                className={
                  chatMessage.role ===
                  'user'
                    ? 'chatMessage userMessage'
                    : 'chatMessage tutorMessage'
                }
              >
                <div className="chatName">
                  {chatMessage.role ===
                  'user'
                    ? activeProfile.name
                    : '🇩🇪 Tutor'}
                </div>

                <div className="chatText">
                  {
                    chatMessage.text
                  }
                </div>
              </div>
            )
          )}

          {aiLoading && (
            <div className="chatMessage tutorMessage">
              <div className="chatName">
                🇩🇪 Tutor
              </div>

              <div className="chatText thinking">
                Thinking...
              </div>
            </div>
          )}
        </div>

        {aiMessages.length >
          0 && (
          <div className="aiInput">
            <textarea
              value={aiInput}
              onChange={
                (event) =>
                  setAiInput(
                    event.target.value
                  )
              }
              onKeyDown={
                (event) => {
                  if (
                    event.key ===
                      'Enter' &&
                    !event.shiftKey
                  ) {
                    event.preventDefault();
                    sendToTutor();
                  }
                }
              }
              placeholder="Write your answer in German..."
              rows={2}
              disabled={
                aiLoading
              }
            />

            <button
              onClick={() =>
                sendToTutor()
              }
              disabled={
                aiLoading ||
                !aiInput.trim()
              }
            >
              {aiLoading
                ? 'Thinking...'
                : 'Send'}
            </button>
          </div>
        )}
      </section>

      {submitted &&
        wrong.length > 0 && (
          <section className="card wrong">
            <h2>
              Incorrect / needs practice
            </h2>

            {wrong.map(
              (
                question,
                index
              ) => (
                <div
                  className="wrongItem"
                  key={
                    question.id
                  }
                >
                  <strong>
                    {index + 1}.{' '}
                    {
                      question.prompt
                    }
                  </strong>

                  {question.viva ? (
                    <>
                      <div>
                        Your
                        self-check:{' '}
                        <span className="bad">
                          Needs
                          practice /
                          not marked
                          correct
                        </span>
                      </div>

                      <div>
                        Expected
                        answer:{' '}
                        <span className="good">
                          {
                            question.answer
                          }
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        Your
                        answer:{' '}
                        <span className="bad">
                          {answers[
                            question
                              .id
                          ] ||
                            'No answer'}
                        </span>
                      </div>

                      <div>
                        Correct
                        answer:{' '}
                        <span className="good">
                          {
                            question.answer
                          }
                        </span>
                      </div>
                    </>
                  )}

                  {question.englishHint && (
                    <div className="reviewEnglish">
                      English / meaning:{' '}
                      <strong>
                        {
                          question.englishHint
                        }
                      </strong>
                    </div>
                  )}

                  {question.answerEnglish && (
                    <div className="reviewEnglish">
                      Answer meaning:{' '}
                      <strong>
                        {
                          question.answerEnglish
                        }
                      </strong>
                    </div>
                  )}
                </div>
              )
            )}
          </section>
        )}
    </main>
  );
}

function ProfilePicker({
  onSelect,
}) {
  return (
    <main className="page profilePage">
      <section className="profileHero">
        <p className="eyebrow">
          GERMAN • A1 PRACTICE
        </p>

        <h1>
          Who is practicing?
        </h1>

        <p>
          Pick a profile. Each person gets
          their own Notion access, available
          practice topics, Gemini API key and
          saved AI question history.
        </p>
      </section>

      <section className="profileGrid">
        {Object.entries(
          PROFILE_META
        ).map(
          ([
            id,
            profile,
          ]) => (
            <button
              key={id}
              className="profileCard"
              onClick={() =>
                onSelect(id)
              }
            >
              <span className="profileAvatar">
                {profile.icon}
              </span>

              <strong>
                {profile.name}
              </strong>

              <small>
                Open{' '}
                {profile.name}
                &apos;s practice
              </small>
            </button>
          )
        )}
      </section>
    </main>
  );
}

function Question({
  q,
  index,
  value,
  setValue,
  submitted,
}) {
  const correct =
    q.viva
      ? value === 'correct'
      : normalize(value) ===
        normalize(q.answer);

  return (
    <div className="question">
      <div className="qmeta">
        {index + 1}.{' '}
        {
          TYPE_LABELS[
            q.type
          ]
        }
        {q.sourceLabel
          ? ` • ${q.sourceLabel}`
          : ''}
      </div>

      <h3>
        {q.prompt}
      </h3>

      {q.englishHint &&
        q.type === 'viva' && (
          <p className="hint">
            Meaning / context:{' '}
            {q.englishHint}
          </p>
        )}

      {q.viva ? (
        <VivaControls
          value={value}
          setValue={setValue}
          submitted={
            submitted
          }
          answer={q.answer}
          englishHint={
            q.englishHint
          }
          answerEnglish={
            q.answerEnglish
          }
        />
      ) : q.image ? (
        <img
          className="quizImage"
          src={q.image}
          alt="German learning prompt"
        />
      ) : q.options?.length ? (
        <div className="options">
          {q.options.map(
            (option) => (
              <label
                key={
                  option
                }
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={
                    value ===
                    option
                  }
                  onChange={() =>
                    setValue(
                      option
                    )
                  }
                  disabled={
                    submitted
                  }
                />

                <span>
                  {option}
                </span>
              </label>
            )
          )}
        </div>
      ) : (
        <input
          className="answer"
          value={value || ''}
          onChange={
            (event) =>
              setValue(
                event.target
                  .value
              )
          }
          disabled={
            submitted
          }
          placeholder="Type your answer…"
        />
      )}

      {submitted &&
        !q.viva && (
          <div
            className={
              correct
                ? 'feedback good'
                : 'feedback bad'
            }
          >
            {correct
              ? 'Correct ✓'
              : `Correct: ${q.answer}`}
          </div>
        )}
    </div>
  );
}

function VivaControls({
  value,
  setValue,
  submitted,
  answer,
  englishHint,
  answerEnglish,
}) {
  const [show, setShow] =
    useState(false);

  return (
    <div className="vivaBox">
      <p>
        Answer aloud first,
        like in your real viva.
      </p>

      <button
        className="secondary"
        onClick={() =>
          setShow(
            (previous) =>
              !previous
          )
        }
      >
        {show
          ? 'Hide answer'
          : 'Reveal answer + English'}
      </button>

      {show && (
        <div className="vivaAnswer">
          <div>
            {answer}
          </div>

          {englishHint && (
            <small>
              Question meaning:{' '}
              {englishHint}
            </small>
          )}

          {answerEnglish && (
            <small>
              Answer meaning:{' '}
              {answerEnglish}
            </small>
          )}
        </div>
      )}

      <div className="vivaButtons">
        <button
          className={
            value ===
            'correct'
              ? 'self correct'
              : 'self'
          }
          onClick={() =>
            setValue(
              'correct'
            )
          }
          disabled={
            submitted
          }
        >
          ✓ I answered
          correctly
        </button>

        <button
          className={
            value ===
            'wrong'
              ? 'self selectedWrong'
              : 'self'
          }
          onClick={() =>
            setValue(
              'wrong'
            )
          }
          disabled={
            submitted
          }
        >
          ↻ I need practice
        </button>
      </div>
    </div>
  );
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?]$/, '')
    .replace(/\s+/g, ' ');
}
