import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { dateKey, elapsedLabel, hashString, labelOf, todayKey } from './dates';
import {
  subscribeTries, createTry, completeTry, deleteTry, updatePlan, PlanInput,
  subscribeFus, createFu, markFuConverted, deleteFu,
  subscribeHabits, createHabit, setHabitCheck, deleteHabit,
} from './store';
import {
  PLAN_PRESETS, presetToMs, toLocalInput, fromLocalInput, planLabel, onPlanRate,
  WEEK_LABELS, isScheduled, daysLabel, habitStats, tryCalendarUrl, habitCalendarUrl,
} from './plan';
import { calcStats } from './stats';
import {
  DAILY_WORDS, DECISION_LABELS, FEEL_LABELS, FU_KINDS, HASSLE_LABELS, findPrepWord,
} from './words';
import { Decision, Feel, Fu, FuKind, Habit, Try } from './types';
import { initClickTracking } from './analytics';

initClickTracking();

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const dailyWordEl = $('daily-word');
const statTotal = $('stat-total');
const statLevel = $('stat-level');
const statNext = $('stat-next');
const statWeek = $('stat-week');
const statStreak = $('stat-streak');
const statFail = $('stat-fail');
const statPoints = $('stat-points');
const weeklyBars = $('weekly-bars');
const statSpeed = $('stat-speed');

const todayDateEl = $('today-date');
const todayProgress = $('today-progress');
const todayBar = $('today-bar');
const todayList = $('today-list');
const todayEmpty = $('today-empty');
const todayRate = $('today-rate');

const sectionAdd = $('section-add');
const tryForm = $<HTMLFormElement>('try-form');
const inputTitle = $<HTMLInputElement>('input-title');
const inputStep = $<HTMLInputElement>('input-step');
const prepWarning = $('prep-warning');
const hasslePicker = $('hassle-picker');
const planPresets = $('plan-presets');
const inputPlanAt = $<HTMLInputElement>('input-plan-at');
const inputCue = $<HTMLInputElement>('input-cue');
const btnTrySubmit = $<HTMLButtonElement>('btn-try-submit');

const waitingCount = $('waiting-count');
const waitingList = $('waiting-list');
const waitingEmpty = $('waiting-empty');

const habitForm = $<HTMLFormElement>('habit-form');
const inputHabitTitle = $<HTMLInputElement>('input-habit-title');
const habitDaysPicker = $('habit-days');
const inputHabitTime = $<HTMLInputElement>('input-habit-time');
const inputHabitCue = $<HTMLInputElement>('input-habit-cue');
const btnHabitSubmit = $<HTMLButtonElement>('btn-habit-submit');
const habitList = $('habit-list');

const fuForm = $<HTMLFormElement>('fu-form');
const fuKinds = $('fu-kinds');
const inputFu = $<HTMLInputElement>('input-fu');
const btnFuSubmit = $<HTMLButtonElement>('btn-fu-submit');
const fuList = $('fu-list');
const fuConverted = $('fu-converted');

const historyTabs = $('history-tabs');
const historyList = $('history-list');
const historyEmpty = $('history-empty');
const btnHistoryMore = $<HTMLButtonElement>('btn-history-more');

const planOverlay = $('plan-modal-overlay');
const planTarget = $('plan-target');
const planModalPresets = $('plan-modal-presets');
const inputPlanModalAt = $<HTMLInputElement>('input-plan-modal-at');
const inputPlanModalCue = $<HTMLInputElement>('input-plan-modal-cue');
const btnPlanClose = $<HTMLButtonElement>('btn-plan-close');
const btnPlanSave = $<HTMLButtonElement>('btn-plan-save');

const resultOverlay = $('result-modal-overlay');
const resultTarget = $('result-target');
const feelGroup = $('feel-group');
const decisionGroup = $('decision-group');
const inputLearning = $<HTMLInputElement>('input-learning');
const btnResultClose = $<HTMLButtonElement>('btn-result-close');
const btnResultSave = $<HTMLButtonElement>('btn-result-save');

const prepOverlay = $('prep-dialog-overlay');
const prepDialogText = $('prep-dialog-text');
const btnPrepForce = $<HTMLButtonElement>('btn-prep-force');
const btnPrepRewrite = $<HTMLButtonElement>('btn-prep-rewrite');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmDialogTitle = $('confirm-dialog-title');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmDelete = $<HTMLButtonElement>('btn-confirm-delete');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type HistoryFilter = 'all' | 'fail' | 'continue';

