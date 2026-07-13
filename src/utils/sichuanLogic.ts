/** 사천성(마작 연결) 보드·매칭 로직 */

import { GRADE_NAMES, GRADE_SYSTEM } from '../components/AdminTypes';

/** 모바일에서도 탭하기 쉬운 크기 (레이스용) */
export const SICHUAN_ROWS = 6;
export const SICHUAN_COLS = 8;
/** 내부 타일 칸 수 (짝수) */
export const SICHUAN_TILE_SLOTS = SICHUAN_ROWS * SICHUAN_COLS;

export const SICHUAN_MATCH_POINTS = 10;
export const SICHUAN_CLEAR_BONUS = 100;
/** 콤보 1단계당 추가 점수 (최대) */
export const SICHUAN_COMBO_BONUS_CAP = 3;
export const SICHUAN_MAX_SHUFFLES = 5;
export const SICHUAN_MAX_PAIRS = SICHUAN_TILE_SLOTS / 2;
export const SICHUAN_MAX_COMBO_BONUS = SICHUAN_MAX_PAIRS * SICHUAN_COMBO_BONUS_CAP;
export const SICHUAN_MAX_SCORE =
  SICHUAN_MAX_PAIRS * SICHUAN_MATCH_POINTS + SICHUAN_CLEAR_BONUS + SICHUAN_MAX_COMBO_BONUS;

export interface SichuanTileFace {
  id: number;
  /** 등급 이모지 */
  label: string;
  /** 등급 한글명 */
  name: string;
  hue: number;
}

/**
 * 관리자 패널 등급 이모지:
 * 블루베리 ~ 태양 + 초승달
 */
const GRADE_TILE_SPECS: { emoji: string; hue: number }[] = [
  { emoji: GRADE_SYSTEM.BLUEBERRY, hue: 250 },
  { emoji: GRADE_SYSTEM.KIWI, hue: 110 },
  { emoji: GRADE_SYSTEM.APPLE, hue: 0 },
  { emoji: GRADE_SYSTEM.MELON, hue: 95 },
  { emoji: GRADE_SYSTEM.WATERMELON, hue: 350 },
  { emoji: GRADE_SYSTEM.EARTH, hue: 200 },
  { emoji: GRADE_SYSTEM.SATURN, hue: 28 },
  { emoji: GRADE_SYSTEM.SUN, hue: 48 },
  { emoji: GRADE_SYSTEM.CRESCENT, hue: 225 },
];

/** 화면에 표시할 타일 종류 (등급 이모지) */
export const SICHUAN_FACES: SichuanTileFace[] = GRADE_TILE_SPECS.map((spec, index) => ({
  id: index + 1,
  label: spec.emoji,
  name: GRADE_NAMES[spec.emoji] || spec.emoji,
  hue: spec.hue,
}));

export type SichuanBoard = number[][]; // 0 = empty, >0 = face id

export interface SichuanPos {
  r: number;
  c: number;
}

export interface SichuanMatchPath {
  points: SichuanPos[];
}

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleInPlace = <T>(arr: T[], rand: () => number): void => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

const SICHUAN_FACE_BY_ID = new Map(SICHUAN_FACES.map((f) => [f.id, f]));

export const getSichuanFace = (id: number): SichuanTileFace | undefined =>
  SICHUAN_FACE_BY_ID.get(id);

/** combo 2 → +1, 3 → +2, 4+ → +3 */
export const comboBonusForMatch = (combo: number): number =>
  Math.min(SICHUAN_COMBO_BONUS_CAP, Math.max(0, combo - 1));

export const sichuanScoreFor = (
  pairs: number,
  remaining: number,
  comboBonus = 0
): number =>
  pairs * SICHUAN_MATCH_POINTS +
  (remaining === 0 ? SICHUAN_CLEAR_BONUS : 0) +
  Math.max(0, Math.min(SICHUAN_MAX_COMBO_BONUS, comboBonus));

/** 시드로 동일 보드 생성 (멀티 공정성) */
export const createSichuanBoard = (seed: number): SichuanBoard => {
  const rand = mulberry32(seed || 1);
  const faceCount = SICHUAN_FACES.length;
  const pairCount = SICHUAN_TILE_SLOTS / 2;
  const ids: number[] = [];

  for (let i = 0; i < pairCount; i += 1) {
    const faceId = SICHUAN_FACES[i % faceCount].id;
    ids.push(faceId, faceId);
  }
  shuffleInPlace(ids, rand);

  const board: SichuanBoard = [];
  let k = 0;
  for (let r = 0; r < SICHUAN_ROWS; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < SICHUAN_COLS; c += 1) {
      row.push(ids[k++] ?? 0);
    }
    board.push(row);
  }
  return board;
};

export const cloneSichuanBoard = (board: SichuanBoard): SichuanBoard =>
  board.map((row) => row.slice());

export const countRemainingTiles = (board: SichuanBoard): number => {
  let n = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell > 0) n += 1;
    }
  }
  return n;
};

