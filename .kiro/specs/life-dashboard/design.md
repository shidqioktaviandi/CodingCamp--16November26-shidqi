# Design Document

## Overview

The Life Dashboard is a single-page web application delivered as three files: `index.html`, `css/style.css`, and `js/app.js`. It has no build step, no server dependency, and no external libraries. All state is kept in `window.localStorage`. The page is divided into four widgets — Greeting, Focus Timer, To-Do List, and Quick Links — plus a global theme toggle. A Quick Links modal overlays the page when editing saved URLs.

---

## Architecture

### File Layout

```
project-root/
├── index.html          # Markup skeleton, links CSS and JS
├── css/
│   └── style.css       # All styles, CSS custom properties for theming
└── js/
    └── app.js          # All logic, no dependencies
```

### Module Organisation (inside `app.js`)

`app.js` is structured into discrete sections separated by block comments. Each section owns one concern and exposes pure functions where possible. No global state is mutated outside the designated state objects.

```
app.js
├── [CONFIG]        Constants: default durations, localStorage keys, greeting ranges
├── [STATE]         Single mutable state object for timer
├── [STORAGE]       get/set helpers wrapping localStorage (parse/stringify JSON)
├── [GREETING]      Pure functions: getGreeting(hour), buildGreetingText(greeting, name), formatDate(date), formatTime(date)
├── [TIMER]         Pure functions: formatCountdown(seconds), validateWorkDuration(n), validateBreakDuration(n)
│                   Stateful: startTimer(), pauseTimer(), resetTimer(), tick(), autoCycle()
├── [TODOS]         Pure functions: isDuplicate(list, label), sortTasks(list, mode)
│                   Stateful: addTask(label), toggleTask(id), deleteTask(id), editTask(id, newLabel), loadTasks()
├── [QUICKLINKS]    Pure functions: validateURL(url), validateLabel(label)
│                   Stateful: addLink(label, url), removeLink(id), loadLinks(), renderLinks()
├── [THEME]         Pure: resolveTheme(stored, systemPrefersDark), toggleTheme(current)
│                   Stateful: applyTheme(theme)
├── [AUDIO]         generateBeep() — Web Audio API tone generator
└── [INIT]          DOMContentLoaded handler; wires all event listeners, restores state
```

---

## Components and Interfaces

The dashboard is composed of five UI components (widgets) and one overlay component, all wired together by `app.js`. Each component owns its DOM section, reads from `localStorage` via the shared storage helpers, and exposes pure functions for its core logic.

| Component | DOM Root | Owned localStorage Keys | Public Pure Functions |
|---|---|---|---|
| Greeting Widget | `#greeting-widget` | `userName` | `getGreeting`, `buildGreetingText`, `formatClockTime`, `formatDate` |
| Focus Timer | `#timer-widget` | `pomodoroWork`, `pomodoroBreak` | `formatCountdown`, `validateWorkDuration`, `validateBreakDuration` |
| To-Do List | `#todo-widget` | `tasks` | `isDuplicate`, `sortTasks` |
| Quick Links | `#quicklinks-widget` | `quickLinks` | `validateURL`, `validateLabel` |
| Quick Links Modal | `#quicklinks-modal` | `quickLinks` | (shared with Quick Links) |
| Theme Controller | `<html data-theme>` | `theme` | `resolveTheme`, `toggleTheme` |

**Shared infrastructure**

- `storageGet(key)` / `storageSet(key, value)` — JSON-safe localStorage wrappers used by all components.
- `generateBeep()` — Web Audio API tone used by the Focus Timer only.

All cross-component communication is synchronous and direct (function calls). There is no event bus or observer pattern.

---

## Data Models

All persistent data is serialised as JSON and stored in `window.localStorage`.

### Task

```javascript
{
  id: string,         // crypto.randomUUID() or Date.now().toString()
  label: string,      // trimmed text, max 200 chars
  done: boolean,      // false = incomplete, true = complete
  createdAt: number,  // Date.now() timestamp; used for creation-order sort
}
```

Stored under key `tasks` as a JSON array. Default value: `[]`.

### LinkEntry

```javascript
{
  id: string,     // unique identifier (crypto.randomUUID() or Date.now().toString())
  label: string,  // display name, max 40 chars
  url: string,    // must start with http:// or https://, max 2048 chars
}
```

