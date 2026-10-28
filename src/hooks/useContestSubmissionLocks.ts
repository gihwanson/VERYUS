import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/** 로그인 사용자의 콘테스트별 최종 제출(submissionLocks) 여부 */
export function useContestSubmissionLocks(
  contestIds: string[],
  uid: string | undefined
): ReadonlySet<string> {
  const [locked, setLocked] = useState<ReadonlySet<string>>(() => new Set());
  const idsKey = useMemo(() => [...contestIds].sort().join(','), [contestIds]);

  useEffect(() => {
    if (!uid || contestIds.length === 0) {
      setLocked(new Set());
      return;
    }

    const allowed = new Set(contestIds);
    setLocked((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
      }
      return next;
    });

    const unsubs = contestIds.map((contestId) =>
      onSnapshot(doc(db, 'contests', contestId, 'submissionLocks', uid), (snap) => {
        setLocked((prev) => {
          const next = new Set(prev);
          if (snap.exists()) next.add(contestId);
          else next.delete(contestId);
          return next;
        });
      })
    );

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [uid, idsKey, contestIds]);

  return locked;
}
