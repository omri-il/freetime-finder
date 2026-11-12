# CLAUDE.md

freetime-finder is a small Hebrew, right-to-left group availability finder, like When2Meet: create an event, share the link, each person paints when they are free, and a heatmap shows the group. No accounts and no email, only a name. Repo `omri-il/freetime-finder`, **public**, default branch `main`. Node and Express, vanilla front end, no build step.

## Commands

```bash
npm install
cp .env.example .env
node server.js        # http://localhost:3010 (npm start does the same)
```

There is no test and no lint.

## Layout

```
server.js        the whole API and the static server
db.js            schema and queries, on the built-in node:sqlite
public/          index.html (create), event.html, js/create.js, js/event.js, js/grid.js, style.css
.env.example     PORT, JWT_SECRET
data/            freetime.db, made on first run. Gitignored
```

## Where it runs

- VPS clone `/root/Projects/freetime-finder`, branch `main`.
- systemd `freetime-finder` (active and enabled). It reads `/root/Projects/freetime-finder/.env` and runs `node server.js`.
- **Deploy is by hand**, there is no timer and no CI: `git pull` in that clone, then `systemctl restart freetime-finder`. Logs: `journalctl -u freetime-finder`.

⚠️ **The service runs, but nobody can reach it.** There is no nginx site for it and ufw lets only 80, 443 and SSH through, so port 3010 is closed from outside. `README.md` says "Live at https://meet.omri-iram.co.il (when deployed)" — that address does not exist. To publish it, add an nginx site that proxies to 127.0.0.1:3010, like the other services, and get a certificate. Ask Omri first.

## Rules

- `node:sqlite` is built into Node 18+, so nothing is compiled. Keep it that way: no `better-sqlite3`.
- `JWT_SECRET` must be set in production. Without it the process makes a random one at start, and every participant token dies on a restart.
- `data/` is gitignored and holds the only copy of the events. It is not in any backup I know of. Ask Omri before you touch or move it.
- The repo is public. No keys and no participant data in it, this file included.
- Hebrew, right to left. Logical CSS only (`margin-inline-start`, not `margin-left`). The `hebrew-rtl` skill holds the rules.
