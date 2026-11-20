# Implementation Plan: Life Dashboard

## Overview

Build the Life Dashboard as three files — `index.html`, `css/style.css`, `js/app.js` — each step wiring incrementally into the previous ones. No build tools, no libraries, no server. Each task below maps to a discrete coding step that leaves the page in a runnable state.

## Tasks

- [x] 1. Scaffold project structure and HTML skeleton
  - Create `index.html` at the project root with the full HTML skeleton: `<head>` (charset, viewport, theme-color meta, link to `css/style.css`, title), `<body>` containing the four `<section>` widgets (`#greeting-widget`, `#timer-widget`, `#todo-widget`, `#quicklinks-widget`), the Quick Links modal (`#quicklinks-modal`), and a theme-toggle button in the header; include `<script src="js/app.js" defer>` at the bottom of `<body>`
  - Create empty `css/style.css` and `js/app.js` files so the page loads without errors
  - All IDs and element types must match the design exactly (see Design §Components)
  - _Requirements: 6.2, 6.3, 6.4_

- [x] 2. Implement the CSS design system and responsive layout
  - [x] 2.1 Write CSS custom properties and base styles
    - Define `--bg`, `--fg`, `--surface`, `--border`, `--accent`, `--error` and typography variables under `:root[data-theme="light"]` and `:root[data-theme="dark"]`
    - Add CSS reset, `body` base styles (font, background `var(--bg)`, color `var(--fg)`)
    - _Requirements: 5.1, 5.2, 6.2, NFR-3_

  - [x] 2.2 Write responsive grid layout
    - On viewports ≥ 900 px: 2×2 CSS Grid containing the four widget sections
    - On narrower viewports: single-column stack using a media query
    - Use `clamp()` for fluid font sizes; ensure no horizontal scroll at any width
    - _Requirements: 6.5, NFR-2, NFR-3_

  - [x] 2.3 Style individual widgets and interactive states
    - Style each widget card (padding, border-radius, background `var(--surface)`)
    - Style all buttons, inputs, selects with visible focus rings and hover states
    - Style the modal overlay (`#quicklinks-modal`), backdrop, and panel
    - Add `.done` class strike-through style for completed task labels
    - _Requirements: 9.1 (design accessibility section), NFR-3_

- [x] 3. Implement the data layer and theme controller in `app.js`
  - [x] 3.1 Write `[CONFIG]`, `[STATE]`, and `[STORAGE]` sections
    - Define all constants: default durations, localStorage keys, greeting hour ranges
    - Define the `timerState` object (mode, status, remaining, intervalId)
    - Implement `storageGet(key)` and `storageSet(key, value)` with try/catch JSON handling
    - _Requirements: 6.6_

  - [x] 3.2 Implement `[THEME]` section and wire theme toggle
    - Implement `resolveTheme(stored, systemPrefersDark)` and `toggleTheme(current)`
    - Implement `applyTheme(theme)`: sets `document.documentElement.dataset.theme`, updates toggle button `aria-label`
    - In `[INIT]`, read stored theme, call `applyTheme(resolveTheme(...))`, attach click listener to theme-toggle button
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 3.3 Write property tests for theme functions (Properties 18, 19, 20)
    - **Property 18: Theme resolution respects stored preference over system preference**
    - **Validates: Requirements 5.3**
    - **Property 19: Theme resolution falls back to system preference when nothing is stored**
    - **Validates: Requirements 5.1**
    - **Property 20: Theme toggle is its own inverse**
    - **Validates: Requirements 5.2**

