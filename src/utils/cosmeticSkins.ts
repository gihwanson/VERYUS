/**
 * 닉네임 / 직책·역할 배지 / 글(제목·본문) 스킨
 */

export const COSMETIC_CHANGE_EVENT = 'veryus-cosmetic-skin-change';
export const COSMETIC_FULL_ACCESS_NICKNAMES = ['너래'] as const;

const STORAGE = {
  nicknameUnlocks: 'veryus_nickname_skin_unlocks',
  nicknameEquipped: 'veryus_nickname_skin_equipped',
  badgeUnlocks: 'veryus_badge_skin_unlocks',
  badgeEquipped: 'veryus_badge_skin_equipped',
  postTitleUnlocks: 'veryus_post_title_skin_unlocks',
  postTitleEquipped: 'veryus_post_title_skin_equipped',
  postBodyUnlocks: 'veryus_post_body_skin_unlocks',
  postBodyEquipped: 'veryus_post_body_skin_equipped',
} as const;

export type CosmeticCategory = 'nickname' | 'badge' | 'postTitle' | 'postBody';

export interface CosmeticSkin {
  id: string;
  name: string;
  description: string;
  acquireLabel: string;
  unlockCondition: string;
  className: string;
}

export const NICKNAME_SKINS: CosmeticSkin[] = [
  {
    id: 'brush',
    name: '붓글씨',
    description: '세리프 느낌으로 살짝 기울어진 닉네임',
    acquireLabel: '붓글씨 닉네임 스킨',
    unlockCondition: '자유글 30개 작성',
    className: 'nick-skin nick-skin--brush',
  },
  {
    id: 'neon',
    name: '네온 사인',
    description: '얇은 외곽 글로우가 감싸는 닉네임',
    acquireLabel: '네온 사인 닉네임 스킨',
    unlockCondition: '앱 접속 30일 달성',
    className: 'nick-skin nick-skin--neon',
  },
  {
    id: 'note-underline',
    name: '음표 밑줄',
    description: '닉네임 아래 음표가 반짝입니다',
    acquireLabel: '음표 밑줄 닉네임 스킨',
    unlockCondition: '녹음·이어부르기 글 25개 작성',
    className: 'nick-skin nick-skin--note-underline',
  },
  {
    id: 'busking-tag',
    name: '버스킹 명찰',
    description: '명찰처럼 밑줄과 점이 붙습니다',
    acquireLabel: '버스킹 명찰 닉네임 스킨',
    unlockCondition: '셋리스트 참여 15회',
    className: 'nick-skin nick-skin--busking-tag',
  },
  {
    id: 'breath-fade',
    name: '숨결 페이드',
    description: '밝기가 천천히 맥박처럼 변합니다',
    acquireLabel: '숨결 페이드 닉네임 스킨',
    unlockCondition: '방명록 주고받기 20회',
    className: 'nick-skin nick-skin--breath-fade',
  },
];

export const BADGE_SKINS: CosmeticSkin[] = [
  {
    id: 'gold-frame',
    name: '금테 배지',
    description: '배지에 금색 테두리가 생깁니다',
    acquireLabel: '금테 배지 스킨',
    unlockCondition: '리더·운영진 역할 보유',
    className: 'badge-skin badge-skin--gold-frame',
  },
  {
    id: 'ribbon-pin',
    name: '리본 핀',
    description: '배지 옆에 작은 리본 핀이 붙습니다',
    acquireLabel: '리본 핀 배지 스킨',
    unlockCondition: '직책 등록',
    className: 'badge-skin badge-skin--ribbon-pin',
  },
  {
    id: 'starlight',
    name: '별빛 테두리',
    description: '배지 테두리가 은은히 반짝입니다',
    acquireLabel: '별빛 테두리 배지 스킨',
    unlockCondition: '앱 접속 60일 달성',
    className: 'badge-skin badge-skin--starlight',
  },
  {
    id: 'season',
    name: '시즌 배지',
    description: '시즌 한정 색감의 배지 프레임',
    acquireLabel: '시즌 배지 스킨',
    unlockCondition: '콘테스트 참가 5회',
    className: 'badge-skin badge-skin--season',
  },
];

export const POST_TITLE_SKINS: CosmeticSkin[] = [
  {
    id: 'highlighter',
    name: '하이라이터',
    description: '제목 뒤에 형광 밑줄이 깔립니다',
    acquireLabel: '하이라이터 제목 스킨',
    unlockCondition: '게시글 50개 작성',
    className: 'post-title-skin post-title-skin--highlighter',
  },
  {
    id: 'ticket',
    name: '티켓 제목',
    description: '좌우에 작은 천공 라인 포스터 느낌',
    acquireLabel: '티켓 제목 스킨',
    unlockCondition: '콘테스트 참가 3회',
    className: 'post-title-skin post-title-skin--ticket',
  },
  {
    id: 'spotlight',
    name: '스포트라이트',
    description: '제목에 부드러운 강조 그라데이션',
    acquireLabel: '스포트라이트 제목 스킨',
    unlockCondition: '평가 합격 5회',
    className: 'post-title-skin post-title-skin--spotlight',
  },
  {
    id: 'handwriting',
    name: '손글씨 제목',
    description: '세리프 손글씨 느낌의 제목',
    acquireLabel: '손글씨 제목 스킨',
    unlockCondition: '자유글 40개 작성',
    className: 'post-title-skin post-title-skin--handwriting',
  },
];

