/* Life Dashboard – js/app.js */

// [CONFIG]
const CONFIG = {
  WORK_DEFAULT: 25,        // minutes
  BREAK_DEFAULT: 5,        // minutes
  WORK_MIN: 1, WORK_MAX: 60,
  BREAK_MIN: 1, BREAK_MAX: 30,
  CLOCK_INTERVAL: 60000,   // ms
  TIMER_INTERVAL: 1000,    // ms
  GREET_MORNING_START: 5,  GREET_MORNING_END: 11,
  GREET_AFTERNOON_START: 12, GREET_AFTERNOON_END: 17,
  GREET_EVENING_START: 18,  GREET_EVENING_END: 20,
};

const KEYS = {
  USER_NAME: 'userName',
  THEME: 'theme',
  POMODORO_WORK: 'pomodoroWork',
  POMODORO_BREAK: 'pomodoroBreak',
  TASKS: 'tasks',
  QUICK_LINKS: 'quickLinks',
  SORT_MODE: 'sortMode',
};

// [STATE]
const timerState = {
  mode: 'work',       // 'work' | 'break'
  status: 'idle',     // 'idle' | 'running' | 'paused'
  remaining: CONFIG.WORK_DEFAULT * 60,  // seconds
  intervalId: null,
};

// [STORAGE]
function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // storage full or unavailable — fail silently
  }
}

// [THEME]

/**
 * resolveTheme(stored, systemPrefersDark)
 * Returns 'dark' or 'light'.
 * - If stored is 'light' or 'dark', return it (stored preference wins)
 * - Otherwise return 'dark' if systemPrefersDark is true, 'light' if false
 */
function resolveTheme(stored, systemPrefersDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * toggleTheme(current)
 * Returns the opposite theme: 'dark' → 'light', 'light' → 'dark'
 */
function toggleTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

/**
 * applyTheme(theme)
 * - Sets document.documentElement.dataset.theme = theme
 * - Updates #theme-toggle button aria-label to "Switch to light mode" or "Switch to dark mode"
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    );
  }
}

// [GREETING]

/** Returns 'Good Morning' | 'Good Afternoon' | 'Good Evening' | 'Good Night' based on hour (0-23) */
function getGreeting(hour) {
  if (hour >= CONFIG.GREET_MORNING_START && hour <= CONFIG.GREET_MORNING_END) {
    return 'Good Morning';
  }
  if (hour >= CONFIG.GREET_AFTERNOON_START && hour <= CONFIG.GREET_AFTERNOON_END) {
    return 'Good Afternoon';
  }
  if (hour >= CONFIG.GREET_EVENING_START && hour <= CONFIG.GREET_EVENING_END) {
    return 'Good Evening';
  }
  return 'Good Night';
}

/** Returns the full greeting string: "Good Morning, Alice" or "Good Morning" if name is empty/null */
function buildGreetingText(greeting, name) {
  const trimmed = name && name.trim();
  return trimmed ? `${greeting}, ${trimmed}` : greeting;
}

/** Formats a Date as HH:MM (24-hour, zero-padded) */
function formatClockTime(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Formats a Date as e.g. "Monday, 20 November 2026" */
function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Reads DOM and storage, re-renders clock/date/greeting */
function renderGreeting() {
  const now = new Date();
  document.getElementById('clock-display').textContent = formatClockTime(now);
  document.getElementById('date-display').textContent = formatDate(now);
  const name = storageGet(KEYS.USER_NAME);
  const greeting = getGreeting(now.getHours());
  document.getElementById('greeting-display').textContent = buildGreetingText(greeting, name);
}

// [AUDIO]

/**
 * generateBeep()
 * Plays a short ~440Hz beep using Web Audio API.
 * Wrapped in try/catch — silent if Web Audio is unavailable.
 */
function generateBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // Web Audio unavailable — silent
  }
}

// [TIMER]

/**
 * formatCountdown(seconds)
 * Returns "MM:SS" string for any non-negative integer seconds.
 * e.g. 90 → "01:30", 3600 → "60:00"
 */
