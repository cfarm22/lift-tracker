// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bskyxhsglprkqbjcjfad.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pUk6zr9RYrA0rlxaeN6ZfQ_4MBzbY9P';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── EXERCISE LIBRARY ─────────────────────────────────────────────────────────
const EXERCISES = {
  'Chest': [
    'Barbell Bench Press',
    'Incline Barbell Bench Press',
    'Decline Barbell Bench Press',
    'Dumbbell Bench Press',
    'Incline Dumbbell Bench Press',
    'Push-Up',
    'Dips',
  ],
  'Back': [
    'Deadlift',
    'Barbell Row',
    'Pendlay Row',
    'Pull-Up',
    'Chin-Up',
    'T-Bar Row',
    'Seated Cable Row',
    'Lat Pulldown',
  ],
  'Legs': [
    'Barbell Back Squat',
    'Front Squat',
    'Romanian Deadlift',
    'Bulgarian Split Squat',
    'Leg Press',
    'Hack Squat',
    'Good Morning',
    'Sumo Deadlift',
  ],
  'Shoulders': [
    'Overhead Press',
    'Push Press',
    'Seated Barbell Press',
    'Dumbbell Shoulder Press',
    'Arnold Press',
    'Upright Row',
  ],
  'Arms': [
    'Barbell Curl',
    'EZ-Bar Curl',
    'Hammer Curl',
    'Close-Grip Bench Press',
    'Skull Crushers',
    'Tricep Dips',
    'Diamond Push-Up',
  ],
  'Core & Olympic': [
    'Plank',
    'Hanging Leg Raise',
    'Ab Wheel Rollout',
    'Power Clean',
    'Hang Clean',
    'Snatch',
    'Clean and Jerk',
  ],
};

// Flat list for search
const ALL_EXERCISES = Object.values(EXERCISES).flat();

// ─── STATE ────────────────────────────────────────────────────────────────────
let entries        = [];
let authMode       = 'login';
let viewMonth      = new Date();
let setRows        = [];
let pickerIndex    = -1; // keyboard nav index in picker
let pickerVisible  = false;

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  const hash   = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));
  if (params.get('type') === 'recovery') {
    showScreen('reset');
    hideLoading();
    return;
  }

  const { data: { session } } = await db.auth.getSession();
  if (session) await enterApp();
  else showScreen('auth');
  hideLoading();

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      if (document.getElementById('reset-screen').style.display !== 'none') return;
      await enterApp();
    } else if (event === 'SIGNED_OUT') {
      entries = [];
      showScreen('auth');
    }
  });
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function switchTab(mode) {
  authMode = mode;
  const isForgot = mode === 'forgot';

  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && mode === 'login') || (i === 1 && mode === 'signup'));
  });
  document.getElementById('password-field').style.display = isForgot ? 'none' : '';
  document.getElementById('confirm-field').style.display  = mode === 'signup' ? '' : 'none';

  const labels = { login: 'Sign In', signup: 'Create Account', forgot: 'Send Reset Link' };
  document.getElementById('auth-submit').textContent = labels[mode];
  document.getElementById('forgot-btn').textContent  = isForgot ? '← Back to sign in' : 'Forgot password?';
  document.getElementById('forgot-btn').onclick      = isForgot ? () => switchTab('login') : () => switchTab('forgot');
  document.getElementById('auth-error').textContent  = '';
  document.getElementById('auth-error').style.color  = 'var(--danger)';
}

async function handleAuth() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm  = document.getElementById('auth-confirm').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit');

  errEl.textContent = ''; errEl.style.color = 'var(--danger)';
  if (!email) { errEl.textContent = 'Please enter your email.'; return; }

  if (authMode === 'forgot') {
    btn.disabled = true; btn.textContent = '...';
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    btn.disabled = false; btn.textContent = 'Send Reset Link';
    if (error) errEl.textContent = error.message;
    else { errEl.style.color = 'var(--accent)'; errEl.textContent = 'Reset link sent — check your email!'; }
    return;
  }

  if (!password) { errEl.textContent = 'Please enter your password.'; return; }
  if (authMode === 'signup') {
    if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  }

  btn.disabled = true; btn.textContent = '...';

  if (authMode === 'login') {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) { errEl.textContent = error.message; btn.disabled = false; btn.textContent = 'Sign In'; }
  } else {
    const { error } = await db.auth.signUp({ email, password });
    if (error) { errEl.textContent = error.message; btn.disabled = false; btn.textContent = 'Create Account'; }
    else { errEl.style.color = 'var(--accent)'; errEl.textContent = 'Check your email to confirm!'; btn.disabled = false; btn.textContent = 'Create Account'; }
  }
}

