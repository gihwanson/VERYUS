import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  ParticipantRecord,
  SongRequestLineupEntry,
  SongRequestParticipationRole,
  SongRequestRecord,
} from '../types/contest';
import {
  coerceFirestoreString,
  isSongRequestPerformer,
  normalizeNickname,
  parseParticipantFromDoc,
} from './contestParticipant';

export const SONG_REQUESTS_COLLECTION = 'songRequests';

export function filterSongRequestPerformers<T extends { participationRole?: string | null }>(
  participants: T[]
): T[] {
  return participants.filter((p) => isSongRequestPerformer(p));
}

/** 신청곡 콘테스트에 출연자/관객으로 스스로 참여 */
export async function joinSongRequestContest(params: {
  contestId: string;
  user: { uid: string; nickname?: string };
  role: SongRequestParticipationRole;
}): Promise<void> {
  const nickname = params.user.nickname?.trim();
  if (!params.contestId || !params.user.uid || !nickname) {
    throw new Error('로그인·닉네임 정보가 없어 참여할 수 없습니다.');
  }
  const ref = doc(db, 'contests', params.contestId, 'participants', params.user.uid);
  const payload: Record<string, unknown> = {
    uid: params.user.uid,
    nickname,
    joinedAt: serverTimestamp(),
    participationRole: params.role,
  };
  payload.selectedSongRequestId = null;
  payload.selectedSongTitle = null;
  payload.selectedAt = null;
  await setDoc(ref, payload, { merge: true });
}

/** 개최 전, 본인이 고른 출연자/관객 참여를 취소 */
export async function leaveSongRequestContest(params: {
  contestId: string;
  user: { uid: string };
}): Promise<void> {
  if (!params.contestId || !params.user.uid) {
    throw new Error('로그인 정보가 없어 참여를 취소할 수 없습니다.');
  }
  const ref = doc(db, 'contests', params.contestId, 'participants', params.user.uid);
  await deleteDoc(ref);
}

export function songRequestDocId(requesterUid: string, targetUid: string): string {
  return `${requesterUid}_${targetUid}`;
}

export function parseSongRequestFromDoc(
  docId: string,
  data: Record<string, unknown>
): SongRequestRecord {
  return {
    id: docId,
    targetUid: coerceFirestoreString(data.targetUid),
    targetNickname: coerceFirestoreString(data.targetNickname),
    requesterUid: coerceFirestoreString(data.requesterUid),
    requesterNickname: coerceFirestoreString(data.requesterNickname),
    songTitle: coerceFirestoreString(data.songTitle),
    createdAt: data.createdAt,
  };
}

/** participants 문서 중 현재 유저와 매칭되는 출연자 문서 (docId 포함) */
export async function findPerformerParticipantDoc(
  contestId: string,
  user: { uid: string; nickname?: string }
): Promise<{ docId: string; participant: ParticipantRecord } | null> {
  if (!contestId || !user?.uid) return null;
  const snap = await getDocs(collection(db, 'contests', contestId, 'participants'));
  const userNick = normalizeNickname(user.nickname || '');
  for (const d of snap.docs) {
    const participant = parseParticipantFromDoc(d.id, d.data() as Record<string, unknown>);
    if (participant.uid === user.uid || d.id === user.uid) {
      return { docId: d.id, participant };
    }
    if (userNick && normalizeNickname(participant.nickname) === userNick) {
      return { docId: d.id, participant };
    }
  }
  return null;
}