Stored under key `quickLinks` as a JSON array. Default value: `[]`.

### Scalar values

| Key | Type | Default | Constraints |
|---|---|---|---|
| `userName` | `string` | `null` | max 40 chars, stored as plain string |
| `pomodoroWork` | `number` | `25` | integer in [1, 60] |
| `pomodoroBreak` | `number` | `5` | integer in [1, 30] |
| `theme` | `'light' \| 'dark'` | system preference | only these two values are valid |

### Timer State (in-memory only, never persisted)

```javascript
const timerState = {
  mode: 'work',       // 'work' | 'break'
  status: 'idle',     // 'idle' | 'running' | 'paused'
  remaining: 1500,    // seconds remaining in current session
  intervalId: null,   // return value of setInterval, or null
};
```

---

## Component Design

### 1. Greeting Widget

**HTML structure**

```html
<section id="greeting-widget">
  <p id="greeting-time"><!-- HH:MM --></p>
  <p id="greeting-date"><!-- Monday, 20 November 2026 --></p>
  <h1 id="greeting-text"><!-- Good Morning, Alex --></h1>
  <div id="name-edit-row">
    <input id="name-input" type="text" placeholder="Enter your name" maxlength="40" />
    <button id="name-save-btn">Save</button>
    <span id="name-error" role="alert" aria-live="polite"></span>
  </div>
</section>
```

**Pure functions**

```javascript
// Returns "Good Morning" | "Good Afternoon" | "Good Evening" | "Good Night"
function getGreeting(hour) {
  if (hour >= 5  && hour <= 11) return 'Good Morning';
  if (hour >= 12 && hour <= 17) return 'Good Afternoon';
  if (hour >= 18 && hour <= 20) return 'Good Evening';
  return 'Good Night'; // 21–23 and 0–4
}

// Returns e.g. "Good Morning, Alex" or "Good Morning" when name is falsy
function buildGreetingText(greeting, name) {
  return name ? `${greeting}, ${name}` : greeting;
}

// Returns e.g. "14:05"
function formatClockTime(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Returns e.g. "Monday, 20 November 2026"
function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}
```

**Update cycle**: `setInterval` fires every 60 000 ms and re-renders time, date, and greeting.

**Name persistence**: On "Save", trim the value; if non-empty, write to `localStorage` key `userName` and re-render greeting immediately.

---

### 2. Focus Timer

**HTML structure**

```html
<section id="timer-widget">
  <div id="timer-display">25:00</div>
  <div id="timer-label">Work Session</div>
  <div id="timer-controls">
    <button id="timer-start">Start</button>
    <button id="timer-stop">Stop</button>
    <button id="timer-reset">Reset</button>
  </div>
  <div id="timer-settings">
    <label>Work (1–60 min)
      <input id="work-input" type="number" min="1" max="60" />
      <button id="work-save">Set</button>
      <span id="work-error" role="alert" aria-live="polite"></span>
    </label>
    <label>Break (1–30 min)
      <input id="break-input" type="number" min="1" max="30" />
      <button id="break-save">Set</button>
      <span id="break-error" role="alert" aria-live="polite"></span>
    </label>
  </div>
</section>
```

**Pure functions**

```javascript
// Converts total seconds to "MM:SS"
function formatCountdown(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// Returns true when n is an integer in [1, 60]
function validateWorkDuration(n) {
  return Number.isInteger(n) && n >= 1 && n <= 60;
}

// Returns true when n is an integer in [1, 30]
function validateBreakDuration(n) {
  return Number.isInteger(n) && n >= 1 && n <= 30;
}
```

**Timer lifecycle**

- `startTimer()`: sets `status = 'running'`, launches `setInterval` calling `tick()` every 1 000 ms.
- `pauseTimer()`: clears the interval, sets `status = 'paused'`.
- `resetTimer()`: clears the interval, reads work duration from `localStorage`, sets `remaining` to that duration, `status = 'idle'`, `mode = 'work'`.
- `tick()`: decrements `remaining`; when it reaches 0, calls `generateBeep()` then `autoCycle()`.
- `autoCycle()`: if `mode === 'work'`, switches to `'break'` and sets remaining to break duration, then auto-starts; if `mode === 'break'`, switches to `'work'` and sets remaining to work duration, then auto-starts.