interface State {
  uid: string | null;
  unsubscribers: (() => void)[];
  tries: Try[];
  fus: Fu[];
  habits: Habit[];
  habitDays: number[];
  planTryId: string | null;
  hassle: number;
  fuKind: FuKind;
  /** 「不」ストックからとびついた場合、その「不」のID（登録成功時に変換済みにする） */
  fromFuId: string | null;
  historyFilter: HistoryFilter;
  historyLimit: number;
  resultTryId: string | null;
  feel: Feel | null;
  decision: Decision | null;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
}

const HISTORY_PAGE = 20;
const WARN_HOURS = 24;
const LATE_HOURS = 48;

const state: State = {
  uid: null,
  unsubscribers: [],
  tries: [],
  fus: [],
  habits: [],
  habitDays: [0, 1, 2, 3, 4, 5, 6],
  planTryId: null,
  hassle: 3,
  fuKind: 'fuman',
  fromFuId: null,
  historyFilter: 'all',
  historyLimit: HISTORY_PAGE,
  resultTryId: null,
  feel: null,
  decision: null,
  pending: new Set(),
  confirmAction: null,
};

// ============================================================
// Helpers
// ============================================================
/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<void> {
  if (state.pending.has(key)) return;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, action: () => Promise<void>): void {
  confirmDialogTitle.textContent = title;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
}

function choiceButtons<K extends string | number>(
  container: HTMLElement,
  items: { key: K; label: string }[],
  selected: K | null,
  onSelect: (key: K) => void,
  className = 'choice',
): void {
  container.replaceChildren(...items.map((item) => {
    const b = button(item.label, `${className}${item.key === selected ? ' is-selected' : ''}`, () => onSelect(item.key));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(item.key === selected));
    b.dataset.key = String(item.key);
    return b;
  }));
}

// ============================================================
// Render
// ============================================================
function renderDashboard(): void {
  const s = calcStats(state.tries, Date.now());
  dailyWordEl.textContent = DAILY_WORDS[hashString(todayKey()) % DAILY_WORDS.length];
  statTotal.textContent = String(s.total);
  statLevel.textContent = s.level;
  statNext.textContent = s.nextLevel ? `「${s.nextLevel.name}」まであと${s.nextLevel.remain}回` : '最高ランク到達！';
  statWeek.textContent = String(s.thisWeek);
  statStreak.textContent = String(s.streak);
  statFail.textContent = String(s.failLearnings);
  statPoints.textContent = String(s.points);

  const max = Math.max(1, ...s.weekly.map((w) => w.count));
  weeklyBars.replaceChildren(...s.weekly.map((w) => {
    const col = document.createElement('div');
    col.className = 'weekly__col';
    const num = textEl('span', 'weekly__num', w.count ? String(w.count) : '');
    const track = document.createElement('div');
    track.className = 'weekly__track';
    const bar = document.createElement('div');
    bar.className = 'weekly__bar';
    bar.style.height = `${(w.count / max) * 100}%`;
    track.appendChild(bar);
    col.append(num, track, textEl('span', 'weekly__label', w.label));
    return col;
  }));

  if (s.avgHoursToStart === null) {
    statSpeed.textContent = '登録してから実行するまでの平均時間がここに表示されます。';
  } else {
    const h = s.avgHoursToStart;
    const label = h < 1 ? `${Math.max(1, Math.round(h * 60))}分` : h < 48 ? `${Math.round(h)}時間` : `${Math.round(h / 24)}日`;
    statSpeed.textContent = `登録→実行までの平均：${label}${h < 24 ? '　その調子！' : '　もっと早く動けるはず'}`;
  }
}

function renderHasslePicker(): void {
  choiceButtons(
    hasslePicker,
    [1, 2, 3, 4, 5].map((n) => ({ key: n, label: String(n) })),
    state.hassle,
    (n) => { state.hassle = n; renderHasslePicker(); },
    'hassle',
  );
  const hint = document.createElement('span');
  hint.className = 'hassle-picker__label';
  hint.textContent = `${HASSLE_LABELS[state.hassle]}（+${state.hassle}pt）`;
  hasslePicker.appendChild(hint);
}

function renderPrepWarning(): void {
  const word = findPrepWord(inputStep.value);
  prepWarning.classList.toggle('hidden', !word);
  if (word) prepWarning.textContent = `「${word}」は準備中のサインかも。今すぐ手を動かせる行動に言い換えてみましょう。`;
}

function hassleDots(n: number): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'hassle-dots';
  wrap.setAttribute('aria-label', `面倒くさい度${n}`);
  for (let i = 1; i <= 5; i++) {
    const dot = document.createElement('span');
    dot.className = `hassle-dots__dot${i <= n ? ' is-on' : ''}`;
    wrap.appendChild(dot);
  }
  return wrap;
}

