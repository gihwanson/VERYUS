import type { BuskingCategory } from './BuskingNav';
import {
  isFreeSongParticipant,
  isSetlistParticipant,
} from './BuskingMember/buskingParticipantsUtils';
import type { SetListData } from './types';
import { getSetListSessionDateISO } from './setListSessionDate';

export type BuskingSessionStatus = 'live' | 'ended';

export type BuskingSessionScope = BuskingCategory;

const SESSION_STORAGE_PREFIX = 'veryus_busking_session_';
const LEGACY_SESSION_STORAGE_PREFIX = 'veryus_busking_session_';

/** hostUid·status·venueLabel 이 있는 새 버스킹 세션 */
export function isNewModelBuskingSession(list: SetListData): boolean {
  return Boolean(
    list.hostUid ||
      list.status === 'live' ||
      list.status === 'ended' ||
      list.venueLabel?.trim()
  );
}

/** 레거시 isActive / isCompleted 와 호환 */
export function getSessionStatus(list: SetListData): BuskingSessionStatus {
  if (list.status === 'live' || list.status === 'ended') return list.status;
  if (list.isCompleted) return 'ended';
  if (list.isActive) return 'live';
  return 'ended';
}

export function isLiveSession(list: SetListData): boolean {
  if (list.isCompleted) return false;
  if (list.status === 'ended') return false;
  if (list.status === 'live') return true;
  if (list.hostUid) return true;
  return getSessionStatus(list) === 'live';
}

function isLegacyLiveSession(list: SetListData): boolean {
  return !isNewModelBuskingSession(list) && isLiveSession(list);
}

function getCreatedAtMs(list: SetListData): number {
  const createdAt = list.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt === 'object' && createdAt !== null && 'toMillis' in createdAt) {
    return (createdAt as { toMillis: () => number }).toMillis();
  }
  if (typeof createdAt === 'object' && createdAt !== null && 'seconds' in createdAt) {
    return (createdAt as { seconds: number }).seconds * 1000;
  }
  if (typeof createdAt === 'number') {
    return createdAt > 1_000_000_000_000 ? createdAt : createdAt * 1000;
  }
  return 0;
}

/** 세션이 해당 카테고리에 속하는지 (필드 없음 = 레거시 자유곡 세션) */
export function sessionMatchesCategory(list: SetListData, category: BuskingSessionScope): boolean {
  if (!list.buskingCategory) {
    return category === 'freeSong';
  }
  return list.buskingCategory === category;
}

function filterSessionsByCategory(
  sessions: SetListData[],
  category: BuskingSessionScope
): SetListData[] {
  return sessions.filter((list) => sessionMatchesCategory(list, category));
}

/** 진행 중(live) 버스킹 세션 — 날짜와 무관, 명시적 종료 전까지 유지 */
export function getLiveSessions(
  setLists: SetListData[],
  category?: BuskingSessionScope
): SetListData[] {
  const live = setLists
    .filter((list) => isNewModelBuskingSession(list) && isLiveSession(list))
    .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
  return category ? filterSessionsByCategory(live, category) : live;
}

/** 특정 sessionDate 라벨의 live 세션만 (표시·필터용) */
export function getLiveSessionsForDate(
  setLists: SetListData[],
  sessionDate: string,
  category?: BuskingSessionScope
): SetListData[] {
  return getLiveSessions(setLists, category).filter(
    (list) => getSetListSessionDateISO(list) === sessionDate
  );
}

function getLegacyLiveSessions(setLists: SetListData[]): SetListData[] {
  return setLists.filter((list) => isLegacyLiveSession(list));
}

export function isParticipantInSession(list: SetListData, nickname: string): boolean {
  const nick = nickname.trim();
  if (!nick) return false;
  const inSetlist = (list.participants ?? []).some((p) => String(p).trim() === nick);
  if (inSetlist) return true;
  return (list.freeSongParticipants ?? []).some((p) => String(p).trim() === nick);
}

