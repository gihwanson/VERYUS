/**
 * 등급 이모지 특수효과(FX) 스킨 — 해금·장착·미리보기
 */

export const GRADE_FX_UNLOCKS_KEY = 'veryus_grade_fx_unlocks';
export const GRADE_FX_EQUIPPED_KEY = 'veryus_grade_fx_equipped';
export const GRADE_FX_CHANGE_EVENT = 'veryus-grade-fx-change';

/** 리더 미리보기·전체 해금용 닉네임 */
export const GRADE_FX_FULL_ACCESS_NICKNAMES = ['너래'] as const;

export type GradeFxSkinId = 'sparkle' | 'cherry-aura' | 'breath' | 'orbit' | 'pulse';

export interface GradeFxSkin {
  id: GradeFxSkinId;
  name: string;
  description: string;
  /** 획득 토스트용 짧은 이름 */
  acquireLabel: string;
  className: string;
  /** 해금 조건 (설정·마이페이지에 동일 문구로 표시) */
  unlockCondition: string;
}

export const GRADE_FX_SKINS: GradeFxSkin[] = [
  {
    id: 'sparkle',
    name: '반짝 가루',
    description: '등급 위에서 가루가 계속 떨어집니다.',
    acquireLabel: '반짝 가루 스킨',
    className: 'grade-fx grade-fx--sparkle',
    unlockCondition: '게시글 50개 작성',
  },
  {
    id: 'cherry-aura',
    name: '체리 오라',
    description: '부드러운 분홍 빛이 등급을 감쌉니다.',
    acquireLabel: '체리 오라 스킨',
    className: 'grade-fx grade-fx--cherry-aura',
    unlockCondition: '???',
  },
  {
    id: 'breath',
    name: '숨결 링',
    description: '은은한 원이 숨 쉬듯 커졌다 작아집니다.',
    acquireLabel: '숨결 링 스킨',
    className: 'grade-fx grade-fx--breath',
    unlockCondition: '방명록 30개 작성',
  },
  {
    id: 'orbit',
    name: '별가루 궤도',
    description: '작은 별이 등급 주위를 천천히 돕니다.',
    acquireLabel: '별가루 궤도 스킨',
    className: 'grade-fx grade-fx--orbit',
    unlockCondition: '미니게임 20회 플레이',
  },
  {
    id: 'pulse',
    name: '펄스 글로우',
    description: '등급이 살짝 밝아졌다 어두워집니다.',
    acquireLabel: '펄스 글로우 스킨',
    className: 'grade-fx grade-fx--pulse',
    unlockCondition: '댓글 150개 작성',
  },
];

const SKIN_BY_ID = new Map(GRADE_FX_SKINS.map((s) => [s.id, s]));

export function getGradeFxSkin(id: string | null | undefined): GradeFxSkin | null {
  if (!id) return null;
  return SKIN_BY_ID.get(id as GradeFxSkinId) ?? null;
}

export function hasGradeFxFullAccess(nickname: string | null | undefined): boolean {
  const n = (nickname ?? '').trim();
  return (GRADE_FX_FULL_ACCESS_NICKNAMES as readonly string[]).includes(n);
}

function readJsonArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function emitGradeFxChange() {
  window.dispatchEvent(new Event(GRADE_FX_CHANGE_EVENT));
}

export function getUnlockedGradeFxIds(nickname?: string | null): GradeFxSkinId[] {
  if (hasGradeFxFullAccess(nickname)) {
    return GRADE_FX_SKINS.map((s) => s.id);
  }
  const unlocked = readJsonArray(GRADE_FX_UNLOCKS_KEY);
  return GRADE_FX_SKINS.map((s) => s.id).filter((id) => unlocked.includes(id));
}

export function isGradeFxUnlocked(skinId: GradeFxSkinId, nickname?: string | null): boolean {
  return getUnlockedGradeFxIds(nickname).includes(skinId);
}

/** localStorage 기준 해금 여부 (리더 전체 해금과 무관) */
export function isGradeFxUnlockedInStorage(skinId: GradeFxSkinId): boolean {
  return readJsonArray(GRADE_FX_UNLOCKS_KEY).includes(skinId);
}

/** 설정 카테고리 노출 — 해금 스킨이 1개 이상일 때 (리더는 전체 해금으로 항상 true) */
export function hasAnyGradeFxUnlock(nickname?: string | null): boolean {
  return getUnlockedGradeFxIds(nickname).length > 0;
}

/** @returns 새로 해금됐으면 true */
export function unlockGradeFxSkin(skinId: GradeFxSkinId): boolean {
  const unlocked = readJsonArray(GRADE_FX_UNLOCKS_KEY);
  if (unlocked.includes(skinId)) return false;
  unlocked.push(skinId);
  localStorage.setItem(GRADE_FX_UNLOCKS_KEY, JSON.stringify(unlocked));
  // 첫 해금이면 자동 장착
  if (!getEquippedGradeFxId()) {
    setEquippedGradeFxId(skinId);
  } else {
    emitGradeFxChange();
  }
  return true;
}

export function getEquippedGradeFxId(): GradeFxSkinId | null {
  try {
    const raw = localStorage.getItem(GRADE_FX_EQUIPPED_KEY);
    if (!raw || raw === 'none') return null;
    return getGradeFxSkin(raw) ? (raw as GradeFxSkinId) : null;
  } catch {
    return null;
  }
}

export const GRADE_FX_USER_FIELD = 'gradeFxEquipped';

export async function persistEquippedGradeFxToFirestore(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    await updateDoc(doc(db, 'users', uid), {
      [GRADE_FX_USER_FIELD]: getEquippedGradeFxId(),
    });
  } catch (error) {
    console.error('등급 FX Firestore 저장 실패:', error);
  }
}

/** Firestore 동기화 없이 로컬만 갱신 (원격 하이드레이션용) */
export function writeLocalEquippedGradeFx(
  skinId: GradeFxSkinId | null,
  options?: { emit?: boolean }
) {
  if (skinId) {
    localStorage.setItem(GRADE_FX_EQUIPPED_KEY, skinId);
  } else {
    localStorage.setItem(GRADE_FX_EQUIPPED_KEY, 'none');
  }
  if (options?.emit !== false) emitGradeFxChange();
}

export function setEquippedGradeFxId(skinId: GradeFxSkinId | null) {
  writeLocalEquippedGradeFx(skinId, { emit: true });
  try {
    const raw = localStorage.getItem('veryus_user');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { uid?: string };
    if (parsed.uid) void persistEquippedGradeFxToFirestore(parsed.uid);
  } catch {
    /* ignore */
  }
}

/** 다른 유저 표시용 — 해금 검사 없이 className만 */
export function getGradeFxClassNameBySkinId(skinId: string | null | undefined): string {
  if (!skinId) return '';
  return getGradeFxSkin(skinId)?.className ?? '';
}

export function getEquippedGradeFxClassName(nickname?: string | null): string {
  const equipped = getEquippedGradeFxId();
  if (!equipped) return '';
  if (!isGradeFxUnlocked(equipped, nickname)) return '';
  return getGradeFxSkin(equipped)?.className ?? '';
}

export function getGradeFxClassNameForSkin(skinId: GradeFxSkinId | null): string {
  if (!skinId) return '';
  return getGradeFxSkin(skinId)?.className ?? '';
}
