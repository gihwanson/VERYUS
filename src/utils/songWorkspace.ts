import { Timestamp } from 'firebase/firestore';

/** 연습곡 / 합격곡 카테고리 */
export type SongWorkspaceCategory = 'practice' | 'approved';

export const SONG_WORKSPACE_COLLECTION = 'songWorkspaces';

/** 합격곡 1곡 = 연습장 문서 1개 (멤버 공유, 중복 생성 방지) */
export function approvedWorkspaceDocId(approvedSongId: string): string {
  return `approved_${approvedSongId}`;
}

/** 가사에 칠하는 파트 색 */
export type LyricPartId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

export interface LyricPartOption {
  id: LyricPartId;
  label: string;
  color: string;
  bg: string;
}

export const LYRIC_PART_OPTIONS: LyricPartOption[] = [
  { id: 'a', label: 'A', color: '#9b3b3b', bg: 'rgba(196, 92, 92, 0.34)' },
  { id: 'b', label: 'B', color: '#2f5f7a', bg: 'rgba(74, 124, 155, 0.34)' },
  { id: 'c', label: 'C', color: '#2f6b4f', bg: 'rgba(72, 140, 110, 0.34)' },
  { id: 'd', label: 'D', color: '#8a6a20', bg: 'rgba(210, 170, 70, 0.38)' },
  { id: 'e', label: 'E', color: '#6b4a7a', bg: 'rgba(140, 110, 160, 0.34)' },
  { id: 'f', label: 'F', color: '#8a4a28', bg: 'rgba(200, 120, 70, 0.34)' },
];

/** 색상(A~F) → 담당 멤버/파트 이름 */
export type LyricPartAssignments = Partial<Record<LyricPartId, string>>;

export function normalizePartAssignments(raw: unknown): LyricPartAssignments {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const out: LyricPartAssignments = {};
  for (const opt of LYRIC_PART_OPTIONS) {
    const value = source[opt.id];
    if (typeof value === 'string' && value.trim()) {
      out[opt.id] = value.trim();
    }
  }
  return out;
}

/** 가사 문자 오프셋 기준 하이라이트 */
export interface LyricHighlight {
  id: string;
  start: number;
  end: number;
  partId: LyricPartId;
}

