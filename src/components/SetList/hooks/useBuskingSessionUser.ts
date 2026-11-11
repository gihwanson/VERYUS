import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase';
import { approvedSongCountsByNicknameFromDocs } from '../../../utils/approvedSongMilestone';
import type { BuskingSessionUser } from '../buskingSessionPermissions';

function createdAtToMs(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'object' && value !== null) {
    const maybe = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') {
      const ms = maybe.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  }
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

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
      .then(async (snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        const grade = typeof data.grade === 'string' && data.grade.trim() ? data.grade : stored.grade;
        const nickname =
          typeof data.nickname === 'string' && data.nickname.trim() ? data.nickname : stored.nickname;
        const role = typeof data.role === 'string' ? data.role : stored.role;
        const createdAtMs = createdAtToMs(data.createdAt);
        let approvedSongCount: number | null = null;
        const nick = (nickname || '').trim();
        if (nick) {
          try {
            const songsSnap = await getDocs(
              query(collection(db, 'approvedSongs'), where('members', 'array-contains', nick))
            );
            approvedSongCount = approvedSongCountsByNicknameFromDocs(songsSnap.docs).get(nick) ?? 0;
          } catch (error) {
            console.error('버스킹 개설용 합격곡 수 확인 실패:', error);
          }
        }
        if (cancelled) return;
        setUser({
          uid: stored.uid,
          nickname: nickname || '',
          role,
          grade,
          createdAtMs,
          approvedSongCount,
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