export function formatBuskingSessionLabel(list: SetListData): string {
  const venue = list.venueLabel?.trim();
  const host = list.hostNickname?.trim() || list.createdBy?.trim();
  if (venue && host) return `${venue} (${host})`;
  if (venue) return venue;
  if (host) return host;
  return list.name?.trim() || '버스킹';
}

export function findHostLiveSession(
  setLists: SetListData[],
  hostUid: string,
  category?: BuskingSessionScope
): SetListData | undefined {
  const pool = category
    ? filterSessionsByCategory(setLists, category)
    : setLists;
  const matches = pool.filter((list) => list.hostUid === hostUid && isLiveSession(list));
  return matches.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a))[0];
}

export function hasHostLiveSession(
  setLists: SetListData[],
  hostUid: string,
  category?: BuskingSessionScope
): boolean {
  const pool = category
    ? filterSessionsByCategory(setLists, category)
    : setLists;
  return pool.some((list) => list.hostUid === hostUid && isLiveSession(list));
}

export interface PickBuskingSessionOptions {
  selectedSessionId: string | null;
  userUid: string;
  userNickname: string;
  isLeader: boolean;
  category: BuskingSessionScope;
}

function isCategoryParticipant(
  list: SetListData,
  nickname: string,
  category: BuskingSessionScope
): boolean {
  return category === 'freeSong'
    ? isFreeSongParticipant(list, nickname)
    : isSetlistParticipant(list, nickname);
}

/** 자동 선택 가능한 세션이 있으면 반환, 없으면 null → 선택 UI 필요 */
export function pickBuskingSession(
  setLists: SetListData[],
  options: PickBuskingSessionOptions
): SetListData | null {
  const liveSessions = getLiveSessions(setLists, options.category);
  const legacyLive = filterSessionsByCategory(getLegacyLiveSessions(setLists), options.category);

  if (options.selectedSessionId) {
    const selected = setLists.find((list) => list.id === options.selectedSessionId);
    if (
      selected &&
      isLiveSession(selected) &&
      sessionMatchesCategory(selected, options.category)
    ) {
      return selected;
    }
  }

  // 셋리스트는 저장된 선택만 사용 — 자동 연결 없음
  if (options.category === 'setlist') {
    return null;
  }

  const ownHost = liveSessions.filter((list) => list.hostUid === options.userUid);
  if (ownHost.length === 1) return ownHost[0];

  const memberOf = liveSessions.filter((list) =>
    isCategoryParticipant(list, options.userNickname, options.category)
  );
  if (memberOf.length === 1) return memberOf[0];

  const legacyMemberOf = legacyLive.filter((list) =>
    isCategoryParticipant(list, options.userNickname, options.category)
  );
  if (legacyMemberOf.length === 1) return legacyMemberOf[0];

  if (options.isLeader && liveSessions.length === 1) return liveSessions[0];
  if (options.isLeader && liveSessions.length === 0 && legacyLive.length === 1) return legacyLive[0];

  return null;
}

function sessionStorageKey(userUid: string, category: BuskingSessionScope): string {
  return `${SESSION_STORAGE_PREFIX}${category}_${userUid}`;
}

export function readStoredBuskingSessionId(
  userUid: string,
  category: BuskingSessionScope = 'freeSong'
): string | null {
  if (!userUid) return null;
  try {
    const scoped = sessionStorage.getItem(sessionStorageKey(userUid, category));
    if (scoped) return scoped;
    // 레거시: 분리 전 공통 키 — 자유곡에만 이전
    if (category === 'freeSong') {
      return sessionStorage.getItem(`${LEGACY_SESSION_STORAGE_PREFIX}${userUid}`);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeStoredBuskingSessionId(
  userUid: string,
  sessionId: string | null,
  category: BuskingSessionScope = 'freeSong'
): void {
  if (!userUid) return;
  try {
    const key = sessionStorageKey(userUid, category);
    if (sessionId) sessionStorage.setItem(key, sessionId);
    else sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage unavailable */
  }
}

export function buildBuskingSessionName(_sessionDate: string, venueLabel: string, hostNickname: string): string {
  const venue = venueLabel.trim();
  if (venue) return venue;
  return hostNickname.trim() || '버스킹';
}
