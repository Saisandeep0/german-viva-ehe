# German Viva — Two Profile Edition

This project is the two-user version of the working German A1 practice app.

It supports:

- Sandeep profile
- Leela profile
- Separate Notion integration/token for each profile
- A different number of Notion databases for each profile
- Automatic discovery of databases shared with each Notion integration
- Dynamic practice categories based on the columns/content that actually exist
- German → English
- English → German
- Writing practice
- Opposites
- Verb meanings
- Verb conjugation
- Articles
- Plurals
- Stored Notion viva questions
- Random AI Conversation
- Random AI Viva
- Separate Gemini API key and quota for each profile
- Separate persistent AI question history in each browser/device

## Quick setup

Open `.env.local`.

Sandeep's existing Notion token and Gemini key have already been migrated into this copy.

You only need to add Leela's values:

```env
LEELA_NOTION_TOKEN=
LEELA_GEMINI_API_KEY=
```

`LEELA_NOTION_SOURCE_IDS` is optional.

### Recommended Notion setup

Create a separate Notion internal integration for Leela.

Share only the German databases/pages she wants to practice with that integration.

Leave:

```env
LEELA_NOTION_SOURCE_IDS=
```

blank.

The app will automatically discover every database that is accessible to Leela's integration.

The same dynamic discovery works for Sandeep.

If you want to restrict a profile to specific sources instead, use a comma-separated list:

```env
SANDEEP_NOTION_SOURCE_IDS=id1,id2,id3
LEELA_NOTION_SOURCE_IDS=idA,idB
```

IDs and full Notion URLs are both accepted.

## Run locally

```bash
npm install
npm run dev
```

Then open:

http://localhost:3000

Pick Sandeep or Leela.

## Profile behavior

The selected profile is remembered on that phone/browser.

Use `Switch user` at the top to change profiles.

AI history is stored separately:

- `german-ai-memory-v2-sandeep`
- `german-ai-memory-v2-leela`

So the tutor's old questions do not mix between profiles.

## Vercel deployment

`.env.local` is ignored by Git, so add the same environment variables in Vercel:

- `SANDEEP_NOTION_TOKEN`
- `SANDEEP_NOTION_SOURCE_IDS` (optional)
- `SANDEEP_GEMINI_API_KEY`
- `LEELA_NOTION_TOKEN`
- `LEELA_NOTION_SOURCE_IDS` (optional)
- `LEELA_GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-3.6-flash`

Then redeploy.

## Important

There is intentionally no authentication.

Anyone who has the app URL can click either profile.

The Notion and Gemini keys still remain server-side and are not sent to browser JavaScript.