**Audio Alert**

```javascript
function generateBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.6);
}
```

---

### 3. To-Do List

**HTML structure**

```html
<section id="todo-widget">
  <div id="todo-add-row">
    <input id="todo-input" type="text" placeholder="Add a task…" maxlength="200" />
    <button id="todo-add-btn">Add</button>
    <span id="todo-error" role="alert" aria-live="polite"></span>
  </div>
  <div id="todo-sort-row">
    <label>Sort:
      <select id="todo-sort">
        <option value="created">Default</option>
        <option value="alpha">A–Z</option>
        <option value="completed">Completed Last</option>
      </select>
    </label>
  </div>
  <ul id="todo-list" aria-label="Tasks"></ul>
</section>
```

**Pure functions**

```javascript
// Returns true when candidate matches any incomplete task (case-insensitive, trimmed)
function isDuplicate(list, candidate) {
  const norm = candidate.trim().toLowerCase();
  return list.some(t => !t.done && t.label.trim().toLowerCase() === norm);
}

// Returns a new sorted array; does not mutate the input
function sortTasks(list, mode) {
  const copy = [...list];
  if (mode === 'alpha') {
    copy.sort((a, b) => a.label.localeCompare(b.label));
  } else if (mode === 'completed') {
    copy.sort((a, b) => Number(a.done) - Number(b.done));
  } else {
    copy.sort((a, b) => a.createdAt - b.createdAt); // 'created' (default)
  }
  return copy;
}
```

**Render**: `renderTasks()` reads from `localStorage`, applies `sortTasks()`, then writes the `<li>` nodes into `#todo-list`. Each `<li>` contains a checkbox, a label `<span>`, an edit button, and a delete button.

**Edit flow**: clicking edit replaces the label `<span>` with an `<input>` pre-filled with the current label. On blur or Enter, if the new value is non-empty (after trim) it replaces the label; otherwise the original is restored.

---

### 4. Quick Links

**HTML structure (main page)**

```html
<section id="quicklinks-widget">
  <h2>Quick Links</h2>
  <div id="quicklinks-grid">
    <!-- One <button> per saved entry -->
  </div>
  <button id="quicklinks-manage">Manage Links</button>
</section>
```

**Modal**

```html
<div id="quicklinks-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" hidden>
  <div id="modal-backdrop"></div>
  <div id="modal-panel">
    <h2 id="modal-title">Manage Quick Links</h2>
    <ul id="modal-list"><!-- existing entries --></ul>
    <div id="modal-add-form">
      <input id="modal-label" type="text" placeholder="Label" maxlength="40" />
      <input id="modal-url"   type="url"  placeholder="https://…" maxlength="2048" />
      <button id="modal-add-btn">Add</button>
      <span id="modal-error" role="alert" aria-live="polite"></span>
    </div>
    <button id="modal-close">Close</button>
  </div>
</div>
```

**Pure functions**

```javascript
// Returns true when url starts with http:// or https://
function validateURL(url) {
  return /^https?:\/\/.+/.test(url.trim());
}

// Returns true when label is non-empty after trimming
function validateLabel(label) {
  return label.trim().length > 0;
}
```

**Modal open/close**: `openModal()` removes `hidden`, traps focus inside the panel. `closeModal()` adds `hidden` back and returns focus to the manage button. Clicking `#modal-backdrop` also calls `closeModal()`.

---

### 5. Light / Dark Theme

**Implementation**

CSS custom properties define all colours under two selectors:

```css
:root[data-theme="light"] { --bg: #f5f5f5; --fg: #111; /* … */ }
:root[data-theme="dark"]  { --bg: #111;    --fg: #f0f0f0; /* … */ }
```

**Pure functions**

```javascript
// Returns 'dark' or 'light' based on stored preference or system preference
function resolveTheme(stored, systemPrefersDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return systemPrefersDark ? 'dark' : 'light';
}

// Returns the opposite theme
function toggleTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}
```

`applyTheme(theme)` sets `document.documentElement.dataset.theme = theme` and updates a toggle button's aria-label.

---

### 6. Data Layer (LocalStorage)

