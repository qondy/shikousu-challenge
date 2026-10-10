export type Feel = 'good' | 'soso' | 'fail';
export type Decision = 'continue' | 'pivot' | 'quit';
export type FuKind = 'fuman' | 'fuben' | 'fuan' | 'fubyodo' | 'other';

/** とびついたこと（未着手 or やってみた） */
export interface Try {
  id: string;
  title: string;
  firstStep: string;
  /** 面倒くさい度 1〜5（そのままポイントになる） */
  hassle: number;
  createdAt: number;
  doneAt: number | null;
  feel: Feel | null;
  decision: Decision | null;
  learning: string;
  /** 実行予定日時（if-thenプランの「いつ」）。未定なら null */
  planAt: number | null;
  /** きっかけ（if-thenプランの「〜したら」） */
  cue: string;
  /** 延期した回数 */
  postponed: number;
}

/** 「不」ストック（不満・不便・不安・不平等） */
export interface Fu {
  id: string;
  text: string;
  kind: FuKind;
  createdAt: number;
  convertedAt: number | null;
}

/** 決めたこと（繰り返しの行動） */
export interface Habit {
  id: string;
  title: string;
  cue: string;
  /** 実行する曜日（0=日〜6=土） */
  days: number[];
  /** 実行時刻 HH:MM（未定なら空文字） */
  time: string;
  /** 実行した日（YYYY-MM-DD） */
  checks: Set<string>;
  createdAt: number;
}