/** 予定あり（予定時刻順）→ 予定なし（登録順） */
function sortWaiting(a: Try, b: Try): number {
  if (a.planAt !== null && b.planAt !== null) return a.planAt - b.planAt;
  if (a.planAt !== null) return -1;
  if (b.planAt !== null) return 1;
  return a.createdAt - b.createdAt;
}

function linkButton(label: string, href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'btn btn--ghost btn--sm';
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label;
  return a;
}

function renderWaiting(): void {
  const now = Date.now();
  const waiting = state.tries.filter((t) => t.doneAt === null).sort(sortWaiting);
  waitingCount.textContent = String(waiting.length);
  waitingEmpty.classList.toggle('hidden', waiting.length > 0);

  waitingList.replaceChildren(...waiting.map((t) => {
    const hours = (now - t.createdAt) / 3600000;
    const overdue = t.planAt !== null && t.planAt < now;
    let tone = 'is-fresh';
    if (t.planAt !== null) tone = overdue ? 'is-late' : 'is-fresh';
    else if (hours >= LATE_HOURS) tone = 'is-late';
    else if (hours >= WARN_HOURS) tone = 'is-warn';
    const card = document.createElement('article');
    card.className = `try-card ${tone}`;

    const head = document.createElement('div');
    head.className = 'try-card__head';
    head.append(textEl('h3', 'try-card__title', t.title), hassleDots(t.hassle));

    const step = document.createElement('p');
    step.className = 'try-card__step';
    step.append(textEl('span', 'try-card__step-label', '最初の一歩'), textEl('span', '', t.firstStep));
    card.append(head, step);

    if (t.planAt !== null || t.cue) {
      const plan = document.createElement('p');
      plan.className = `try-card__plan${overdue ? ' is-overdue' : ''}`;
      const parts = [t.planAt !== null ? planLabel(t.planAt, now) : '', t.cue ? `${t.cue}、やる` : ''].filter(Boolean);
      plan.append(textEl('span', 'try-card__step-label', 'if-then'), textEl('span', '', parts.join(' ／ ')));
      if (t.postponed) plan.append(textEl('span', 'try-card__postponed', `延期${t.postponed}回`));
      card.append(plan);
    }

    let timerText = `登録から ${elapsedLabel(t.createdAt, now)}`;
    if (overdue) timerText += '　予定を過ぎています。今やるか、延期するか決めましょう';
    else if (t.planAt === null && hours >= LATE_HOURS) timerText += '　「準備中」になっていませんか？ 今日やるか、やめるか決めましょう';
    else if (t.planAt === null && hours >= WARN_HOURS) timerText += '　そろそろ動きましょう';
    else if (t.planAt === null) timerText += '　「いつやるか」を決めると実行しやすくなります';
    card.append(textEl('p', 'try-card__timer', timerText));

    const actions = document.createElement('div');
    actions.className = 'try-card__actions';
    const busy = state.pending.has(`try:${t.id}`);
    const del = button('やめる（削除）', 'btn btn--ghost btn--sm is-danger', () => {
      const uid = state.uid;
      if (!uid) return;
      askConfirm(`「${t.title}」を削除しますか？`, () => deleteTry(uid, t.id));
    });
    const plan = button(t.planAt !== null ? '予定を変更' : 'いつやるか決める', 'btn btn--ghost btn--sm', () => openPlan(t));
    const done = button('やった！結果を記録', 'btn btn--primary btn--sm', () => openResult(t));
    [del, plan, done].forEach((b) => { b.disabled = busy; });
    actions.append(del, plan);
    const cal = tryCalendarUrl(t);
    if (cal) actions.append(linkButton('カレンダーに登録', cal));
    if (overdue) {
      const later = button('明日に延期', 'btn btn--ghost btn--sm', () => postpone(t));
      later.disabled = busy;
      actions.append(later);
    }
    actions.append(done);

    card.append(actions);
    return card;
  }));
}

interface TodayItem {
  sortKey: number;
  done: boolean;
  el: HTMLElement;
}

function checkButton(done: boolean, label: string, onClick: () => void, disabled: boolean): HTMLButtonElement {
  const b = button('', `today-item__check${done ? ' is-done' : ''}`, onClick);
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-pressed', String(done));
  b.disabled = disabled;
  b.innerHTML = '<svg width="18" height="18" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 33 L27 46 L50 20"/></svg>';
  return b;
}