async function handleSetNewPassword() {
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;
  const errEl    = document.getElementById('reset-error');
  const btn      = document.getElementById('reset-submit');

  errEl.textContent = ''; errEl.style.color = 'var(--danger)';
  if (!password) { errEl.textContent = 'Please enter a new password.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }

  btn.disabled = true; btn.textContent = 'SAVING...';
  const { error } = await db.auth.updateUser({ password });
  if (error) { errEl.textContent = error.message; btn.disabled = false; btn.textContent = 'Set New Password'; }
  else {
    showToast('Password updated! Signing you in...');
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => enterApp(), 1200);
  }
}

async function signOut() { await db.auth.signOut(); }

// ─── APP ENTRY ────────────────────────────────────────────────────────────────
async function enterApp() {
  viewMonth = new Date();
  showScreen('app');
  resetForm();
  await loadEntries();
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
async function loadEntries() {
  const { data, error } = await db
    .from('workouts').select('*').order('created_at', { ascending: false });
  if (error) { showToast('Error loading workouts'); return; }
  entries = data || [];
  renderHistory();
  updateStats();
}

async function addEntry() {
  const name    = document.getElementById('input-name').value.trim();
  const notes   = document.getElementById('input-notes').value.trim();
  const btn     = document.getElementById('btn-add');
  const isPerSet = document.getElementById('per-set-checkbox').checked;

  if (!name) { document.getElementById('input-name').focus(); showToast('Enter an exercise name!'); return; }

  let record = { sets: null, reps: null, weight: null, sets_data: null };

  if (isPerSet) {
    const rows = [...document.querySelectorAll('.set-row')].map(row => ({
      reps:   row.querySelector('.set-reps').value.trim(),
      weight: row.querySelector('.set-weight').value.trim(),
    }));
    if (rows.length === 0) { showToast('Add at least one set!'); return; }
    record.sets_data = rows;
    record.sets = rows.length;
  } else {
    const sets   = document.getElementById('input-sets').value;
    const reps   = document.getElementById('input-reps').value.trim();
    const weight = document.getElementById('input-weight').value.trim();
    record.sets   = sets   ? parseInt(sets)  : null;
    record.reps   = reps   ? parseInt(reps)  : null;
    record.weight = weight || null;
  }

  btn.disabled = true; btn.textContent = 'SAVING...';
  const { data: { user } } = await db.auth.getUser();

  const { data, error } = await db
    .from('workouts')
    .insert({ user_id: user.id, name, notes: notes || null, ...record })
    .select().single();

  btn.disabled = false; btn.textContent = '+ ADD TO LOG';
  if (error) { showToast('Error saving workout'); console.error(error); return; }

  entries.unshift(data);
  viewMonth = new Date();
  renderHistory();
  updateStats();
  resetForm();
  showToast(`${name} logged ✓`);

  setTimeout(() => {
    const first = document.querySelector('.entry');
    if (first) { first.classList.add('flash'); setTimeout(() => first.classList.remove('flash'), 1500); }
  }, 50);
}

async function deleteEntry(id) {
  const { error } = await db.from('workouts').delete().eq('id', id);
  if (error) { showToast('Error deleting entry'); return; }
  entries = entries.filter(e => e.id !== id);
  renderHistory(); updateStats();
  showToast('Entry removed');
}

// ─── EXERCISE PICKER ──────────────────────────────────────────────────────────
function filterExercises(query) {
  const picker = document.getElementById('exercise-picker');
  pickerIndex = -1;
  query = query.trim().toLowerCase();

  // Also include previously used custom exercises from history
  const usedNames = [...new Set(entries.map(e => e.name))].filter(
    n => !ALL_EXERCISES.includes(n)
  );

  if (!query) {
    // Show full grouped library
    let html = '';
    for (const [group, exercises] of Object.entries(EXERCISES)) {
      html += `<div class="picker-group-label">${group}</div>`;
      html += exercises.map(ex => `
        <div class="picker-item" onmousedown="selectExercise('${esc(ex)}')">${ex}</div>
      `).join('');
    }
    if (usedNames.length > 0) {
      html += `<div class="picker-group-label">Recent Custom</div>`;
      html += usedNames.map(n => `
        <div class="picker-item" onmousedown="selectExercise('${esc(n)}')">${esc(n)}</div>
      `).join('');
    }
    picker.innerHTML = html;
  } else {
    // Fuzzy filter across all exercises + custom
    const allNames = [...ALL_EXERCISES, ...usedNames];
    const matches  = allNames.filter(n => n.toLowerCase().includes(query));

    if (matches.length === 0) {
      picker.innerHTML = `<div class="picker-empty">No match — just type to use "${esc(query)}"</div>`;
    } else {
      picker.innerHTML = matches.map(ex => {
        const highlighted = ex.replace(
          new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
          '<mark>$1</mark>'
        );
        return `<div class="picker-item" onmousedown="selectExercise('${esc(ex)}')">${highlighted}</div>`;
      }).join('');
    }
  }

  picker.classList.add('open');
  pickerVisible = true;
}

function selectExercise(name) {
  document.getElementById('input-name').value = name;
  hidePicker();
  document.getElementById('input-sets').focus();
}

function showPicker() {
  filterExercises(document.getElementById('input-name').value);
}

function hidePicker() {
  setTimeout(() => {
    document.getElementById('exercise-picker').classList.remove('open');
    pickerVisible = false;
    pickerIndex = -1;
  }, 150);
}

// Keyboard navigation in picker
document.addEventListener('keydown', e => {
  if (!pickerVisible) return;
  const items = document.querySelectorAll('.picker-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    pickerIndex = Math.min(pickerIndex + 1, items.length - 1);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === pickerIndex));
    items[pickerIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    pickerIndex = Math.max(pickerIndex - 1, 0);
    items.forEach((el, i) => el.classList.toggle('highlighted', i === pickerIndex));
    items[pickerIndex]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && pickerIndex >= 0) {
    e.preventDefault();
    selectExercise(items[pickerIndex].textContent.trim());
  } else if (e.key === 'Escape') {
    hidePicker();
  }
});

// ─── SET BUILDER ──────────────────────────────────────────────────────────────
function togglePerSet() {
  const isPerSet = document.getElementById('per-set-checkbox').checked;
  document.getElementById('simple-mode').style.display  = isPerSet ? 'none' : '';
  document.getElementById('per-set-mode').style.display = isPerSet ? '' : 'none';

  if (isPerSet && document.querySelectorAll('.set-row').length === 0) {
    const sets   = parseInt(document.getElementById('input-sets').value) || 3;
    const reps   = document.getElementById('input-reps').value.trim();
    const weight = document.getElementById('input-weight').value.trim();
    setRows = [];
    for (let i = 0; i < sets; i++) setRows.push({ reps, weight });
    renderSetBuilder();
  }
}

function addSetRow(defaultReps = '', defaultWeight = '') {
  setRows.push({ reps: defaultReps, weight: defaultWeight });
  renderSetBuilder();
}

function removeSetRow(index) {
  setRows.splice(index, 1);
  renderSetBuilder();
}

function renderSetBuilder() {
  const builder = document.getElementById('set-builder');
  if (setRows.length === 0) { builder.innerHTML = ''; return; }

  builder.innerHTML = `
    <div class="set-builder-header">
      <span>#</span><span>Reps</span><span>Weight (lbs)</span><span></span>
    </div>
    ${setRows.map((row, i) => `
      <div class="set-row">
        <div class="set-num">${i + 1}</div>
        <input class="set-reps" type="number" placeholder="10" min="1" max="999"
          value="${esc(row.reps)}" oninput="setRows[${i}].reps = this.value">
        <input class="set-weight" type="text" placeholder="135"
          value="${esc(row.weight)}" oninput="setRows[${i}].weight = this.value">
        <button class="btn-remove-set" onclick="removeSetRow(${i})" title="Remove">✕</button>
      </div>
    `).join('')}
  `;
}

function resetForm() {
  document.getElementById('input-name').value   = '';
  document.getElementById('input-sets').value   = '3';
  document.getElementById('input-reps').value   = '';
  document.getElementById('input-weight').value = '';
  document.getElementById('input-notes').value  = '';
  document.getElementById('per-set-checkbox').checked = false;
  document.getElementById('simple-mode').style.display  = '';
  document.getElementById('per-set-mode').style.display = 'none';
  setRows = [];
  document.getElementById('set-builder').innerHTML = '';
  document.getElementById('exercise-picker').classList.remove('open');
  pickerVisible = false;
}

// ─── MONTH NAV ────────────────────────────────────────────────────────────────
function shiftMonth(delta) {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1);
  renderHistory();
}

function updateCalLabel() {
  const label = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('cal-month').textContent = label.toUpperCase();
  const now = new Date();
  const isCurrent = viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();
  document.querySelectorAll('.cal-arrow')[1].disabled = isCurrent;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderHistory() {
  updateCalLabel();
  const container = document.getElementById('history');
  const query     = document.getElementById('search')?.value?.toLowerCase() || '';

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd   = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0, 23, 59, 59);

  let filtered = entries.filter(e => {
    const d = new Date(e.created_at);
    return d >= monthStart && d <= monthEnd;
  });
  if (query) filtered = filtered.filter(e => e.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    const monthName = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    container.innerHTML = `
      <div class="empty">
        <span class="empty-icon">📅</span>
        ${query ? 'No exercises match your search.' : `No workouts logged in ${monthName}.`}
      </div>`;
    return;
  }

  const groups = {};
  filtered.forEach(e => {
    const d   = new Date(e.created_at);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  container.innerHTML = Object.entries(groups).map(([date, items], gi) => `
    <div class="day-group">
      <div class="day-label" onclick="toggleDay(this)">
        <span>${esc(date)}</span>
        <span class="day-count">${items.length} exercise${items.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="day-entries ${gi === 0 ? 'open' : ''}">
        ${items.map(e => `
          <div class="entry" data-id="${e.id}">
            <div>
              <div class="entry-name">${esc(e.name)}</div>
              ${renderEntryMeta(e)}
              ${e.notes ? `<div class="entry-note">${esc(e.notes)}</div>` : ''}
            </div>
            <button class="btn-delete" onclick="deleteEntry('${e.id}')" title="Delete">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderEntryMeta(e) {
  if (e.sets_data && Array.isArray(e.sets_data) && e.sets_data.length > 0) {
    return `
      <div class="sets-table">
        <div class="sets-table-header"><span>#</span><span>Reps</span><span>Weight</span></div>
        ${e.sets_data.map((s, i) => `
          <div class="set-row-display">
            <span class="set-val">${i + 1}</span>
            <span class="set-val">${s.reps || '—'}</span>
            <span class="set-val">${s.weight ? esc(s.weight) + ' lbs' : '—'}</span>
          </div>
        `).join('')}
      </div>`;
  }
  return `
    <div class="entry-meta">
      ${e.sets   ? `<span class="meta-chip"><span class="chip-label">Sets</span> ${e.sets}</span>` : ''}
      ${e.reps   ? `<span class="meta-chip"><span class="chip-label">Reps</span> ${e.reps}</span>` : ''}
      ${e.weight ? `<span class="meta-chip"><span class="chip-label">Weight</span> ${esc(e.weight)} lbs</span>` : ''}
    </div>`;
}

function toggleDay(el) { el.nextElementSibling.classList.toggle('open'); }

function updateStats() {
  document.getElementById('stat-total').textContent = entries.length;
  const days = new Set(entries.map(e => new Date(e.created_at).toDateString())).size;
  document.getElementById('stat-days').textContent = days;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function showScreen(name) {
  document.getElementById('auth-screen').style.display  = name === 'auth'  ? '' : 'none';
  document.getElementById('reset-screen').style.display = name === 'reset' ? '' : 'none';
  document.getElementById('app-screen').style.display   = name === 'app'   ? '' : 'none';
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
  setTimeout(() => document.getElementById('loading-overlay').remove(), 400);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Global Enter key handler for form submission
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (pickerVisible) return; // picker handles its own Enter
  if (document.getElementById('app-screen').style.display !== 'none') {
    if (e.target.id !== 'input-notes' && e.target.tagName !== 'TEXTAREA') addEntry();
  }
  if (document.getElementById('auth-screen').style.display !== 'none') {
    if (e.target.tagName === 'INPUT') handleAuth();
  }
  if (document.getElementById('reset-screen').style.display !== 'none') {
    if (e.target.tagName === 'INPUT') handleSetNewPassword();
  }
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
init();
