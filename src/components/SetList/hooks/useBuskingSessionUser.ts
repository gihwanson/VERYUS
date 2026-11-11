import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { BuskingSessionUser } from '../buskingSessionPermissions';

function readStoredBuskingUser(): BuskingSessionUser | null {
  try {
    const raw = localStorage.getItem('veryus_user');
    if (!raw) return null;
    const user = JSON.parse(raw) as {
      uid?: string;
      nickname?: string;
      role?: string;
      grade?: string;
    };
    if (!user?.uid) return null;
    return {
      uid: user.uid,
      nickname: user.nickname || '',
      role: user.role,
      grade: user.grade,
    };
  } catch {
    return null;
  }
}

/** 로그인 사용자. 등급은 users 문서를 다시 읽어 버스킹 권한에 맞춘다. */
export function useBuskingSessionUser(): BuskingSessionUser | null {
  const [user, setUser] = useState<BuskingSessionUser | null>(readStoredBuskingUser);

  useEffect(() => {
    const stored = readStoredBuskingUser();
    if (!stored?.uid) return;
    let cancelled = false;
    getDoc(doc(db, 'users', stored.uid))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        const grade = typeof data.grade === 'string' && data.grade.trim() ? data.grade : stored.grade;
        const nickname =
          typeof data.nickname === 'string' && data.nickname.trim() ? data.nickname : stored.nickname;
        const role = typeof data.role === 'string' ? data.role : stored.role;
        setUser({
          uid: stored.uid,
          nickname: nickname || '',
          role,
          grade,
        });
      })
      .catch(() => {
        /* 저장된 등급을 그대로 사용 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