function todayRow(kind: string, title: string, meta: string, check: HTMLButtonElement, flags: { done: boolean; overdue: boolean }): HTMLElement {
  const li = document.createElement('li');
  li.className = `today-item${flags.done ? ' is-done' : ''}${flags.overdue ? ' is-overdue' : ''}`;
  const body = document.createElement('div');
  body.className = 'today-item__body';
  const top = document.createElement('div');
  top.className = 'today-item__top';
  top.append(textEl('span', 'today-item__kind', kind));
  if (flags.overdue) top.append(textEl('span', 'today-item__overdue', '予定超過'));
  body.append(top, textEl('p', 'today-item__title', title));
  if (meta) body.append(textEl('p', 'today-item__meta', meta));
  li.append(check, body);
  return li;
}

function renderToday(): void {
  const now = Date.now();
  const today = todayKey();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  todayDateEl.textContent = labelOf(now);

  const items: TodayItem[] = [];

  state.tries.forEach((t) => {
    if (t.planAt === null) return;
    const plannedToday = dateKey(new Date(t.planAt)) === today;
    const doneToday = t.doneAt !== null && dateKey(new Date(t.doneAt)) === today;
    const overdueOpen = t.doneAt === null && t.planAt <= endOfToday.getTime();
    if (!(overdueOpen || (plannedToday && (t.doneAt === null || doneToday)))) return;
    const done = t.doneAt !== null;
    const overdue = !done && t.planAt < now;
    const meta = [planLabel(t.planAt, now), t.cue ? `${t.cue}、やる` : '', `とびつき：${t.title}`].filter(Boolean).join('　');
    const check = checkButton(done, done ? '記録済み' : `「${t.firstStep}」の結果を記録`, () => { if (!done) openResult(t); }, done);
    items.push({ sortKey: t.planAt, done, el: todayRow('一歩', t.firstStep, meta, check, { done, overdue }) });
  });

  state.habits.forEach((h) => {
    if (!isScheduled(h, today)) return;
    const done = h.checks.has(today);
    const [hh, mm] = h.time ? h.time.split(':').map(Number) : [23, 59];
    const at = new Date();
    at.setHours(hh, mm, 0, 0);
    const overdue = !done && h.time !== '' && at.getTime() < now;
    const meta = [h.time, h.cue ? `${h.cue}、やる` : ''].filter(Boolean).join('　');
    const check = checkButton(done, done ? `「${h.title}」のチェックを外す` : `「${h.title}」を実行した`, () => toggleHabit(h, today), state.pending.has(`habit:${h.id}`));
    items.push({ sortKey: at.getTime(), done, el: todayRow('決めたこと', h.title, meta, check, { done, overdue }) });
  });

  items.sort((a, b) => (Number(a.done) - Number(b.done)) || (a.sortKey - b.sortKey));
  const doneCount = items.filter((i) => i.done).length;
  todayProgress.textContent = `${doneCount}/${items.length}`;
  todayBar.style.width = items.length ? `${(doneCount / items.length) * 100}%` : '0%';
  todayList.replaceChildren(...items.map((i) => i.el));
  todayEmpty.classList.toggle('hidden', items.length > 0);

  const rate = onPlanRate(state.tries);
  const habitRates = state.habits.map((h) => habitStats(h).rate).filter((r): r is number => r !== null);
  const parts: string[] = [];
  if (rate) parts.push(`予定どおりに一歩を実行：${rate.rate}%（${rate.count}件）`);
  if (habitRates.length) parts.push(`決めたことの実行率（30日）：${Math.round(habitRates.reduce((a, b) => a + b, 0) / habitRates.length)}%`);
  todayRate.textContent = parts.join('　');
}

function renderPresets(container: HTMLElement, input: HTMLInputElement): void {
  const now = Date.now();
  const current = input.value;
  const chips = PLAN_PRESETS.map((p) => {
    const value = toLocalInput(presetToMs(p.key, now));
    const b = button(p.label, `chip${current === value ? ' is-selected' : ''}`, () => {
      input.value = toLocalInput(presetToMs(p.key, Date.now()));
      renderPresets(container, input);
    });
    return b;
  });
  const none = button('未定', `chip${current === '' ? ' is-selected' : ''}`, () => {
    input.value = '';
    renderPresets(container, input);
  });
  container.replaceChildren(...chips, none);
}

