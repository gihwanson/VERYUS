import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from './notificationService';

export function normalizeApprovedSongTitleKey(data: Record<string, unknown>): string {
  const titleNoSpace = String(data.titleNoSpace || '').trim();
  if (titleNoSpace) return titleNoSpace.toLowerCase();
  const title = String(data.title || '').trim();
  return title.replace(/\s/g, '').toLowerCase();
}

function getCreatedAtMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  return 0;
}

/** 명예의 전당·마이페이지 공통: 같은 곡 제목+멤버 조합은 문서가 여러 개여도 1곡으로만 집계 */
export function approvedSongCountsByNicknameFromDocs(
  docs: Array<QueryDocumentSnapshot<DocumentData> | { data: () => DocumentData }>
): Map<string, number> {
  const counts = new Map<string, number>();
  const seenTitleMember = new Set<string>();

  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    const titleKey = normalizeApprovedSongTitleKey(data);
    if (!titleKey) continue;

    const members = Array.isArray(data.members) ? data.members : [];
    const seenInDoc = new Set<string>();

    for (const raw of members) {
      const nick = String(raw || '').trim();
      if (!nick || seenInDoc.has(nick)) continue;
      seenInDoc.add(nick);

      const dedupeKey = `${titleKey}\0${nick}`;
      if (seenTitleMember.has(dedupeKey)) continue;
      seenTitleMember.add(dedupeKey);

      counts.set(nick, (counts.get(nick) || 0) + 1);
    }
  }
  return counts;
}

/**
 * 특정 닉네임의 합격곡 목록을 명예의전당과 같은 기준으로 정리.
 * 같은 제목은 1곡만 남기고, 더 최근(createdAt) 문서를 우선한다.
 */
export function dedupeApprovedSongsForNickname<
  T extends {
    title?: string;
    titleNoSpace?: string;
    members?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  }
>(songs: T[], nickname: string): T[] {
  const nick = String(nickname || '').trim();
  if (!nick) return [];

  const sorted = [...songs].sort((a, b) => {
    const aMs = Math.max(getCreatedAtMs(a.updatedAt), getCreatedAtMs(a.createdAt));
    const bMs = Math.max(getCreatedAtMs(b.updatedAt), getCreatedAtMs(b.createdAt));
    return bMs - aMs;
  });

  const seenTitles = new Set<string>();
  const result: T[] = [];
  for (const song of sorted) {
    const members = Array.isArray(song.members)
      ? song.members.map((m) => String(m || '').trim()).filter(Boolean)
      : [];
    if (!members.includes(nick)) continue;

    const titleKey = normalizeApprovedSongTitleKey(song as Record<string, unknown>);
    if (!titleKey || seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);
    result.push(song);
  }
  return result;
}

/** 재심사 등: 제목+멤버 조합이 같은 approvedSongs 문서 id 목록 */
export function findApprovedSongDocIdsMatchingTitleMembers(
  docs: Array<QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }>,
  title: string,
  members: string[]
): string[] {
  const titleKey = normalizeApprovedSongTitleKey({ title, titleNoSpace: title.replace(/\s/g, '') });
  if (!titleKey) return [];

  const normalizedMembers = [...new Set(members.map((m) => String(m || '').trim()).filter(Boolean))]
    .map((m) => m.toLowerCase())
    .sort();
  if (normalizedMembers.length === 0) return [];

  const ids: string[] = [];
  for (const d of docs) {
    const data = d.data() as Record<string, unknown>;
    if (normalizeApprovedSongTitleKey(data) !== titleKey) continue;
    const songMembers = (Array.isArray(data.members) ? data.members : [])
      .map((m) => String(m || '').trim().toLowerCase())
      .filter(Boolean)
      .sort();
    if (songMembers.length !== normalizedMembers.length) continue;
    if (songMembers.every((m, i) => m === normalizedMembers[i])) {
      ids.push(d.id);
    }
  }
  return ids;
}

const MILESTONES = [20, 50, 100] as const;

/** 닉네임 '너래' + role '운영진' 계정(중복 제거) */
async function getNeraeAndOpsStaffUids(): Promise<string[]> {
  const [staffSnap, neraeSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), where('role', '==', '운영진'))),
    getDocs(query(collection(db, 'users'), where('nickname', '==', '너래')))
  ]);
  const uidSet = new Set<string>();
  staffSnap.docs.forEach((d) => uidSet.add(d.id));
  neraeSnap.docs.forEach((d) => uidSet.add(d.id));
  return [...uidSet];
}

/**
 * 합격곡 문서 변경 전후로, 영향 받은 닉네임 중 users에 등록된 회원이
 * 20·50·100곡 고지를 처음 넘었을 때만 너래·운영진에게 알림.
 */
export async function notifyStaffOnApprovedSongCountMilestones(params: {
  countsByNicknameBefore: Map<string, number>;
  countsByNicknameAfter: Map<string, number>;
  affectedNicknames: string[];
}): Promise<void> {
  const { countsByNicknameBefore, countsByNicknameAfter, affectedNicknames } = params;
  const nickSet = new Set(
    affectedNicknames.map((n) => String(n || '').trim()).filter((n) => n.length > 0)
  );
  if (nickSet.size === 0) return;

  try {
    const [usersSnap, staffUids] = await Promise.all([getDocs(collection(db, 'users')), getNeraeAndOpsStaffUids()]);
    const nicknameToUid = new Map<string, string>();
    usersSnap.forEach((userDoc) => {
      const nick = String((userDoc.data() as Record<string, unknown>).nickname || '').trim();
      if (nick) nicknameToUid.set(nick, userDoc.id);
    });

    const payloads: Array<Promise<boolean>> = [];

    for (const nickname of nickSet) {
      const achieverUid = nicknameToUid.get(nickname);
      if (!achieverUid) continue;

      const before = countsByNicknameBefore.get(nickname) ?? 0;
      const after = countsByNicknameAfter.get(nickname) ?? 0;

      for (const m of MILESTONES) {
        if (before >= m || after < m) continue;
        const message = `${nickname}님이 합격곡 ${m}곡을 달성했습니다!`;
        for (const toUid of staffUids) {
          if (!toUid || toUid === achieverUid) continue;
          payloads.push(
            NotificationService.createNotification({
              type: 'approved_song_milestone',
              toUid,
              fromUid: achieverUid,
              fromNickname: nickname,
              postId: `approved-song-milestone-${m}-${achieverUid}`,
              postTitle: `합격곡 ${m}곡 달성`,
              message,
              route: '/hall-of-fame'
            })
          );
        }
      }
    }

    await Promise.all(payloads);
  } catch (error) {
    console.error('합격곡 마일스톤 알림(운영진) 전송 실패:', error);
  }
}
