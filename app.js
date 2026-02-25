// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://bskyxhsglprkqbjcjfad.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_pUk6zr9RYrA0rlxaeN6ZfQ_4MBzbY9P';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ────────────────────────────────────────────────────────────────────
let entries   = [];
let authMode  = 'login'; // 'login' | 'signup' | 'forgot'
let viewMonth = new Date();

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  // Supabase puts #access_token=...&type=recovery in the URL after a reset link click
  const hash   = window.location.hash;
  const params = new URLSearchParams(hash.replace('#', '?'));
  const type   = params.get('type');

  if (type === 'recovery') {
    // User arrived via a password reset email — show the set-new-password screen
    showScreen('reset');
    hideLoading();
    return;
  }

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await enterApp();
  } else {
    showScreen('auth');
  }
  hideLoading();

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // Don't redirect if we're in the middle of a password reset
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

  // Tab highlight
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && mode === 'login') || (i === 1 && mode === 'signup'));
  });

  // Show/hide fields
  document.getElementById('password-field').style.display = isForgot ? 'none' : '';
  document.getElementById('confirm-field').style.display  = mode === 'signup' ? '' : 'none';

  // Button label
  const labels = { login: 'Sign In', signup: 'Create Account', forgot: 'Send Reset Link' };
  document.getElementById('auth-submit').textContent = labels[mode];

  // Forgot link label
  document.getElementById('forgot-btn').textContent = isForgot ? '← Back to sign in' : 'Forgot password?';
  document.getElementById('forgot-btn').onclick = isForgot ? () => switchTab('login') : () => switchTab('forgot');

  // Clear errors
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-error').style.color = 'var(--danger)';
}

async function handleAuth() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm  = document.getElementById('auth-confirm').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit');

  errEl.textContent = '';
  errEl.style.color = 'var(--danger)';

  if (!email) { errEl.textContent = 'Please enter your email.'; return; }

  // ── Forgot password ──
  if (authMode === 'forgot') {
    btn.disabled = true;
    btn.textContent = '...';
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname,
    });
    btn.disabled = false;
    btn.textContent = 'Send Reset Link';
    if (error) {
      errEl.textContent = error.message;
    } else {
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Reset link sent — check your email!';
    }
    return;
  }

  // ── Login / Signup ──
  if (!password) { errEl.textContent = 'Please enter your password.'; return; }

  if (authMode === 'signup') {
    if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
    if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  }

  btn.disabled = true;
  btn.textContent = '...';

  if (authMode === 'login') {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      errEl.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  } else {
    const { error } = await db.auth.signUp({ email, password });
    if (error) {
      errEl.textContent = error.message;
      btn.disabled = false;
      btn.textContent = 'Create Account';
    } else {
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Check your email to confirm your account!';
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }
}

// ─── SET NEW PASSWORD (after clicking reset link) ─────────────────────────────
async function handleSetNewPassword() {
  const password = document.getElementById('reset-password').value;
  const confirm  = document.getElementById('reset-confirm').value;
  const errEl    = document.getElementById('reset-error');
  const btn      = document.getElementById('reset-submit');

  errEl.textContent = '';
  errEl.style.color = 'var(--danger)';

  if (!password) { errEl.textContent = 'Please enter a new password.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }

  btn.disabled = true;
  btn.textContent = 'SAVING...';

  const { error } = await db.auth.updateUser({ password });

  if (error) {
    errEl.textContent = error.message;
    btn.disabled = false;
    btn.textContent = 'Set New Password';
  } else {
    showToast('Password updated! Signing you in...');
    // Clean the hash from the URL so a refresh doesn't re-trigger reset mode
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => enterApp(), 1200);
  }
}

async function signOut() {
  await db.auth.signOut();
}