function renderHabitDays(): void {
  // 月曜はじまりで並べる
  const order = [1, 2, 3, 4, 5, 6, 0];
  habitDaysPicker.replaceChildren(...order.map((d) => {
    const on = state.habitDays.includes(d);
    const b = button(WEEK_LABELS[d], `weekday${on ? ' is-selected' : ''}`, () => {
      state.habitDays = on ? state.habitDays.filter((x) => x !== d) : [...state.habitDays, d];
      renderHabitDays();
    });
    b.setAttribute('aria-pressed', String(on));
    return b;
  }));
}

function renderHabits(): void {
  const today = todayKey();
  const habits = [...state.habits].sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.createdAt - b.createdAt);
  habitList.replaceChildren(...habits.map((h) => {
    const st = habitStats(h);
    const card = document.createElement('article');
    card.className = 'habit-card';

    const head = document.createElement('div');
    head.className = 'habit-card__head';
    const titleWrap = document.createElement('div');
    titleWrap.append(
      textEl('h3', 'habit-card__title', h.title),
      textEl('p', 'habit-card__meta', [daysLabel(h.days), h.time, h.cue ? `${h.cue}、やる` : ''].filter(Boolean).join('　')),
    );
    const streak = document.createElement('div');
    streak.className = 'habit-card__streak';
    streak.append(textEl('span', 'habit-card__streak-num', String(st.streak)), textEl('span', 'habit-card__streak-label', '回連続'));
    head.append(titleWrap, streak);

    const week = document.createElement('div');
    week.className = 'habit-week';
    st.last7.forEach((d) => {
      const col = document.createElement('div');
      col.className = `habit-week__day is-${d.state}`;
      col.title = d.key;
      col.append(textEl('span', 'habit-week__dot', ''), textEl('span', 'habit-week__label', d.label));
      week.append(col);
    });

    const foot = document.createElement('div');
    foot.className = 'habit-card__foot';
    foot.append(textEl('span', 'habit-card__rate', st.rate === null ? '30日の実行率：—' : `30日の実行率：${st.rate}%`));
    const actions = document.createElement('div');
    actions.className = 'habit-card__actions';
    actions.append(button('削除', 'btn btn--ghost btn--sm is-danger', () => {
      const uid = state.uid;
      if (!uid) return;
      askConfirm(`「${h.title}」を削除しますか？（実行記録も消えます）`, () => deleteHabit(uid, h.id));
    }));
    actions.append(linkButton('カレンダーに登録', habitCalendarUrl(h)));
    if (isScheduled(h, today)) {
      const done = h.checks.has(today);
      const b = button(done ? '今日は実行済み' : '今日やった！', `btn btn--sm ${done ? 'btn--ghost' : 'btn--primary'}`, () => toggleHabit(h, today));
      b.disabled = state.pending.has(`habit:${h.id}`);
      actions.append(b);
    }
    foot.append(actions);

    card.append(head, week, foot);
    return card;
  }));
}

function renderFus(): void {
  choiceButtons(fuKinds, FU_KINDS, state.fuKind, (k) => { state.fuKind = k; renderFus(); }, 'chip');

  const open = state.fus.filter((f) => f.convertedAt === null).sort((a, b) => b.createdAt - a.createdAt);
  const convertedCount = state.fus.length - open.length;
  fuConverted.textContent = convertedCount ? `これまで ${convertedCount} 個の「不」にとびつきました` : '';

  fuList.replaceChildren(...open.map((f) => {
    const li = document.createElement('li');
    li.className = 'fu-item';
    const kind = FU_KINDS.find((k) => k.key === f.kind)?.label ?? 'その他';
    const body = document.createElement('div');
    body.className = 'fu-item__body';
    body.append(textEl('span', 'fu-item__kind', kind), textEl('span', 'fu-item__text', f.text));
    const actions = document.createElement('div');
    actions.className = 'fu-item__actions';
    const del = button('削除', 'btn btn--ghost btn--sm is-danger', () => {
      const uid = state.uid;
      if (!uid) return;
      askConfirm('この「不」を削除しますか？', () => deleteFu(uid, f.id));
    });
    const go = button('とびつく', 'btn btn--primary btn--sm', () => startFromFu(f));
    actions.append(del, go);
    li.append(body, actions);
    return li;
  }));
}

