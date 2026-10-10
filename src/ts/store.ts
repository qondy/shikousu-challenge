import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { isDecision, isFeel, isFuKind } from './words';
import { Decision, Feel, Fu, FuKind, Habit, Try } from './types';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const msOrNull = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? v : null);

export function subscribeTries(
  uid: string,
  onData: (tries: Try[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(collection(db, 'users', uid, 'tries'), (snap) => {
    const list: Try[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      if (!createdAt || typeof data.title !== 'string') return;
      const hassle = typeof data.hassle === 'number' ? Math.min(5, Math.max(1, Math.round(data.hassle))) : 3;
      list.push({
        id: d.id,
        title: data.title,
        firstStep: str(data.firstStep),
        hassle,
        createdAt,
        doneAt: msOrNull(data.doneAt),
        feel: isFeel(data.feel) ? data.feel : null,
        decision: isDecision(data.decision) ? data.decision : null,
        learning: str(data.learning),
        planAt: msOrNull(data.planAt),
        cue: str(data.cue),
        postponed: typeof data.postponed === 'number' && data.postponed > 0 ? Math.floor(data.postponed) : 0,
      });
    });
    onData(list);
  }, onError);
}

export interface PlanInput {
  planAt: number | null;
  cue: string;
}

export async function createTry(uid: string, title: string, firstStep: string, hassle: number, plan: PlanInput): Promise<string> {
  const ref = await addDoc(collection(db, 'users', uid, 'tries'), {
    title, firstStep, hassle, createdAt: Date.now(), doneAt: null, feel: null, decision: null, learning: '',
    planAt: plan.planAt, cue: plan.cue, postponed: 0,
  });
  return ref.id;
}

/** if-thenプランを設定・変更する。postpone=true なら延期回数を1増やす */
export function updatePlan(uid: string, id: string, plan: PlanInput, postpone = false): Promise<void> {
  const payload: Record<string, unknown> = { planAt: plan.planAt, cue: plan.cue };
  if (postpone) payload.postponed = increment(1);
  return updateDoc(doc(db, 'users', uid, 'tries', id), payload);
}

export function completeTry(uid: string, id: string, feel: Feel, decision: Decision, learning: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'tries', id), { doneAt: Date.now(), feel, decision, learning });
}

export function deleteTry(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'tries', id));
}

export function subscribeFus(
  uid: string,
  onData: (fus: Fu[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(collection(db, 'users', uid, 'fus'), (snap) => {
    const list: Fu[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      if (!createdAt || typeof data.text !== 'string') return;
      list.push({
        id: d.id,
        text: data.text,
        kind: isFuKind(data.kind) ? data.kind : 'other',
        createdAt,
        convertedAt: msOrNull(data.convertedAt),
      });
    });
    onData(list);
  }, onError);
}

export async function createFu(uid: string, text: string, kind: FuKind): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'fus'), { text, kind, createdAt: Date.now(), convertedAt: null });
}

export function markFuConverted(uid: string, id: string): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'fus', id), { convertedAt: Date.now() });
}

export function deleteFu(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'fus', id));
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function subscribeHabits(
  uid: string,
  onData: (habits: Habit[]) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(collection(db, 'users', uid, 'habits'), (snap) => {
    const list: Habit[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const createdAt = msOrNull(data.createdAt);
      if (!createdAt || typeof data.title !== 'string') return;
      const days = Array.isArray(data.days)
        ? (data.days as unknown[]).filter((n): n is number => typeof n === 'number' && n >= 0 && n <= 6)
        : [];
      const checks = new Set<string>();
      if (data.checks && typeof data.checks === 'object') {
        Object.entries(data.checks as Record<string, unknown>).forEach(([k, v]) => {
          if (v === true && DATE_RE.test(k)) checks.add(k);
        });
      }
      list.push({
        id: d.id,
        title: data.title,
        cue: str(data.cue),
        days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
        time: TIME_RE.test(str(data.time)) ? str(data.time) : '',
        checks,
        createdAt,
      });
    });
    onData(list);
  }, onError);
}

export async function createHabit(uid: string, title: string, cue: string, days: number[], time: string): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'habits'), { title, cue, days, time, checks: {}, createdAt: Date.now() });
}

export function setHabitCheck(uid: string, id: string, date: string, on: boolean): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'habits', id), { [`checks.${date}`]: on ? true : deleteField() });
}

export function deleteHabit(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'habits', id));
}
