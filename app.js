'use strict';

// ===== CONSTANTS =====
const PREDEFINED_EXERCISES = [
  'Klimmzüge', 'Chin-ups', 'Dips', 'Liegestütze', 'Pike Push-ups',
  'Muscle-ups', 'Rudern', 'Beinheben', 'L-Sit', 'Pistol Squat'
];

const DAYS_DE   = ['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'];
const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni',
                   'Juli','August','September','Oktober','November','Dezember'];

// ===== DB =====
const DB = {
  getSessions()          { return JSON.parse(localStorage.getItem('trainingSessions') || '[]'); },
  saveSessions(s)        { localStorage.setItem('trainingSessions', JSON.stringify(s)); },
  getCustomExercises()   { return JSON.parse(localStorage.getItem('customExercises') || '[]'); },
  saveCustomExercises(e) { localStorage.setItem('customExercises', JSON.stringify(e)); },
  getCardioEntries()     { return JSON.parse(localStorage.getItem('cardioEntries') || '[]'); },
  saveCardioEntries(e)   { localStorage.setItem('cardioEntries', JSON.stringify(e)); },

  addSession(s)          { const a = this.getSessions(); a.push(s); this.saveSessions(a); },
  updateSession(id, s)   { const a = this.getSessions(); const i = a.findIndex(x => x.id === id); if (i > -1) { a[i] = s; this.saveSessions(a); } },
  deleteSession(id)      { this.saveSessions(this.getSessions().filter(s => s.id !== id)); },

  addCustomExercise(name) {
    const a = this.getCustomExercises();
    if (!a.includes(name)) { a.push(name); this.saveCustomExercises(a); }
  },
  getAllExercises()       { return [...PREDEFINED_EXERCISES, ...this.getCustomExercises()]; },
  getExercisesWithData() {
    const names = new Set();
    this.getSessions().forEach(s => s.exercises.forEach(e => names.add(e.name)));
    return [...names].sort();
  },

  addCardioEntry(e)      { const a = this.getCardioEntries(); a.push(e); this.saveCardioEntries(a); },
  updateCardioEntry(id,e){ const a = this.getCardioEntries(); const i = a.findIndex(x => x.id === id); if (i > -1) { a[i] = e; this.saveCardioEntries(a); } },
  deleteCardioEntry(id)  { this.saveCardioEntries(this.getCardioEntries().filter(e => e.id !== id)); },

  getPRs()       { return JSON.parse(localStorage.getItem('personalRecords') || '{}'); },
  savePRs(p)     { localStorage.setItem('personalRecords', JSON.stringify(p)); },
  checkAndUpdatePR(name, reps, weight) {
    const score    = e1rm(reps, weight);
    const prs      = this.getPRs();
    const cur      = prs[name];
    const curScore = (cur && typeof cur === 'object') ? cur.score : (cur || 0);
    if (score > curScore) {
      prs[name] = { score, reps, weight };
      this.savePRs(prs);
      return true;
    }
    return false;
  },
};

// ===== UTILS =====
function uid()   { return Date.now() + Math.random().toString(36).slice(2); }
function today() { return new Date().toISOString().slice(0,10); }

function formatDate(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y, m-1, d);
  return `${DAYS_DE[date.getDay()]} ${d}. ${MONTHS_DE[m-1]} ${y}`;
}

function formatDateShort(iso) {
  const [,m,d] = iso.split('-').map(Number);
  return `${d}.${m < 10 ? '0'+m : m}`;
}

function e1rm(reps, weight) {
  if (weight > 0) return Math.round(weight * (1 + reps / 30) * 10) / 10;
  return reps; // bodyweight: use reps as metric
}

function bestSet(sets) {
  return sets.reduce((best, s) => {
    return e1rm(s.reps, s.weight) > e1rm(best.reps, best.weight) ? s : best;
  }, sets[0]);
}

function weightLabel(w) {
  return w === 0 ? 'BG' : `${w} kg`;
}

function setLabel(s) {
  return `${s.reps} × ${weightLabel(s.weight)}`;
}

function el(id) { return document.getElementById(id); }

function paceToStr(val) {
  if (val == null) return '';
  const min = Math.floor(val);
  const sec = Math.round((val - min) * 60);
  return `${min}:${String(sec).padStart(2, '0')} min/km`;
}

function showConfirm(message, onOk, okLabel = 'Löschen') {
  el('confirm-message').textContent = message;
  el('btn-confirm-ok').textContent  = okLabel;
  el('modal-confirm').classList.add('open');
  el('modal-confirm').setAttribute('aria-hidden', 'false');
  el('btn-confirm-ok').onclick = () => { closeConfirm(); onOk(); };
}
function closeConfirm() {
  el('modal-confirm').classList.remove('open');
  el('modal-confirm').setAttribute('aria-hidden', 'true');
}

