import { ROLE_SYSTEM, SUPER_ADMIN_NICKNAMES } from '../AdminTypes';
import type { SetListData } from './types';

export interface BuskingSessionUser {
  uid?: string;
  nickname?: string;
  role?: string | null;
}

/** 버스킹 관리 탭(편성·선정 등) 접근 — 리더·조장 */
export function canAccessBuskingManage(role?: string | null): boolean {
  return role === ROLE_SYSTEM.LEADER || role === ROLE_SYSTEM.SQUAD_LEADER;
}

/** 다른 사람이 연 세션도 관리할 수 있는지 — 리더·너래 */
export function isNeraeBuskingSupervisor(user: BuskingSessionUser | null | undefined): boolean {
  const nick = user?.nickname?.trim();
  return Boolean(nick && SUPER_ADMIN_NICKNAMES.includes(nick));
}

export function canManageAnyBuskingSession(user: BuskingSessionUser | null | undefined): boolean {
  return user?.role === ROLE_SYSTEM.LEADER || isNeraeBuskingSupervisor(user);
}

/** 현재 세션 문서를 수정할 수 있는지 (호스트 조장 또는 리더·너래) */
export function canManageBuskingSession(
  session: SetListData | null | undefined,
  user: BuskingSessionUser | null | undefined
): boolean {
  if (!session || !user?.uid) return false;
  if (canManageAnyBuskingSession(user)) return true;
  if (user.role === ROLE_SYSTEM.SQUAD_LEADER && session.hostUid === user.uid) return true;
  return false;
}

/** 새 버스킹 세션을 열 수 있는지 */
export function canHostBuskingSession(user: BuskingSessionUser | null | undefined): boolean {
  return canAccessBuskingManage(user?.role);
}
