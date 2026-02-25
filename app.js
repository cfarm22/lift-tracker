// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://bskyxhsglprkqbjcjfad.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_pUk6zr9RYrA0rlxaeN6ZfQ_4MBzbY9P';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ────────────────────────────────────────────────────────────────────
let entries  = [];
let authMode = 'login'; // 'login' | 'signup'

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await enterApp();
  } else {
    showScreen('auth');
  }
  hideLoading();

  // Listen for auth changes (e.g. email confirmation redirect)
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
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
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && mode === 'login') || (i === 1 && mode === 'signup'));
  });
  document.getElementById('confirm-field').style.display = mode === 'signup' ? '' : 'none';
  document.getElementById('auth-submit').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').textContent = '';
}

async function handleAuth() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm  = document.getElementById('auth-confirm').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit');

  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Email and password required.'; return; }

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
    // onAuthStateChange handles success
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

async function signOut() {
  await db.auth.signOut();
}

// ─── APP ENTRY ────────────────────────────────────────────────────────────────
async function enterApp() {
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
  renderHistory();
  updateStats();
  updateSuggestions();

  // Clear fields (keep name for quick repeat logging)
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

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const container = document.getElementById('history');
  const query = document.getElementById('search')?.value?.toLowerCase() || '';

  const filtered = query
    ? entries.filter(e => e.name.toLowerCase().includes(query))
    : entries;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🏋️</span>
        ${query ? 'No exercises match your search.' : 'No workouts logged yet.<br>Add your first exercise above.'}
      </div>`;
    return;
  }

  // Group by calendar date
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
                ${e.weight ? `<span class="meta-chip"><span class="chip-label">Weight</span> ${esc(e.weight)}</span>` : ''}
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
  document.getElementById('auth-screen').style.display = name === 'auth' ? '' : 'none';
  document.getElementById('app-screen').style.display  = name === 'app'  ? '' : 'none';
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

// Enter key submits form (except in textarea)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('app-screen').style.display !== 'none') {
    if (e.target.id !== 'input-notes' && e.target.tagName !== 'TEXTAREA') {
      addEntry();
    }
  }
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') {
    if (e.target.tagName === 'INPUT') handleAuth();
  }
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
init();