function formatCountdown(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * validateWorkDuration(n)
 * Returns true iff n is an integer in [1, 60] (CONFIG.WORK_MIN to CONFIG.WORK_MAX)
 */
function validateWorkDuration(n) {
  return Number.isInteger(n) && n >= CONFIG.WORK_MIN && n <= CONFIG.WORK_MAX;
}

/**
 * validateBreakDuration(n)
 * Returns true iff n is an integer in [1, 30] (CONFIG.BREAK_MIN to CONFIG.BREAK_MAX)
 */
function validateBreakDuration(n) {
  return Number.isInteger(n) && n >= CONFIG.BREAK_MIN && n <= CONFIG.BREAK_MAX;
}

// [TIMER_CONTROLS]

/** Renders the current timerState.remaining to #timer-display */
function renderTimer() {
  document.getElementById('timer-display').textContent = formatCountdown(timerState.remaining);
}

/** Called every second when timer is running */
function tick() {
  timerState.remaining -= 1;
  renderTimer();
  if (timerState.remaining <= 0) {
    autoCycle();
  }
}

/** When a session ends: beep, switch mode, reset remaining, restart */
function autoCycle() {
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  generateBeep();
  if (timerState.mode === 'work') {
    timerState.mode = 'break';
    timerState.remaining = (storageGet(KEYS.POMODORO_BREAK) || CONFIG.BREAK_DEFAULT) * 60;
  } else {
    timerState.mode = 'work';
    timerState.remaining = (storageGet(KEYS.POMODORO_WORK) || CONFIG.WORK_DEFAULT) * 60;
  }
  renderTimer();
  timerState.status = 'running';
  timerState.intervalId = setInterval(tick, CONFIG.TIMER_INTERVAL);
}

function startTimer() {
  if (timerState.status === 'running') return;
  timerState.status = 'running';
  timerState.intervalId = setInterval(tick, CONFIG.TIMER_INTERVAL);
}

function pauseTimer() {
  if (timerState.status !== 'running') return;
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  timerState.status = 'paused';
}

function resetTimer() {
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  timerState.status = 'idle';
  timerState.mode = 'work';
  timerState.remaining = (storageGet(KEYS.POMODORO_WORK) || CONFIG.WORK_DEFAULT) * 60;
  renderTimer();
}

// [TODOS]

/**
 * isDuplicate(list, candidate)
 * Returns true if any INCOMPLETE task in list has the same label
 * as candidate (case-insensitive, whitespace-trimmed comparison).
 */
function isDuplicate(list, candidate) {
  const normalized = candidate.trim().toLowerCase();
  return list.some(task => !task.done && task.label.trim().toLowerCase() === normalized);
}

/**
 * sortTasks(list, mode)
 * Returns a NEW sorted array (does not mutate list).
 * mode: 'creation'  — original order (by createdAt asc)
 * mode: 'alpha'     — alphabetical by label (locale-aware)
 * mode: 'done-last' — incomplete tasks first, completed last;
 *                     within each group: creation order
 */
function sortTasks(list, mode) {
  const copy = [...list];
  if (mode === 'alpha') {
    copy.sort((a, b) => a.label.localeCompare(b.label));
  } else if (mode === 'done-last') {
    copy.sort((a, b) => {
      if (a.done === b.done) return a.createdAt - b.createdAt;
      return a.done ? 1 : -1;
    });
  } else {
    // 'creation' (default) — sort by createdAt ascending
    copy.sort((a, b) => a.createdAt - b.createdAt);
  }
  return copy;
}

/**
 * renderTasks()
 * Reads tasks from storage, reads sort mode from storage (default 'creation'),
 * sorts with sortTasks, clears #todo-list, then appends one <li> per task.
 * Each <li> contains:
 *   - <input type="checkbox" aria-label="Complete task"> checked if task.done
 *   - <span class="todo-label [done if task.done]">task.label</span>
 *   - <button class="btn-icon" data-id="...">Edit</button>
 *   - <button class="btn-icon" data-id="...">Delete</button>
 */
function renderTasks() {
  const tasks = storageGet(KEYS.TASKS) || [];
  const sortMode = storageGet(KEYS.SORT_MODE) || 'creation';
  const sorted = sortTasks(tasks, sortMode);

  const list = document.getElementById('todo-list');
  list.innerHTML = '';

  sorted.forEach(task => {
    const li = document.createElement('li');
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.setAttribute('aria-label', 'Complete task');
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleTask(task.id));

    const label = document.createElement('span');
    label.className = 'todo-label' + (task.done ? ' done' : '');
    label.textContent = task.label;

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon';
    editBtn.dataset.id = task.id;
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editTask(task.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon';
    deleteBtn.dataset.id = task.id;
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    li.appendChild(checkbox);
    li.appendChild(label);
    li.appendChild(editBtn);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });
}

// [TODOS_CRUD]

function addTask(label) {
  const trimmed = label.trim();
  if (!trimmed) return;
  const list = storageGet(KEYS.TASKS) || [];
  if (isDuplicate(list, trimmed)) {
    document.getElementById('todo-error').textContent = 'Task already exists';
    return;
  }
  document.getElementById('todo-error').textContent = '';
  const task = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    label: trimmed,
    done: false,
    createdAt: Date.now(),
  };
  list.push(task);
  storageSet(KEYS.TASKS, list);
  renderTasks();
}

