import { doc, updateDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../firebase';
import { NotificationService } from './notificationService';
import {
  getCosmeticSkin,
  hasCosmeticFullAccess,
  readStoredCosmeticUnlockIds,
  rememberCosmeticUnlock,
  unlockCosmeticSkin,
  type CosmeticCategory,
} from './cosmeticSkins';
import {
  getGradeFxSkin,
  hasGradeFxFullAccess,
  readStoredGradeFxUnlockIds,
  rememberGradeFxUnlock,
  unlockGradeFxSkin,
  type GradeFxSkinId,
} from './gradeFxSkins';
import {
  fetchSkinUnlockMetrics,
  type SkinUnlockMetrics,
  type StoredSkinUnlocks,
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
    met: (m) => m.practiceSongs >= 10,
  },
  {
    kind: 'gradeFx',
    id: 'comet',
    autoManage: true,
    met: (m) => m.guestbookUniqueRecipients >= 12,
  },
  {
    kind: 'gradeFx',
    id: 'dash-ring',
    autoManage: true,
    met: (m) => m.practiceRoomBookings >= 8,
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
  { kind: 'cosmetic', category: 'nickname', id: 'ink', met: (m) => m.likesReceived >= 100 },
  { kind: 'cosmetic', category: 'nickname', id: 'beat', met: (m) => m.worldCupVoteDays >= 20 },
  {
    kind: 'cosmetic',
    category: 'nickname',
    id: 'side-by-side',
    met: (m) => m.adoptedAnonymousQuestions >= 5,
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
  { kind: 'cosmetic', category: 'badge', id: 'sprout', met: (m) => m.anonymousNotes >= 15 },
  { kind: 'cosmetic', category: 'badge', id: 'tape', met: (m) => m.commentsOnMyPosts >= 40 },
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
  { kind: 'cosmetic', category: 'postTitle', id: 'hairline', met: (m) => m.contestGradesGiven >= 10 },
  { kind: 'cosmetic', category: 'postTitle', id: 'duet', met: (m) => m.gradeBattleScores >= 10 },
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
  { kind: 'cosmetic', category: 'postBody', id: 'pencil', met: (m) => m.sharedPracticeSongs >= 8 },
  { kind: 'cosmetic', category: 'postBody', id: 'stripe', met: (m) => m.manittoSeasons >= 1 },
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

const SKIN_UNLOCKS_FIELD = 'skinUnlocks';

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every((id) => right.has(id));
}

function mergeIds(remote: string[], local: string[], known: (id: string) => boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...remote, ...local]) {
    if (!known(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 조건을 달성하면 해금하고, 계정에 저장한다.
 * 한 번 받은 스킨은 조건이 바뀌어도 회수하지 않는다.
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
  const quiet = hasGradeFxFullAccess(nickname) || hasCosmeticFullAccess(nickname);
  const next: StoredSkinUnlocks = {
    gradeFx: mergeIds(metrics.storedUnlocks.gradeFx, readStoredGradeFxUnlockIds(), (id) =>
      Boolean(getGradeFxSkin(id))
    ),
    nickname: mergeIds(
      metrics.storedUnlocks.nickname,
      readStoredCosmeticUnlockIds('nickname'),
      (id) => Boolean(getCosmeticSkin('nickname', id))
    ),
    badge: mergeIds(
      metrics.storedUnlocks.badge,
      readStoredCosmeticUnlockIds('badge'),
      (id) => Boolean(getCosmeticSkin('badge', id))
    ),
    postTitle: mergeIds(
      metrics.storedUnlocks.postTitle,
      readStoredCosmeticUnlockIds('postTitle'),
      (id) => Boolean(getCosmeticSkin('postTitle', id))
    ),
    postBody: mergeIds(
      metrics.storedUnlocks.postBody,
      readStoredCosmeticUnlockIds('postBody'),
      (id) => Boolean(getCosmeticSkin('postBody', id))
    ),
  };

  for (const id of next.gradeFx) rememberGradeFxUnlock(id);
  (['nickname', 'badge', 'postTitle', 'postBody'] as const).forEach((category) => {
    next[category].forEach((id) => rememberCosmeticUnlock(category, id));
  });

  for (const rule of GRADE_FX_RULES) {
    if (!rule.autoManage || next.gradeFx.includes(rule.id) || !rule.met(metrics)) continue;
    next.gradeFx.push(rule.id);
    const granted = quiet ? (rememberGradeFxUnlock(rule.id), true) : unlockGradeFxSkin(rule.id);
    if (!granted) continue;
    unlocked.push(`gradeFx:${rule.id}`);
    if (notify && !quiet) {
      const skin = getGradeFxSkin(rule.id);
      await notifyUnlock({
        uid,
        skinLabel: skin?.acquireLabel ?? rule.id,
        postId: `grade-fx-unlock-${rule.id}-${uid}`,
      });
    }
  }

  for (const rule of COSMETIC_RULES) {
    const owned = next[rule.category];
    if (owned.includes(rule.id) || !rule.met(metrics)) continue;
    owned.push(rule.id);
    const granted = quiet
      ? (rememberCosmeticUnlock(rule.category, rule.id), true)
      : unlockCosmeticSkin(rule.category, rule.id);
    if (!granted) continue;
    unlocked.push(`${rule.category}:${rule.id}`);
    if (notify && !quiet) {
      const skin = getCosmeticSkin(rule.category, rule.id);
      await notifyUnlock({
        uid,
        skinLabel: skin?.acquireLabel ?? rule.id,
        postId: `cosmetic-unlock-${rule.category}-${rule.id}-${uid}`,
      });
    }
  }

  const changed = (Object.keys(next) as Array<keyof StoredSkinUnlocks>).some(
    (key) => !sameIds(next[key], metrics.storedUnlocks[key])
  );
  if (changed) {
    try {
      await updateDoc(doc(db, 'users', uid), { [SKIN_UNLOCKS_FIELD]: next });
    } catch (error) {
      console.error('스킨 해금 목록 저장 실패:', error);
    }
  }

  return { unlocked, locked: [], metrics };
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
