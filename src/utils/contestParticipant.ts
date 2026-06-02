import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ContestType, ParticipantRecord, RoundVote } from '../types/contest';

export const CONTEST_LATE_JOIN_MESSAGE =
  '콘테스트가 이미 개최되었습니다. 참여하려면 관리자에게 참가 등록을 요청해주세요.';

export const CONTEST_NOT_REGISTERED_MESSAGE =
  '참가자 목록에 등록된 멤버만 참여할 수 있습니다. 관리자에게 참가 등록을 요청해주세요.';

/** Firestore 필드를 React 렌더링·비교용 문자열로 안전하게 변환 */
export function coerceFirestoreString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

export function normalizeNickname(nickname: unknown): string {
  return coerceFirestoreString(nickname).toLowerCase();
}

export const CUSTOM_PARTICIPANT_ID_PREFIX = 'custom_';

/** participants 문서 ID 기준으로 실제 UID를 결정 (투표 doc ID와 일치시키기 위함) */
export function resolveParticipantUid(
  docId: string,
  data: { uid?: unknown }
): string {
  if (!docId.startsWith(CUSTOM_PARTICIPANT_ID_PREFIX)) {
    return docId;
  }
  const dataUid = coerceFirestoreString(data.uid);
  return dataUid || docId;
}

/** participants 문서를 안전하게 파싱 */
export function parseParticipantFromDoc(
  docId: string,
  data: Record<string, unknown>
): ParticipantRecord {
  return {
    uid: resolveParticipantUid(docId, data),
    nickname: coerceFirestoreString(data.nickname),
    joinedAt: data.joinedAt,
  };
}

/** Firestore votes/{authUid} 문서를 RoundVote로 변환 (본문 uid 누락 시 doc ID 사용) */
export function parseRoundVoteFromDoc(
  docId: string,
  data: Record<string, unknown>
): RoundVote {
  const uid = coerceFirestoreString(data.uid) || docId;
  return {
    uid,
    nickname: coerceFirestoreString(data.nickname),
    choice: data.choice === 'B' ? 'B' : 'A',
    comment: typeof data.comment === 'string' ? data.comment : undefined,
    updatedAt: data.updatedAt,
  };
}

function preferAuthParticipant<T extends { uid: string }>(a: T, b: T): T {
  const aCustom = a.uid.startsWith(CUSTOM_PARTICIPANT_ID_PREFIX);
  const bCustom = b.uid.startsWith(CUSTOM_PARTICIPANT_ID_PREFIX);
  if (aCustom && !bCustom) return b;
  if (!aCustom && bCustom) return a;
  return a;
}

/** 동일 닉네임 중복 참가자 중 Auth UID 기록을 우선 (관리자 수동 추가 custom_ 문서와 충돌 방지) */
export function dedupeContestParticipants<T extends { uid: string; nickname?: string }>(
  participants: T[]
): T[] {
  const byUid = new Map<string, T>();
  for (const p of participants) {
    const uid = coerceFirestoreString(p.uid);
    if (!uid) continue;
    const normalized = {
      ...p,
      uid,
      nickname: coerceFirestoreString(p.nickname),
    };
    if (!byUid.has(uid)) {
      byUid.set(uid, normalized);
    }
  }

  const byNickname = new Map<string, T>();
  const withoutNickname: T[] = [];

  for (const p of byUid.values()) {
    const nick = coerceFirestoreString(p.nickname);
    if (!nick) {
      withoutNickname.push(p);
      continue;
    }
    const key = normalizeNickname(nick);
    const existing = byNickname.get(key);
    if (!existing) {
      byNickname.set(key, p);
      continue;
    }
    byNickname.set(key, preferAuthParticipant(existing, p));
  }

  return [...withoutNickname, ...byNickname.values()];
}

/** 라운드매치 투표 ↔ 참가자 매칭 (uid + 닉네임) */
export function participantMatchesRoundVote(
  participant: { uid?: string; nickname?: string },
  vote: { uid?: string; nickname?: string }
): boolean {
  const pUid = coerceFirestoreString(participant.uid);
  const vUid = coerceFirestoreString(vote.uid);
  if (pUid && vUid && pUid === vUid) {
    return true;
  }
  const pNick = coerceFirestoreString(participant.nickname);
  const vNick = coerceFirestoreString(vote.nickname);
  if (pNick && vNick) {
    return normalizeNickname(pNick) === normalizeNickname(vNick);
  }
  return false;
}

export function isRegisteredParticipant(
  participants: Array<{ uid?: string; nickname?: string }>,
  user: { uid: string; nickname?: string }
): boolean {
  if (!user?.nickname) return false;
  const userNick = normalizeNickname(user.nickname);
  return participants.some(
    (p) =>
      p.uid === user.uid ||
      (p.nickname && normalizeNickname(p.nickname) === userNick)
  );
}

/** 개최 전 참여 버튼 클릭 시 참가자 목록에 자동 등록 */
export async function ensureContestParticipant(
  contestId: string,
  user: { uid: string; nickname?: string }
): Promise<void> {
  if (!user.uid || !user.nickname?.trim()) return;

  const byUidRef = doc(db, 'contests', contestId, 'participants', user.uid);
  const byUidSnap = await getDoc(byUidRef);
  if (byUidSnap.exists()) return;

  const participantsSnap = await getDocs(collection(db, 'contests', contestId, 'participants'));
  const alreadyByNickname = participantsSnap.docs.some((d) => {
    const data = d.data();
    const nick = coerceFirestoreString(data.nickname);
    const userNick = normalizeNickname(user.nickname!);
    return nick && normalizeNickname(nick) === userNick;
  });
  if (alreadyByNickname) return;

  await setDoc(byUidRef, {
    nickname: user.nickname.trim(),
    uid: user.uid,
    joinedAt: new Date(),
  });
}

export function canAutoJoinBeforeStart(type: ContestType): boolean {
  return type === '경연' || type === '라운드매치';
}

/** 참여 버튼 클릭 시 참가자 명단 등록
 * - 개최 전(경연·라운드매치): 모든 멤버
 * - 개최 후: 리더만 (일반 멤버는 관리자가 수동 추가)
 */
export async function registerOnParticipateClick(
  contestId: string,
  contest: { isStarted: boolean; type: ContestType },
  user: { uid: string; nickname?: string; role?: string }
): Promise<void> {
  if (!canAutoJoinBeforeStart(contest.type)) return;

  const isLeader = user.role === '리더';
  if (!contest.isStarted || isLeader) {
    await ensureContestParticipant(contestId, user);
  }
}