// ===== STATE =====
const State = {
  session: null,         // active training session
  currentExercise: null, // {name, sets:[]}
  editSession: null,     // deep copy during session edit
  editCardioId: null,
};

// ===== TAB MANAGEMENT =====
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  el(`tab-${name}`).classList.add('active');
  if (name === 'history')  History.render();
  if (name === 'progress') Progress.render();
  if (name === 'cardio')   Cardio.render();
}

// ===== TRAINING MODULE =====
const Training = {
  render() {
    const active = !!State.session;
    el('training-idle').classList.toggle('hidden', active);
    el('training-active').classList.toggle('hidden', !active);
    if (active) {
      el('active-date-display').textContent = formatDate(State.session.date);
      this.renderCompleted();
      this.renderCurrent();
      this.updateActions();
    } else {
      this.renderIdle();
    }
  },

  renderIdle() {
    // PR showcase (3 hardcoded key exercises)
    const PR_EXERCISES = ['Liegestütze', 'Klimmzüge', 'Dips'];
    const prs = DB.getPRs();
    const colsHTML = PR_EXERCISES.map((name, i) => {
      const pr  = prs[name];
      const val = (pr && typeof pr === 'object')
        ? `${pr.reps} × ${weightLabel(pr.weight)}`
        : '—';
      return `${i > 0 ? '<div class="home-pr-divider"></div>' : ''}
        <div class="home-pr-col">
          <div class="home-pr-name">${name}</div>
          <div class="home-pr-value">${val}</div>
        </div>`;
    }).join('');
    el('home-pr-card').innerHTML =
      `<div class="home-pr-title">Aktuelle PRs 🏆</div>
       <div class="home-pr-cols">${colsHTML}</div>`;

    // Weekly goal progress
    const goal  = parseInt(localStorage.getItem('weeklyGoal') || '3');
    const count = this._sessionsThisWeek();
    el('home-goal-text').textContent = `${count} von ${goal} Trainings diese Woche`;
    el('home-goal-fill').style.width = `${Math.min(count / goal, 1) * 100}%`;

    // Last training label
    const sessions = DB.getSessions().sort((a, b) => b.date.localeCompare(a.date));
    if (sessions.length > 0) {
      const last   = sessions[0].date;
      const todayS = today();
      let label;
      if (last === todayS) {
        label = 'Heute trainiert';
      } else {
        const [ly, lm, ld] = last.split('-').map(Number);
        const [ty, tm, td] = todayS.split('-').map(Number);
        const diff = Math.round(
          (new Date(ty, tm-1, td) - new Date(ly, lm-1, ld)) / 86400000
        );
        label = diff === 1 ? 'Gestern trainiert' : `Letztes Training vor ${diff} Tagen`;
      }
      el('last-training-text').textContent = label;
    } else {
      el('last-training-text').textContent = 'Noch kein Training';
    }
  },

  _sessionsThisWeek() {
    const now = new Date();
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - dow);
    const monStr = mon.toISOString().slice(0, 10);
    return DB.getSessions().filter(s => s.date >= monStr).length;
  },

  start() {
    State.session = { id: uid(), date: today(), exercises: [] };
    State.currentExercise = null;
    this.render();
    ExercisePicker.open();
  },

  renderCompleted() {
    const wrap = el('completed-exercises');
    wrap.innerHTML = '';
    State.session.exercises.forEach(ex => {
      const div = document.createElement('div');
      div.className = 'completed-exercise';
      div.innerHTML = `
        <div class="completed-exercise-name">${ex.name}</div>
        <div class="completed-sets">
          ${ex.sets.map(s => `<span class="set-chip">${setLabel(s)}</span>`).join('')}
        </div>`;
      wrap.appendChild(div);
    });
  },

  renderCurrent() {
    const card = el('current-exercise-card');
    if (!State.currentExercise) {
      card.classList.add('hidden');
      el('last-session-card').classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    el('current-exercise-name').textContent = State.currentExercise.name;
    const list = el('current-sets-list');
    list.innerHTML = '';
    State.currentExercise.sets.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'set-row';
      row.innerHTML = `
        <span class="set-num">${i+1}</span>
        <span class="set-data">${s.reps} Wdh. <span>× ${weightLabel(s.weight)}</span></span>
        ${s.isPR ? '<span class="pr-badge">PR 🏆</span>' : ''}
        <button class="btn-delete-set" data-idx="${i}" aria-label="Satz löschen">✕</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.btn-delete-set').forEach(btn => {
      btn.addEventListener('click', () => this.deleteSet(+btn.dataset.idx));
    });
  },

  updateActions() {
    const hasEx = State.session && State.session.exercises.length > 0;
    el('training-bottom-actions').classList.toggle('hidden', !!State.currentExercise);
  },

  addSet() {
    const reps = parseInt(el('input-reps').value);
    const weight = parseFloat(el('input-weight').value) || 0;
    if (!reps || reps < 1) { el('input-reps').focus(); return; }
    if (!State.currentExercise) return;
    const isPR = DB.checkAndUpdatePR(State.currentExercise.name, reps, weight);
    State.currentExercise.sets.push({ reps, weight, isPR });
    el('input-reps').value = '';
    el('input-weight').value = '';
    el('input-reps').focus();
    this.renderCurrent();
  },

  deleteSet(idx) {
    State.currentExercise.sets.splice(idx, 1);
    this.renderCurrent();
  },

  finishExercise() {
    if (!State.currentExercise || State.currentExercise.sets.length === 0) return;
    State.session.exercises.push(State.currentExercise);
    State.currentExercise = null;
    this.renderCompleted();
    this.renderCurrent();
    this.updateActions();
  },

  addAnotherExercise() {
    if (State.currentExercise && State.currentExercise.sets.length > 0) this.finishExercise();
    ExercisePicker.open();
  },

  renderLastSession(name) {
    const past = DB.getSessions()
      .filter(s => s.exercises.some(e => e.name === name))
      .sort((a, b) => b.date.localeCompare(a.date));
    const setsWrap = el('last-session-sets');
    if (past.length === 0) {
      el('last-session-date').textContent = '';
      setsWrap.innerHTML = '<p class="last-session-first">Erste Session mit dieser Übung 💪</p>';
    } else {
      const last = past[0];
      const ex   = last.exercises.find(e => e.name === name);
      el('last-session-date').textContent = formatDate(last.date);
      setsWrap.innerHTML = ex.sets
        .map((s, i) => `<div class="last-session-set-row">Satz ${i+1}: ${s.reps} Wdh × ${weightLabel(s.weight)}</div>`)
        .join('');
    }
    el('last-session-card').classList.remove('hidden');
  },

  finishTraining() {
    if (!State.session) return;
    if (State.currentExercise && State.currentExercise.sets.length > 0) this.finishExercise();
    if (State.session.exercises.length === 0) {
      showConfirm('Das Training hat keine Übungen. Trotzdem beenden?', () => {
        State.session = null;
        this.render();
      });
      return;
    }
    DB.addSession(State.session);
    State.session = null;
    State.currentExercise = null;
    this.render();
  },
};

// ===== EXERCISE PICKER =====
const ExercisePicker = {
  open() {
    el('exercise-search').value = '';
    this.renderList('');
    el('modal-exercise').classList.add('open');
    el('modal-exercise').setAttribute('aria-hidden', 'false');
    setTimeout(() => el('exercise-search').focus(), 300);
  },

  close() {
    el('modal-exercise').classList.remove('open');
    el('modal-exercise').setAttribute('aria-hidden', 'true');
  },

  renderList(query) {
    const q = query.trim().toLowerCase();
    const all = DB.getAllExercises();
    const filtered = q ? all.filter(e => e.toLowerCase().includes(q)) : all;
    const wrap = el('exercise-picker-list');
    wrap.innerHTML = '';

    filtered.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'exercise-btn';
      btn.textContent = name;
      btn.addEventListener('click', () => this.select(name));
      wrap.appendChild(btn);
    });

    // "Add custom" option when typed text doesn't match existing
    const trimmed = query.trim();
    if (trimmed && !all.some(e => e.toLowerCase() === trimmed.toLowerCase())) {
      const btn = document.createElement('button');
      btn.className = 'exercise-btn custom-add';
      btn.textContent = `+ "${trimmed}" hinzufügen`;
      btn.addEventListener('click', () => {
        DB.addCustomExercise(trimmed);
        this.select(trimmed);
      });
      wrap.prepend(btn);
    }
  },

  select(name) {
    this.close();
    State.currentExercise = { name, sets: [] };
    el('input-reps').value = '';
    el('input-weight').value = '';
    Training.renderCurrent();
    Training.updateActions();
    Training.renderLastSession(name);
    setTimeout(() => el('input-reps').focus(), 350);
  },
};

// ===== HISTORY MODULE =====
const History = {
  render() {
    const sessions = DB.getSessions().slice().sort((a,b) => b.date.localeCompare(a.date));
    const wrap = el('history-list');
    wrap.innerHTML = '';
    if (sessions.length === 0) {
      wrap.innerHTML = '<p class="empty-state">Noch keine Trainings gespeichert.</p>';
      return;
    }
    sessions.forEach(s => wrap.appendChild(this.buildCard(s)));
  },

  buildCard(session) {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.dataset.id = session.id;

    const totalSets = session.exercises.reduce((n,e) => n + e.sets.length, 0);
    const hasPR    = session.exercises.some(e => e.sets.some(s => s.isPR));

    card.innerHTML = `
      <div class="session-header">
        <span class="session-date">${formatDate(session.date)}${hasPR ? ' 🏆' : ''}</span>
        <span class="session-meta">${session.exercises.length} Übung${session.exercises.length !== 1 ? 'en' : ''} · ${totalSets} Sätze</span>
        <span class="chevron">›</span>
      </div>
      <div class="session-body">
        <div class="session-body-inner">
          ${session.exercises.map(ex => `
            <div class="session-exercise-block">
              <div class="session-exercise-name">${ex.name}</div>
              ${ex.sets.map((s,i) => `
                <div class="set-row">
                  <span class="set-num">${i+1}</span>
                  <span class="set-data">${s.reps} Wdh. <span>× ${weightLabel(s.weight)}</span></span>
                </div>`).join('')}
            </div>`).join('')}
          <div class="session-actions">
            <button class="btn-sm btn-sm-muted btn-edit-session">Bearbeiten</button>
            <button class="btn-sm btn-sm-danger btn-delete-session">Löschen</button>
          </div>
        </div>
      </div>`;

    card.querySelector('.session-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
    card.querySelector('.btn-edit-session').addEventListener('click', e => {
      e.stopPropagation();
      this.openEditModal(session.id);
    });
    card.querySelector('.btn-delete-session').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`Training vom ${formatDate(session.date)} löschen?`, () => {
        DB.deleteSession(session.id);
        this.render();
      });
    });

    return card;
  },

  openEditModal(id) {
    const session = DB.getSessions().find(s => s.id === id);
    if (!session) return;
    State.editSession = JSON.parse(JSON.stringify(session)); // deep copy
    this.renderEditBody();
    el('modal-session-edit').classList.add('open');
    el('modal-session-edit').setAttribute('aria-hidden', 'false');
  },

  closeEditModal() {
    el('modal-session-edit').classList.remove('open');
    el('modal-session-edit').setAttribute('aria-hidden', 'true');
    State.editSession = null;
  },

  renderEditBody() {
    const body = el('session-edit-body');
    const s = State.editSession;
    body.innerHTML = `<p style="color:var(--text-muted);font-size:13px;margin-bottom:16px">${formatDate(s.date)}</p>`;

    if (s.exercises.length === 0) {
      body.innerHTML += '<p class="empty-state" style="padding:20px 0">Keine Übungen mehr vorhanden.</p>';
      return;
    }

    s.exercises.forEach((ex, exIdx) => {
      const block = document.createElement('div');
      block.className = 'edit-exercise-block';
      block.innerHTML = `
        <div class="edit-exercise-header">
          <span class="edit-exercise-name">${ex.name}</span>
          <button class="btn-sm btn-sm-danger btn-del-ex" data-ex="${exIdx}">Entfernen</button>
        </div>
        ${ex.sets.map((s,si) => `
          <div class="edit-set-row">
            <span class="edit-set-num">${si+1}</span>
            <input class="edit-input" type="number" inputmode="numeric" value="${s.reps}"
              data-ex="${exIdx}" data-si="${si}" data-field="reps" min="1">
            <span class="edit-sep">×</span>
            <input class="edit-input" type="number" inputmode="decimal" value="${s.weight}"
              data-ex="${exIdx}" data-si="${si}" data-field="weight" min="0" step="0.5">
            <span class="edit-sep" style="font-size:11px;color:var(--text-dim)">kg</span>
            <button class="btn-delete-set btn-del-set" data-ex="${exIdx}" data-si="${si}">✕</button>
          </div>`).join('')}`;
      body.appendChild(block);
    });

    body.querySelectorAll('.btn-del-ex').forEach(btn => {
      btn.addEventListener('click', () => {
        State.editSession.exercises.splice(+btn.dataset.ex, 1);
        this.renderEditBody();
      });
    });
    body.querySelectorAll('.btn-del-set').forEach(btn => {
      btn.addEventListener('click', () => {
        const ex = State.editSession.exercises[+btn.dataset.ex];
        ex.sets.splice(+btn.dataset.si, 1);
        if (ex.sets.length === 0) State.editSession.exercises.splice(+btn.dataset.ex, 1);
        this.renderEditBody();
      });
    });
  },

  saveEdit() {
    // read current input values into editSession
    el('session-edit-body').querySelectorAll('.edit-input').forEach(inp => {
      const ex = State.editSession.exercises[+inp.dataset.ex];
      if (!ex) return;
      const set = ex.sets[+inp.dataset.si];
      if (!set) return;
      if (inp.dataset.field === 'reps')   set.reps   = parseInt(inp.value)   || set.reps;
      if (inp.dataset.field === 'weight') set.weight = parseFloat(inp.value) || 0;
    });
    DB.updateSession(State.editSession.id, State.editSession);
    this.closeEditModal();
    this.render();
  },
};

// ===== PROGRESS MODULE =====
const Progress = {
  chart: null,
  volumeChart: null,

  render() {
    const exercises = DB.getExercisesWithData();
    const sel = el('progress-select');
    const prev = sel.value;
    sel.innerHTML = '<option value="">Übung wählen…</option>';
    exercises.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    if (prev && exercises.includes(prev)) sel.value = prev;
    this.update();
    this.renderVolumeChart();
  },

  update() {
    const name = el('progress-select').value;
    if (!name) {
      el('progress-chart-wrap').classList.add('hidden');
      el('progress-empty').classList.remove('hidden');
      el('progress-no-data').classList.add('hidden');
      return;
    }
    el('progress-empty').classList.add('hidden');

    const sessions = DB.getSessions()
      .filter(s => s.exercises.some(e => e.name === name))
      .sort((a,b) => a.date.localeCompare(b.date));

    if (sessions.length === 0) {
      el('progress-chart-wrap').classList.add('hidden');
      el('progress-no-data').classList.remove('hidden');
      return;
    }

    el('progress-no-data').classList.add('hidden');
    el('progress-chart-wrap').classList.remove('hidden');

    const labels = [];
    const data   = [];

    sessions.forEach(s => {
      const ex = s.exercises.find(e => e.name === name);
      if (!ex || ex.sets.length === 0) return;
      const best = bestSet(ex.sets);
      labels.push(formatDateShort(s.date));
      data.push(e1rm(best.reps, best.weight));
    });

    const allBodyweight = sessions.every(s => {
      const ex = s.exercises.find(e => e.name === name);
      return ex && ex.sets.every(st => st.weight === 0);
    });
    const yLabel = allBodyweight ? 'Max. Wdh.' : 'E1RM (kg)';

    if (this.chart) { this.chart.destroy(); this.chart = null; }

    const isLight = document.documentElement.dataset.theme === 'light';
    const accent    = isLight ? '#00C853' : '#00E676';
    const surface   = isLight ? '#F5F5F5' : '#111111';
    const border    = isLight ? '#E0E0E0' : '#222222';
    const muted     = isLight ? '#666666' : '#888888';
    const textColor = isLight ? '#000000' : '#FFFFFF';

    const ctx = el('progress-chart').getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: accent,
          backgroundColor: `${accent}14`,
          borderWidth: 2.5,
          pointBackgroundColor: accent,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surface,
            borderColor: border,
            borderWidth: 1,
            titleColor: muted,
            bodyColor: textColor,
            callbacks: { label: ctx => `${ctx.parsed.y} ${yLabel}` }
          }
        },
        scales: {
          x: {
            grid: { color: border },
            ticks: { color: muted, font: { size: 11 } },
          },
          y: {
            grid: { color: border },
            ticks: { color: muted, font: { size: 11 } },
            title: { display: true, text: yLabel, color: muted, font: { size: 11 } },
          }
        }
      }
    });
  },

  renderVolumeChart() {
    const sessions = DB.getSessions();
    const wrap = el('volume-chart-wrap');

    // Build 8 weekly buckets ending with the current week (Mon–Sun)
    const now = new Date();
    const dowOffset = now.getDay() === 0 ? 6 : now.getDay() - 1; // days since Monday
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - dowOffset);
    thisMonday.setHours(0, 0, 0, 0);

    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() - (7 - i) * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      const d = start;
      return { start, end, volume: 0, label: `${d.getDate()}.${d.getMonth()+1}.` };
    });

    sessions.forEach(s => {
      const [y, m, d] = s.date.split('-').map(Number);
      const date = new Date(y, m-1, d);
      for (const week of weeks) {
        if (date >= week.start && date <= week.end) {
          s.exercises.forEach(ex =>
            ex.sets.forEach(set => { if (set.weight > 0) week.volume += set.reps * set.weight; })
          );
          break;
        }
      }
    });

    if (weeks.every(w => w.volume === 0)) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');

    if (this.volumeChart) { this.volumeChart.destroy(); this.volumeChart = null; }

    const isLight  = document.documentElement.dataset.theme === 'light';
    const accent   = isLight ? '#00C853' : '#00E676';
    const surface  = isLight ? '#F5F5F5' : '#111111';
    const border   = isLight ? '#E0E0E0' : '#222222';
    const muted    = isLight ? '#666666' : '#888888';
    const textColor = isLight ? '#000000' : '#FFFFFF';

    this.volumeChart = new Chart(el('volume-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: weeks.map(w => w.label),
        datasets: [{
          data: weeks.map(w => w.volume),
          backgroundColor: `${accent}28`,
          borderColor: accent,
          borderWidth: 1.5,
          borderRadius: 5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surface, borderColor: border, borderWidth: 1,
            titleColor: muted, bodyColor: textColor,
            callbacks: { label: ctx => `${Math.round(ctx.parsed.y).toLocaleString('de-DE')} kg` }
          }
        },
        scales: {
          x: { grid: { color: border }, ticks: { color: muted, font: { size: 11 } } },
          y: {
            grid: { color: border }, ticks: { color: muted, font: { size: 11 } },
            title: { display: true, text: 'kg', color: muted, font: { size: 11 } },
            beginAtZero: true,
          }
        }
      }
    });
  },
};

// ===== DURATION PICKER =====
const DurationPicker = {
  ITEM_H: 44,
  SPACER_H: 88, // 2 × ITEM_H so first/last item can reach center

  init() {
    this._buildCol(el('picker-hours'),   24, v => String(v));
    this._buildCol(el('picker-minutes'), 60, v => String(v).padStart(2, '0'));
    this.setFromMinutes(0);
  },

  _buildCol(col, count, fmt) {
    const top = document.createElement('div');
    top.style.height = this.SPACER_H + 'px';
    top.style.flexShrink = '0';
    col.appendChild(top);

    for (let i = 0; i < count; i++) {
      const item = document.createElement('div');
      item.className = 'picker-item';
      item.textContent = fmt(i);
      col.appendChild(item);
    }

    const bot = document.createElement('div');
    bot.style.height = this.SPACER_H + 'px';
    bot.style.flexShrink = '0';
    col.appendChild(bot);

    let timer;
    col.addEventListener('scroll', () => {
      clearTimeout(timer);
      this._highlightSelected(col);
      timer = setTimeout(() => {
        this._updateHidden();
        this._highlightSelected(col);
      }, 120);
    }, { passive: true });
  },

  _idx(col) {
    return Math.round(col.scrollTop / this.ITEM_H);
  },

  _highlightSelected(col) {
    const idx = this._idx(col);
    col.querySelectorAll('.picker-item').forEach((item, i) => {
      item.classList.toggle('selected', i === idx);
    });
  },

  _updateHidden() {
    const h = this._idx(el('picker-hours'));
    const m = this._idx(el('picker-minutes'));
    const total = h * 60 + m;
    el('cardio-duration').value = total > 0 ? total : '';
  },

  setFromMinutes(totalMin) {
    totalMin = totalMin || 0;
    const h = Math.min(Math.floor(totalMin / 60), 23);
    const m = totalMin % 60;
    requestAnimationFrame(() => {
      el('picker-hours').scrollTop   = h * this.ITEM_H;
      el('picker-minutes').scrollTop = m * this.ITEM_H;
      this._updateHidden();
      this._highlightSelected(el('picker-hours'));
      this._highlightSelected(el('picker-minutes'));
    });
  },
};

// ===== PACE PICKER (MM:SS) =====
const PacePicker = {
  init() {
    el('pace-min').addEventListener('input', () => this._update());
    el('pace-sec').addEventListener('input', () => {
      const v = parseInt(el('pace-sec').value);
      if (!isNaN(v) && v > 59) el('pace-sec').value = 59;
      this._update();
    });
  },

  _update() {
    const min = parseInt(el('pace-min').value) || 0;
    const sec = parseInt(el('pace-sec').value) || 0;
    const total = min + sec / 60;
    el('cardio-pace').value = total > 0 ? parseFloat(total.toFixed(6)) : '';
  },

  setFromDecimal(val) {
    if (!val) {
      el('pace-min').value  = '';
      el('pace-sec').value  = '';
      el('cardio-pace').value = '';
      return;
    }
    const min = Math.floor(val);
    const sec = Math.round((val - min) * 60);
    el('pace-min').value  = min;
    el('pace-sec').value  = String(sec).padStart(2, '0');
    el('cardio-pace').value = val;
  },
};

// ===== CARDIO MODULE =====
const Cardio = {
  render() {
    const entries = DB.getCardioEntries().slice().sort((a,b) => b.date.localeCompare(a.date));
    const wrap = el('cardio-list');
    wrap.innerHTML = '';
    if (entries.length === 0) {
      wrap.innerHTML = '<p class="empty-state">Noch keine Cardio-Einheiten gespeichert.</p>';
      return;
    }
    entries.forEach(e => wrap.appendChild(this.buildCard(e)));
  },

  updateActivityFields() {
    const isFahrrad = el('cardio-activity').value === 'Fahrrad';
    el('pace-section').classList.toggle('hidden', isFahrrad);
    el('speed-section').classList.toggle('hidden', !isFahrrad);
  },

  showForm(entry = null) {
    State.editCardioId = entry ? entry.id : null;
    el('cardio-form-heading').textContent = entry ? 'Einheit bearbeiten' : 'Neue Einheit';
    el('cardio-activity').value  = entry ? entry.activity : 'Joggen';
    el('cardio-date').value      = entry ? entry.date     : today();
    DurationPicker.setFromMinutes(entry?.duration ?? 0);
    el('cardio-distance').value  = entry?.distance  != null ? entry.distance  : '';
    PacePicker.setFromDecimal(entry?.pace ?? null);
    el('cardio-speed').value     = entry?.speed     != null ? entry.speed     : '';
    el('cardio-heartrate').value = entry?.heartrate != null ? entry.heartrate : '';
    this.updateActivityFields();
    el('cardio-form-wrap').classList.remove('hidden');
    el('cardio-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  hideForm() {
    el('cardio-form-wrap').classList.add('hidden');
    State.editCardioId = null;
  },

  save() {
    const activity  = el('cardio-activity').value;
    const date      = el('cardio-date').value;
    if (!date) { el('cardio-date').focus(); return; }

    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const isFahrrad = activity === 'Fahrrad';
    const entry = {
      id:        State.editCardioId || uid(),
      activity,
      date,
      duration:  num(el('cardio-duration').value),
      distance:  num(el('cardio-distance').value),
      pace:      isFahrrad ? null : num(el('cardio-pace').value),
      speed:     isFahrrad ? num(el('cardio-speed').value) : null,
      heartrate: num(el('cardio-heartrate').value),
    };

    if (State.editCardioId) DB.updateCardioEntry(State.editCardioId, entry);
    else                    DB.addCardioEntry(entry);

    this.hideForm();
    this.render();
  },

  buildCard(entry) {
    const card = document.createElement('div');
    card.className = 'cardio-card';

    const parts = [];
    if (entry.distance != null) parts.push(`${entry.distance} km`);
    if (entry.duration != null) parts.push(`${entry.duration} min`);
    const summary = parts.join(' · ') || '—';

    const detail = (label, val, unit='') => val != null
      ? `<div class="cardio-detail-item"><label>${label}</label><span>${val}${unit ? ' '+unit : ''}</span></div>`
      : '';

    card.innerHTML = `
      <div class="cardio-header">
        <span class="cardio-activity-badge">${entry.activity}</span>
        <div class="cardio-header-info">
          <div class="cardio-header-date">${formatDate(entry.date)}</div>
          <div class="cardio-header-summary">${summary}</div>
        </div>
        <span class="chevron">›</span>
      </div>
      <div class="cardio-body">
        <div class="cardio-body-inner">
          <div class="cardio-detail-grid">
            ${detail('Dauer',    entry.duration,  'min')}
            ${detail('Distanz',  entry.distance,  'km')}
            ${entry.activity === 'Fahrrad'
              ? detail('Geschwindigkeit', entry.speed, 'km/h')
              : (entry.pace != null ? `<div class="cardio-detail-item"><label>Tempo</label><span>${paceToStr(entry.pace)}</span></div>` : '')}
            ${detail('Herzrate', entry.heartrate, 'bpm')}
          </div>
          <div class="cardio-actions">
            <button class="btn-sm btn-sm-muted btn-cardio-edit">Bearbeiten</button>
            <button class="btn-sm btn-sm-danger btn-cardio-delete">Löschen</button>
          </div>
        </div>
      </div>`;

    card.querySelector('.cardio-header').addEventListener('click', () => {
      card.classList.toggle('expanded');
    });
    card.querySelector('.btn-cardio-edit').addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('expanded');
      this.showForm(entry);
    });
    card.querySelector('.btn-cardio-delete').addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`${entry.activity} vom ${formatDate(entry.date)} löschen?`, () => {
        DB.deleteCardioEntry(entry.id);
        this.render();
      });
    });

    return card;
  },
};

// ===== BACKUP MODULE =====
const Backup = {
  _statusTimer: null,

  _showStatus(msg, type) {
    const el_ = el('backup-status');
    el_.textContent = msg;
    el_.className = `backup-status ${type}`;
    el_.classList.remove('hidden');
    clearTimeout(this._statusTimer);
    this._statusTimer = setTimeout(() => el_.classList.add('hidden'), 4000);
  },

  export() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      trainingSessions: DB.getSessions(),
      cardioEntries:    DB.getCardioEntries(),
      customExercises:  DB.getCustomExercises(),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `kali-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this._showStatus('Backup erfolgreich heruntergeladen.', 'success');
  },

  triggerImport() {
    el('input-import-file').value = '';
    el('input-import-file').click();
  },

  import(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        this._showStatus('Ungültige Datei – kein gültiges JSON.', 'error');
        return;
      }
      if (!Array.isArray(data.trainingSessions) ||
          !Array.isArray(data.cardioEntries) ||
          !Array.isArray(data.customExercises)) {
        this._showStatus('Ungültige Datei – falsche Struktur.', 'error');
        return;
      }
      showConfirm('Alle aktuellen Daten werden überschrieben. Fortfahren?', () => {
        DB.saveSessions(data.trainingSessions);
        DB.saveCardioEntries(data.cardioEntries);
        DB.saveCustomExercises(data.customExercises);
        window.location.reload();
      }, 'Importieren');
    };
    reader.onerror = () => this._showStatus('Datei konnte nicht gelesen werden.', 'error');
    reader.readAsText(file);
  },
};

