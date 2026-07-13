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

const LOBBY_STALE_MS = 90_000; // 로비에서 90초 무응답이면 유령으로 간주

const getUpdatedAtMs = (data: { updatedAtMs?: number }): number =>
  Number(data.updatedAtMs) || 0;

/** 방 + 참가자 문서 전부 삭제 (열린 방/잔여 방 강제 제거) */
export const dissolveSichuanRoom = async (roomId: string): Promise<void> => {
  const id = roomId.trim().toUpperCase();
  if (!id) return;
  const rRef = roomRef(id);
  try {
    const playersSnap = await getDocs(playersCol(id));
    await Promise.all(playersSnap.docs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
  } catch {
    /* ignore */
  }
  try {
    await deleteDoc(rRef);
  } catch {
    /* ignore */
  }
};

/** 로비 방의 실제 참가자 수와 playerCount/방장을 맞춤. 빈·유령 방은 삭제. */
export const reconcileSichuanLobby = async (roomId: string): Promise<SichuanRoom | null> => {
  const rRef = roomRef(roomId);
  const roomSnap = await getDoc(rRef);
  if (!roomSnap.exists()) return null;

  const room = { id: roomSnap.id, ...(roomSnap.data() as Omit<SichuanRoom, 'id'>) };
  if (room.status !== 'lobby') return room;

  const playersSnap = await getDocs(playersCol(roomId));
  const now = Date.now();

  // 오래 갱신 없는 유령 참가자 제거
  const staleDocs = playersSnap.docs.filter((d) => {
    const ms = getUpdatedAtMs(d.data() as { updatedAtMs?: number });
    return !ms || now - ms > LOBBY_STALE_MS;
  });
  if (staleDocs.length > 0) {
    await Promise.all(staleDocs.map((d) => deleteDoc(d.ref).catch(() => undefined)));
  }

  const aliveSnap = staleDocs.length > 0 ? await getDocs(playersCol(roomId)) : playersSnap;
  const actualCount = aliveSnap.size;

  if (actualCount === 0) {
    try {
      if ((Number(room.playerCount) || 0) !== 0) {
        await updateDoc(rRef, { playerCount: 0 });
      }
      await deleteDoc(rRef);
    } catch {
      try {
        await dissolveSichuanRoom(roomId);
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  const hostStillHere = aliveSnap.docs.some((d) => d.id === room.hostUid);
  const nextHost = hostStillHere ? room.hostUid : aliveSnap.docs[0].id;
  const patch: Record<string, string | number> = {};
  if ((Number(room.playerCount) || 0) !== actualCount) patch.playerCount = actualCount;
  if (nextHost !== room.hostUid) patch.hostUid = nextHost;

  if (Object.keys(patch).length > 0) {
    try {
      await updateDoc(rRef, patch);
    } catch {
      /* ignore */
    }
  }

  return {
    ...room,
    playerCount: actualCount,
    hostUid: nextHost,
  };
};

/** 열린 방 목록의 유령/빈 로비를 정리 */
export const pruneStaleSichuanLobbies = async (): Promise<void> => {
  const snap = await getDocs(query(roomsCol(), where('status', '==', 'lobby')));
  await Promise.all(snap.docs.map((d) => reconcileSichuanLobby(d.id)));
};

/** 끝난 방·비정상 playing 방도 정리 (열린 방 잔류/고아 문서 방지) */
export const pruneClosedSichuanRooms = async (): Promise<void> => {
  const [finishedSnap, playingSnap] = await Promise.all([
    getDocs(query(roomsCol(), where('status', '==', 'finished'))),
    getDocs(query(roomsCol(), where('status', '==', 'playing'))),
  ]);

  await Promise.all(
    finishedSnap.docs.map((d) => dissolveSichuanRoom(d.id))
  );

  const now = Date.now();
  await Promise.all(
    playingSnap.docs.map(async (d) => {
      const room = d.data() as SichuanRoom;
      const started = Number(room.startedAtMs) || Number(room.createdAtMs) || 0;
      // 30분 넘게 playing 이면 강제 해산
      if (started && now - started > 30 * 60 * 1000) {
        await dissolveSichuanRoom(d.id);
        return;
      }
      const playersSnap = await getDocs(playersCol(d.id));
      if (playersSnap.empty) {
        await dissolveSichuanRoom(d.id);
      }
    })
  );
};

export const joinSichuanRoom = async (params: {
  roomId: string;
  uid: string;
  nickname: string;
}): Promise<SichuanRoom> => {
  const roomId = params.roomId.trim().toUpperCase();
  if (!roomId) throw new Error('방을 찾을 수 없습니다.');

  // 입장 전 유령 인원/빈 방 정리
  const reconciled = await reconcileSichuanLobby(roomId);
  if (!reconciled) throw new Error('방이 닫혔습니다.');

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
  const id = roomId.trim().toUpperCase();
  const rRef = roomRef(id);
  const pRef = playerRef(id, uid);

  let wasHost = false;
  let shouldDissolve = false;
  let roomStatus: SichuanRoomStatus | null = null;

  try {
    await runTransaction(db, async (tx) => {
      const roomSnap = await tx.get(rRef);
      const playerSnap = await tx.get(pRef);
      if (playerSnap.exists()) tx.delete(pRef);
      if (!roomSnap.exists()) {
        shouldDissolve = true;
        return;
      }

      const room = roomSnap.data() as SichuanRoom;
      roomStatus = room.status;
      wasHost = room.hostUid === uid;
      const nextCount = Math.max(
        0,
        (Number(room.playerCount) || 1) - (playerSnap.exists() ? 1 : 0)
      );

      // 로비: 방장 이탈 또는 인원 0 → 즉시 해산
      if (room.status === 'lobby' && (nextCount === 0 || wasHost)) {
        tx.delete(rRef);
        shouldDissolve = true;
        return;
      }

      // 종료된 방 / 마지막 인원 → 해산
      if (room.status === 'finished' || nextCount === 0) {
        tx.delete(rRef);
        shouldDissolve = true;
        return;
      }

      tx.update(rRef, { playerCount: nextCount });
    });
  } catch {
    // 트랜잭션 실패해도 아래에서 강제 정리
    shouldDissolve = true;
  }

  // 참가자 문서까지 포함해 잔여 정리
  const playersSnap = await getDocs(playersCol(id)).catch(() => null);
  const remaining = playersSnap?.docs.filter((d) => d.id !== uid) ?? [];

  if (
    shouldDissolve ||
    remaining.length === 0 ||
    roomStatus === 'finished' ||
    (roomStatus === 'lobby' && wasHost)
  ) {
    await dissolveSichuanRoom(id);
    return;
  }

  const roomSnap = await getDoc(rRef).catch(() => null);
  if (!roomSnap?.exists()) {
    await dissolveSichuanRoom(id);
    return;
  }

  if (wasHost) {
    const nextHost = remaining[0]?.id;
    if (nextHost) {
      try {
        await updateDoc(rRef, { hostUid: nextHost });
      } catch {
        /* ignore */
      }
    } else {
      await dissolveSichuanRoom(id);
    }
  }
};

export const touchSichuanLobbyPresence = async (
  roomId: string,
  uid: string
): Promise<void> => {
  try {
    await updateDoc(playerRef(roomId, uid), { updatedAtMs: Date.now() });
  } catch {
    /* ignore */
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

/** 종료 처리 후 방을 삭제해 열린 방/잔여 방에 남지 않게 함 */
export const finishSichuanRoom = async (params: {
  roomId: string;
  winnerTeam: 0 | 1 | null;
  winnerLabel: string;
}): Promise<void> => {
  const rRef = roomRef(params.roomId);
  try {
    await updateDoc(rRef, {
      status: 'finished',
      finishedAtMs: Date.now(),
      winnerTeam: params.winnerTeam,
      winnerLabel: params.winnerLabel.slice(0, 60),
    });
  } catch {
    // 이미 지워졌거나 권한 문제여도 아래에서 강제 해산
  }

  // finished 스냅샷이 각 클라이언트에 도착할 시간을 짧게 준 뒤 완전 해산
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 400);
  });
  await dissolveSichuanRoom(params.roomId);
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