All reads and writes go through two helpers to centralise JSON handling:

```javascript
function storageGet(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
```

**Keys used**

| Key | Type | Default |
|---|---|---|
| `userName` | `string` | `null` |
| `pomodoroWork` | `number` | `25` |
| `pomodoroBreak` | `number` | `5` |
| `tasks` | `Task[]` | `[]` |
| `quickLinks` | `LinkEntry[]` | `[]` |
| `theme` | `'light' \| 'dark'` | system preference |

---

### 7. Initialisation Sequence (`DOMContentLoaded`)

1. Read `theme` from storage → call `applyTheme(resolveTheme(stored, systemPrefersDark))`.
2. Read `userName` → render greeting, start 60-second clock interval.
3. Read `pomodoroWork` and `pomodoroBreak` → initialise `timerState.remaining`, populate settings inputs.
4. Read `tasks` → render task list with stored sort mode (or `'created'` default).
5. Read `quickLinks` → render quick-links buttons.
6. Attach all event listeners (theme toggle, name save, timer controls, to-do CRUD, quick-links modal, sort select).

---

### 8. Responsive Layout

The page uses a CSS Grid layout. On wide viewports (≥ 900 px) the four widgets appear in a 2×2 grid. On narrower viewports they stack into a single column. Font sizes scale using `clamp()` to remain readable without horizontal scroll.

---

### 9. Accessibility

- All interactive controls have visible focus styles.
- Error messages use `role="alert"` and `aria-live="polite"`.
- The modal uses `role="dialog"`, `aria-modal="true"`, and focus trapping.
- The theme-toggle button updates its `aria-label` on each switch.
- Checkbox inputs for tasks use associated `<label>` elements.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `localStorage` not available (private mode, quota exceeded) | `storageSet` silently no-ops; `storageGet` returns `null`. UI still works for the session. |
| Invalid timer duration submitted | Inline error message shown; value not saved. |
| Duplicate task submitted | Inline warning shown; task not added. |
| Invalid URL submitted in modal | Inline error shown; entry not saved. |
| Empty label submitted in modal | Inline error shown; entry not saved. |
| `AudioContext` not supported | `generateBeep` is wrapped in a try/catch; timer still cycles silently. |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Clock time format

*For any* `Date` object, `formatClockTime(date)` returns a string that matches the pattern `HH:MM` (two digits, colon, two digits).

**Validates: Requirements 1.1**

---

### Property 2: Date string contains all required fields

*For any* `Date` object, `formatDate(date)` returns a string that contains a weekday name, a numeric day, a month name, and a four-digit year.

**Validates: Requirements 1.2**

---

### Property 3: Greeting covers every hour of the day

*For any* integer hour in [0, 23], `getGreeting(hour)` returns exactly one of `"Good Morning"`, `"Good Afternoon"`, `"Good Evening"`, or `"Good Night"`, with no hour left unclassified.

**Validates: Requirements 1.3, 1.4, 1.5, 1.6**

---

### Property 4: Greeting text includes name when present

*For any* greeting string and any non-empty name string, `buildGreetingText(greeting, name)` returns a string that ends with the name, and when the name is absent (empty or null), the result equals the greeting alone.

**Validates: Requirements 1.7, 1.9**

---

### Property 5: Username round-trip

*For any* non-empty string saved to `localStorage` under key `userName`, reading `localStorage.getItem('userName')` returns the same string.

**Validates: Requirements 1.8**

---

### Property 6: Valid timer duration is accepted and persisted

*For any* integer `n` in [1, 60], `validateWorkDuration(n)` returns `true` and the value is stored under `pomodoroWork`; for any value outside that range, `validateWorkDuration` returns `false` and `pomodoroWork` is not updated. The same invariant holds for break duration with range [1, 30] and key `pomodoroBreak`.

**Validates: Requirements 2.2, 2.3, 2.11, 2.12**

---

### Property 7: Countdown display format

*For any* non-negative integer `seconds`, `formatCountdown(seconds)` returns a string matching `MM:SS` (two digits, colon, two digits).

**Validates: Requirements 2.4**

---

### Property 8: Task addition round-trip

*For any* non-empty task label, calling `addTask(label)` and then reading `tasks` from `localStorage` produces a list that contains an entry with that label.

