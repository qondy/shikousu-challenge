import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyDASQq_6Lsbf7V7kJteafTB00nYsus9WIw',
  authDomain: 'shikousu-challenge.firebaseapp.com',
  projectId: 'shikousu-challenge',
  storageBucket: 'shikousu-challenge.firebasestorage.app',
  messagingSenderId: '24584702407',
  appId: '1:24584702407:web:a601df78ab1dfe959171e2',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