- [x] 4. Implement the Greeting Widget
  - [x] 4.1 Implement `[GREETING]` pure functions
    - Implement `getGreeting(hour)`, `buildGreetingText(greeting, name)`, `formatClockTime(date)`, `formatDate(date)`
    - In `[INIT]`, read `userName` from storage, render time/date/greeting, start `setInterval` every 60 000 ms to re-render
    - Attach click listener to `#name-save-btn`: trim input, if non-empty save to `userName` key and re-render; if empty show inline error in `#name-error`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [ ]* 4.2 Write property tests for greeting pure functions (Properties 1–5)
    - **Property 1: Clock time format** — `formatClockTime(date)` matches `/^\d{2}:\d{2}$/` for any Date
    - **Validates: Requirements 1.1**
    - **Property 2: Date string contains all required fields** — weekday, numeric day, month name, 4-digit year all present
    - **Validates: Requirements 1.2**
    - **Property 3: Greeting covers every hour of the day** — `getGreeting(h)` returns one of the four strings for all h in [0, 23]
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6**
    - **Property 4: Greeting text includes name when present** — result ends with name; result equals greeting alone when name is absent
    - **Validates: Requirements 1.7, 1.9**
    - **Property 5: Username round-trip** — storing then reading `userName` returns the same string
    - **Validates: Requirements 1.8**

- [x] 5. Checkpoint — Greeting and theme functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement the Focus Timer
  - [x] 6.1 Implement `[AUDIO]` and `[TIMER]` pure functions
    - Implement `generateBeep()` with Web Audio API (wrapped in try/catch)
    - Implement `formatCountdown(seconds)`, `validateWorkDuration(n)`, `validateBreakDuration(n)`
    - _Requirements: 2.4, 2.9, 2.10, 2.11, 2.12_

  - [x] 6.2 Implement timer stateful functions and wire controls
    - Implement `startTimer()`, `pauseTimer()`, `resetTimer()`, `tick()`, `autoCycle()` using `timerState`
    - In `[INIT]`, read `pomodoroWork`/`pomodoroBreak` from storage (falling back to 25/5), initialise `timerState.remaining`, populate `#work-input` and `#break-input`, render `#timer-display`
    - Attach listeners to `#timer-start`, `#timer-stop`, `#timer-reset`
    - Attach listeners to `#work-save` and `#break-save`: parse input as integer, validate, save to storage, show/clear `#work-error` / `#break-error`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [ ]* 6.3 Write property tests for timer pure functions (Properties 6, 7)
    - **Property 6: Valid timer duration is accepted and persisted** — `validateWorkDuration(n)` true iff n ∈ [1,60]; `validateBreakDuration(n)` true iff n ∈ [1,30]
    - **Validates: Requirements 2.2, 2.3, 2.11, 2.12**
    - **Property 7: Countdown display format** — `formatCountdown(s)` matches `/^\d{2}:\d{2}$/` for any non-negative integer s
    - **Validates: Requirements 2.4**

- [x] 7. Implement the To-Do List
  - [x] 7.1 Implement `[TODOS]` pure functions and render
    - Implement `isDuplicate(list, candidate)` and `sortTasks(list, mode)`
    - Implement `renderTasks()`: reads from storage, applies `sortTasks`, writes `<li>` nodes to `#todo-list` (each with checkbox, label `<span>`, edit button, delete button)
    - _Requirements: 3.2, 3.7, 3.9_

  - [x] 7.2 Implement CRUD stateful functions and wire controls
    - Implement `addTask(label)`: deduplication check → if duplicate show `#todo-error`, else create Task object (id, label, done=false, createdAt), push to list, `storageSet`, `renderTasks`
    - Implement `toggleTask(id)`: flip `done`, `storageSet`, `renderTasks`
    - Implement `deleteTask(id)`: filter out task, `storageSet`, `renderTasks`
    - Implement `editTask(id, newLabel)`: replace label span with input on edit click; on Enter/blur save if non-empty else restore; `storageSet`, `renderTasks`
    - In `[INIT]`, call `renderTasks()`, attach listeners to `#todo-add-btn`, `#todo-input` (Enter key), `#todo-sort` (change event)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8_

  - [ ]* 7.3 Write property tests for to-do pure functions (Properties 8–13)
    - **Property 8: Task addition round-trip** — `addTask(label)` then read storage produces list containing that label
    - **Validates: Requirements 3.1**
    - **Property 9: Duplicate detection rejects matching incomplete tasks** — `isDuplicate` returns true for case/whitespace variants of existing incomplete task labels
    - **Validates: Requirements 3.2**
    - **Property 10: Completion toggle is its own inverse** — `toggleTask` twice restores original `done` value
    - **Validates: Requirements 3.3**
    - **Property 11: Task deletion removes the task** — `deleteTask(id)` produces list without that id
    - **Validates: Requirements 3.4**
    - **Property 12: Alphabetical sort is ordered** — `sortTasks(list, 'alpha')` produces locale-ordered labels
    - **Validates: Requirements 3.7**
    - **Property 13: Task list persistence round-trip** — tasks written then read from storage are identical
    - **Validates: Requirements 3.9**