const DIRS: SichuanPos[] = [
  { r: -1, c: 0 },
  { r: 0, c: 1 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
];

/**
 * 최대 2번 꺾어 연결 가능한지 검사 (사천성 규칙).
 * 보드 바깥(패딩)도 경로로 사용한다.
 */
export const canConnectSichuan = (
  board: SichuanBoard,
  a: SichuanPos,
  b: SichuanPos
): SichuanMatchPath | null => {
  if (a.r === b.r && a.c === b.c) return null;
  const type = board[a.r]?.[a.c];
  if (!type || type !== board[b.r]?.[b.c]) return null;

  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  if (!rows || !cols) return null;

  const pr = rows + 2;
  const pc = cols + 2;
  const empty = (r: number, c: number): boolean => {
    if (r < 0 || c < 0 || r >= pr || c >= pc) return false;
    if (r === 0 || c === 0 || r === pr - 1 || c === pc - 1) return true;
    const br = r - 1;
    const bc = c - 1;
    if (br === a.r && bc === a.c) return true;
    if (br === b.r && bc === b.c) return true;
    return board[br][bc] === 0;
  };

  const sr = a.r + 1;
  const sc = a.c + 1;
  const er = b.r + 1;
  const ec = b.c + 1;

  type Node = { r: number; c: number; dir: number; turns: number; prev: number };
  const visited = new Uint8Array(pr * pc * 4);
  const nodes: Node[] = [];
  const queue: number[] = [];

  const enqueue = (r: number, c: number, dir: number, turns: number, prev: number) => {
    if (dir >= 0) {
      const vi = (r * pc + c) * 4 + dir;
      const mark = turns + 1;
      if (visited[vi] !== 0 && visited[vi] <= mark) return;
      visited[vi] = mark;
    }
    const idx = nodes.length;
    nodes.push({ r, c, dir, turns, prev });
    queue.push(idx);
  };

  enqueue(sr, sc, -1, 0, -1);

  let found = -1;
  for (let qi = 0; qi < queue.length && found < 0; qi += 1) {
    const curIdx = queue[qi];
    const cur = nodes[curIdx];
    for (let d = 0; d < 4; d += 1) {
      const nextTurns = cur.dir === -1 || cur.dir === d ? cur.turns : cur.turns + 1;
      if (nextTurns > 2) continue;
      let nr = cur.r + DIRS[d].r;
      let nc = cur.c + DIRS[d].c;
      while (empty(nr, nc)) {
        if (nr === er && nc === ec) {
          found = nodes.length;
          nodes.push({ r: nr, c: nc, dir: d, turns: nextTurns, prev: curIdx });
          break;
        }
        enqueue(nr, nc, d, nextTurns, curIdx);
        nr += DIRS[d].r;
        nc += DIRS[d].c;
      }
      if (found >= 0) break;
    }
  }

  if (found < 0) return null;

  const pointsPad: SichuanPos[] = [];
  let i = found;
  while (i >= 0) {
    const n = nodes[i];
    pointsPad.push({ r: n.r, c: n.c });
    i = n.prev;
  }
  pointsPad.reverse();

  const simplified: SichuanPos[] = [];
  for (let p = 0; p < pointsPad.length; p += 1) {
    const cur = pointsPad[p];
    const prev = pointsPad[p - 1];
    const next = pointsPad[p + 1];
    const isEnd = p === 0 || p === pointsPad.length - 1;
    let isCorner = false;
    if (prev && next) {
      isCorner =
        cur.r - prev.r !== next.r - cur.r || cur.c - prev.c !== next.c - cur.c;
    }
    if (isEnd || isCorner) {
      simplified.push({ r: cur.r - 1, c: cur.c - 1 });
    }
  }

  return { points: simplified };
};

export const removeSichuanPair = (
  board: SichuanBoard,
  a: SichuanPos,
  b: SichuanPos
): SichuanBoard => {
  const next = cloneSichuanBoard(board);
  next[a.r][a.c] = 0;
  next[b.r][b.c] = 0;
  return next;
};

/** 현재 보드에서 가능한 매치 한 쌍 (힌트용) — 같은 패끼리만 검사 */
export const findSichuanHint = (
  board: SichuanBoard
): { a: SichuanPos; b: SichuanPos; path: SichuanMatchPath } | null => {
  const byFace = new Map<number, SichuanPos[]>();
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    for (let c = 0; c < row.length; c += 1) {
      const id = row[c];
      if (id <= 0) continue;
      const list = byFace.get(id);
      if (list) list.push({ r, c });
      else byFace.set(id, [{ r, c }]);
    }
  }

  for (const cells of byFace.values()) {
    if (cells.length < 2) continue;
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const path = canConnectSichuan(board, cells[i], cells[j]);
        if (path) return { a: cells[i], b: cells[j], path };
      }
    }
  }
  return null;
};

export const hasAnySichuanMatch = (board: SichuanBoard): boolean =>
  findSichuanHint(board) !== null;

/** 막혔을 때 남은 타일만 재배치 (타입 구성 유지) */
export const reshuffleSichuanBoard = (board: SichuanBoard, seed: number): SichuanBoard => {
  const rand = mulberry32(seed || 1);
  const ids: number[] = [];
  const positions: SichuanPos[] = [];
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < board[r].length; c += 1) {
      if (board[r][c] > 0) {
        ids.push(board[r][c]);
        positions.push({ r, c });
      }
    }
  }
  if (ids.length < 2) return cloneSichuanBoard(board);

  const place = (sourceIds: number[]): SichuanBoard => {
    const next = cloneSichuanBoard(board);
    for (let i = 0; i < positions.length; i += 1) {
      const pos = positions[i];
      next[pos.r][pos.c] = sourceIds[i] ?? 0;
    }
    return next;
  };

  shuffleInPlace(ids, rand);
  let candidate = place(ids);
  // 가능하면 매치가 생기도록 최대 12회 재시도
  let tries = 0;
  while (!hasAnySichuanMatch(candidate) && tries < 12) {
    tries += 1;
    shuffleInPlace(ids, rand);
    candidate = place(ids);
  }
  return candidate;
};
