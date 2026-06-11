import { httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../../firebase';
import type { UpgradeKey } from './constants';
import { GAME_ID } from './constants';

export async function connectBattlefield(): Promise<{
  ok: boolean;
  message: string;
  roundId?: string;
  roundNumber?: number;
}> {
  const fn = httpsCallable<
    void,
    { ok: boolean; message: string; roundId?: string; roundNumber?: number }
  >(functions, 'veryusDefenseConnect');
  const result = await fn();
  return result.data;
}

export async function manualSpawnUnit(): Promise<{ ok: boolean; message: string }> {
  const fn = httpsCallable<void, { ok: boolean; message: string }>(
    functions,
    'veryusDefenseManualSpawn'
  );
  const result = await fn();
  return result.data;
}

export async function claimDailyAttendance(): Promise<{
  ok: boolean;
  message: string;
  capital?: number;
}> {
  const fn = httpsCallable<void, { ok: boolean; message: string; capital?: number }>(
    functions,
    'veryusDefenseClaimDaily'
  );
  const result = await fn();
  return result.data;
}

export async function setDefenseDifficulty(multiplier: number): Promise<{
  ok: boolean;
  message: string;
  multiplier?: number;
}> {
  const fn = httpsCallable<{ multiplier: number }, { ok: boolean; message: string; multiplier?: number }>(
    functions,
    'veryusDefenseSetDifficulty'
  );
  const result = await fn({ multiplier });
  return result.data;
}

export async function requestBattleBoost(): Promise<{ ok: boolean; message: string }> {
  const fn = httpsCallable<void, { ok: boolean; message: string }>(
    functions,
    'veryusDefenseBoostTick'
  );
  const result = await fn();
  return result.data;
}

export async function purchaseUpgrade(upgradeKey: UpgradeKey): Promise<{
  ok: boolean;
  message: string;
  newLevel?: number;
  capital?: number;
}> {
  const fn = httpsCallable<{ upgradeKey: UpgradeKey }, { ok: boolean; message: string; newLevel?: number; capital?: number }>(
    functions,
    'veryusDefensePurchaseUpgrade'
  );
  const result = await fn({ upgradeKey });
  return result.data;
}

export function subscribeRound(
  roundId: string,
  onData: (data: Record<string, unknown> | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, 'games', GAME_ID, 'rounds', roundId),
    (snap) => onData(snap.exists() ? (snap.data() as Record<string, unknown>) : null),
    (error) => onError?.(error)
  );
}

export function subscribeUnits(
  roundId: string,
  onData: (docs: Array<{ id: string; data: Record<string, unknown> }>) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, 'games', GAME_ID, 'rounds', roundId, 'units'),
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })));
    },
    (error) => onError?.(error)
  );
}

export async function updatePresence(uid: string, nickname: string): Promise<void> {
  await setDoc(
    doc(db, 'games', GAME_ID, 'presence', uid),
    {
      uid,
      nickname,
      inGame: true,
      lastSeenAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearPresence(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'games', GAME_ID, 'presence', uid),
    {
      uid,
      inGame: false,
      lastSeenAt: serverTimestamp(),
    },
    { merge: true }
  );
}