export const POST_BODY_SKINS: CosmeticSkin[] = [
  {
    id: 'notebook',
    name: '노트 원고지',
    description: '본문·카드에 줄 노트 배경',
    acquireLabel: '노트 원고지 글 스킨',
    unlockCondition: '게시글 30개 작성',
    className: 'post-body-skin post-body-skin--notebook',
  },
  {
    id: 'polaroid',
    name: '폴라로이드',
    description: '카드에 폴라로이드 테두리',
    acquireLabel: '폴라로이드 글 스킨',
    unlockCondition: '녹음글 15개 작성',
    className: 'post-body-skin post-body-skin--polaroid',
  },
  {
    id: 'stage',
    name: '스테이지 프레임',
    description: '상단에 얇은 스테이지 조명 라인',
    acquireLabel: '스테이지 프레임 글 스킨',
    unlockCondition: '이어부르기 글 15개 작성',
    className: 'post-body-skin post-body-skin--stage',
  },
  {
    id: 'postcard',
    name: '엽서',
    description: '가장자리에 엽서·스탬프 느낌',
    acquireLabel: '엽서 글 스킨',
    unlockCondition: '파트너 모집글 10개 작성',
    className: 'post-body-skin post-body-skin--postcard',
  },
];

const CATEGORY_SKINS: Record<CosmeticCategory, CosmeticSkin[]> = {
  nickname: NICKNAME_SKINS,
  badge: BADGE_SKINS,
  postTitle: POST_TITLE_SKINS,
  postBody: POST_BODY_SKINS,
};

const CATEGORY_KEYS: Record<
  CosmeticCategory,
  { unlocks: string; equipped: string }
> = {
  nickname: { unlocks: STORAGE.nicknameUnlocks, equipped: STORAGE.nicknameEquipped },
  badge: { unlocks: STORAGE.badgeUnlocks, equipped: STORAGE.badgeEquipped },
  postTitle: { unlocks: STORAGE.postTitleUnlocks, equipped: STORAGE.postTitleEquipped },
  postBody: { unlocks: STORAGE.postBodyUnlocks, equipped: STORAGE.postBodyEquipped },
};

