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
