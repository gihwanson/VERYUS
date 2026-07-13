import {
  SICHUAN_MAX_COMBO_BONUS,
  SICHUAN_MAX_PAIRS,
  SICHUAN_MAX_SCORE,
  SICHUAN_MAX_SHUFFLES,
  SICHUAN_TILE_SLOTS,
  sichuanScoreFor,
} from './sichuanLogic';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';

export type SichuanMode = '1v1' | '2v2';
export type SichuanRoomStatus = 'lobby' | 'playing' | 'finished';

export interface SichuanPlayer {
  uid: string;
  nickname: string;
  team: 0 | 1;
  ready: boolean;
  score: number;
  pairs: number;
  remaining: number;
  finished: boolean;
  shuffleCount: number;
  comboBonus: number;
  updatedAtMs: number;
}

export interface SichuanRoom {
  id: string;
  code: string;
  mode: SichuanMode;
  status: SichuanRoomStatus;
  hostUid: string;
  hostNickname: string;
  seed: number;
  maxPlayers: number;
  playerCount: number;
  createdAtMs: number;
  startedAtMs: number | null;
  finishedAtMs: number | null;
  winnerTeam: 0 | 1 | null;
  winnerLabel: string | null;
}

export const sichuanMaxPlayers = (mode: SichuanMode): number => (mode === '1v1' ? 2 : 4);

export const SICHUAN_SCORE_RULES = {
  maxPairs: SICHUAN_MAX_PAIRS,
  maxScore: SICHUAN_MAX_SCORE,
  maxShuffles: SICHUAN_MAX_SHUFFLES,
  maxComboBonus: SICHUAN_MAX_COMBO_BONUS,
  tileSlots: SICHUAN_TILE_SLOTS,
} as const;

const roomsCol = () => collection(db, 'games', 'sichuan', 'rooms');
const roomRef = (roomId: string) => doc(db, 'games', 'sichuan', 'rooms', roomId);
const playersCol = (roomId: string) =>
  collection(db, 'games', 'sichuan', 'rooms', roomId, 'players');
const playerRef = (roomId: string, uid: string) =>
  doc(db, 'games', 'sichuan', 'rooms', roomId, 'players', uid);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateSichuanRoomCode = (): string => {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
};

const newPlayerDoc = (
  uid: string,
  nickname: string,
  team: 0 | 1,
  now: number
): SichuanPlayer => ({
  uid,
  nickname: nickname.slice(0, 24),
  team,
  ready: false,
  score: 0,
  pairs: 0,
  remaining: SICHUAN_TILE_SLOTS,
  finished: false,
  shuffleCount: 0,
  comboBonus: 0,
  updatedAtMs: now,
});

export const createSichuanRoom = async (params: {
  mode: SichuanMode;
  hostUid: string;
  hostNickname: string;
}): Promise<SichuanRoom> => {
  const code = generateSichuanRoomCode();
  const maxPlayers = sichuanMaxPlayers(params.mode);
  const now = Date.now();
  const room: SichuanRoom = {
    id: code,
    code,
    mode: params.mode,
    status: 'lobby',
    hostUid: params.hostUid,
    hostNickname: params.hostNickname.slice(0, 24),
    seed: 0,
    maxPlayers,
    playerCount: 0,
    createdAtMs: now,
    startedAtMs: null,
    finishedAtMs: null,
    winnerTeam: null,
    winnerLabel: null,
  };

  const rRef = roomRef(code);
  const pRef = playerRef(code, params.hostUid);

  // 1) 빈 로비 생성 → 2) 방장 참가(준비됨) → 3) 인원 수 반영
  await setDoc(rRef, {
    ...room,
    createdAt: serverTimestamp(),
  });
  await setDoc(pRef, newPlayerDoc(params.hostUid, params.hostNickname, 0, now));
  await updateDoc(pRef, { ready: true, updatedAtMs: Date.now() });
  await updateDoc(rRef, { playerCount: 1 });

  return { ...room, playerCount: 1 };
};

export const findSichuanRoomByCode = async (code: string): Promise<SichuanRoom | null> => {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const snap = await getDoc(roomRef(normalized));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<SichuanRoom, 'id'>) };
};