function renderHistory(): void {
  historyTabs.querySelectorAll<HTMLButtonElement>('.tabs__btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.filter === state.historyFilter);
  });
  const done = state.tries
    .filter((t) => t.doneAt !== null)
    .filter((t) => (state.historyFilter === 'fail' ? t.feel === 'fail'
      : state.historyFilter === 'continue' ? t.decision === 'continue' : true))
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  historyEmpty.classList.toggle('hidden', done.length > 0);
  btnHistoryMore.classList.toggle('hidden', done.length <= state.historyLimit);

  historyList.replaceChildren(...done.slice(0, state.historyLimit).map((t) => {
    const card = document.createElement('article');
    card.className = 'try-card is-done';

    const head = document.createElement('div');
    head.className = 'try-card__head';
    head.append(textEl('h3', 'try-card__title', t.title), hassleDots(t.hassle));

    const badges = document.createElement('div');
    badges.className = 'try-card__badges';
    badges.append(textEl('span', 'try-card__date', labelOf(t.doneAt ?? t.createdAt)));
    if (t.feel) badges.append(textEl('span', `badge badge--${t.feel}`, FEEL_LABELS[t.feel]));
    if (t.decision) badges.append(textEl('span', `badge badge--${t.decision}`, DECISION_LABELS[t.decision]));

    card.append(head, badges);
    if (t.learning) {
      const learn = document.createElement('p');
      learn.className = 'try-card__learning';
      learn.append(textEl('span', 'try-card__step-label', '学び'), textEl('span', '', t.learning));
      card.append(learn);
    }

    const actions = document.createElement('div');
    actions.className = 'try-card__actions';
    if (t.decision !== 'quit') {
      actions.append(button('次の一歩を登録', 'btn btn--ghost btn--sm', () => prefillNext(t)));
    }
    actions.append(button('削除', 'btn btn--ghost btn--sm is-danger', () => {
      const uid = state.uid;
      if (!uid) return;
      askConfirm('この記録を削除しますか？（試行数も1減ります）', () => deleteTry(uid, t.id));
    }));
    card.append(actions);
    return card;
  }));
}

function renderResultChoices(): void {
  choiceButtons(feelGroup, (Object.keys(FEEL_LABELS) as Feel[]).map((k) => ({ key: k, label: FEEL_LABELS[k] })),
    state.feel, (k) => { state.feel = k; renderResultChoices(); });
  choiceButtons(decisionGroup, (Object.keys(DECISION_LABELS) as Decision[]).map((k) => ({ key: k, label: DECISION_LABELS[k] })),
    state.decision, (k) => { state.decision = k; renderResultChoices(); });
  btnResultSave.disabled = !state.feel || !state.decision || state.pending.has('result');
}

function renderAll(): void {
  renderDashboard();
  renderToday();
  renderWaiting();
  renderHabits();
  renderFus();
  renderHistory();
  renderResultChoices();
  btnTrySubmit.disabled = state.pending.has('try:create');
  btnFuSubmit.disabled = state.pending.has('fu:create');
  btnHabitSubmit.disabled = state.pending.has('habit:create');
  btnPlanSave.disabled = state.pending.has('plan');
}

// ============================================================
// Actions
// ============================================================
function focusAddForm(focusEl: HTMLInputElement): void {
  sectionAdd.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => focusEl.focus({ preventScroll: true }), 350);
}

function startFromFu(f: Fu): void {
  state.fromFuId = f.id;
  inputTitle.value = f.text.slice(0, 60);
  inputStep.value = '';
  renderPrepWarning();
  focusAddForm(inputStep);
}

function prefillNext(t: Try): void {
  state.fromFuId = null;
  inputTitle.value = t.decision === 'pivot' ? '' : t.title;
  inputStep.value = '';
  inputPlanAt.value = '';
  inputCue.value = '';
  renderPresets(planPresets, inputPlanAt);
  renderPrepWarning();
  focusAddForm(t.decision === 'pivot' ? inputTitle : inputStep);
}

function openPlan(t: Try): void {
  state.planTryId = t.id;
  planTarget.textContent = t.firstStep;
  inputPlanModalAt.value = t.planAt !== null ? toLocalInput(t.planAt) : '';
  inputPlanModalCue.value = t.cue;
  renderPresets(planModalPresets, inputPlanModalAt);
  openOverlay(planOverlay);
}

function closePlan(): void {
  closeOverlay(planOverlay);
  state.planTryId = null;
}

/** 入力欄から if-then プランを読む。過去の日時なら null を返して呼び出し側で止める */
function readPlan(atInput: HTMLInputElement, cueInput: HTMLInputElement): PlanInput | null {
  const planAt = fromLocalInput(atInput.value);
  if (planAt !== null && planAt < Date.now() - 60 * 1000) {
    showToast('過去の日時になっています。これからの日時を選びましょう');
    atInput.focus();
    return null;
  }
  return { planAt, cue: cueInput.value.trim().slice(0, 40) };
}