**Validates: Requirements 3.1**

---

### Property 9: Duplicate detection rejects matching incomplete tasks

*For any* task list containing at least one incomplete task with label `L`, `isDuplicate(list, L2)` returns `true` for any `L2` that equals `L` after whitespace trimming and case-folding, and `false` for any label that does not match any incomplete task.

**Validates: Requirements 3.2**

---

### Property 10: Completion toggle is its own inverse

*For any* task, toggling its completion state twice with `toggleTask` restores the original `done` value.

**Validates: Requirements 3.3**

---

### Property 11: Task deletion removes the task

*For any* task list and any task `id` present in that list, calling `deleteTask(id)` produces a list that does not contain an entry with that `id`.

**Validates: Requirements 3.4**

---

### Property 12: Alphabetical sort is ordered

*For any* array of tasks, `sortTasks(list, 'alpha')` returns a list in which the label of each element is less than or equal to the label of the next element under locale-aware comparison.

**Validates: Requirements 3.7**

---

### Property 13: Task list persistence round-trip

*For any* array of tasks written to `localStorage` under key `tasks`, `loadTasks()` returns an array containing all the same tasks.

**Validates: Requirements 3.9**

---

### Property 14: Quick Links render count matches data

*For any* array of link entries, `renderLinks(entries)` produces exactly `entries.length` button elements in `#quicklinks-grid`.

**Validates: Requirements 4.1**

---

### Property 15: Link Entry addition round-trip

*For any* valid label and valid URL (starting with `http://` or `https://`), calling `addLink(label, url)` and then reading `quickLinks` from `localStorage` produces a list that contains an entry with that label and URL.

**Validates: Requirements 4.4**

---

### Property 16: URL validation rejects non-HTTP(S) URLs

*For any* string that does not begin with `http://` or `https://`, `validateURL(url)` returns `false` and no entry is added to `quickLinks`.

**Validates: Requirements 4.5**

---

### Property 17: Link Entry deletion removes the entry

*For any* list of link entries and any entry `id` in that list, calling `removeLink(id)` produces a list that does not contain an entry with that `id`.

**Validates: Requirements 4.7**

---

### Property 18: Theme resolution respects stored preference over system preference

*For any* stored theme value (`'light'` or `'dark'`) and any value of `systemPrefersDark`, `resolveTheme(stored, systemPrefersDark)` returns the stored value.

**Validates: Requirements 5.3**

---

### Property 19: Theme resolution falls back to system preference when nothing is stored

*For any* `systemPrefersDark` boolean, `resolveTheme(null, systemPrefersDark)` returns `'dark'` when `systemPrefersDark` is `true` and `'light'` when it is `false`.

**Validates: Requirements 5.1**

---

### Property 20: Theme toggle is its own inverse

*For any* theme value (`'light'` or `'dark'`), `toggleTheme(toggleTheme(theme))` returns the original theme.

**Validates: Requirements 5.2**

---

## Testing Strategy

### Approach

Because the entire application is a collection of pure JavaScript functions plus a thin DOM-rendering layer, testing is split into two complementary tracks:

**Unit / example-based tests** cover specific scenarios, state machine transitions, and DOM interactions:
- Timer state machine transitions (idle → running → paused → idle).
- Auto-cycle behaviour (work → break → work) when countdown reaches zero.
- Edit confirmation and cancel flows in the to-do list.
- Modal open/close without side-effects.
- LocalStorage unavailability (quota exceeded) silently degrades.

**Property-based tests** cover the pure functions listed in the Correctness Properties section above. Each property is run with a minimum of 100 randomly generated inputs using a PBT library (e.g. fast-check). Properties map directly to requirements and are tagged `Feature: life-dashboard, Property N: <property text>`.

### What is NOT tested with PBT

- DOM rendering and CSS visual output — use snapshot or visual regression tests.
- `window.open` calls for Quick Links — mock-verified in unit tests.
- Web Audio API tone generation — wrapped in try/catch; tested only that it does not throw.
- `setInterval` / clock ticking — tested with fake timers in unit tests, not PBT.

### Test file location

All tests live alongside the production files in a `tests/` directory at the project root (not inside `js/` or `css/`), keeping the production file structure exactly as specified in the technical constraints.
