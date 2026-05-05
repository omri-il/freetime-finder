require('dotenv').config();
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const PORT = parseInt(process.env.PORT || '3010', 10);
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const newId = () => crypto.randomBytes(4).toString('hex');

const stmts = {
  insertEvent: db.prepare(`
    INSERT INTO events (id, title, mode, start_date, end_date, days_mask, start_hour, end_hour, slot_minutes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getEvent: db.prepare('SELECT * FROM events WHERE id = ?'),
  getParticipantByName: db.prepare('SELECT * FROM participants WHERE event_id = ? AND name = ?'),
  insertParticipant: db.prepare(`
    INSERT INTO participants (event_id, name, password_hash, created_at) VALUES (?, ?, ?, ?)
  `),
  setParticipantPassword: db.prepare('UPDATE participants SET password_hash = ? WHERE id = ?'),
  listParticipants: db.prepare('SELECT id, name FROM participants WHERE event_id = ? ORDER BY created_at ASC'),
  deleteAvailability: db.prepare('DELETE FROM availability WHERE participant_id = ?'),
  insertAvailability: db.prepare('INSERT INTO availability (participant_id, slot_key) VALUES (?, ?)'),
  participantSlots: db.prepare('SELECT slot_key FROM availability WHERE participant_id = ?'),
  eventHeatmap: db.prepare(`
    SELECT a.slot_key, GROUP_CONCAT(p.name, '') AS names, COUNT(*) AS cnt
    FROM availability a
    JOIN participants p ON p.id = a.participant_id
    WHERE p.event_id = ?
    GROUP BY a.slot_key
  `),
};

function validateMode(body) {
  const { mode } = body;
  if (mode === 'recurring') {
    const m = parseInt(body.days_mask, 10);
    if (!Number.isInteger(m) || m <= 0 || m > 127) return 'days_mask must be 1..127';
    return null;
  }
  if (mode === 'specific') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start_date || '')) return 'start_date must be YYYY-MM-DD';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.end_date || '')) return 'end_date must be YYYY-MM-DD';
    if (body.end_date < body.start_date) return 'end_date must be on or after start_date';
    return null;
  }
  return 'mode must be recurring or specific';
}

app.post('/api/events', (req, res) => {
  const b = req.body || {};
  const title = (b.title || '').trim();
  if (!title || title.length > 120) return res.status(400).json({ error: 'title required (1-120 chars)' });

  const modeErr = validateMode(b);
  if (modeErr) return res.status(400).json({ error: modeErr });

  const startHour = parseInt(b.start_hour, 10);
  const endHour = parseInt(b.end_hour, 10);
  if (!(startHour >= 0 && startHour <= 23)) return res.status(400).json({ error: 'start_hour 0..23' });
  if (!(endHour >= 1 && endHour <= 24)) return res.status(400).json({ error: 'end_hour 1..24' });
  if (endHour <= startHour) return res.status(400).json({ error: 'end_hour must be > start_hour' });

  const slotMinutes = [15, 30, 60].includes(parseInt(b.slot_minutes, 10)) ? parseInt(b.slot_minutes, 10) : 30;

  const id = newId();
  stmts.insertEvent.run(
    id,
    title,
    b.mode,
    b.mode === 'specific' ? b.start_date : null,
    b.mode === 'specific' ? b.end_date : null,
    b.mode === 'recurring' ? parseInt(b.days_mask, 10) : null,
    startHour,
    endHour,
    slotMinutes,
    Date.now()
  );

  res.json({ id });
});

app.get('/api/events/:id', (req, res) => {
  const ev = stmts.getEvent.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'event not found' });

  const participants = stmts.listParticipants.all(ev.id);
  const heat = stmts.eventHeatmap.all(ev.id).map(r => ({
    slot: r.slot_key,
    count: r.cnt,
    names: r.names ? r.names.split('') : [],
  }));

  res.json({ event: ev, participants, heatmap: heat });
});

app.post('/api/events/:id/join', async (req, res) => {
  const ev = stmts.getEvent.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'event not found' });

  const name = (req.body?.name || '').trim();
  const password = req.body?.password || '';
  if (!name || name.length > 60) return res.status(400).json({ error: 'name required (1-60 chars)' });

  let p = stmts.getParticipantByName.get(ev.id, name);

  if (!p) {
    const passHash = password ? await bcrypt.hash(password, 10) : null;
    const result = stmts.insertParticipant.run(ev.id, name, passHash, Date.now());
    p = { id: result.lastInsertRowid, event_id: ev.id, name, password_hash: passHash };
  } else if (p.password_hash) {
    if (!password) return res.status(401).json({ error: 'password required' });
    const ok = await bcrypt.compare(password, p.password_hash);
    if (!ok) return res.status(401).json({ error: 'wrong password' });
  } else if (password) {
    const passHash = await bcrypt.hash(password, 10);
    stmts.setParticipantPassword.run(passHash, p.id);
    p.password_hash = passHash;
  }

  const token = jwt.sign({ pid: p.id, eid: ev.id }, JWT_SECRET, { expiresIn: '30d' });
  const slots = stmts.participantSlots.all(p.id).map(r => r.slot_key);
  res.json({ token, participantId: p.id, name: p.name, slots });
});

function authParticipant(req, res, next) {
  const token = req.header('X-Participant-Token') || '';
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.eid !== req.params.id) return res.status(403).json({ error: 'wrong event' });
    req.participantId = payload.pid;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.get('/api/events/:id/me', authParticipant, (req, res) => {
  const slots = stmts.participantSlots.all(req.participantId).map(r => r.slot_key);
  res.json({ slots });
});

app.put('/api/events/:id/availability', authParticipant, (req, res) => {
  const ev = stmts.getEvent.get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'event not found' });

  const slots = Array.isArray(req.body?.slots) ? req.body.slots : null;
  if (!slots) return res.status(400).json({ error: 'slots must be an array' });
  if (slots.length > 50000) return res.status(400).json({ error: 'too many slots' });

  const slotRe = ev.mode === 'recurring'
    ? /^[0-6]-\d{2}:\d{2}$/
    : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
  for (const s of slots) {
    if (typeof s !== 'string' || !slotRe.test(s)) {
      return res.status(400).json({ error: `bad slot key: ${s}` });
    }
  }

  const tx = db.prepare('BEGIN');
  const commit = db.prepare('COMMIT');
  const rollback = db.prepare('ROLLBACK');
  try {
    tx.run();
    stmts.deleteAvailability.run(req.participantId);
    for (const s of slots) stmts.insertAvailability.run(req.participantId, s);
    commit.run();
  } catch (err) {
    rollback.run();
    return res.status(500).json({ error: 'db error', detail: err.message });
  }

  res.json({ ok: true, count: slots.length });
});

app.get('/e/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'event.html'));
});

app.listen(PORT, () => {
  console.log(`freetime-finder listening on http://localhost:${PORT}`);
});