function postpone(t: Try): void {
  const uid = state.uid;
  if (!uid || t.planAt === null) return;
  const DAY = 24 * 60 * 60 * 1000;
  let next = t.planAt + DAY;
  while (next < Date.now()) next += DAY;
  void withLock(`try:${t.id}`, async () => {
    await updatePlan(uid, t.id, { planAt: next, cue: t.cue }, true);
    showToast(`${planLabel(next, Date.now())} に延期しました。次は必ず！`);
  });
}

function toggleHabit(h: Habit, date: string): void {
  const uid = state.uid;
  if (!uid) return;
  const on = !h.checks.has(date);
  void withLock(`habit:${h.id}`, async () => {
    await setHabitCheck(uid, h.id, date, on);
    if (on) showToast('ナイス！ 決めたことを実行しました');
  });
}

function openResult(t: Try): void {
  state.resultTryId = t.id;
  state.feel = null;
  state.decision = null;
  inputLearning.value = '';
  resultTarget.textContent = t.title;
  renderResultChoices();
  openOverlay(resultOverlay);
}

function closeResult(): void {
  closeOverlay(resultOverlay);
  state.resultTryId = null;
}

function submitTry(): void {
  const uid = state.uid;
  if (!uid) return;
  const title = inputTitle.value.trim();
  const step = inputStep.value.trim();
  const hassle = state.hassle;
  const fuId = state.fromFuId;
  const plan = readPlan(inputPlanAt, inputCue);
  if (!plan) return;
  void withLock('try:create', async () => {
    await createTry(uid, title.slice(0, 60), step.slice(0, 80), hassle, plan);
    if (fuId) await markFuConverted(uid, fuId);
    inputTitle.value = '';
    inputStep.value = '';
    inputPlanAt.value = '';
    inputCue.value = '';
    state.fromFuId = null;
    renderPresets(planPresets, inputPlanAt);
    renderPrepWarning();
    showToast(plan.planAt !== null
      ? `${planLabel(plan.planAt, Date.now())} にやると決めました。カレンダー登録もおすすめ！`
      : 'とびつきリストに追加しました。さあ、最初の一歩を！');
  });
}

// ============================================================
// Auth
// ============================================================
function onLoadError(err: Error): void {
  console.error(err);
  showToast('データの読み込みに失敗しました。再読み込みしてください');
}

function handleUser(user: User | null): void {
  state.unsubscribers.forEach((fn) => fn());
  state.unsubscribers = [];
  state.tries = [];
  state.fus = [];
  state.habits = [];
  state.uid = user?.uid ?? null;

  if (!user) {
    loginScreen.classList.remove('hidden');
    appEl.classList.add('hidden');
    userInfo.classList.add('hidden');
    return;
  }

  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userName.textContent = user.displayName ?? '';
  if (user.photoURL) {
    userAvatar.src = user.photoURL;
    userAvatar.classList.remove('hidden');
  } else {
    userAvatar.classList.add('hidden');
  }

  renderAll();
  state.unsubscribers.push(
    subscribeTries(user.uid, (list) => { state.tries = list; renderAll(); }, onLoadError),
    subscribeFus(user.uid, (list) => { state.fus = list; renderAll(); }, onLoadError),
    subscribeHabits(user.uid, (list) => { state.habits = list; renderAll(); }, onLoadError),
  );
}

// ============================================================
// Events
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      console.error(err);
      showToast('ログインに失敗しました');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

inputStep.addEventListener('input', renderPrepWarning);

tryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!inputTitle.value.trim()) {
    showToast('思いついたことを入力してください');
    inputTitle.focus();
    return;
  }
  const step = inputStep.value.trim();
  if (!step) {
    showToast('「5分でできる最初の一歩」を決めましょう');
    inputStep.focus();
    return;
  }
  const word = findPrepWord(step);
  if (word) {
    prepDialogText.textContent = `「${word}」が入っています。準備や下調べは、動かない理由になりがちです。5分で手を動かせる行動（連絡する・申し込む・作ってみる など）に言い換えられませんか？`;
    openOverlay(prepOverlay);
    return;
  }
  submitTry();
});

btnPrepRewrite.addEventListener('click', () => {
  closeOverlay(prepOverlay);
  inputStep.focus();
  inputStep.select();
});

btnPrepForce.addEventListener('click', () => {
  closeOverlay(prepOverlay);
  submitTry();
});

inputPlanAt.addEventListener('input', () => renderPresets(planPresets, inputPlanAt));
inputPlanModalAt.addEventListener('input', () => renderPresets(planModalPresets, inputPlanModalAt));

