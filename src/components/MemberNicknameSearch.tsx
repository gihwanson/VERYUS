import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { Search } from 'lucide-react';
import './MemberNicknameSearch.css';
import { db } from '../firebase';
import { useUserProfile } from '../contexts/UserProfileContext';

type MemberSearchHit = { uid: string; nickname: string; profileImageUrl?: string };

async function searchMembersByNickname(raw: string): Promise<MemberSearchHit[]> {
  const q = raw.trim();
  if (!q) return [];

  const exactSnap = await getDocs(
    query(collection(db, 'users'), where('nickname', '==', q), limit(8))
  );
  if (!exactSnap.empty) {
    return exactSnap.docs.map((d) => ({
      uid: d.id,
      nickname: d.data().nickname as string,
      profileImageUrl: d.data().profileImageUrl as string | undefined
    }));
  }

  const prefixSnap = await getDocs(
    query(
      collection(db, 'users'),
      where('nickname', '>=', q),
      where('nickname', '<=', `${q}\uf8ff`),
      limit(20)
    )
  );
  return prefixSnap.docs.map((d) => ({
    uid: d.id,
    nickname: d.data().nickname as string,
    profileImageUrl: d.data().profileImageUrl as string | undefined
  }));
}

const MemberNicknameSearch: React.FC = () => {
  const { profile } = useUserProfile();
  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState('');
  const [memberHits, setMemberHits] = useState<MemberSearchHit[]>([]);
  const [memberSuggestLoading, setMemberSuggestLoading] = useState(false);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSuggestOpen, setMemberSuggestOpen] = useState(true);
  const memberSearchWrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const goToMemberMypage = useCallback(
    (hit: MemberSearchHit) => {
      setMemberSuggestOpen(false);
      setMemberHits([]);
      setMemberSearch('');
      setDebouncedMemberSearch('');
      let selfUid: string | undefined =
        profile?.uid != null ? String(profile.uid) : undefined;
      if (!selfUid) {
        try {
          const raw = localStorage.getItem('veryus_user');
          if (raw) selfUid = String(JSON.parse(raw).uid);
        } catch {
          /* ignore */
        }
      }
      if (selfUid && hit.uid === selfUid) {
        navigate('/mypage');
        return;
      }
      navigate(`/mypage/${hit.uid}`);
    },
    [navigate, profile?.uid]
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMemberSearch(memberSearch), 280);
    return () => window.clearTimeout(t);
  }, [memberSearch]);

  useEffect(() => {
    const q = debouncedMemberSearch.trim();
    if (!q) {
      setMemberHits([]);
      setMemberSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setMemberSuggestLoading(true);
    void searchMembersByNickname(q)
      .then((hits) => {
        if (cancelled) return;
        setMemberHits(hits);
      })
      .catch((err) => {
        console.error('멤버 자동완성 실패:', err);
        if (!cancelled) setMemberHits([]);
      })
      .finally(() => {
        if (!cancelled) setMemberSuggestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedMemberSearch]);

  const runMemberSearch = useCallback(async () => {
    const q = memberSearch.trim();
    if (!q) {
      toast.info('닉네임을 입력해 주세요.');
      return;
    }
    const suggestionsMatchCurrent =
      debouncedMemberSearch.trim() === q && memberHits.length >= 1;
    if (suggestionsMatchCurrent) {
      goToMemberMypage(memberHits[0]);
      return;
    }
    setMemberSearchLoading(true);
    try {
      const hits = await searchMembersByNickname(q);
      if (hits.length === 0) {
        toast.error('일치하는 멤버를 찾을 수 없습니다.');
        return;
      }
      goToMemberMypage(hits[0]);
    } catch (err) {
      console.error('멤버 검색 실패:', err);
      toast.error('검색 중 오류가 발생했습니다.');
    } finally {
      setMemberSearchLoading(false);
    }
  }, [memberSearch, debouncedMemberSearch, memberHits, goToMemberMypage]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = memberSearchWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setMemberSuggestOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const showMemberSuggestPanel =
    memberSuggestOpen && memberSearch.trim().length > 0;

  return (
    <div className="member-nick-search" ref={memberSearchWrapRef}>
      <div className="member-nick-search-inner">
        <Search className="member-nick-search-icon" size={18} aria-hidden />
        <input
          type="search"
          className="member-nick-search-input"
          value={memberSearch}
          onChange={(e) => {
            setMemberSearch(e.target.value);
            setMemberSuggestOpen(true);
          }}
          onFocus={() => setMemberSuggestOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void runMemberSearch();
            }
          }}
          placeholder="닉네임을 검색하세요"
          enterKeyHint="search"
          aria-label="멤버 닉네임 검색"
          aria-autocomplete="list"
          aria-expanded={showMemberSuggestPanel}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="member-nick-search-submit"
          onClick={() => void runMemberSearch()}
          disabled={memberSearchLoading}
          aria-label="멤버 검색 실행"
        >
          {memberSearchLoading ? '…' : '이동'}
        </button>
      </div>
      {showMemberSuggestPanel && (
        <div className="member-nick-search-dropdown" role="listbox" aria-label="검색된 멤버">
          {memberSuggestLoading ? (
            <div className="member-nick-search-suggest-status">검색 중…</div>
          ) : memberHits.length === 0 ? (
            <div className="member-nick-search-suggest-status">일치하는 멤버가 없습니다.</div>
          ) : (
            <ul className="member-nick-search-suggest-list">
              {memberHits.map((hit) => (
                <li key={hit.uid}>
                  <button
                    type="button"
                    className="member-nick-search-hit"
                    onClick={() => goToMemberMypage(hit)}
                  >
                    {hit.profileImageUrl ? (
                      <img src={hit.profileImageUrl} alt="" className="member-nick-search-avatar" />
                    ) : (
                      <span className="member-nick-search-avatar-fallback">
                        {hit.nickname?.charAt(0) || '?'}
                      </span>
                    )}
                    <span className="member-nick-search-nick">{hit.nickname}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default MemberNicknameSearch;