function toggleTask(id) {
  const list = storageGet(KEYS.TASKS) || [];
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return;
  list[idx].done = !list[idx].done;
  storageSet(KEYS.TASKS, list);
  renderTasks();
}

function deleteTask(id) {
  const list = (storageGet(KEYS.TASKS) || []).filter(t => t.id !== id);
  storageSet(KEYS.TASKS, list);
  renderTasks();
}

function editTask(id) {
  const list = storageGet(KEYS.TASKS) || [];
  const task = list.find(t => t.id === id);
  if (!task) return;

  const li = document.querySelector(`#todo-list li[data-id="${id}"]`);
  if (!li) return;
  const span = li.querySelector('.todo-label');
  if (!span) return;

  const originalLabel = task.label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = originalLabel;
  input.className = 'todo-edit-input';
  span.replaceWith(input);
  input.focus();

  function saveEdit() {
    const newLabel = input.value.trim();
    if (newLabel) {
      task.label = newLabel;
      storageSet(KEYS.TASKS, list);
    }
    renderTasks();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') renderTasks();
  });
  input.addEventListener('blur', saveEdit);
}

// [QUICKLINKS]

/**
 * validateURL(url)
 * Returns true iff url starts with 'http://' or 'https://' (case-sensitive).
 * Requirement 4.5
 */
function validateURL(url) {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

/**
 * validateLabel(label)
 * Returns true iff label, after trimming, is non-empty.
 * Requirement 4.6
 */
function validateLabel(label) {
  return typeof label === 'string' && label.trim().length > 0;
}

/**
 * renderLinks()
 * Reads quickLinks from storage.
 * Clears #quicklinks-grid.
 * For each entry, creates a <button> with entry.label as text,
 * onclick: window.open(entry.url, '_blank').
 * Appends each button to #quicklinks-grid.
 * Requirements 4.1, 4.2, 4.8
 */
function renderLinks() {
  const links = storageGet(KEYS.QUICK_LINKS) || [];
  const grid = document.getElementById('quicklinks-grid');
  if (!grid) return;
  grid.innerHTML = '';
  links.forEach(entry => {
    const btn = document.createElement('button');
    btn.textContent = entry.label;
    btn.addEventListener('click', () => window.open(entry.url, '_blank'));
    grid.appendChild(btn);
  });
}

// [QUICKLINKS_MODAL]

/**
 * renderModalList()
 * Reads quickLinks from storage, clears #modal-list,
 * creates one <li> per entry with label text and a Remove <button>,
 * Remove button calls removeLink(entry.id).
 */
function renderModalList() {
  const links = storageGet(KEYS.QUICK_LINKS) || [];
  const list = document.getElementById('modal-list');
  if (!list) return;
  list.innerHTML = '';
  links.forEach(entry => {
    const li = document.createElement('li');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = entry.label;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeLink(entry.id));

    li.appendChild(labelSpan);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

/**
 * addLink(label, url)
 * Validates label and url.
 * If invalid: show error in #modal-error, return.
 * If valid: create LinkEntry { id, label, url }, push to list,
 * storageSet, renderLinks(), renderModalList(), clear inputs and #modal-error.
 */
function addLink(label, url) {
  const errorEl = document.getElementById('modal-error');
  if (!validateLabel(label) || !validateURL(url)) {
    if (errorEl) errorEl.textContent = 'Please enter a valid label and a URL starting with http:// or https://';
    return;
  }
  if (errorEl) errorEl.textContent = '';
  const links = storageGet(KEYS.QUICK_LINKS) || [];
  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    label: label.trim(),
    url: url.trim(),
  };
  links.push(entry);
  storageSet(KEYS.QUICK_LINKS, links);
  renderLinks();
  renderModalList();
  const labelInput = document.getElementById('modal-label-input');
  const urlInput = document.getElementById('modal-url-input');
  if (labelInput) labelInput.value = '';
  if (urlInput) urlInput.value = '';
}

/**
 * removeLink(id)
 * Filters out entry with matching id, storageSet, renderLinks(), renderModalList().
 */
function removeLink(id) {
  const links = (storageGet(KEYS.QUICK_LINKS) || []).filter(entry => entry.id !== id);
  storageSet(KEYS.QUICK_LINKS, links);
  renderLinks();
  renderModalList();
}

/**
 * openModal()
 * Remove 'hidden' class from #quicklinks-modal,
 * call renderModalList(),
 * trap focus inside #modal-panel (focus #modal-close first),
 * add keydown listener for Escape to close (fires once only).
 * Sets aria-hidden="true" on <main> while modal is open.
 */
function openModal() {
  const modal = document.getElementById('quicklinks-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const main = document.querySelector('main');
  if (main) main.setAttribute('aria-hidden', 'true');
  renderModalList();
  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) closeBtn.focus();

  document.addEventListener('keydown', function onKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
    }
  }, { once: true });
}