/** 선택 구간에 붙이는 메모 */
export interface LyricNote {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface SongWorkspace {
  id: string;
  category: SongWorkspaceCategory;
  title: string;
  titleNoSpace: string;
  members: string[];
  approvedSongId?: string | null;
  lyrics: string;
  /** @deprecated 구버전 줄 단위 색 — parse 시 highlights로 이관 */
  linePartIds: string[];
  highlights: LyricHighlight[];
  notes: LyricNote[];
  /** 색상별 담당 멤버/파트 표시명 */
  partAssignments: LyricPartAssignments;
  /** 용지 하단 자유 메모 (화음 포함) */
  memo: string;
  harmonyNote: string;
  createdByUid: string;
  createdByNickname: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  updatedByNickname: string;
}

export function normalizeSongTitle(title: string | null | undefined): string {
  return String(title ?? '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function formatFirestoreWriteError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';
  if (code === 'permission-denied') {
    return '저장 권한이 없습니다. Firestore 규칙(songWorkspaces) 배포 여부·로그인을 확인해 주세요.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return '네트워크 상태가 불안정합니다. 잠시 후 다시 시도해 주세요.';
  }
  return '요청 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

export function membersShareKey(members: string[]): string {
  return [...members]
    .map((m) => m.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .join('\u0001');
}

export function canEditSongWorkspace(
  workspace: Pick<SongWorkspace, 'members'>,
  nickname: string | null | undefined
): boolean {
  if (!nickname) return false;
  return workspace.members.some((m) => m.trim() === nickname.trim());
}

export function ensureSelfInMembers(members: string[], selfNickname: string): string[] {
  const cleaned = members.map((m) => m.trim()).filter(Boolean);
  const self = selfNickname.trim();
  if (!self) return cleaned;
  if (cleaned.some((m) => m === self)) return cleaned;
  return [self, ...cleaned];
}

export function mergeUniqueMembers(...groups: Array<string[] | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    for (const raw of group) {
      const m = String(raw).trim();
      if (!m || seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

export function getLyricPartOption(partId: string | null | undefined): LyricPartOption | null {
  if (!partId) return null;
  return LYRIC_PART_OPTIONS.find((p) => p.id === partId) ?? null;
}

export function createAnnotationId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function syncLinePartIds(lyrics: string, prev: string[] | undefined | null): string[] {
  const lineCount = lyrics.length === 0 ? 0 : lyrics.split('\n').length;
  const source = Array.isArray(prev) ? prev : [];
  return Array.from({ length: lineCount }, (_, i) => {
    const id = typeof source[i] === 'string' ? source[i] : '';
    return LYRIC_PART_OPTIONS.some((p) => p.id === id) ? id : '';
  });
}

export function linePartsToHighlights(
  lyrics: string,
  linePartIds: string[] | undefined | null
): LyricHighlight[] {
  if (!lyrics || !Array.isArray(linePartIds) || linePartIds.length === 0) return [];
  const lines = lyrics.split('\n');
  const out: LyricHighlight[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const partId = linePartIds[i];
    if (partId && LYRIC_PART_OPTIONS.some((p) => p.id === partId) && line.length > 0) {
      out.push({
        id: `legacy_line_${i}`,
        start: offset,
        end: offset + line.length,
        partId: partId as LyricPartId,
      });
    }
    offset += line.length;
    if (i < lines.length - 1) offset += 1;
  }
  return out;
}

function isLyricPartId(value: unknown): value is LyricPartId {
  return typeof value === 'string' && LYRIC_PART_OPTIONS.some((p) => p.id === value);
}

export function normalizeHighlights(
  lyrics: string,
  raw: unknown,
  fallbackLineParts?: string[] | null
): LyricHighlight[] {
  const len = lyrics.length;
  let list: LyricHighlight[] = [];

  if (Array.isArray(raw) && raw.length > 0) {
    list = raw
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const start = Number(row.start);
        const end = Number(row.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        if (!isLyricPartId(row.partId)) return null;
        return {
          id: typeof row.id === 'string' && row.id ? row.id : `hl_${index}`,
          start: Math.max(0, Math.min(start, len)),
          end: Math.max(0, Math.min(end, len)),
          partId: row.partId,
        } as LyricHighlight;
      })
      .filter((item): item is LyricHighlight => !!item && item.end > item.start);
  } else {
    list = linePartsToHighlights(lyrics, fallbackLineParts);
  }

  return mergeHighlights(list);
}

export function normalizeNotes(lyrics: string, raw: unknown): LyricNote[] {
  const len = lyrics.length;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const start = Number(row.start);
      const end = Number(row.end);
      const text = typeof row.text === 'string' ? row.text.trim() : '';
      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return {
        id: typeof row.id === 'string' && row.id ? row.id : `note_${index}`,
        start: Math.max(0, Math.min(start, len)),
        end: Math.max(0, Math.min(end, len)),
        text,
      } as LyricNote;
    })
    .filter((item): item is LyricNote => !!item && item.end > item.start);
}

/** 겹치는 같은 색은 병합, 이후 추가분이 덮어씀 */
export function mergeHighlights(list: LyricHighlight[]): LyricHighlight[] {
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: LyricHighlight[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && last.partId === item.partId && item.start <= last.end) {
      last.end = Math.max(last.end, item.end);
    } else {
      out.push({ ...item });
    }
  }
  return out;
}

export function addOrReplaceHighlight(
  list: LyricHighlight[],
  start: number,
  end: number,
  partId: LyricPartId | null
): LyricHighlight[] {
  if (end <= start) return list;
  // 선택 구간과 겹치는 기존 하이라이트 자르기
  const carved: LyricHighlight[] = [];
  for (const item of list) {
    if (item.end <= start || item.start >= end) {
      carved.push(item);
      continue;
    }
    if (item.start < start) {
      carved.push({ ...item, id: createAnnotationId('hl'), end: start });
    }
    if (item.end > end) {
      carved.push({ ...item, id: createAnnotationId('hl'), start: end });
    }
  }
  if (!partId) return mergeHighlights(carved);
  return mergeHighlights([
    ...carved,
    { id: createAnnotationId('hl'), start, end, partId },
  ]);
}

/** prev → next 단일 연속 편집 구간 (공통 접두·접미 기준) */
export function findLyricsEdit(
  prev: string,
  next: string
): { start: number; oldEnd: number; newEnd: number } | null {
  if (prev === next) return null;
  let start = 0;
  const prevLen = prev.length;
  const nextLen = next.length;
  const minLen = Math.min(prevLen, nextLen);
  while (start < minLen && prev.charAt(start) === next.charAt(start)) {
    start += 1;
  }
  let oldEnd = prevLen;
  let newEnd = nextLen;
  while (
    oldEnd > start &&
    newEnd > start &&
    prev.charAt(oldEnd - 1) === next.charAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return { start, oldEnd, newEnd };
}

/** 편집 구간을 지난 뒤 인덱스 매핑 (assoc: 시작=-1, 끝=+1) */
function mapIndexThroughEdit(
  index: number,
  editStart: number,
  oldEnd: number,
  newEnd: number,
  assoc: -1 | 1
): number {
  if (index < editStart) return index;
  if (index > oldEnd) return index + (newEnd - oldEnd);
  if (index === editStart) return editStart;
  if (index === oldEnd) return newEnd;
  // 삭제·교체된 구간 안
  return assoc < 0 ? editStart : newEnd;
}

/**
 * 가사 텍스트 변경에 맞춰 하이라이트/메모 오프셋 보정.
 * prevLyrics를 넘기면 중간 삭제·삽입 시 뒤쪽 문단 색이 밀리거나 사라지지 않음.
 */
export function remapAnnotationsForLyricsChange<T extends { start: number; end: number }>(
  annotations: T[],
  nextLyrics: string,
  prevLyrics?: string
): T[] {
  const len = nextLyrics.length;
  if (len === 0) return [];
  if (!annotations.length) return annotations;

  if (prevLyrics == null || prevLyrics === nextLyrics) {
    return annotations
      .map((item) => ({
        ...item,
        start: Math.max(0, Math.min(item.start, len)),
        end: Math.max(0, Math.min(item.end, len)),
      }))
      .filter((item) => item.end > item.start);
  }

  const edit = findLyricsEdit(prevLyrics, nextLyrics);
  if (!edit) {
    return annotations
      .map((item) => ({
        ...item,
        start: Math.max(0, Math.min(item.start, len)),
        end: Math.max(0, Math.min(item.end, len)),
      }))
      .filter((item) => item.end > item.start);
  }

  const { start: editStart, oldEnd, newEnd } = edit;
  return annotations
    .map((item) => {
      const nextStart = mapIndexThroughEdit(item.start, editStart, oldEnd, newEnd, -1);
      const nextEnd = mapIndexThroughEdit(item.end, editStart, oldEnd, newEnd, 1);
      if (nextEnd <= nextStart) return null;
      return {
        ...item,
        start: Math.max(0, Math.min(nextStart, len)),
        end: Math.max(0, Math.min(nextEnd, len)),
      };
    })
    .filter((item): item is T => Boolean(item && item.end > item.start));
}

export type LyricRenderSegment = {
  type: 'text';
  text: string;
  start: number;
  end: number;
  partId?: LyricPartId;
  noteIds: string[];
};

/** 하이라이트·메모 경계를 기준으로 렌더 세그먼트 생성 */
export function buildLyricSegments(
  lyrics: string,
  highlights: LyricHighlight[],
  notes: LyricNote[]
): LyricRenderSegment[] {
  if (!lyrics) return [];
  const bounds = new Set<number>([0, lyrics.length]);
  highlights.forEach((h) => {
    bounds.add(h.start);
    bounds.add(h.end);
  });
  notes.forEach((n) => {
    bounds.add(n.start);
    bounds.add(n.end);
  });
  const points = [...bounds].sort((a, b) => a - b);
  const segments: LyricRenderSegment[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const mid = (start + end) / 2;
    const hl = [...highlights].reverse().find((h) => h.start <= mid && mid < h.end);
    const noteIds = notes.filter((n) => n.start <= mid && mid < n.end).map((n) => n.id);
    segments.push({
      type: 'text',
      text: lyrics.slice(start, end),
      start,
      end,
      partId: hl?.partId,
      noteIds,
    });
  }
  return segments;
}

export function parseSongWorkspaceDoc(
  id: string,
  data: Record<string, unknown>
): SongWorkspace {
  const lyrics = typeof data.lyrics === 'string' ? data.lyrics : '';
  const rawParts = Array.isArray(data.linePartIds)
    ? data.linePartIds.map((v) => String(v ?? ''))
    : [];
  const harmonyNote = typeof data.harmonyNote === 'string' ? data.harmonyNote : '';
  const memoStored = typeof data.memo === 'string' ? data.memo : '';
  const memo =
    memoStored.trim().length > 0
      ? memoStored
      : harmonyNote.trim().length > 0
        ? harmonyNote
        : '';

  return {
    id,
    category: data.category === 'approved' ? 'approved' : 'practice',
    title: typeof data.title === 'string' ? data.title : '',
    titleNoSpace: typeof data.titleNoSpace === 'string' ? data.titleNoSpace : '',
    members: Array.isArray(data.members)
      ? data.members.map((m) => String(m).trim()).filter(Boolean)
      : [],
    approvedSongId: typeof data.approvedSongId === 'string' ? data.approvedSongId : null,
    lyrics,
    linePartIds: syncLinePartIds(lyrics, rawParts),
    highlights: normalizeHighlights(lyrics, data.highlights, rawParts),
    notes: normalizeNotes(lyrics, data.notes),
    partAssignments: normalizePartAssignments(data.partAssignments),
    harmonyNote,
    memo,
    createdByUid: typeof data.createdByUid === 'string' ? data.createdByUid : '',
    createdByNickname:
      typeof data.createdByNickname === 'string' ? data.createdByNickname : '',
    createdAt: (data.createdAt as SongWorkspace['createdAt']) ?? null,
    updatedAt: (data.updatedAt as SongWorkspace['updatedAt']) ?? null,
    updatedByNickname:
      typeof data.updatedByNickname === 'string' ? data.updatedByNickname : '',
  };
}
