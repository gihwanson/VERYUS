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

/** 명예의 전당 합격곡 순위: 같은 곡 제목+멤버 조합은 문서가 여러 개여도 1곡으로만 집계 */
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
