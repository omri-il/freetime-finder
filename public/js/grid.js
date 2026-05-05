const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HEBREW_DAYS_SHORT = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ש\''];

function pad2(n) { return String(n).padStart(2, '0'); }

function buildColumns(event) {
  if (event.mode === 'recurring') {
    const cols = [];
    for (let d = 0; d <= 6; d++) {
      if (event.days_mask & (1 << d)) {
        cols.push({
          key: String(d),
          label: HEBREW_DAYS[d],
          shortLabel: HEBREW_DAYS_SHORT[d],
        });
      }
    }
    return cols;
  }
  // specific
  const cols = [];
  const start = new Date(event.start_date + 'T00:00:00');
  const end = new Date(event.end_date + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    cols.push({
      key: iso,
      label: `${HEBREW_DAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`,
      shortLabel: `${d.getDate()}/${d.getMonth() + 1}`,
    });
  }
  return cols;
}

function buildRows(event) {
  const rows = [];
  const totalMin = (event.end_hour - event.start_hour) * 60;
  for (let m = 0; m < totalMin; m += event.slot_minutes) {
    const h = event.start_hour + Math.floor(m / 60);
    const mm = m % 60;
    rows.push({ time: `${pad2(h)}:${pad2(mm)}` });
  }
  return rows;
}

function slotKey(event, col, row) {
  if (event.mode === 'recurring') return `${col.key}-${row.time}`;
  return `${col.key} ${row.time}`;
}

class AvailabilityGrid {
  constructor(host, event, opts) {
    this.host = host;
    this.event = event;
    this.cols = buildColumns(event);
    this.rows = buildRows(event);
    this.mySlots = new Set(opts.mySlots || []);
    this.heatmap = new Map(); // slotKey -> {count, names}
    this.participantCount = opts.participantCount || 0;
    this.mode = 'mine'; // 'mine' | 'group'
    this.onChange = opts.onChange || (() => {});
    this.dragging = false;
    this.dragPaintMode = null; // 'paint' | 'erase'
    this.dragVisited = new Set();
    this.lastTouchKey = null;
    this.render();
    this.attachInteraction();
  }

  setMode(mode) {
    this.mode = mode;
    this.refreshCells();
  }

  setMySlots(slots) {
    this.mySlots = new Set(slots);
    this.refreshCells();
  }

  setHeatmap(entries, participantCount) {
    this.heatmap = new Map();
    for (const e of entries) this.heatmap.set(e.slot, { count: e.count, names: e.names });
    this.participantCount = participantCount;
    this.refreshCells();
  }

  render() {
    const tbl = document.createElement('table');
    tbl.className = 'grid';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(document.createElement('th')); // corner
    for (const c of this.cols) {
      const th = document.createElement('th');
      th.textContent = c.label;
      th.dataset.colKey = c.key;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const r of this.rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'time-label';
      th.textContent = r.time;
      tr.appendChild(th);
      for (const c of this.cols) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.slot = slotKey(this.event, c, r);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    tbl.appendChild(tbody);

    this.host.innerHTML = '';
    this.host.appendChild(tbl);
    this.tableEl = tbl;
    this.refreshCells();
  }

  refreshCells() {
    const cells = this.tableEl.querySelectorAll('td.cell');
    const max = Math.max(1, this.participantCount);
    for (const td of cells) {
      const key = td.dataset.slot;
      td.classList.toggle('mine', this.mySlots.has(key));
      td.classList.remove('group-l1', 'group-l2', 'group-l3', 'group-l4', 'group-l5');
      td.removeAttribute('title');
      if (this.mode === 'group') {
        const h = this.heatmap.get(key);
        if (h && h.count > 0) {
          const ratio = h.count / max;
          let level = 1;
          if (ratio >= 1) level = 5;
          else if (ratio >= 0.75) level = 4;
          else if (ratio >= 0.5) level = 3;
          else if (ratio >= 0.25) level = 2;
          td.classList.add(`group-l${level}`);
          td.title = `${h.count}/${max} פנויים: ${h.names.join(', ')}`;
        }
      } else if (this.mySlots.has(key)) {
        td.title = 'אני פנוי/ה';
      }
    }
  }

  cellAtPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const td = el.closest('td.cell');
    if (!td || !this.tableEl.contains(td)) return null;
    return td;
  }

  paintCell(td) {
    if (this.mode !== 'mine') return;
    const key = td.dataset.slot;
    if (this.dragVisited.has(key)) return;
    this.dragVisited.add(key);
    if (this.dragPaintMode === 'paint') this.mySlots.add(key);
    else this.mySlots.delete(key);
    td.classList.toggle('mine', this.mySlots.has(key));
  }

  attachInteraction() {
    const tbl = this.tableEl;

    const startDrag = (td) => {
      if (this.mode !== 'mine') return;
      this.dragging = true;
      this.dragVisited = new Set();
      const key = td.dataset.slot;
      this.dragPaintMode = this.mySlots.has(key) ? 'erase' : 'paint';
      this.paintCell(td);
    };

    const endDrag = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dragVisited.clear();
      this.lastTouchKey = null;
      this.onChange([...this.mySlots]);
    };

    // Mouse
    tbl.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td.cell');
      if (td) { e.preventDefault(); startDrag(td); }
    });
    tbl.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const td = e.target.closest('td.cell');
      if (td && this.tableEl.contains(td)) this.paintCell(td);
    });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('mouseleave', endDrag);

    // Touch — use elementFromPoint because touchmove target stays as start
    tbl.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const td = this.cellAtPoint(t.clientX, t.clientY);
      if (td) { e.preventDefault(); startDrag(td); this.lastTouchKey = td.dataset.slot; }
    }, { passive: false });
    tbl.addEventListener('touchmove', (e) => {
      if (!this.dragging) return;
      const t = e.touches[0];
      const td = this.cellAtPoint(t.clientX, t.clientY);
      if (td && td.dataset.slot !== this.lastTouchKey) {
        this.lastTouchKey = td.dataset.slot;
        this.paintCell(td);
      }
      e.preventDefault();
    }, { passive: false });
    tbl.addEventListener('touchend', endDrag);
    tbl.addEventListener('touchcancel', endDrag);
  }
}

window.AvailabilityGrid = AvailabilityGrid;
