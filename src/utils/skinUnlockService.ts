import { toast } from 'react-toastify';
import { NotificationService } from './notificationService';
import {
  getCosmeticSkin,
  isCosmeticUnlockedInStorage,
  lockCosmeticSkin,
  unlockCosmeticSkin,
  type CosmeticCategory,
} from './cosmeticSkins';
import {
  getGradeFxSkin,
  isGradeFxUnlockedInStorage,
  lockGradeFxSkin,
  unlockGradeFxSkin,
  type GradeFxSkinId,
} from './gradeFxSkins';
import {
  fetchSkinUnlockMetrics,
  type SkinUnlockMetrics,
} from './skinUnlockMetrics';

const UNLOCK_GUIDE = '마이페이지 → 설정에서 스킨을 적용할 수 있어요.';
/** 이미 알림을 보낸 스킨 postId — localStorage 초기화/해금 회수 후에도 재발송 방지 */
const NOTIFIED_UNLOCKS_KEY = 'veryus_skin_unlock_notified';

function readNotifiedUnlockIds(): string[] {
  try {
    const raw = localStorage.getItem(NOTIFIED_UNLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function wasUnlockNotified(postId: string): boolean {
  return readNotifiedUnlockIds().includes(postId);
}

function markUnlockNotified(postId: string): void {
  if (!postId || wasUnlockNotified(postId)) return;
  const next = [...readNotifiedUnlockIds(), postId];
  localStorage.setItem(NOTIFIED_UNLOCKS_KEY, JSON.stringify(next));
}

const notifyingPostIds = new Set<string>();

type GradeFxRule = {
  kind: 'gradeFx';
  id: GradeFxSkinId;
  /** 체리 오라는 이스터에그 전용 — 메트릭으로 해금/회수하지 않음 */
  met: (m: SkinUnlockMetrics) => boolean;
  autoManage: boolean;
};

type CosmeticRule = {
  kind: 'cosmetic';
  category: CosmeticCategory;
  id: string;
  met: (m: SkinUnlockMetrics) => boolean;
};

const GRADE_FX_RULES: GradeFxRule[] = [
  {
    kind: 'gradeFx',
    id: 'sparkle',
    autoManage: true,
    met: (m) => m.postsTotal >= 50,
  },
  {
    kind: 'gradeFx',
    id: 'cherry-aura',
    autoManage: false,
    met: () => false,
  },
  {
    kind: 'gradeFx',
    id: 'breath',
    autoManage: true,
    met: (m) => m.guestbookWritten >= 30,
  },
  {
    kind: 'gradeFx',
    id: 'orbit',
    autoManage: true,
    met: (m) => m.minigamePlays >= 20,
  },
  {
    kind: 'gradeFx',
    id: 'pulse',
    autoManage: true,
    met: (m) => m.comments >= 150,
  },
];

const COSMETIC_RULES: CosmeticRule[] = [
  { kind: 'cosmetic', category: 'nickname', id: 'brush', met: (m) => m.postsFree >= 30 },
  { kind: 'cosmetic', category: 'nickname', id: 'neon', met: (m) => m.activeDays >= 30 },
  {
    kind: 'cosmetic',
    category: 'nickname',
    id: 'note-underline',
    met: (m) => m.postsRecordingPlusChorus >= 25,
  },
  {
    kind: 'cosmetic',
    category: 'nickname',
    id: 'busking-tag',
    met: (m) => m.setlistParticipations >= 15,
  },
  {
    kind: 'cosmetic',
    category: 'nickname',
    id: 'breath-fade',
    met: (m) => m.guestbookGiven + m.guestbookReceived >= 20,
  },
  {
    kind: 'cosmetic',
    category: 'badge',
    id: 'gold-frame',
    met: (m) => m.isLeaderOrAdmin,
  },
  {
    kind: 'cosmetic',
    category: 'badge',
    id: 'ribbon-pin',
    met: (m) => m.hasPublicPosition,
  },
  {
    kind: 'cosmetic',
    category: 'badge',
    id: 'starlight',
    met: (m) => m.activeDays >= 60,
  },
  {
    kind: 'cosmetic',
    category: 'badge',
    id: 'season',
    met: (m) => m.contestParticipations >= 5,
  },
  {
    kind: 'cosmetic',
    category: 'postTitle',
    id: 'highlighter',
    met: (m) => m.postsTotal >= 50,
  },
  {
    kind: 'cosmetic',
    category: 'postTitle',
    id: 'ticket',
    met: (m) => m.contestParticipations >= 3,
  },
  {
    kind: 'cosmetic',
    category: 'postTitle',
    id: 'spotlight',
    met: (m) => m.evaluationPasses >= 5,
  },
  {
    kind: 'cosmetic',
    category: 'postTitle',
    id: 'handwriting',
    met: (m) => m.postsFree >= 40,
  },
  {
    kind: 'cosmetic',
    category: 'postBody',
    id: 'notebook',
    met: (m) => m.postsTotal >= 30,
  },
  {
    kind: 'cosmetic',
    category: 'postBody',
    id: 'polaroid',
    met: (m) => m.postsRecording >= 15,
  },
  {
    kind: 'cosmetic',
    category: 'postBody',
    id: 'stage',
    met: (m) => m.postsChorus >= 15,
  },
  {
    kind: 'cosmetic',
    category: 'postBody',
    id: 'postcard',
    met: (m) => m.postsPartner >= 10,
  },
];

async function notifyUnlock(params: {
  uid: string;
  skinLabel: string;
  postId: string;
}) {
  const { uid, skinLabel, postId } = params;
  if (!uid || !postId) return;
  // 이미 보낸 적 있으면 toast/푸시 모두 스킵
  if (wasUnlockNotified(postId) || notifyingPostIds.has(postId)) return;
  notifyingPostIds.add(postId);
  try {
    const exists = await NotificationService.hasSkinUnlockNotification(uid, postId);
    if (exists) {
      markUnlockNotified(postId);
      return;
    }

    // 동시 sync / 재시도로 중복 생성되지 않도록 먼저 기록
    markUnlockNotified(postId);

    const message = `✨ ${skinLabel}을 획득했어요! ${UNLOCK_GUIDE}`;
    toast.success(message, {
      autoClose: 5000,
      hideProgressBar: true,
    });
    try {
      await NotificationService.createNotification({
        type: 'grade_fx_unlock',
        toUid: uid,
        fromNickname: 'VERYUS',
        message,
        route: '/settings',
        postId,
        postTitle: skinLabel,
      });
    } catch (error) {
      console.error('스킨 해금 알림 실패:', error);
    }
  } finally {
    notifyingPostIds.delete(postId);
  }
}

export type SkinUnlockCheckResult = {
  unlocked: string[];
  locked: string[];
  metrics: SkinUnlockMetrics;
};

/**
 * 조건에 맞는 스킨만 해금하고, 미달이면 해금을 회수한다.
 * (체리 오라는 이스터에그 전용으로 여기서 다루지 않음)
 */
export async function syncSkinUnlocksByMetrics(params: {
  uid: string;
  nickname?: string | null;
  notify?: boolean;
}): Promise<SkinUnlockCheckResult> {
  const { uid, nickname, notify = true } = params;
  const metrics = await fetchSkinUnlockMetrics(uid, nickname || '');
  const unlocked: string[] = [];
  const locked: string[] = [];

  for (const rule of GRADE_FX_RULES) {
    if (!rule.autoManage) continue;
    const meets = rule.met(metrics);
    const inStorage = isGradeFxUnlockedInStorage(rule.id);
    if (meets && !inStorage) {
      if (unlockGradeFxSkin(rule.id)) {
        unlocked.push(`gradeFx:${rule.id}`);
        if (notify) {
          const skin = getGradeFxSkin(rule.id);
          await notifyUnlock({
            uid,
            skinLabel: skin?.acquireLabel ?? rule.id,
            postId: `grade-fx-unlock-${rule.id}-${uid}`,
          });
        }
      }
    } else if (!meets && inStorage) {
      if (lockGradeFxSkin(rule.id)) {
        locked.push(`gradeFx:${rule.id}`);
      }
    }
  }

  for (const rule of COSMETIC_RULES) {
    const meets = rule.met(metrics);
    const inStorage = isCosmeticUnlockedInStorage(rule.category, rule.id);
    if (meets && !inStorage) {
      if (unlockCosmeticSkin(rule.category, rule.id)) {
        unlocked.push(`${rule.category}:${rule.id}`);
        if (notify) {
          const skin = getCosmeticSkin(rule.category, rule.id);
          await notifyUnlock({
            uid,
            skinLabel: skin?.acquireLabel ?? rule.id,
            postId: `cosmetic-unlock-${rule.category}-${rule.id}-${uid}`,
          });
        }
      }
    } else if (!meets && inStorage) {
      if (lockCosmeticSkin(rule.category, rule.id)) {
        locked.push(`${rule.category}:${rule.id}`);
      }
    }
  }

  return { unlocked, locked, metrics };
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastKey = '';

/** 연속 호출 시 묶어서 1회만 동기화 */
export function queueSkinUnlockSync(params: {
  uid: string;
  nickname?: string | null;
  delayMs?: number;
}): void {
  const { uid, nickname, delayMs = 1200 } = params;
  if (!uid) return;
  const key = `${uid}:${nickname || ''}`;
  lastKey = key;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (lastKey !== key) return;
    void syncSkinUnlocksByMetrics({ uid, nickname }).catch((error) => {
      console.error('스킨 해금 동기화 실패:', error);
    });
  }, delayMs);
}
