import { ROLE_SYSTEM } from '../AdminTypes';

/** 셋리스트 관리 탭 권한 (리더·조장만, 앱 전역 권한과 무관) */
export function canManageSetList(role?: string | null): boolean {
  return role === ROLE_SYSTEM.LEADER || role === ROLE_SYSTEM.SQUAD_LEADER;
}