export function hasCosmeticFullAccess(nickname: string | null | undefined): boolean {
  const n = (nickname ?? '').trim();
  return (COSMETIC_FULL_ACCESS_NICKNAMES as readonly string[]).includes(n);
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

function emitCosmeticChange() {
  window.dispatchEvent(new Event(COSMETIC_CHANGE_EVENT));
}

export function getCosmeticSkins(category: CosmeticCategory): CosmeticSkin[] {
  return CATEGORY_SKINS[category];
}

export function getCosmeticSkin(
  category: CosmeticCategory,
  id: string | null | undefined
): CosmeticSkin | null {
  if (!id) return null;
  return CATEGORY_SKINS[category].find((s) => s.id === id) ?? null;
}

export function getUnlockedCosmeticIds(
  category: CosmeticCategory,
  nickname?: string | null
): string[] {
  const skins = CATEGORY_SKINS[category];
  if (hasCosmeticFullAccess(nickname)) return skins.map((s) => s.id);
  const unlocked = readJsonArray(CATEGORY_KEYS[category].unlocks);
  return skins.map((s) => s.id).filter((id) => unlocked.includes(id));
}

export function isCosmeticUnlocked(
  category: CosmeticCategory,
  skinId: string,
  nickname?: string | null
): boolean {
  return getUnlockedCosmeticIds(category, nickname).includes(skinId);
}

/** localStorage 기준 해금 여부 (리더 전체 해금과 무관) */
export function isCosmeticUnlockedInStorage(category: CosmeticCategory, skinId: string): boolean {
  return readJsonArray(CATEGORY_KEYS[category].unlocks).includes(skinId);
}

/** 조건 미달 시 해금 회수 */
export function lockCosmeticSkin(category: CosmeticCategory, skinId: string): boolean {
  if (!getCosmeticSkin(category, skinId)) return false;
  const key = CATEGORY_KEYS[category].unlocks;
  const unlocked = readJsonArray(key);
  if (!unlocked.includes(skinId)) return false;
  localStorage.setItem(key, JSON.stringify(unlocked.filter((id) => id !== skinId)));
  if (getEquippedCosmeticId(category) === skinId) {
    setEquippedCosmeticId(category, null);
  } else {
    emitCosmeticChange();
  }
  return true;
}

export function hasAnyCosmeticUnlock(
  category: CosmeticCategory,
  nickname?: string | null
): boolean {
  return getUnlockedCosmeticIds(category, nickname).length > 0;
}

/** 설정에 코스메틱 스킨 영역 노출 (카테고리 중 하나라도 해금/리더) */
export function hasAnyCosmeticCategoryUnlock(nickname?: string | null): boolean {
  return (
    hasAnyCosmeticUnlock('nickname', nickname) ||
    hasAnyCosmeticUnlock('badge', nickname) ||
    hasAnyCosmeticUnlock('postTitle', nickname) ||
    hasAnyCosmeticUnlock('postBody', nickname)
  );
}

export function unlockCosmeticSkin(category: CosmeticCategory, skinId: string): boolean {
  if (!getCosmeticSkin(category, skinId)) return false;
  const key = CATEGORY_KEYS[category].unlocks;
  const unlocked = readJsonArray(key);
  if (unlocked.includes(skinId)) return false;
  unlocked.push(skinId);
  localStorage.setItem(key, JSON.stringify(unlocked));
  if (!getEquippedCosmeticId(category)) {
    setEquippedCosmeticId(category, skinId);
  } else {
    emitCosmeticChange();
  }
  return true;
}

export function getEquippedCosmeticId(category: CosmeticCategory): string | null {
  try {
    const raw = localStorage.getItem(CATEGORY_KEYS[category].equipped);
    if (!raw || raw === 'none') return null;
    return getCosmeticSkin(category, raw) ? raw : null;
  } catch {
    return null;
  }
}

export type EquippedCosmeticSkins = {
  nickname?: string | null;
  badge?: string | null;
  postTitle?: string | null;
  postBody?: string | null;
};

export const COSMETIC_SKINS_USER_FIELD = 'cosmeticSkins';

export function getLocalEquippedCosmeticSkins(): EquippedCosmeticSkins {
  return {
    nickname: getEquippedCosmeticId('nickname'),
    badge: getEquippedCosmeticId('badge'),
    postTitle: getEquippedCosmeticId('postTitle'),
    postBody: getEquippedCosmeticId('postBody'),
  };
}

/** 게시글/댓글 저장용 — 작성 시점 장착 스킨 스냅샷 */
export function buildWriterCosmeticSkinsPayload(): EquippedCosmeticSkins {
  return getLocalEquippedCosmeticSkins();
}

export function parseEquippedCosmeticSkins(raw: unknown): EquippedCosmeticSkins {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  const pick = (key: CosmeticCategory): string | null => {
    const v = data[key];
    return typeof v === 'string' && getCosmeticSkin(key, v) ? v : null;
  };
  return {
    nickname: pick('nickname'),
    badge: pick('badge'),
    postTitle: pick('postTitle'),
    postBody: pick('postBody'),
  };
}

/** 다른 유저 스킨 표시용 — 해금 여부 검사 없이 className만 */
export function getCosmeticClassNameBySkinId(
  category: CosmeticCategory,
  skinId: string | null | undefined
): string {
  if (!skinId) return '';
  return getCosmeticSkin(category, skinId)?.className ?? '';
}

export async function persistEquippedCosmeticSkinsToFirestore(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const { db } = await import('../firebase');
    await updateDoc(doc(db, 'users', uid), {
      [COSMETIC_SKINS_USER_FIELD]: getLocalEquippedCosmeticSkins(),
    });
  } catch (error) {
    console.error('코스메틱 스킨 Firestore 저장 실패:', error);
  }
}

/** Firestore 동기화 없이 로컬만 갱신 (원격 하이드레이션용) */
export function writeLocalEquippedCosmeticSkins(
  skins: EquippedCosmeticSkins,
  options?: { emit?: boolean }
) {
  (['nickname', 'badge', 'postTitle', 'postBody'] as const).forEach((category) => {
    if (skins[category] === undefined) return;
    localStorage.setItem(CATEGORY_KEYS[category].equipped, skins[category] ?? 'none');
  });
  if (options?.emit !== false) emitCosmeticChange();
}

export function setEquippedCosmeticId(category: CosmeticCategory, skinId: string | null) {
  localStorage.setItem(CATEGORY_KEYS[category].equipped, skinId ?? 'none');
  emitCosmeticChange();
  try {
    const raw = localStorage.getItem('veryus_user');
    if (!raw) return;
    const parsed = JSON.parse(raw) as { uid?: string };
    if (parsed.uid) void persistEquippedCosmeticSkinsToFirestore(parsed.uid);
  } catch {
    /* ignore */
  }
}

export function getEquippedCosmeticClassName(
  category: CosmeticCategory,
  nickname?: string | null
): string {
  const equipped = getEquippedCosmeticId(category);
  if (!equipped || !isCosmeticUnlocked(category, equipped, nickname)) return '';
  return getCosmeticSkin(category, equipped)?.className ?? '';
}

export function nicknamesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