- [x] 8. Checkpoint — Timer and To-Do List functional
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement the Quick Links widget and modal
  - [x] 9.1 Implement `[QUICKLINKS]` pure functions and render
    - Implement `validateURL(url)` and `validateLabel(label)`
    - Implement `renderLinks()`: reads from storage, creates one `<button>` per entry in `#quicklinks-grid` with `window.open(url, '_blank')` on click
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [x] 9.2 Implement modal CRUD and wire controls
    - Implement `addLink(label, url)`: validate both fields → if invalid show `#modal-error`, else create LinkEntry (id, label, url), push to list, `storageSet`, `renderLinks`, re-render `#modal-list`
    - Implement `removeLink(id)`: filter out entry, `storageSet`, `renderLinks`, re-render `#modal-list`
    - Implement `openModal()`: remove `hidden` from `#quicklinks-modal`, render `#modal-list`, trap focus inside `#modal-panel`
    - Implement `closeModal()`: add `hidden` back, return focus to `#quicklinks-manage`
    - In `[INIT]`, call `renderLinks()`, attach listeners to `#quicklinks-manage` (opens modal), `#modal-close` (closes modal), `#modal-backdrop` (closes modal), `#modal-add-btn`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]* 9.3 Write property tests for Quick Links pure functions (Properties 14–17)
    - **Property 14: Quick Links render count matches data** — `renderLinks(entries)` produces exactly `entries.length` buttons in `#quicklinks-grid`
    - **Validates: Requirements 4.1**
    - **Property 15: Link Entry addition round-trip** — `addLink(label, url)` then read storage contains that label and url
    - **Validates: Requirements 4.4**
    - **Property 16: URL validation rejects non-HTTP(S) URLs** — `validateURL(url)` returns false for any string not starting with `http://` or `https://`
    - **Validates: Requirements 4.5**
    - **Property 17: Link Entry deletion removes the entry** — `removeLink(id)` produces list without that id
    - **Validates: Requirements 4.7**

- [x] 10. Final wiring and polish
  - [x] 10.1 Verify initialisation sequence and cross-widget integration
    - Confirm `DOMContentLoaded` handler runs steps 1–6 from Design §Initialisation in order
    - Verify theme toggle, name save, timer controls, to-do CRUD, quick-links modal all work together on a single page load from `file://`
    - Fix any event-listener conflicts or render ordering issues
    - _Requirements: 6.1, 6.5_

  - [x] 10.2 Accessibility and browser-compatibility pass
    - Add `aria-label` to icon-only buttons, `role="alert"` and `aria-live="polite"` to all error `<span>` elements (if not already present), `role="dialog"` and focus-trap to modal
    - Test keyboard navigation (Tab/Shift-Tab through all controls, Enter/Space on buttons)
    - Verify that the page renders correctly when opened via `file://` in Chrome, Firefox, Edge, and Safari
    - _Requirements: 6.5, NFR-1, design §Accessibility_

- [x] 11. Final checkpoint — Full dashboard functional
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at logical milestones
- Property tests (tasks 3.3, 4.2, 6.3, 7.3, 9.3) validate the pure-function correctness properties from Design §Correctness Properties
- Unit tests cover state-machine transitions, DOM interactions, and edge cases not suitable for property testing
- All test files live in `tests/` at the project root, keeping `css/` and `js/` clean

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1"] },
    { "id": 3, "tasks": ["2.3", "3.3", "4.2", "6.1"] },
    { "id": 4, "tasks": ["6.2", "7.1"] },
    { "id": 5, "tasks": ["6.3", "7.2", "9.1"] },
    { "id": 6, "tasks": ["7.3", "9.2"] },
    { "id": 7, "tasks": ["9.3", "10.1"] },
    { "id": 8, "tasks": ["10.2"] }
  ]
}
```