export const joinSichuanRoom = async (params: {
  roomId: string;
  uid: string;
  nickname: string;
}): Promise<SichuanRoom> => {
  const roomId = params.roomId.trim().toUpperCase();
  if (!roomId) throw new Error('방을 찾을 수 없습니다.');

  const joined = await runTransaction(db, async (tx) => {
    const rRef = roomRef(roomId);
    const roomSnap = await tx.get(rRef);
    if (!roomSnap.exists()) throw new Error('방을 찾을 수 없습니다.');
    const room = { id: roomSnap.id, ...(roomSnap.data() as Omit<SichuanRoom, 'id'>) };
    if (room.status !== 'lobby') throw new Error('이미 시작된 방입니다.');

    const pRef = playerRef(roomId, params.uid);
    const existingPlayer = await tx.get(pRef);
    if (existingPlayer.exists()) return room;

    const count = Number(room.playerCount) || 0;
    if (count >= room.maxPlayers) throw new Error('방이 가득 찼습니다.');

    const team = (count % 2 === 0 ? 0 : 1) as 0 | 1;
    const now = Date.now();

    tx.set(pRef, newPlayerDoc(params.uid, params.nickname, team, now));
    tx.update(rRef, { playerCount: count + 1 });
    return { ...room, playerCount: count + 1 };
  });

  await updateDoc(playerRef(roomId, params.uid), {
    ready: true,
    updatedAtMs: Date.now(),
  });
  return joined;
};

export const leaveSichuanRoom = async (roomId: string, uid: string): Promise<void> => {
  const rRef = roomRef(roomId);
  const pRef = playerRef(roomId, uid);

  let wasHost = false;
  let dissolved = false;

  await runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(rRef);
    const playerSnap = await tx.get(pRef);
    if (playerSnap.exists()) tx.delete(pRef);
    if (!roomSnap.exists()) return;

    const room = roomSnap.data() as SichuanRoom;
    wasHost = room.hostUid === uid;
    const nextCount = Math.max(0, (Number(room.playerCount) || 1) - (playerSnap.exists() ? 1 : 0));

    // 로비에서 방장 이탈 또는 인원 0 → 방 해산 (열린 방에서 즉시 제거)
    if (nextCount === 0 || (wasHost && room.status === 'lobby')) {
      tx.delete(rRef);
      dissolved = true;
      return;
    }

    // 종료된 방에서도 마지막 인원이 아니면 카운트만 감소, 끝나면 아래에서 정리
    if (room.status === 'finished' && nextCount <= 1) {
      tx.delete(rRef);
      dissolved = true;
      return;
    }

    tx.update(rRef, { playerCount: nextCount });
  });

  if (dissolved) return;

  const roomSnap = await getDoc(rRef);
  if (!roomSnap.exists()) return;

  const room = roomSnap.data() as SichuanRoom;
  const playersSnap = await getDocs(playersCol(roomId));

  if (playersSnap.empty) {
    try {
      await deleteDoc(rRef);
    } catch {
      /* ignore */
    }
    return;
  }

  // 게임 중/종료 후: 남은 인원이 없으면 제거
  if (room.status === 'finished' || playersSnap.size === 0) {
    try {
      await deleteDoc(rRef);
    } catch {
      /* ignore */
    }
    return;
  }

  if (wasHost) {
    const nextHost = playersSnap.docs.find((d) => d.id !== uid)?.id;
    if (nextHost) {
      try {
        await updateDoc(rRef, { hostUid: nextHost });
      } catch {
        /* ignore */
      }
    }
  }
};

export const setSichuanPlayerReady = async (
  roomId: string,
  uid: string,
  ready: boolean
): Promise<void> => {
  await updateDoc(playerRef(roomId, uid), {
    ready,
    updatedAtMs: Date.now(),
  });
};

