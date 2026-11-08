import { addDays, dateKey, todayKey, weekStart } from './dates';
import { LEVELS } from './words';
import { Try } from './types';

export interface Stats {
  total: number;
  thisWeek: number;
  streak: number;
  failLearnings: number;
  points: number;
  avgHoursToStart: number | null;
  weekly: { label: string; count: number }[];
  level: string;
  nextLevel: { name: string; remain: number } | null;
}

const WEEKS_SHOWN = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function calcStats(tries: Try[], nowMs: number): Stats {
  const done = tries.filter((t): t is Try & { doneAt: number } => t.doneAt !== null);
  const thisWeekStart = weekStart(nowMs).getTime();

  const doneDays = new Set(done.map((t) => dateKey(new Date(t.doneAt))));
  let cursor = todayKey();
  if (!doneDays.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (doneDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const weekly: { label: string; count: number }[] = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - i * 7);
    const s = start.getTime();
    const e = s + WEEK_MS;
    weekly.push({
      label: i === 0 ? '今週' : `${start.getMonth() + 1}/${start.getDate()}`,
      count: done.filter((t) => t.doneAt >= s && t.doneAt < e).length,
    });
  }

  const hours = done.map((t) => Math.max(0, t.doneAt - t.createdAt) / 3600000);
  const avgHoursToStart = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null;

  const total = done.length;
  let level = LEVELS[0].name;
  let nextLevel: Stats['nextLevel'] = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (total >= LEVELS[i].min) {
      level = LEVELS[i].name;
      const next = LEVELS[i + 1];
      nextLevel = next ? { name: next.name, remain: next.min - total } : null;
    }
  }

  return {
    total,
    thisWeek: done.filter((t) => t.doneAt >= thisWeekStart).length,
    streak,
    failLearnings: done.filter((t) => t.feel === 'fail').length,
    points: done.reduce((sum, t) => sum + t.hassle, 0),
    avgHoursToStart,
    weekly,
    level,
    nextLevel,
  };
}

// ============================================================
// はじめの頃 vs いま（挑戦の歩み）
// ============================================================
export interface GrowthSide {
  /** 通し番号の範囲（1始まり） */
  from: number;
  to: number;
  /** 1週間あたりの挑戦数 */
  pace: number;
  avgHassle: number;
  /** 登録→実行までの平均時間 */
  avgHours: number;
  /** 学びを残した割合（%） */
  learnRate: number;
  first: Try;
  last: Try;
}

export interface Growth {
  total: number;
  /** 最初の挑戦から今日までの日数 */
  days: number;
  early: GrowthSide;
  recent: GrowthSide;
}

/** 比べるときの1グループの最大件数 */
const GROWTH_GROUP = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function sideOf(list: (Try & { doneAt: number })[], offset: number): GrowthSide {
  const first = list[0];
  const last = list[list.length - 1];
  const spanWeeks = Math.max(7 * DAY_MS, last.doneAt - first.doneAt) / WEEK_MS;
  const avg = (nums: number[]): number => nums.reduce((a, b) => a + b, 0) / nums.length;
  return {
    from: offset + 1,
    to: offset + list.length,
    pace: list.length / spanWeeks,
    avgHassle: avg(list.map((t) => t.hassle)),
    avgHours: avg(list.map((t) => Math.max(0, t.doneAt - t.createdAt) / 3600000)),
    learnRate: Math.round((list.filter((t) => t.learning).length / list.length) * 100),
    first,
    last,
  };
}

/** 実行済みの挑戦を、最初の数件（はじめの頃）と最近の数件（いま）に分けて比べる。2件未満なら null */
export function calcGrowth(tries: Try[], nowMs: number): Growth | null {
  const done = tries
    .filter((t): t is Try & { doneAt: number } => t.doneAt !== null)
    .sort((a, b) => a.doneAt - b.doneAt);
  if (done.length < 2) return null;
  const n = Math.min(GROWTH_GROUP, Math.floor(done.length / 2));
  return {
    total: done.length,
    days: Math.max(1, Math.floor((nowMs - done[0].doneAt) / DAY_MS) + 1),
    early: sideOf(done.slice(0, n), 0),
    recent: sideOf(done.slice(-n), done.length - n),
  };
}

/** 時間を「45分」「5時間」「3日」で表す */
export function hoursLabel(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}分`;
  if (h < 48) return `${Math.round(h)}時間`;
  return `${Math.round(h / 24)}日`;
}
