# Freetime Finder · מתי נפגשים?

Tiny Hebrew-RTL group availability finder — like When2Meet, but mobile-friendly and on your own domain.

Live at **https://meet.omri-iram.co.il** (when deployed).

## What it does

- Create an event (recurring weekly **or** specific dates)
- Share a link
- Each person enters their name (optional password to "lock" their slot) and drags to paint when they're free
- Group view shows a heatmap of who's free when

No accounts, no sign-ups, no email — just a name.

## Stack

- Node.js (built-in `node:sqlite`, no native compilation)
- Express, bcryptjs, jsonwebtoken
- Vanilla HTML/CSS/JS (no build step)

## Run locally

```bash
npm install
cp .env.example .env
node server.js
```

Open http://localhost:3010.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3010` | HTTP port |
| `JWT_SECRET` | random per-process | Signs participant tokens. **Set this in production** so tokens survive restarts. |

## Data

SQLite file at `data/freetime.db` (gitignored). Schema is bootstrapped on first run.

## License

MIT
