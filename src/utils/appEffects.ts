import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const EFFECTS_DOC = doc(db, 'appConfig', 'effects');

export type AppEffectsActor = {
  uid: string;
  nickname?: string;
};

export function subscribeSnowEnabled(
  onChange: (enabled: boolean) => void,
  onError?: (error: unknown) => void
): () => void {
  let stopped = false;
  let unsubscribe = () => {};
  let retryTimer = 0;

  const listen = () => {
    unsubscribe = onSnapshot(
      EFFECTS_DOC,
      (snap) => {
        onChange(snap.exists() && snap.data()?.snowEnabled === true);
      },
      (error) => {
        console.error('앱 효과 구독 실패:', error);
        onChange(false);
        onError?.(error);
        unsubscribe();
        if (stopped) return;
        retryTimer = window.setTimeout(() => {
          if (!stopped) listen();
        }, 4000);
      }
    );
  };

  listen();

  return () => {
    stopped = true;
    window.clearTimeout(retryTimer);
    unsubscribe();
  };
}

export async function setSnowEnabled(enabled: boolean, actor?: AppEffectsActor | null): Promise<void> {
  await setDoc(
    EFFECTS_DOC,
    {
      snowEnabled: enabled,
      updatedAt: serverTimestamp(),
      updatedByUid: actor?.uid ?? '',
      updatedByNickname: actor?.nickname?.trim() || '',
    },
    { merge: true }
  );
}
