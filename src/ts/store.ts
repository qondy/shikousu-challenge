import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { isDecision, isFeel, isFuKind } from './words';
import { Decision, Feel, Fu, FuKind, Try } from './types';

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
      });
    });
    onData(list);
  }, onError);
}

export async function createTry(uid: string, title: string, firstStep: string, hassle: number): Promise<string> {
  const ref = await addDoc(collection(db, 'users', uid, 'tries'), {
    title, firstStep, hassle, createdAt: Date.now(), doneAt: null, feel: null, decision: null, learning: '',
  });
  return ref.id;
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
