// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://bskyxhsglprkqbjcjfad.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pUk6zr9RYrA0rlxaeN6ZfQ_4MBzbY9P';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── EXERCISE LIBRARY ─────────────────────────────────────────────────────────
const EXERCISES = {
  'Chest':          ['Barbell Bench Press','Incline Barbell Bench Press','Decline Barbell Bench Press','Dumbbell Bench Press','Incline Dumbbell Bench Press','Push-Up','Dips'],
  'Back':           ['Deadlift','Barbell Row','Pendlay Row','Pull-Up','Chin-Up','T-Bar Row','Seated Cable Row','Lat Pulldown'],
  'Legs':           ['Barbell Back Squat','Front Squat','Romanian Deadlift','Bulgarian Split Squat','Leg Press','Hack Squat','Good Morning','Sumo Deadlift'],
  'Shoulders':      ['Overhead Press','Push Press','Seated Barbell Press','Dumbbell Shoulder Press','Arnold Press','Upright Row'],
  'Arms':           ['Barbell Curl','EZ-Bar Curl','Hammer Curl','Close-Grip Bench Press','Skull Crushers','Tricep Dips','Diamond Push-Up'],
  'Core & Olympic': ['Plank','Hanging Leg Raise','Ab Wheel Rollout','Power Clean','Hang Clean','Snatch','Clean and Jerk'],
};
const ALL_EXERCISES = Object.values(EXERCISES).flat();

// ─── STATE ────────────────────────────────────────────────────────────────────
let entries       = [];
let plans         = {};   // keyed by 'YYYY-MM-DD'
let authMode      = 'login';
let viewMonth     = new Date();
let planMonth     = new Date();
let setRows       = [];
let pickerIndex   = -1;
let pickerVisible = false;
let selectedDate  = null; // 'YYYY-MM-DD' currently selected in plan cal
let aiMuscle      = null; // selected muscle group for AI

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  const hash   = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));
  if (params.get('type') === 'recovery') { showScreen('reset'); hideLoading(); return; }

  const { data: { session } } = await db.auth.getSession();
  if (session) await enterApp(); else showScreen('auth');
  hideLoading();

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      if (document.getElementById('reset-screen').style.display !== 'none') return;
      await enterApp();
    } else if (event === 'SIGNED_OUT') {
      entries = []; plans = {};
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
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
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
  else { showToast('Password updated!'); history.replaceState(null, '', window.location.pathname); setTimeout(() => enterApp(), 1200); }
}

async function signOut() { await db.auth.signOut(); }

// ─── APP ENTRY ────────────────────────────────────────────────────────────────
async function enterApp() {
  viewMonth = new Date(); planMonth = new Date();
  showScreen('app');
  resetForm();
  await Promise.all([loadEntries(), loadPlans()]);
}

// ─── DATA: WORKOUTS ───────────────────────────────────────────────────────────
async function loadEntries() {
  const { data, error } = await db.from('workouts').select('*').order('created_at', { ascending: false });
  if (error) { showToast('Error loading workouts'); return; }
  entries = data || [];
  renderHistory(); updateStats();
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
      reps: row.querySelector('.set-reps').value.trim(),
      weight: row.querySelector('.set-weight').value.trim(),
    }));
    if (rows.length === 0) { showToast('Add at least one set!'); return; }
    record.sets_data = rows; record.sets = rows.length;
  } else {
    const sets = document.getElementById('input-sets').value;
    const reps = document.getElementById('input-reps').value.trim();
    const weight = document.getElementById('input-weight').value.trim();
    record.sets = sets ? parseInt(sets) : null;
    record.reps = reps ? parseInt(reps) : null;
    record.weight = weight || null;
  }

  btn.disabled = true; btn.textContent = 'SAVING...';
  const { data: { user } } = await db.auth.getUser();
  const { data, error } = await db.from('workouts').insert({ user_id: user.id, name, notes: notes || null, ...record }).select().single();
  btn.disabled = false; btn.textContent = '+ ADD TO LOG';
  if (error) { showToast('Error saving workout'); console.error(error); return; }

  entries.unshift(data);
  viewMonth = new Date();
  renderHistory(); updateStats(); renderCalendar();
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
  renderHistory(); updateStats(); renderCalendar();
  showToast('Entry removed');
}

// ─── DATA: PLANS ──────────────────────────────────────────────────────────────
async function loadPlans() {
  const { data, error } = await db.from('plans').select('*');
  if (error) { showToast('Error loading plans'); return; }
  plans = {};
  (data || []).forEach(p => { plans[p.date] = p; });
  renderCalendar();
  if (selectedDate) renderDayDetail(selectedDate);
}

