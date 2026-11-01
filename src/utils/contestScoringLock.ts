import { collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function contestScoringLockCollection(contestId: string) {
  return collection(db, 'contests', contestId, 'scoringLocks');
}

export function contestScoringLockRef(contestId: string, targetId: string) {
  return doc(db, 'contests', contestId, 'scoringLocks', targetId);
}

export function isContestScoringTargetClosed(
  closedIds: ReadonlySet<string>,
  targetIds: string[]
): boolean {
  return targetIds.some((id) => closedIds.has(id));
}

export async function setContestScoringClosed(
  contestId: string,
  targetIds: string[],
  closed: boolean,
  actor: { uid?: string; nickname?: string }
): Promise<void> {
  const unique = [...new Set(targetIds.filter(Boolean))];
  if (unique.length === 0) {
    throw new Error('마감할 무대가 없습니다.');
  }
  const now = new Date();
  let saved = 0;
  const errors: unknown[] = [];

  for (const targetId of unique) {
    try {
      await setDoc(contestScoringLockRef(contestId, targetId), {
        closed,
        targetId,
        updatedAt: now,
        closedByUid: actor.uid || '',
        closedByNickname: actor.nickname || '',
      });
      saved += 1;
    } catch (error) {
      errors.push(error);
      console.error('scoringLocks 저장 실패', targetId, error);
    }

    try {
      const teamRef = doc(db, 'contests', contestId, 'teams', targetId);
      if ((await getDoc(teamRef)).exists()) {
        await updateDoc(teamRef, { scoringClosed: closed, scoringClosedAt: now });
        saved += 1;
      }
    } catch (error) {
      errors.push(error);
      console.error('team scoringClosed 저장 실패', targetId, error);
    }

    try {
      const soloRef = doc(db, 'contests', contestId, 'evaluationTargets', targetId);
      if ((await getDoc(soloRef)).exists()) {
        await updateDoc(soloRef, { scoringClosed: closed, scoringClosedAt: now });
        saved += 1;
      }
    } catch (error) {
      errors.push(error);
      console.error('evaluationTarget scoringClosed 저장 실패', targetId, error);
    }
  }

  if (saved === 0) {
    const first = errors[0];
    throw first instanceof Error ? first : new Error('채점 마감 상태를 저장하지 못했습니다.');
  }
}
