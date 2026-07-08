import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';

export interface BuskingMemberOption {
  nickname: string;
  grade?: string;
  role?: string;
}

/** 멤버 편성 선택 목록에 노출하지 않는 역할 */
const HIDDEN_BUSKING_MEMBER_ROLES = new Set(['리더', '일반', '평가자']);

export function getBuskingMemberDisplayMeta(grade?: string, role?: string): string | null {
  const parts: string[] = [];
  const gradeTrim = grade?.trim();
  if (gradeTrim) parts.push(gradeTrim);
  const roleTrim = role?.trim();
  if (roleTrim && !HIDDEN_BUSKING_MEMBER_ROLES.has(roleTrim)) {
    parts.push(roleTrim);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function useBuskingMemberList(enabled: boolean) {
  const [members, setMembers] = useState<BuskingMemberOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: BuskingMemberOption[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const nickname = String(data.nickname ?? '').trim();
        if (!nickname) continue;
        list.push({
          nickname,
          grade: data.grade ? String(data.grade) : undefined,
          role: data.role ? String(data.role) : undefined,
        });
      }
      list.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
      setMembers(list);
    } catch (e) {
      console.error('멤버 목록 로드 실패:', e);
      setError('멤버 목록을 불러오지 못했습니다.');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);

  return { members, loading, error, reload: load };
}

export function filterBuskingMembers(
  members: BuskingMemberOption[],
  search: string
): BuskingMemberOption[] {
  const q = search.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => m.nickname.toLowerCase().includes(q));
}
