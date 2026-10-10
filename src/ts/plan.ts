import { addDays, dateKey, todayKey } from './dates';
import { Habit, Try } from './types';

const pad = (n: number): string => String(n).padStart(2, '0');
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export const WEEK_LABELS = WEEK;

// ============================================================
// if-thenプラン（とびつきの「いつ」）
// ============================================================
export type PlanPreset = 'hour' | 'tonight' | 'tomorrow';

export const PLAN_PRESETS: { key: PlanPreset; label: string }[] = [
  { key: 'hour', label: '1時間後' },
  { key: 'tonight', label: '今夜21時' },
  { key: 'tomorrow', label: '明日の朝8時' },
];

/** プリセットから予定日時（ms）を作る。21時を過ぎていたら「今夜」は2時間後にする */
export function presetToMs(preset: PlanPreset, nowMs: number): number {
  const d = new Date(nowMs);
  if (preset === 'hour') {
    d.setMinutes(Math.ceil((d.getMinutes() + 60) / 15) * 15, 0, 0);
    return d.getTime();
  }
  if (preset === 'tonight') {
    const t = new Date(nowMs);
    t.setHours(21, 0, 0, 0);
    return t.getTime() > nowMs ? t.getTime() : presetToMs('hour', nowMs) + 60 * 60 * 1000;
  }
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

/** <input type="datetime-local"> 用の値 */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** 「今日 21:00」「明日 8:00」「10/14（火）9:00」 */
export function planLabel(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const key = dateKey(d);
  const today = dateKey(new Date(nowMs));
  const time = `${d.getHours()}:${pad(d.getMinutes())}`;
  if (key === today) return `今日 ${time}`;
  if (key === addDays(today, 1)) return `明日 ${time}`;
  if (key === addDays(today, -1)) return `昨日 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${time}`;
}

/** 予定日の 23:59:59.999 */
function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** 予定どおり（予定日のうちに）実行できた割合。予定付きで実行した記録がなければ null */
export function onPlanRate(tries: Try[]): { rate: number; count: number } | null {
  const planned = tries.filter((t) => t.doneAt !== null && t.planAt !== null);
  if (!planned.length) return null;
  const ok = planned.filter((t) => (t.doneAt ?? 0) <= endOfDay(t.planAt ?? 0)).length;
  return { rate: Math.round((ok / planned.length) * 100), count: planned.length };
}

// ============================================================
// 決めたこと（繰り返しの行動）
// ============================================================
const weekdayOf = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

export function isScheduled(h: Habit, key: string): boolean {
  return key >= dateKey(new Date(h.createdAt)) && h.days.includes(weekdayOf(key));
}

export function daysLabel(days: number[]): string {
  if (days.length === 7) return '毎日';
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (sorted.join() === '1,2,3,4,5') return '平日';
  if (sorted.join() === '6,0') return '土日';
  return sorted.map((d) => WEEK[d]).join('・');
}

export interface HabitStats {
  /** 予定日ベースの連続実行回数 */
  streak: number;
  /** 直近30日の実行率（予定日がなければ null） */
  rate: number | null;
  /** 直近7日の状態 */
  last7: { key: string; label: string; state: 'done' | 'miss' | 'off' | 'today' }[];
}

export function habitStats(h: Habit): HabitStats {
  const today = todayKey();
  const created = dateKey(new Date(h.createdAt));

  let streak = 0;
  let cursor = today;
  // 今日がまだ未実行なら、昨日からさかのぼる（今日の分で連続が途切れたことにしない）
  if (!h.checks.has(cursor)) cursor = addDays(cursor, -1);
  for (let i = 0; i < 400 && cursor >= created; i++) {
    if (isScheduled(h, cursor)) {
      if (!h.checks.has(cursor)) break;
      streak++;
    }
    cursor = addDays(cursor, -1);
  }

  let scheduled = 0;
  let done = 0;
  for (let i = 0; i < 30; i++) {
    const key = addDays(today, -i);
    if (key < created) break;
    if (!isScheduled(h, key)) continue;
    // 今日はまだ途中なので、実行済みのときだけ分母に入れる
    if (key === today && !h.checks.has(key)) continue;
    scheduled++;
    if (h.checks.has(key)) done++;
  }

  const last7: HabitStats['last7'] = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDays(today, -i);
    const label = WEEK[weekdayOf(key)];
    let state: HabitStats['last7'][number]['state'] = 'off';
    if (h.checks.has(key)) state = 'done';
    else if (!isScheduled(h, key)) state = 'off';
    else state = key === today ? 'today' : 'miss';
    last7.push({ key, label, state });
  }

  return { streak, rate: scheduled ? Math.round((done / scheduled) * 100) : null, last7 };
}

// ============================================================
// Googleカレンダー連携（予定とリマインダーをカレンダー側に任せる）
// ============================================================
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function calStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function calendarUrl(params: Record<string, string>): string {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', ...params }).toString()}`;
}

const APP_URL = 'https://shikousu-challenge.vercel.app';

export function tryCalendarUrl(t: Try): string | null {
  if (t.planAt === null) return null;
  const start = new Date(t.planAt);
  const end = new Date(t.planAt + 15 * 60 * 1000);
  const details = [t.cue ? `きっかけ：${t.cue}` : '', `最初の一歩：${t.firstStep}`, `やったら記録 → ${APP_URL}`]
    .filter(Boolean).join('\n');
  return calendarUrl({ text: `【一歩】${t.firstStep}`, dates: `${calStamp(start)}/${calStamp(end)}`, details });
}

export function habitCalendarUrl(h: Habit): string {
  // 次に予定されている日（今日を含む）から始める
  let key = todayKey();
  for (let i = 0; i < 7 && !h.days.includes(weekdayOf(key)); i++) key = addDays(key, 1);
  const [y, m, d] = key.split('-').map(Number);
  let dates: string;
  if (h.time) {
    const [hh, mm] = h.time.split(':').map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    dates = `${calStamp(start)}/${calStamp(end)}`;
  } else {
    dates = `${key.replace(/-/g, '')}/${addDays(key, 1).replace(/-/g, '')}`;
  }
  const details = [h.cue ? `きっかけ：${h.cue}` : '', `やったらチェック → ${APP_URL}`].filter(Boolean).join('\n');
  return calendarUrl({
    text: `【決めたこと】${h.title}`,
    dates,
    details,
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${h.days.map((n) => BYDAY[n]).join(',')}`,
  });
}
