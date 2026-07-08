import type { SetListData } from './types';
import { formatSetListDateLabel, getSetListSessionDateISO, toLocalDateISO } from './setListSessionDate';

export type BuskingSessionStatus = 'live' | 'ended';

const SESSION_STORAGE_PREFIX = 'veryus_busking_session_';

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

/** 세션 선택 UI에 표시할 오늘 live 세션 (레거시 isActive 문서 제외) */
export function getLiveSessionsForDate(setLists: SetListData[], sessionDate: string): SetListData[] {
  return setLists
    .filter(
      (list) =>
        isNewModelBuskingSession(list) &&
        isLiveSession(list) &&
        getSetListSessionDateISO(list) === sessionDate
    )
    .sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
}

function getLegacyLiveSessionsForDate(setLists: SetListData[], sessionDate: string): SetListData[] {
  return setLists.filter(
    (list) => isLegacyLiveSession(list) && getSetListSessionDateISO(list) === sessionDate
  );
}

export function isParticipantInSession(list: SetListData, nickname: string): boolean {
  const nick = nickname.trim();
  if (!nick) return false;
  return (list.participants ?? []).some((p) => String(p).trim() === nick);
}

export function formatBuskingSessionLabel(list: SetListData): string {
  const venue = list.venueLabel?.trim();
  const host = list.hostNickname?.trim() || list.createdBy?.trim();
  const dateLabel = formatSetListDateLabel(getSetListSessionDateISO(list));
  if (venue && host) return `${dateLabel} · ${venue} (${host})`;
  if (venue) return `${dateLabel} · ${venue}`;
  if (host) return `${dateLabel} · ${host}`;
  return list.name?.trim() || dateLabel;
}

export function findHostLiveSession(
  setLists: SetListData[],
  hostUid: string,
  sessionDate = toLocalDateISO(new Date())
): SetListData | undefined {
  const matches = setLists.filter(
    (list) =>
      list.hostUid === hostUid &&
      isLiveSession(list) &&
      getSetListSessionDateISO(list) === sessionDate
  );
  return matches.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a))[0];
}

export function hasHostLiveSession(
  setLists: SetListData[],
  hostUid: string,
  sessionDate = toLocalDateISO(new Date())
): boolean {
  return setLists.some(
    (list) =>
      list.hostUid === hostUid &&
      isLiveSession(list) &&
      getSetListSessionDateISO(list) === sessionDate
  );
}

export interface PickBuskingSessionOptions {
  selectedSessionId: string | null;
  userUid: string;
  userNickname: string;
  isLeader: boolean;
}

/** 자동 선택 가능한 세션이 있으면 반환, 없으면 null → 선택 UI 필요 */
export function pickBuskingSession(
  setLists: SetListData[],
  options: PickBuskingSessionOptions
): SetListData | null {
  const today = toLocalDateISO(new Date());
  const todayLive = getLiveSessionsForDate(setLists, today);
  const legacyLive = getLegacyLiveSessionsForDate(setLists, today);

  if (options.selectedSessionId) {
    const selected = setLists.find((list) => list.id === options.selectedSessionId);
    if (selected && isLiveSession(selected)) return selected;
  }

  const ownHost = todayLive.filter((list) => list.hostUid === options.userUid);
  if (ownHost.length === 1) return ownHost[0];

  const memberOf = todayLive.filter((list) => isParticipantInSession(list, options.userNickname));
  if (memberOf.length === 1) return memberOf[0];

  const legacyMemberOf = legacyLive.filter((list) =>
    isParticipantInSession(list, options.userNickname)
  );
  if (legacyMemberOf.length === 1) return legacyMemberOf[0];

  if (options.isLeader && todayLive.length === 1) return todayLive[0];
  if (options.isLeader && todayLive.length === 0 && legacyLive.length === 1) return legacyLive[0];

  return null;
}

export function readStoredBuskingSessionId(userUid: string): string | null {
  if (!userUid) return null;
  try {
    return sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${userUid}`);
  } catch {
    return null;
  }
}

export function writeStoredBuskingSessionId(userUid: string, sessionId: string | null): void {
  if (!userUid) return;
  try {
    const key = `${SESSION_STORAGE_PREFIX}${userUid}`;
    if (sessionId) sessionStorage.setItem(key, sessionId);
    else sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage unavailable */
  }
}

export function buildBuskingSessionName(sessionDate: string, venueLabel: string, hostNickname: string): string {
  const venue = venueLabel.trim();
  const dateLabel = formatSetListDateLabel(sessionDate);
  if (venue) return `${dateLabel} · ${venue}`;
  return `${dateLabel} · ${hostNickname.trim() || '버스킹'}`;
}
