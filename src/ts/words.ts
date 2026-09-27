import { Decision, Feel, FuKind } from './types';

/** 「最初の一歩」が準備・先延ばしになっていないかを判定するための言葉 */
const PREP_WORDS = [
  '準備', '調べ', '調査', 'リサーチ', '情報収集', '計画', '検討', '考える', '考え中', '勉強',
  '様子見', 'いつか', 'そのうち', '落ち着いたら', '比較', '下調べ', '構想', '整理', 'まとめる',
];

/** 見つかった「準備中ワード」を返す（なければ null） */
export function findPrepWord(text: string): string | null {
  return PREP_WORDS.find((w) => text.includes(w)) ?? null;
}

export const HASSLE_LABELS: Record<number, string> = {
  1: 'ラク',
  2: 'ちょっと面倒',
  3: 'ふつうに面倒',
  4: 'かなり面倒',
  5: '超めんどう',
};

export const FEEL_LABELS: Record<Feel, string> = {
  good: 'うまくいった',
  soso: 'まあまあ',
  fail: '失敗した',
};

export const DECISION_LABELS: Record<Decision, string> = {
  continue: '続ける',
  pivot: '方向転換',
  quit: 'やめる',
};

export const FU_KINDS: { key: FuKind; label: string }[] = [
  { key: 'fuman', label: '不満' },
  { key: 'fuben', label: '不便' },
  { key: 'fuan', label: '不安' },
  { key: 'fubyodo', label: '不平等' },
  { key: 'other', label: 'その他' },
];

export const isFeel = (v: unknown): v is Feel => v === 'good' || v === 'soso' || v === 'fail';
export const isDecision = (v: unknown): v is Decision => v === 'continue' || v === 'pivot' || v === 'quit';
export const isFuKind = (v: unknown): v is FuKind => FU_KINDS.some((k) => k.key === v);

/** 日替わりのひとこと */
export const DAILY_WORDS = [
  '「準備中」と言った瞬間、止まっている。',
  '計画を立てすぎない。いいと思ったら、まず飛びつく。',
  '失敗した数だけ、知見がたまる。',
  '面倒くさいことほど、ライバルがいない。',
  '差がつくのは、才能より試行回数。',
  '世間の目より、自分の打席数。',
  '合うか合わないかは、やってみてから決めればいい。',
  'やめるのも、方向転換も、立派な1回の試行。',
  '仕事を受けながら、並行して始めればいい。',
  '地道で泥臭い一手を、軽く見ない。',
  '周りの反対より、自分の判断で動く。',
  '身の回りの「不」は、挑戦のタネになる。',
];

/** 総試行数に応じた称号 */
export const LEVELS: { min: number; name: string }[] = [
  { min: 0, name: 'まだ打席に立っていない' },
  { min: 1, name: '一歩目を踏み出した人' },
  { min: 5, name: '打席に立つ人' },
  { min: 15, name: '行動派' },
  { min: 30, name: '試行の常連' },
  { min: 60, name: '泥臭いチャレンジャー' },
  { min: 100, name: '圧倒的行動力' },
];
