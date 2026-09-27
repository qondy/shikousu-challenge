import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { elapsedLabel, hashString, labelOf, todayKey } from './dates';
import {
  subscribeTries, createTry, completeTry, deleteTry,
  subscribeFus, createFu, markFuConverted, deleteFu,
} from './store';
import { calcStats } from './stats';
import {
  DAILY_WORDS, DECISION_LABELS, FEEL_LABELS, FU_KINDS, HASSLE_LABELS, findPrepWord,
} from './words';
import { Decision, Feel, Fu, FuKind, Try } from './types';

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

const sectionAdd = $('section-add');
const tryForm = $<HTMLFormElement>('try-form');
const inputTitle = $<HTMLInputElement>('input-title');
const inputStep = $<HTMLInputElement>('input-step');
const prepWarning = $('prep-warning');
const hasslePicker = $('hassle-picker');
const btnTrySubmit = $<HTMLButtonElement>('btn-try-submit');

const waitingCount = $('waiting-count');
const waitingList = $('waiting-list');
const waitingEmpty = $('waiting-empty');

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

function renderWaiting(): void {
  const now = Date.now();
  const waiting = state.tries.filter((t) => t.doneAt === null).sort((a, b) => a.createdAt - b.createdAt);
  waitingCount.textContent = String(waiting.length);
  waitingEmpty.classList.toggle('hidden', waiting.length > 0);

  waitingList.replaceChildren(...waiting.map((t) => {
    const hours = (now - t.createdAt) / 3600000;
    const tone = hours >= LATE_HOURS ? 'is-late' : hours >= WARN_HOURS ? 'is-warn' : 'is-fresh';
    const card = document.createElement('article');
    card.className = `try-card ${tone}`;

    const head = document.createElement('div');
    head.className = 'try-card__head';
    head.append(textEl('h3', 'try-card__title', t.title), hassleDots(t.hassle));

    const step = document.createElement('p');
    step.className = 'try-card__step';
    step.append(textEl('span', 'try-card__step-label', '最初の一歩'), textEl('span', '', t.firstStep));

    const timer = textEl('p', 'try-card__timer', `登録から ${elapsedLabel(t.createdAt, now)}`);
    if (hours >= LATE_HOURS) timer.textContent += '　「準備中」になっていませんか？ 今日やるか、やめるか決めましょう';
    else if (hours >= WARN_HOURS) timer.textContent += '　そろそろ動きましょう';

    const actions = document.createElement('div');
    actions.className = 'try-card__actions';
    const busy = state.pending.has(`try:${t.id}`);
    const del = button('やめる（削除）', 'btn btn--ghost btn--sm is-danger', () => {
      const uid = state.uid;
      if (!uid) return;
      askConfirm(`「${t.title}」を削除しますか？`, () => deleteTry(uid, t.id));
    });
    const done = button('やった！結果を記録', 'btn btn--primary btn--sm', () => openResult(t));
    del.disabled = busy;
    done.disabled = busy;
    actions.append(del, done);

    card.append(head, step, timer, actions);
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
  renderWaiting();
  renderFus();
  renderHistory();
  renderResultChoices();
  btnTrySubmit.disabled = state.pending.has('try:create');
  btnFuSubmit.disabled = state.pending.has('fu:create');
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
  renderPrepWarning();
  focusAddForm(t.decision === 'pivot' ? inputTitle : inputStep);
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
  void withLock('try:create', async () => {
    await createTry(uid, title.slice(0, 60), step.slice(0, 80), hassle);
    if (fuId) await markFuConverted(uid, fuId);
    inputTitle.value = '';
    inputStep.value = '';
    state.fromFuId = null;
    renderPrepWarning();
    showToast('とびつきリストに追加しました。さあ、最初の一歩を！');
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
const overlays = [resultOverlay, prepOverlay, feedbackOverlay, confirmOverlay];

function closeAllOverlays(target?: HTMLElement): void {
  (target ? [target] : overlays).forEach((o) => {
    closeOverlay(o);
    if (o === resultOverlay) state.resultTryId = null;
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
    renderWaiting();
  }
}, 60000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.uid) renderAll();
});

renderHasslePicker();
onAuthChange(handleUser);
