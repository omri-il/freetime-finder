const eventId = location.pathname.split('/').pop();
const TOKEN_KEY = `ft.token.${eventId}`;
const NAME_KEY = `ft.name.${eventId}`;

const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const loginNameInput = document.getElementById('login-name');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const eventTitleEl = document.getElementById('event-title');
const eventH1 = document.getElementById('event-h1');
const eventSubtitle = document.getElementById('event-subtitle');
const app = document.getElementById('app');
const tabMine = document.getElementById('tab-mine');
const tabGroup = document.getElementById('tab-group');
const gridHost = document.getElementById('grid-host');
const participantsList = document.getElementById('participants-list');
const pCount = document.getElementById('p-count');
const statusEl = document.getElementById('status');
const shareBtn = document.getElementById('share-btn');
const logoutBtn = document.getElementById('logout-btn');

let eventData = null;
let myToken = null;
let myName = null;
let grid = null;
let pollTimer = null;
let saveDebounce = null;

const SHORT_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

function showStatus(msg, kind = 'info') {
  statusEl.textContent = msg;
  statusEl.dataset.kind = kind;
  if (kind !== 'error' && msg) {
    setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, 1500);
  }
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
}

async function loadEvent() {
  const res = await fetch(`/api/events/${eventId}`);
  if (!res.ok) {
    eventTitleEl.textContent = 'אירוע לא נמצא';
    return null;
  }
  return res.json();
}

function renderEventHeader() {
  const ev = eventData.event;
  eventTitleEl.textContent = ev.title;
  eventH1.textContent = ev.title;

  let sub;
  if (ev.mode === 'recurring') {
    const days = [];
    for (let d = 0; d <= 6; d++) if (ev.days_mask & (1 << d)) days.push(SHORT_DAYS[d]);
    sub = `שבועי קבוע · ימים ${days.join(', ')} · ${pad2(ev.start_hour)}:00–${pad2(ev.end_hour)}:00`;
  } else {
    sub = `${ev.start_date} עד ${ev.end_date} · ${pad2(ev.start_hour)}:00–${pad2(ev.end_hour)}:00`;
  }
  eventSubtitle.textContent = sub;
}
function pad2(n) { return String(n).padStart(2, '0'); }

function renderParticipants() {
  pCount.textContent = eventData.participants.length;
  participantsList.innerHTML = '';
  for (const p of eventData.participants) {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.name === myName) li.classList.add('me');
    participantsList.appendChild(li);
  }
}

async function joinEvent(name, password) {
  const res = await fetch(`/api/events/${eventId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'שגיאה');
  return data;
}

async function saveSlots(slots) {
  const res = await fetch(`/api/events/${eventId}/availability`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Participant-Token': myToken },
    body: JSON.stringify({ slots }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'שגיאה בשמירה');
  }
}

function debouncedSave(slots) {
  showStatus('שומר…');
  if (saveDebounce) clearTimeout(saveDebounce);
  saveDebounce = setTimeout(async () => {
    try {
      await saveSlots(slots);
      showStatus('נשמר ✓', 'ok');
      await refreshHeatmap();
    } catch (err) {
      showStatus('שגיאה: ' + err.message, 'error');
    }
  }, 300);
}

async function refreshHeatmap() {
  const fresh = await loadEvent();
  if (!fresh) return;
  eventData = fresh;
  renderParticipants();
  if (grid) grid.setHeatmap(eventData.heatmap, eventData.participants.length);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshHeatmap, 3000);
}

function setMode(mode) {
  tabMine.classList.toggle('active', mode === 'mine');
  tabGroup.classList.toggle('active', mode === 'group');
  tabMine.setAttribute('aria-selected', mode === 'mine');
  tabGroup.setAttribute('aria-selected', mode === 'group');
  if (grid) grid.setMode(mode);
}

tabMine.addEventListener('click', () => setMode('mine'));
tabGroup.addEventListener('click', () => setMode('group'));

shareBtn.addEventListener('click', async () => {
  const url = location.href;
  const shareData = { title: eventData.event.title, text: 'בואו נתאם זמן לעבוד יחד', url };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch {}
  } else {
    try {
      await navigator.clipboard.writeText(url);
      showStatus('הקישור הועתק ✓', 'ok');
    } catch {
      prompt('העתיקו את הקישור:', url);
    }
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  location.reload();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const name = loginNameInput.value.trim();
  const password = loginPasswordInput.value;
  if (!name) return showLoginError('הקלידו שם');

  try {
    const data = await joinEvent(name, password);
    myToken = data.token;
    myName = data.name;
    localStorage.setItem(TOKEN_KEY, myToken);
    localStorage.setItem(NAME_KEY, myName);
    await initApp(data.slots);
  } catch (err) {
    showLoginError(err.message);
  }
});

async function initApp(initialSlots) {
  loginModal.classList.add('hidden');
  app.classList.remove('hidden');
  await refreshHeatmap();
  renderEventHeader();

  grid = new AvailabilityGrid(gridHost, eventData.event, {
    mySlots: initialSlots,
    participantCount: eventData.participants.length,
    onChange: (slots) => debouncedSave(slots),
  });

  startPolling();
}

(async function boot() {
  eventData = await loadEvent();
  if (!eventData) {
    eventTitleEl.textContent = 'אירוע לא נמצא';
    return;
  }
  renderEventHeader();

  const savedToken = localStorage.getItem(TOKEN_KEY);
  const savedName = localStorage.getItem(NAME_KEY);
  if (savedToken && savedName) {
    try {
      const res = await fetch(`/api/events/${eventId}/me`, {
        headers: { 'X-Participant-Token': savedToken },
      });
      if (res.ok) {
        const { slots } = await res.json();
        myToken = savedToken;
        myName = savedName;
        await initApp(slots);
        return;
      }
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
  }
  loginModal.classList.remove('hidden');
  loginNameInput.focus();
})();