async function savePlan(dateStr, exercises) {
  const { data: { user } } = await db.auth.getUser();
  const existing = plans[dateStr];

  if (existing) {
    const { data, error } = await db.from('plans').update({ exercises }).eq('id', existing.id).select().single();
    if (error) { showToast('Error saving plan'); return; }
    plans[dateStr] = data;
  } else {
    const { data, error } = await db.from('plans').insert({ user_id: user.id, date: dateStr, exercises }).select().single();
    if (error) { showToast('Error saving plan'); return; }
    plans[dateStr] = data;
  }
  renderCalendar();
  renderDayDetail(dateStr);
}

async function addPlanExercise(dateStr) {
  const input = document.getElementById('plan-ex-input');
  const name  = input?.value?.trim();
  if (!name) { showToast('Enter an exercise name'); return; }

  const current = plans[dateStr]?.exercises || [];
  await savePlan(dateStr, [...current, name]);
  input.value = '';
  showToast(`${name} added to plan`);
}

async function removePlanExercise(dateStr, index) {
  const current = [...(plans[dateStr]?.exercises || [])];
  current.splice(index, 1);
  if (current.length === 0) {
    await db.from('plans').delete().eq('id', plans[dateStr].id);
    delete plans[dateStr];
    renderCalendar();
    renderDayDetail(dateStr);
  } else {
    await savePlan(dateStr, current);
  }
}

// ─── AI SUGGESTIONS ───────────────────────────────────────────────────────────
async function suggestWorkout(dateStr, muscleGroup) {
  const loadingEl = document.getElementById('ai-loading');
  const btn       = document.getElementById('btn-ai-suggest');
  if (loadingEl) loadingEl.style.display = 'flex';
  if (btn) btn.disabled = true;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a strength training coach. Suggest a workout focused on ${muscleGroup} using only big compound barbell/dumbbell movements. Return ONLY a JSON array of exercise name strings, no explanation, no markdown, no backticks. Example: ["Barbell Bench Press","Incline Dumbbell Bench Press","Dips"]. Give 4-6 exercises.`
        }]
      })
    });

    const data    = await response.json();
    const text    = data.content?.map(c => c.text || '').join('') || '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const exercises = JSON.parse(cleaned);

    if (!Array.isArray(exercises) || exercises.length === 0) throw new Error('Bad response');

    const current = plans[dateStr]?.exercises || [];
    const merged  = [...new Set([...current, ...exercises])];
    await savePlan(dateStr, merged);
    showToast(`${exercises.length} exercises suggested!`);
  } catch (err) {
    console.error(err);
    showToast('AI suggestion failed — try again');
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (btn) btn.disabled = false;
    aiMuscle = null;
    document.querySelectorAll('.muscle-chip').forEach(c => c.classList.remove('active'));
  }
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
function shiftPlanMonth(delta) {
  planMonth = new Date(planMonth.getFullYear(), planMonth.getMonth() + delta, 1);
  renderCalendar();
}

function renderCalendar() {
  const label = planMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const el    = document.getElementById('plan-cal-month');
  if (el) el.textContent = label.toUpperCase();

  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const year  = planMonth.getFullYear();
  const month = planMonth.getMonth();
  const today = toDateStr(new Date());

  const firstDay  = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // Empty cells before month starts
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const isSel   = dateStr === selectedDate;

    const dayEntries = entries.filter(e => toDateStr(new Date(e.created_at)) === dateStr);
    const dayPlan    = plans[dateStr];

    let dots = '';
    if (dayEntries.length > 0) dots += `<span class="cal-dot logged" title="${dayEntries.length} logged"></span>`;
    if (dayPlan?.exercises?.length > 0) dots += `<span class="cal-dot planned" title="${dayPlan.exercises.length} planned"></span>`;

    let preview = '';
    if (dayPlan?.exercises?.length > 0) {
      preview = `<div class="cal-day-preview">${dayPlan.exercises.slice(0,2).map(e => esc(e)).join(', ')}</div>`;
    } else if (dayEntries.length > 0) {
      preview = `<div class="cal-day-preview">${[...new Set(dayEntries.map(e => e.name))].slice(0,2).map(e => esc(e)).join(', ')}</div>`;
    }

    html += `
      <div class="cal-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}" onclick="selectCalDay('${dateStr}')">
        <div class="cal-day-num">${d}</div>
        <div class="cal-day-dots">${dots}</div>
        ${preview}
      </div>`;
  }

  grid.innerHTML = html;
}

function selectCalDay(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  renderDayDetail(dateStr);
}

function renderDayDetail(dateStr) {
  const titleEl = document.getElementById('day-detail-title');
  const bodyEl  = document.getElementById('day-detail-body');
  if (!titleEl || !bodyEl) return;

  const d = new Date(dateStr + 'T12:00:00');
  titleEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

  const dayPlan    = plans[dateStr];
  const dayEntries = entries.filter(e => toDateStr(new Date(e.created_at)) === dateStr);
  const planned    = dayPlan?.exercises || [];

  let html = '';

  // ── PLAN SECTION ──
  html += `<div class="day-section">
    <div class="day-section-header">
      <span>Planned</span>
      ${planned.length > 0 ? `<button class="log-from-plan-btn" onclick="loadPlanIntoLog('${dateStr}')">▶ Start This Workout</button>` : ''}
    </div>`;

  if (planned.length > 0) {
    html += planned.map((ex, i) => `
      <div class="day-exercise-item">
        <span class="ex-name">${esc(ex)}</span>
        <button class="btn-remove-plan" onclick="removePlanExercise('${dateStr}', ${i})">✕</button>
      </div>`).join('');
  }

  // Add exercise form
  html += `
    <div class="day-add-form">
      <div class="day-add-row">
        <input type="text" id="plan-ex-input" placeholder="Add exercise..." list="plan-ex-list"
          onkeydown="if(event.key==='Enter') addPlanExercise('${dateStr}')">
        <datalist id="plan-ex-list">
          ${ALL_EXERCISES.map(n => `<option value="${esc(n)}">`).join('')}
        </datalist>
        <button class="btn-plan-add" onclick="addPlanExercise('${dateStr}')">Add</button>
      </div>
      <button class="btn-ai-suggest" id="btn-ai-suggest" onclick="toggleAiPanel('${dateStr}')">
        ✦ Suggest with AI
      </button>
      <div id="ai-panel" style="display:none">
        <div class="ai-muscle-select" id="ai-muscle-select">
          ${Object.keys(EXERCISES).map(g => `
            <button class="muscle-chip" onclick="selectMuscle('${g}', '${dateStr}')">${g}</button>
          `).join('')}
        </div>
        <div class="ai-loading" id="ai-loading" style="display:none">
          <div class="ai-spinner"></div> Asking Claude...
        </div>
      </div>
    </div>
  </div>`;

  // ── LOGGED SECTION ──
  html += `<div class="day-section">
    <div class="day-section-header"><span>Logged</span></div>`;

  if (dayEntries.length === 0) {
    html += `<div style="padding:16px 20px; font-size:13px; color:var(--text-muted); font-style:italic;">Nothing logged yet.</div>`;
  } else {
    html += dayEntries.map(e => `
      <div class="day-logged-item">
        <div class="log-name">${esc(e.name)}</div>
        <div>${renderInlineEntryMeta(e)}</div>
      </div>`).join('');
  }
  html += `</div>`;

  bodyEl.innerHTML = html;
}

function renderInlineEntryMeta(e) {
  if (e.sets_data?.length > 0) {
    return e.sets_data.map((s, i) =>
      `<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted);margin-right:10px;">
        Set ${i+1}: ${s.reps || '—'} reps${s.weight ? ' @ ' + esc(s.weight) + ' lbs' : ''}
      </span>`
    ).join('');
  }
  const parts = [];
  if (e.sets)   parts.push(`${e.sets} sets`);
  if (e.reps)   parts.push(`${e.reps} reps`);
  if (e.weight) parts.push(`${esc(e.weight)} lbs`);
  return `<span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text-muted)">${parts.join(' · ') || '—'}</span>`;
}