/**
 * closeModal()
 * Add 'hidden' class back to #quicklinks-modal,
 * restore aria-hidden on <main>,
 * return focus to #quicklinks-manage.
 */
function closeModal() {
  const modal = document.getElementById('quicklinks-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  const main = document.querySelector('main');
  if (main) main.removeAttribute('aria-hidden');
  const manageBtn = document.getElementById('quicklinks-manage');
  if (manageBtn) manageBtn.focus();
}

// [INIT]

document.addEventListener('DOMContentLoaded', () => {
  // Theme initialisation
  const stored = storageGet(KEYS.THEME);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = resolveTheme(stored, systemDark);
  applyTheme(theme);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const next = toggleTheme(current);
    storageSet(KEYS.THEME, next);
    applyTheme(next);
  });

  // Greeting initialisation
  renderGreeting();
  setInterval(renderGreeting, CONFIG.CLOCK_INTERVAL);

  document.getElementById('name-save-btn').addEventListener('click', () => {
    const input = document.getElementById('name-input');
    const errorEl = document.getElementById('name-error');
    const trimmed = input.value.trim();
    if (trimmed) {
      storageSet(KEYS.USER_NAME, trimmed);
      renderGreeting();
      errorEl.textContent = '';
    } else {
      errorEl.textContent = 'Please enter a name';
    }
  });

  // Timer initialisation
  const storedWork = storageGet(KEYS.POMODORO_WORK) || CONFIG.WORK_DEFAULT;
  const storedBreak = storageGet(KEYS.POMODORO_BREAK) || CONFIG.BREAK_DEFAULT;
  document.getElementById('work-input').value = storedWork;
  document.getElementById('break-input').value = storedBreak;
  timerState.remaining = storedWork * 60;
  renderTimer();

  document.getElementById('timer-start').addEventListener('click', startTimer);
  document.getElementById('timer-stop').addEventListener('click', pauseTimer);
  document.getElementById('timer-reset').addEventListener('click', resetTimer);

  document.getElementById('work-save').addEventListener('click', () => {
    const n = parseInt(document.getElementById('work-input').value, 10);
    const errorEl = document.getElementById('work-error');
    if (validateWorkDuration(n)) {
      storageSet(KEYS.POMODORO_WORK, n);
      errorEl.textContent = '';
      if (timerState.status === 'idle') {
        timerState.remaining = n * 60;
        renderTimer();
      }
    } else {
      errorEl.textContent = `Work duration must be between ${CONFIG.WORK_MIN} and ${CONFIG.WORK_MAX} minutes.`;
    }
  });

  document.getElementById('break-save').addEventListener('click', () => {
    const n = parseInt(document.getElementById('break-input').value, 10);
    const errorEl = document.getElementById('break-error');
    if (validateBreakDuration(n)) {
      storageSet(KEYS.POMODORO_BREAK, n);
      errorEl.textContent = '';
      // Only update display if the timer is currently idle AND in break mode.
      // Idle always starts in work mode, so break duration never affects the idle display.
      if (timerState.status === 'idle' && timerState.mode === 'break') {
        timerState.remaining = n * 60;
        renderTimer();
      }
    } else {
      errorEl.textContent = `Break duration must be between ${CONFIG.BREAK_MIN} and ${CONFIG.BREAK_MAX} minutes.`;
    }
  });

  // To-Do initialisation
  const sortEl = document.getElementById('todo-sort');
  if (sortEl) {
    sortEl.value = storageGet(KEYS.SORT_MODE) || 'creation';
    sortEl.addEventListener('change', (e) => {
      storageSet(KEYS.SORT_MODE, e.target.value);
      renderTasks();
    });
  }

  renderTasks();

  document.getElementById('todo-add-btn').addEventListener('click', () => {
    const input = document.getElementById('todo-input');
    addTask(input.value);
    input.value = '';
  });

  document.getElementById('todo-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const input = document.getElementById('todo-input');
      addTask(input.value);
      input.value = '';
    }
  });

  // Quick Links initialisation
  renderLinks();

  document.getElementById('quicklinks-manage').addEventListener('click', openModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', closeModal);

  document.getElementById('modal-add-btn').addEventListener('click', () => {
    const label = document.getElementById('modal-label-input').value;
    const url = document.getElementById('modal-url-input').value;
    addLink(label, url);
  });
});