btnPlanClose.addEventListener('click', closePlan);

btnPlanSave.addEventListener('click', () => {
  const uid = state.uid;
  const id = state.planTryId;
  if (!uid || !id) return;
  const plan = readPlan(inputPlanModalAt, inputPlanModalCue);
  if (!plan) return;
  void withLock('plan', async () => {
    await updatePlan(uid, id, plan);
    closePlan();
    showToast(plan.planAt !== null ? `${planLabel(plan.planAt, Date.now())} にやると決めました` : '予定を未定にしました');
  });
});

habitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const title = inputHabitTitle.value.trim();
  if (!title) {
    showToast('決めたことを入力してください');
    inputHabitTitle.focus();
    return;
  }
  if (!state.habitDays.length) {
    showToast('やる曜日を1つ以上選んでください');
    return;
  }
  const days = [...state.habitDays].sort();
  const time = inputHabitTime.value;
  const cue = inputHabitCue.value.trim().slice(0, 40);
  void withLock('habit:create', async () => {
    await createHabit(uid, title.slice(0, 40), cue, days, time);
    inputHabitTitle.value = '';
    inputHabitTime.value = '';
    inputHabitCue.value = '';
    state.habitDays = [0, 1, 2, 3, 4, 5, 6];
    renderHabitDays();
    showToast('決めたことに追加しました。今日やる日なら「今日やること」に並びます');
  });
});

fuForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const uid = state.uid;
  const text = inputFu.value.trim();
  if (!uid) return;
  if (!text) {
    showToast('見つけた「不」を入力してください');
    inputFu.focus();
    return;
  }
  const kind = state.fuKind;
  void withLock('fu:create', async () => {
    await createFu(uid, text.slice(0, 80), kind);
    inputFu.value = '';
    showToast('ストックしました');
  });
});

historyTabs.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.tabs__btn');
  const filter = btn?.dataset.filter;
  if (filter !== 'all' && filter !== 'fail' && filter !== 'continue') return;
  state.historyFilter = filter;
  state.historyLimit = HISTORY_PAGE;
  renderHistory();
});

btnHistoryMore.addEventListener('click', () => {
  state.historyLimit += HISTORY_PAGE;
  renderHistory();
});

btnResultClose.addEventListener('click', closeResult);

btnResultSave.addEventListener('click', () => {
  const uid = state.uid;
  const id = state.resultTryId;
  const { feel, decision } = state;
  if (!uid || !id || !feel || !decision) return;
  const t = state.tries.find((x) => x.id === id);
  const learning = inputLearning.value.trim().slice(0, 100);
  void withLock('result', async () => {
    await completeTry(uid, id, feel, decision, learning);
    closeResult();
    const msg = feel === 'fail' ? '試行数 +1！ 失敗は知見。次の打席へ' : '試行数 +1！ ナイスアクション';
    showToast(msg);
    if (t && decision !== 'quit') prefillNext({ ...t, decision });
  });
});

btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});

btnConfirmDelete.addEventListener('click', async () => {
  const action = state.confirmAction;
  if (!action) return;
  btnConfirmDelete.disabled = true;
  try {
    await action();
    state.confirmAction = null;
    closeOverlay(confirmOverlay);
  } catch (err) {
    console.error(err);
    showToast('削除に失敗しました');
  } finally {
    btnConfirmDelete.disabled = false;
  }
});

feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  inputFeedbackMessage.focus();
});

btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));

btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('内容を入力してください');
    return;
  }
  btnFeedbackSend.disabled = true;
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいてお試しください');
  }
});

// オーバーレイの背景クリック / Escで閉じる
const overlays = [planOverlay, resultOverlay, prepOverlay, feedbackOverlay, confirmOverlay];

function closeAllOverlays(target?: HTMLElement): void {
  (target ? [target] : overlays).forEach((o) => {
    closeOverlay(o);
    if (o === resultOverlay) state.resultTryId = null;
    if (o === planOverlay) state.planTryId = null;
    if (o === confirmOverlay) state.confirmAction = null;
  });
}

overlays.forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeAllOverlays(overlay);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllOverlays();
});

// 放置タイマーと「今週」「今日のひとこと」を最新に保つ
window.setInterval(() => {
  if (state.uid && document.visibilityState === 'visible') {
    renderDashboard();
    renderToday();
    renderWaiting();
    renderPresets(planPresets, inputPlanAt);
  }
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.uid) renderAll();
});

renderHasslePicker();
renderPresets(planPresets, inputPlanAt);
renderHabitDays();
onAuthChange(handleUser);
