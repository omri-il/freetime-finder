const form = document.getElementById('create-form');
const recurringFields = document.getElementById('recurring-fields');
const specificFields = document.getElementById('specific-fields');
const errorEl = document.getElementById('error');

document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    recurringFields.classList.toggle('hidden', mode !== 'recurring');
    specificFields.classList.toggle('hidden', mode !== 'specific');
  });
});

const today = new Date();
const fmt = d => d.toISOString().slice(0, 10);
const inAWeek = new Date(today.getTime() + 7 * 86400e3);
document.getElementById('start-date').value = fmt(today);
document.getElementById('end-date').value = fmt(inAWeek);

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const mode = document.querySelector('input[name="mode"]:checked').value;
  const body = {
    title: document.getElementById('title').value.trim(),
    mode,
    start_hour: parseInt(document.getElementById('start-hour').value, 10),
    end_hour: parseInt(document.getElementById('end-hour').value, 10),
    slot_minutes: parseInt(document.getElementById('slot-minutes').value, 10),
  };

  if (mode === 'recurring') {
    let mask = 0;
    document.querySelectorAll('#days-picker input:checked').forEach(cb => {
      mask |= (1 << parseInt(cb.value, 10));
    });
    if (!mask) return showError('בחרו לפחות יום אחד');
    body.days_mask = mask;
  } else {
    body.start_date = document.getElementById('start-date').value;
    body.end_date = document.getElementById('end-date').value;
    if (!body.start_date || !body.end_date) return showError('בחרו טווח תאריכים');
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || 'שגיאה ביצירת האירוע');
    location.href = `/e/${data.id}`;
  } catch (err) {
    showError('שגיאת רשת — נסו שוב');
  }
});
