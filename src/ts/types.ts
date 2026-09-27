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
}

/** 「不」ストック（不満・不便・不安・不平等） */
export interface Fu {
  id: string;
  text: string;
  kind: FuKind;
  createdAt: number;
  convertedAt: number | null;
}
