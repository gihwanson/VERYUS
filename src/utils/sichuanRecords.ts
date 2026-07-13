import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface SichuanRecord {
  uid: string;
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  updatedAtMs: number;
  lastMatchKey: string | null;
}

const recordsCol = () => collection(db, 'games', 'sichuan', 'records');
const recordRef = (uid: string) => doc(db, 'games', 'sichuan', 'records', uid);

export const emptySichuanRecord = (uid: string, nickname = ''): SichuanRecord => ({
  uid,
  nickname: nickname.slice(0, 24),
  wins: 0,
  losses: 0,
  draws: 0,
  gamesPlayed: 0,
  updatedAtMs: Date.now(),
  lastMatchKey: null,
});

export const formatSichuanRecord = (r: Pick<SichuanRecord, 'wins' | 'losses' | 'draws'>): string => {
  if (r.draws > 0) return `${r.wins}승 ${r.losses}패 ${r.draws}무`;
  return `${r.wins}승 ${r.losses}패`;
};

export const sichuanWinRate = (r: Pick<SichuanRecord, 'wins' | 'losses' | 'draws'>): number => {
  const n = r.wins + r.losses + r.draws;
  if (n <= 0) return 0;
  return Math.round((r.wins / n) * 100);
};

export const sortSichuanRecords = (list: SichuanRecord[]): SichuanRecord[] =>
  [...list].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const ar = sichuanWinRate(a);
    const br = sichuanWinRate(b);
    if (br !== ar) return br - ar;
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
  });

export const getSichuanRecord = async (uid: string): Promise<SichuanRecord | null> => {
  const snap = await getDoc(recordRef(uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...(snap.data() as Omit<SichuanRecord, 'uid'>) };
};

export const getSichuanRecordsByUids = async (
  uids: string[]
): Promise<Record<string, SichuanRecord>> => {
  const unique = [...new Set(uids.filter(Boolean))];
  const out: Record<string, SichuanRecord> = {};
  await Promise.all(
    unique.map(async (uid) => {
      const rec = await getSichuanRecord(uid);
      if (rec) out[uid] = rec;
      else out[uid] = emptySichuanRecord(uid);
    })
  );
  return out;
};

export const listSichuanRecords = async (): Promise<SichuanRecord[]> => {
  const snap = await getDocs(recordsCol());
  return sortSichuanRecords(
    snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<SichuanRecord, 'uid'>) }))
  );
};

export const subscribeSichuanRecords = (
  onData: (records: SichuanRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe =>
  onSnapshot(
    recordsCol(),
    (snap) => {
      onData(
        sortSichuanRecords(
          snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<SichuanRecord, 'uid'>) }))
        )
      );
    },
    (err) => {
      console.error('사천성 전적 구독 실패:', err);
      onError?.(err);
      onData([]);
    }
  );

export type SichuanMatchOutcome = 'win' | 'loss' | 'draw';

/** 본인 전적만 갱신 (종료 시 각자 호출). 동일 매치는 1회만 반영 */
export const applySichuanMatchResult = async (params: {
  uid: string;
  nickname: string;
  outcome: SichuanMatchOutcome;
  matchKey: string;
}): Promise<SichuanRecord> => {
  const ref = recordRef(params.uid);
  const nickname = params.nickname.slice(0, 24);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists()
      ? ({ uid: snap.id, ...(snap.data() as Omit<SichuanRecord, 'uid'>) } as SichuanRecord)
      : emptySichuanRecord(params.uid, nickname);

    if (prev.lastMatchKey === params.matchKey) return prev;

    const wins = prev.wins + (params.outcome === 'win' ? 1 : 0);
    const losses = prev.losses + (params.outcome === 'loss' ? 1 : 0);
    const draws = prev.draws + (params.outcome === 'draw' ? 1 : 0);
    const next: SichuanRecord = {
      uid: params.uid,
      nickname: nickname || prev.nickname,
      wins,
      losses,
      draws,
      gamesPlayed: wins + losses + draws,
      updatedAtMs: Date.now(),
      lastMatchKey: params.matchKey,
    };
    tx.set(ref, next);
    return next;
  });
};