// ===== SETTINGS / THEME =====
const Settings = {
  apply(theme) {
    document.documentElement.dataset.theme = theme;
    const isLight = theme === 'light';
    el('theme-toggle').checked = isLight;
    el('theme-sub-label').textContent = isLight ? 'Aktuell: Hell' : 'Aktuell: Dunkel';
    // Re-render charts with updated colors if visible
    if (Progress.chart)       Progress.update();
    if (Progress.volumeChart) Progress.renderVolumeChart();
  },

  toggle(isLight) {
    const theme = isLight ? 'light' : 'dark';
    localStorage.setItem('theme', theme);
    this.apply(theme);
  },

  init() {
    const saved = localStorage.getItem('theme') || 'dark';
    this.apply(saved);
    el('weekly-goal-input').value = localStorage.getItem('weeklyGoal') || '3';
  },
};

// ===== EVENT WIRING =====
function initEvents() {
  // Tab bar
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Training – idle
  el('btn-start-training').addEventListener('click', () => Training.start());

  // Training – active
  el('btn-add-set').addEventListener('click', () => Training.addSet());
  el('input-reps').addEventListener('keydown', e => { if (e.key === 'Enter') el('input-weight').focus(); });
  el('input-weight').addEventListener('keydown', e => { if (e.key === 'Enter') Training.addSet(); });
  el('btn-finish-exercise').addEventListener('click', () => Training.finishExercise());
  el('btn-add-exercise').addEventListener('click', () => Training.addAnotherExercise());
  el('btn-finish-training').addEventListener('click', () => Training.finishTraining());

  // Exercise picker
  el('exercise-search').addEventListener('input', e => ExercisePicker.renderList(e.target.value));
  el('btn-exercise-close').addEventListener('click', () => ExercisePicker.close());
  el('exercise-backdrop').addEventListener('click', () => ExercisePicker.close());

  // Session edit modal
  el('btn-session-edit-close').addEventListener('click', () => History.closeEditModal());
  el('session-edit-backdrop').addEventListener('click', () => History.closeEditModal());
  el('btn-session-edit-cancel').addEventListener('click', () => History.closeEditModal());
  el('btn-session-edit-save').addEventListener('click', () => History.saveEdit());

  // Confirm dialog
  el('btn-confirm-cancel').addEventListener('click', closeConfirm);
  el('confirm-backdrop').addEventListener('click', closeConfirm);

  // Progress
  el('progress-select').addEventListener('change', () => Progress.update());

  // Cardio
  el('btn-show-cardio-form').addEventListener('click', () => Cardio.showForm());
  el('btn-cardio-cancel').addEventListener('click', () => Cardio.hideForm());
  el('btn-cardio-save').addEventListener('click', () => Cardio.save());
  el('cardio-activity').addEventListener('change', () => Cardio.updateActivityFields());

  // Settings – theme toggle
  el('theme-toggle').addEventListener('change', e => Settings.toggle(e.target.checked));

  // Settings – weekly goal
  el('weekly-goal-input').addEventListener('change', e => {
    const v = Math.max(1, Math.min(14, parseInt(e.target.value) || 3));
    e.target.value = v;
    localStorage.setItem('weeklyGoal', v);
    Training.renderIdle();
  });

  // Backup
  el('btn-export').addEventListener('click', () => Backup.export());
  el('btn-import').addEventListener('click', () => Backup.triggerImport());
  el('input-import-file').addEventListener('change', e => Backup.import(e.target.files[0]));
}

// ===== SERVICE WORKER =====
function initSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
  Settings.init();
  DurationPicker.init();
  PacePicker.init();
  initEvents();
  initSW();
  Training.render();
  History.render();
  Cardio.render();
  Progress.render();
});