// ─── APP ENTRY ────────────────────────────────────────────────────────────────
async function enterApp() {
  viewMonth = new Date();
  showScreen('app');
  await loadEntries();
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
async function loadEntries() {
  const { data, error } = await db
    .from('workouts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { showToast('Error loading workouts'); return; }

  entries = data || [];
  renderHistory();
  updateStats();
  updateSuggestions();
}

async function addEntry() {
  const name   = document.getElementById('input-name').value.trim();
  const sets   = document.getElementById('input-sets').value.trim();
  const reps   = document.getElementById('input-reps').value.trim();
  const weight = document.getElementById('input-weight').value.trim();
  const notes  = document.getElementById('input-notes').value.trim();
  const btn    = document.getElementById('btn-add');

  if (!name) {
    document.getElementById('input-name').focus();
    showToast('Enter an exercise name!');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'SAVING...';

  const { data: { user } } = await db.auth.getUser();

  const record = {
    user_id: user.id,
    name,
    sets:   sets   ? parseInt(sets)  : null,
    reps:   reps   ? parseInt(reps)  : null,
    weight: weight || null,
    notes:  notes  || null,
  };

  const { data, error } = await db
    .from('workouts')
    .insert(record)
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = '+ ADD TO LOG';

  if (error) { showToast('Error saving workout'); console.error(error); return; }

  entries.unshift(data);
  viewMonth = new Date();
  renderHistory();
  updateStats();
  updateSuggestions();

  document.getElementById('input-sets').value   = '';
  document.getElementById('input-reps').value   = '';
  document.getElementById('input-weight').value = '';
  document.getElementById('input-notes').value  = '';
  document.getElementById('input-name').focus();

  showToast(`${name} logged ✓`);

  setTimeout(() => {
    const first = document.querySelector('.entry');
    if (first) {
      first.classList.add('flash');
      setTimeout(() => first.classList.remove('flash'), 1500);
    }
  }, 50);
}

async function deleteEntry(id) {
  const { error } = await db.from('workouts').delete().eq('id', id);
  if (error) { showToast('Error deleting entry'); return; }
  entries = entries.filter(e => e.id !== id);
  renderHistory();
  updateStats();
  showToast('Entry removed');
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
  const isCurrentMonth =
    viewMonth.getFullYear() === now.getFullYear() &&
    viewMonth.getMonth()    === now.getMonth();
  document.querySelectorAll('.cal-arrow')[1].disabled = isCurrentMonth;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderHistory() {
  updateCalLabel();

  const container = document.getElementById('history');
  const query = document.getElementById('search')?.value?.toLowerCase() || '';

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
    const d = new Date(e.created_at);
    const key = d.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'short', day: 'numeric'
    });
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
              <div class="entry-meta">
                ${e.sets   ? `<span class="meta-chip"><span class="chip-label">Sets</span> ${e.sets}</span>` : ''}
                ${e.reps   ? `<span class="meta-chip"><span class="chip-label">Reps</span> ${e.reps}</span>` : ''}
                ${e.weight ? `<span class="meta-chip"><span class="chip-label">Weight</span> ${esc(e.weight)} lbs</span>` : ''}
              </div>
              ${e.notes ? `<div class="entry-note">${esc(e.notes)}</div>` : ''}
            </div>
            <button class="btn-delete" onclick="deleteEntry('${e.id}')" title="Delete">✕</button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function toggleDay(el) {
  el.nextElementSibling.classList.toggle('open');
}

function updateStats() {
  document.getElementById('stat-total').textContent = entries.length;
  const days = new Set(entries.map(e => new Date(e.created_at).toDateString())).size;
  document.getElementById('stat-days').textContent = days;
}

function updateSuggestions() {
  const names = [...new Set(entries.map(e => e.name))];
  document.getElementById('exercise-list').innerHTML =
    names.map(n => `<option value="${esc(n)}">`).join('');
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('app-screen').style.display !== 'none') {
    if (e.target.id !== 'input-notes' && e.target.tagName !== 'TEXTAREA') addEntry();
  }
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') {
    if (e.target.tagName === 'INPUT') handleAuth();
  }
  if (e.key === 'Enter' && document.getElementById('reset-screen').style.display !== 'none') {
    if (e.target.tagName === 'INPUT') handleSetNewPassword();
  }
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
init();
