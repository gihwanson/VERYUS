import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { ContestType } from '../types/contest';

export const CONTEST_LATE_JOIN_MESSAGE =
  '콘테스트가 이미 개최되었습니다. 참여하려면 관리자에게 참가 등록을 요청해주세요.';

export const CONTEST_NOT_REGISTERED_MESSAGE =
  '참가자 목록에 등록된 멤버만 참여할 수 있습니다. 관리자에게 참가 등록을 요청해주세요.';

export function normalizeNickname(nickname: string): string {
  return nickname.toLowerCase().trim();
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
    return (
      data.nickname &&
      normalizeNickname(data.nickname) === normalizeNickname(user.nickname!)
    );
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