export const startSichuanGame = async (roomId: string, hostUid: string): Promise<void> => {
  await runTransaction(db, async (tx) => {
    const ref = roomRef(roomId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('방이 없습니다.');
    const room = snap.data() as SichuanRoom;
    if (room.hostUid !== hostUid) throw new Error('방장만 시작할 수 있습니다.');
    if (room.status !== 'lobby') throw new Error('이미 시작되었습니다.');
    if ((Number(room.playerCount) || 0) < room.maxPlayers) {
      throw new Error(`${room.maxPlayers}명이 모여야 시작할 수 있습니다.`);
    }

    const seed = (Math.floor(Math.random() * 2_147_483_647) || 1) >>> 0;
    tx.update(ref, {
      status: 'playing',
      seed,
      startedAtMs: Date.now(),
      finishedAtMs: null,
      winnerTeam: null,
      winnerLabel: null,
    });
  });
};

export const updateSichuanProgress = async (params: {
  roomId: string;
  uid: string;
  score: number;
  pairs: number;
  remaining: number;
  finished: boolean;
  shuffleCount: number;
  comboBonus: number;
}): Promise<void> => {
  const pairs = Math.max(0, Math.min(SICHUAN_MAX_PAIRS, Math.floor(params.pairs)));
  const expectedRemaining = SICHUAN_TILE_SLOTS - pairs * 2;
  const safeRemaining = Math.max(0, Math.min(SICHUAN_TILE_SLOTS, expectedRemaining));
  const comboBonus = Math.max(
    0,
    Math.min(SICHUAN_MAX_COMBO_BONUS, Math.floor(params.comboBonus || 0))
  );
  const score = sichuanScoreFor(pairs, safeRemaining, comboBonus);

  await updateDoc(playerRef(params.roomId, params.uid), {
    score,
    pairs,
    remaining: safeRemaining,
    finished: params.finished || safeRemaining === 0,
    shuffleCount: Math.max(0, Math.min(SICHUAN_MAX_SHUFFLES, Math.floor(params.shuffleCount))),
    comboBonus,
    updatedAtMs: Date.now(),
  });
};

/** 종료 처리 후 방을 삭제해 열린 방 목록에 남지 않게 함 */
export const finishSichuanRoom = async (params: {
  roomId: string;
  winnerTeam: 0 | 1 | null;
  winnerLabel: string;
}): Promise<void> => {
  const rRef = roomRef(params.roomId);
  await updateDoc(rRef, {
    status: 'finished',
    finishedAtMs: Date.now(),
    winnerTeam: params.winnerTeam,
    winnerLabel: params.winnerLabel.slice(0, 60),
  });

  // 스냅샷으로 finished 를 먼저 전달한 뒤 방 제거
  globalThis.setTimeout(() => {
    void deleteDoc(rRef).catch(() => {
      /* ignore */
    });
  }, 1200);
};

export const subscribeSichuanRoom = (
  roomId: string,
  onData: (room: SichuanRoom | null) => void
): Unsubscribe =>
  onSnapshot(roomRef(roomId), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData({ id: snap.id, ...(snap.data() as Omit<SichuanRoom, 'id'>) });
  });

export const subscribeSichuanPlayers = (
  roomId: string,
  onData: (players: SichuanPlayer[]) => void
): Unsubscribe =>
  onSnapshot(playersCol(roomId), (snap) => {
    const list = snap.docs.map((d) => d.data() as SichuanPlayer);
    list.sort((a, b) => a.team - b.team || a.nickname.localeCompare(b.nickname, 'ko'));
    onData(list);
  });

export const listOpenSichuanLobbies = async (mode?: SichuanMode): Promise<SichuanRoom[]> => {
  const constraints = [where('status', '==', 'lobby')];
  if (mode) constraints.push(where('mode', '==', mode));
  const q = query(roomsCol(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SichuanRoom, 'id'>) }))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
};

/** 대기 중인 방 목록 실시간 구독 */
export const subscribeSichuanLobbies = (
  onData: (rooms: SichuanRoom[]) => void,
  onError?: (err: Error) => void
): Unsubscribe =>
  onSnapshot(
    query(roomsCol(), where('status', '==', 'lobby')),
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<SichuanRoom, 'id'>) }))
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      onData(list);
    },
    (err) => {
      console.error('사천성 로비 목록 구독 실패:', err);
      onError?.(err);
      onData([]);
    }
  );

export const teamScore = (players: SichuanPlayer[], team: 0 | 1): number =>
  players.filter((p) => p.team === team).reduce((sum, p) => sum + p.score, 0);

export const teamLabel = (mode: SichuanMode, team: 0 | 1): string => {
  if (mode === '1v1') return team === 0 ? '플레이어 A' : '플레이어 B';
  return team === 0 ? '팀 청' : '팀 홍';
};

export const roomTitle = (room: SichuanRoom): string => {
  const host = room.hostNickname || '누군가';
  return room.mode === '1v1' ? `${host}의 1대1` : `${host}의 2대2`;
};
