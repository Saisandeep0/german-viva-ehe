# German Viva Quiz — multi-Notion edition

This version syncs all five of your German Notion databases in one click:

1. **Verbs** — `86817998fa2a4f93994578332f43a28a`
2. **Questions & Answers** — `49b840d0124341ecb60eaa9771162c43`
3. **Nouns & Articles** — `a1034b47f85c4acc8f034bc9ea4e6620`
4. **Opposites** — `04f5f69f149f49438f7d22c66e62d496`
5. **Other Key Vocabulary** — `cb2aea35c68547c2bea364b2571fafe3`

The IDs are built into `lib/notion.js`, so you do **not** need to paste them every time.

## Setup

1. Create a Notion internal integration.
2. Share **each of the five databases** with that integration.
3. Copy `.env.example` to `.env.local`.
4. Put your token in `.env.local`:

```env
NOTION_TOKEN=secret_...
```

5. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Sync All Notion**.

## What is generated

### Verbs
- German → English
- English → German
- Verb meaning
- `ich`, `du`, `er/sie/es` conjugation questions
- Notes such as irregular/separable/reflexive information are retained

### Questions & Answers
These become **🎤 Viva questions**. The app asks the exact German question from Notion, lets you answer aloud, then reveal the stored answer and self-mark it as correct or needing practice.

### Nouns & Articles
- der/die/das
- English → German
- German → English
- plural questions

### Opposites
- German word → opposite

### Other Key Vocabulary
- German → English
- English → German

## Extra sources

You can paste additional Notion IDs/URLs into the optional box. Or set `NOTION_SOURCE_IDS` in `.env.local` as comma-separated IDs.

## Security

Never put `NOTION_TOKEN` in a `NEXT_PUBLIC_` variable. It is only used on the server.