export async function upsertSongRequest(params: {
  contestId: string;
  targetUid: string;
  targetNickname: string;
  requesterUid: string;
  requesterNickname: string;
  songTitle: string;
}): Promise<string> {
  const title = params.songTitle.trim();
  if (!title) throw new Error('곡명을 입력해주세요.');
  if (!params.targetUid) throw new Error('출연자를 선택해주세요.');
  if (params.requesterUid === params.targetUid) {
    throw new Error('본인에게는 신청곡을 넣을 수 없습니다.');
  }
  if (
    normalizeNickname(params.requesterNickname) &&
    normalizeNickname(params.requesterNickname) === normalizeNickname(params.targetNickname)
  ) {
    throw new Error('본인에게는 신청곡을 넣을 수 없습니다.');
  }

  const id = songRequestDocId(params.requesterUid, params.targetUid);
  const ref = doc(db, 'contests', params.contestId, SONG_REQUESTS_COLLECTION, id);
  await setDoc(
    ref,
    {
      targetUid: params.targetUid,
      targetNickname: params.targetNickname.trim(),
      requesterUid: params.requesterUid,
      requesterNickname: params.requesterNickname.trim(),
      songTitle: title,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  return id;
}

export async function selectSongRequest(params: {
  contestId: string;
  participantDocId: string;
  requestId: string;
  songTitle: string;
}): Promise<void> {
  const title = params.songTitle.trim();
  if (!params.participantDocId || !params.requestId || !title) {
    throw new Error('선택한 신청곡 정보가 올바르지 않습니다.');
  }
  await updateDoc(doc(db, 'contests', params.contestId, 'participants', params.participantDocId), {
    selectedSongRequestId: params.requestId,
    selectedSongTitle: title,
    selectedAt: serverTimestamp(),
  });
}

export function buildSongRequestLineup(
  participants: Array<{
    uid: string;
    nickname: string;
    selectedSongTitle?: string | null;
    participationRole?: string | null;
  }>
): SongRequestLineupEntry[] {
  return filterSongRequestPerformers(participants)
    .map((p) => ({
      uid: p.uid,
      nickname: coerceFirestoreString(p.nickname),
      selectedSongTitle: coerceFirestoreString(p.selectedSongTitle) || null,
    }))
    .filter((p) => p.nickname)
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
}

export function subscribeSongRequestsForTarget(
  contestId: string,
  targetUid: string,
  onChange: (requests: SongRequestRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'contests', contestId, SONG_REQUESTS_COLLECTION),
    where('targetUid', '==', targetUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => parseSongRequestFromDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.songTitle.localeCompare(b.songTitle, 'ko'));
      onChange(list);
    },
    () => onChange([])
  );
}

export function subscribeMySongRequests(
  contestId: string,
  requesterUid: string,
  onChange: (requests: SongRequestRecord[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'contests', contestId, SONG_REQUESTS_COLLECTION),
    where('requesterUid', '==', requesterUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => parseSongRequestFromDoc(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => a.targetNickname.localeCompare(b.targetNickname, 'ko'));
      onChange(list);
    },
    () => onChange([])
  );
}

/** 목록·홈 버블 공통: ended 또는 마감일 다음날부터 종료 */
export function isContestEnded(contest: {
  ended?: boolean;
  deadline?: { seconds?: number } | null;
}): boolean {
  if (contest.ended) return true;
  if (contest.deadline?.seconds) {
    const deadlineDate = new Date(contest.deadline.seconds * 1000);
    const deadlineDateOnly = new Date(
      deadlineDate.getFullYear(),
      deadlineDate.getMonth(),
      deadlineDate.getDate()
    );
    const now = new Date();
    const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return nowDateOnly > deadlineDateOnly;
  }
  return false;
}

export type ActiveSongRequestContest = {
  id: string;
  title: string;
  isStarted: boolean;
  ended?: boolean;
  deadline: { seconds?: number } | null;
};

/** 종료되지 않은 신청곡 콘테스트 중 마감이 가까운 1건 */
export function subscribeActiveSongRequestContest(
  onChange: (contest: ActiveSongRequestContest | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'contests'), orderBy('deadline', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const active = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            title: coerceFirestoreString(data.title) || '신청곡',
            type: coerceFirestoreString(data.type),
            isStarted: Boolean(data.isStarted),
            ended: Boolean(data.ended),
            deadline: (data.deadline as { seconds?: number } | null) ?? null,
          };
        })
        .filter((c) => c.type === '신청곡' && !isContestEnded(c))
        .sort((a, b) => {
          const aSec = a.deadline?.seconds ?? Number.MAX_SAFE_INTEGER;
          const bSec = b.deadline?.seconds ?? Number.MAX_SAFE_INTEGER;
          return aSec - bSec;
        });
      const next = active[0];
      onChange(
        next
          ? {
              id: next.id,
              title: next.title,
              isStarted: next.isStarted,
              ended: next.ended,
              deadline: next.deadline,
            }
          : null
      );
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      onChange(null);
    }
  );
}