function toggleAiPanel(dateStr) {
  const panel = document.getElementById('ai-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function selectMuscle(group, dateStr) {
  aiMuscle = group;
  document.querySelectorAll('.muscle-chip').forEach(c => c.classList.toggle('active', c.textContent === group));
  suggestWorkout(dateStr, group);
}

function loadPlanIntoLog(dateStr) {
  const planned = plans[dateStr]?.exercises || [];
  if (planned.length === 0) return;

  // Switch to log tab and pre-fill first exercise
  switchAppTab('log');
  document.getElementById('input-name').value = planned[0];
  document.getElementById('input-name').focus();
  showToast(`Loaded ${planned.length} exercises — log them one by one`);
}

// ─── APP TABS ─────────────────────────────────────────────────────────────────
function switchAppTab(tab) {
  document.getElementById('tab-log').style.display  = tab === 'log'  ? '' : 'none';
  document.getElementById('tab-plan').style.display = tab === 'plan' ? '' : 'none';
  document.querySelectorAll('.nav-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'log') || (i === 1 && tab === 'plan'));
  });
  if (tab === 'plan') { renderCalendar(); if (selectedDate) renderDayDetail(selectedDate); }
}

// ─── EXERCISE PICKER ──────────────────────────────────────────────────────────
function filterExercises(query) {
  const picker = document.getElementById('exercise-picker');
  pickerIndex  = -1;
  query = query.trim().toLowerCase();
  const usedNames = [...new Set(entries.map(e => e.name))].filter(n => !ALL_EXERCISES.includes(n));

  if (!query) {
    let html = '';
    for (const [group, exs] of Object.entries(EXERCISES)) {
      html += `<div class="picker-group-label">${group}</div>`;
      html += exs.map(ex => `<div class="picker-item" onmousedown="selectExercise('${esc(ex)}')">${ex}</div>`).join('');
    }
    if (usedNames.length > 0) {
      html += `<div class="picker-group-label">Recent Custom</div>`;
      html += usedNames.map(n => `<div class="picker-item" onmousedown="selectExercise('${esc(n)}')">${esc(n)}</div>`).join('');
    }
    picker.innerHTML = html;
  } else {
    const allNames = [...ALL_EXERCISES, ...usedNames];
    const matches  = allNames.filter(n => n.toLowerCase().includes(query));
    if (matches.length === 0) {
      picker.innerHTML = `<div class="picker-empty">No match — just type to use "${esc(query)}"</div>`;
    } else {
      picker.innerHTML = matches.map(ex => {
        const hi = ex.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
        return `<div class="picker-item" onmousedown="selectExercise('${esc(ex)}')">${hi}</div>`;
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

function showPicker() { filterExercises(document.getElementById('input-name').value); }
function hidePicker() {
  setTimeout(() => {
    document.getElementById('exercise-picker').classList.remove('open');
    pickerVisible = false; pickerIndex = -1;
  }, 150);
}

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

function addSetRow(r = '', w = '') { setRows.push({ reps: r, weight: w }); renderSetBuilder(); }
function removeSetRow(i) { setRows.splice(i, 1); renderSetBuilder(); }

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
          value="${esc(row.reps)}" oninput="setRows[${i}].reps=this.value">
        <input class="set-weight" type="text" placeholder="135"
          value="${esc(row.weight)}" oninput="setRows[${i}].weight=this.value">
        <button class="btn-remove-set" onclick="removeSetRow(${i})">✕</button>
      </div>`).join('')}`;
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
  const picker = document.getElementById('exercise-picker');
  if (picker) picker.classList.remove('open');
  pickerVisible = false;
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
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

function renderHistory() {
  updateCalLabel();
  const container = document.getElementById('history');
  const query     = document.getElementById('search')?.value?.toLowerCase() || '';
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd   = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0, 23, 59, 59);

  let filtered = entries.filter(e => { const d = new Date(e.created_at); return d >= monthStart && d <= monthEnd; });
  if (query) filtered = filtered.filter(e => e.name.toLowerCase().includes(query));

  if (filtered.length === 0) {
    const monthName = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    container.innerHTML = `<div class="empty"><span class="empty-icon">📅</span>${query ? 'No exercises match your search.' : `No workouts logged in ${monthName}.`}</div>`;
    return;
  }

  const groups = {};
  filtered.forEach(e => {
    const key = new Date(e.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
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
            <button class="btn-delete" onclick="deleteEntry('${e.id}')">✕</button>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function renderEntryMeta(e) {
  if (e.sets_data?.length > 0) {
    return `<div class="sets-table">
      <div class="sets-table-header"><span>#</span><span>Reps</span><span>Weight</span></div>
      ${e.sets_data.map((s, i) => `
        <div class="set-row-display">
          <span class="set-val">${i+1}</span>
          <span class="set-val">${s.reps||'—'}</span>
          <span class="set-val">${s.weight ? esc(s.weight)+' lbs' : '—'}</span>
        </div>`).join('')}
    </div>`;
  }
  return `<div class="entry-meta">
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

// ─── MODAL ────────────────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  document.getElementById('day-modal').style.display     = 'none';
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

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
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Keyboard handler
document.addEventListener('keydown', e => {
  if (pickerVisible) {
    const items = document.querySelectorAll('.picker-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); pickerIndex = Math.min(pickerIndex+1, items.length-1); items.forEach((el,i) => el.classList.toggle('highlighted', i===pickerIndex)); items[pickerIndex]?.scrollIntoView({block:'nearest'}); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pickerIndex = Math.max(pickerIndex-1, 0); items.forEach((el,i) => el.classList.toggle('highlighted', i===pickerIndex)); items[pickerIndex]?.scrollIntoView({block:'nearest'}); }
    else if (e.key === 'Enter' && pickerIndex >= 0) { e.preventDefault(); selectExercise(items[pickerIndex].textContent.trim()); }
    else if (e.key === 'Escape') hidePicker();
    return;
  }
  if (e.key !== 'Enter') return;
  if (document.getElementById('app-screen').style.display !== 'none') {
    if (e.target.id !== 'input-notes' && e.target.tagName !== 'TEXTAREA' && e.target.id !== 'plan-ex-input') addEntry();
  }
  if (document.getElementById('auth-screen').style.display !== 'none' && e.target.tagName === 'INPUT') handleAuth();
  if (document.getElementById('reset-screen').style.display !== 'none' && e.target.tagName === 'INPUT') handleSetNewPassword();
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
init();
