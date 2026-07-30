import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { BookOpen, ChevronLeft, Plus, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { db } from '../firebase';
import GlobalLoadingScreen from './GlobalLoadingScreen';
import NicknameSuggestInput, {
  findInvalidMemberNicknames,
  normalizeMemberNicknames,
} from './NicknameSuggestInput';
import SongWorkspacePaper from './SongWorkspacePaper';
import { getUserMentions } from '../utils/getUserMentions';
import type { UserMention } from '../utils/getUserMentions';
import type { ApprovedSong } from './ApprovedSongsUtils';
import {
  SONG_WORKSPACE_COLLECTION,
  approvedWorkspaceDocId,
  canEditSongWorkspace,
  ensureSelfInMembers,
  formatFirestoreWriteError,
  membersShareKey,
  mergeUniqueMembers,
  normalizeSongTitle,
  parseSongWorkspaceDoc,
  type LyricHighlight,
  type LyricNote,
  type LyricPartAssignments,
  type SongWorkspace,
  type SongWorkspaceCategory,
} from '../utils/songWorkspace';
import './SongWorkspaceManage.css';

type ViewMode = 'list' | 'create' | 'detail';

type LocalUser = {
  uid: string;
  nickname: string;
};

function getLocalUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem('veryus_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid?: string; nickname?: string };
    if (!parsed?.uid || !parsed?.nickname) return null;
    return { uid: parsed.uid, nickname: parsed.nickname };
  } catch {
    return null;
  }
}

function formatUpdatedAt(value: SongWorkspace['updatedAt']): string {
  if (!value || typeof (value as { toDate?: () => Date }).toDate !== 'function') {
    return '';
  }
  try {
    return (value as { toDate: () => Date }).toDate().toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function updatedStamp(value: SongWorkspace['updatedAt']): number {
  if (!value || typeof (value as { seconds?: number }).seconds !== 'number') return 0;
  return (value as { seconds: number }).seconds;
}

const SongWorkspaceManage: React.FC = () => {
  const user = useMemo(() => getLocalUser(), []);
  const [category, setCategory] = useState<SongWorkspaceCategory>('practice');
  const [view, setView] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<SongWorkspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** onSnapshot 반영 전에도 상세를 바로 열기 위한 임시 문서 */
  const [selectedSeed, setSelectedSeed] = useState<SongWorkspace | null>(null);

  const [memberCandidates, setMemberCandidates] = useState<UserMention[]>([]);
  const [myApprovedSongs, setMyApprovedSongs] = useState<ApprovedSong[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(false);

  const [createTitle, setCreateTitle] = useState('');
  const [createMembers, setCreateMembers] = useState<string[]>(['']);
  const [selectedApprovedId, setSelectedApprovedId] = useState<string | null>(null);
  const [approvedSearch, setApprovedSearch] = useState('');
  const [remoteNewer, setRemoteNewer] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const loadedStampRef = useRef(0);
  /** 본인 저장 직후 remoteNewer 오탐 방지 */
  const ignoreRemoteUntilRef = useRef(0);

  useEffect(() => {
    getUserMentions()
      .then(setMemberCandidates)
      .catch(() => setMemberCandidates([]));
  }, []);

  useEffect(() => {
    if (!user?.nickname) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, SONG_WORKSPACE_COLLECTION),
      where('members', 'array-contains', user.nickname)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) =>
          parseSongWorkspaceDoc(d.id, d.data() as Record<string, unknown>)
        );

        next.sort((a, b) => {
          const aSec = updatedStamp(a.updatedAt) || updatedStamp(a.createdAt);
          const bSec = updatedStamp(b.updatedAt) || updatedStamp(b.createdAt);
          return bSec - aSec;
        });

        setItems(next);
        setLoading(false);
      },
      (error) => {
        console.error('연습장 목록 로드 실패:', error);
        toast.error('목록을 불러오지 못했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.nickname]);

  const filteredItems = useMemo(
    () => items.filter((item) => item.category === category),
    [items, category]
  );

  const filteredApprovedSongs = useMemo(() => {
    const q = approvedSearch.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return myApprovedSongs;
    return myApprovedSongs.filter((song) => {
      const title = String(song.title ?? '')
        .toLowerCase()
        .replace(/\s+/g, '');
      const titleNoSpace = String(song.titleNoSpace ?? '').toLowerCase();
      const members = (song.members ?? []).join(' ').toLowerCase().replace(/\s+/g, '');
      return title.includes(q) || titleNoSpace.includes(q) || members.includes(q);
    });
  }, [myApprovedSongs, approvedSearch]);

  const selected = useMemo(() => {
    const fromList = items.find((item) => item.id === selectedId) ?? null;
    if (fromList) return fromList;
    if (selectedSeed && selectedSeed.id === selectedId) return selectedSeed;
    return null;
  }, [items, selectedId, selectedSeed]);

  const upsertLocalItem = (workspace: SongWorkspace) => {
    setItems((prev) => {
      const index = prev.findIndex((item) => item.id === workspace.id);
      if (index < 0) return [workspace, ...prev];
      const next = [...prev];
      next[index] = { ...next[index], ...workspace };
      return next;
    });
    setSelectedSeed(workspace);
  };

  useEffect(() => {
    if (view !== 'detail' || !selected) return;
    if (Date.now() < ignoreRemoteUntilRef.current) return;
    const remoteStamp = updatedStamp(selected.updatedAt);
    if (remoteStamp > loadedStampRef.current) {
      setRemoteNewer(true);
    }
  }, [
    view,
    selected?.id,
    selected?.updatedAt,
    selected?.lyrics,
    selected?.memo,
    selected?.members,
    selected?.highlights,
    selected?.notes,
    selected?.partAssignments,
    selected?.title,
  ]);

  const openCreate = async () => {
    if (!user) {
      toast.error('로그인이 필요합니다.');
      return;
    }
    setCreateTitle('');
    setCreateMembers(['']);
    setSelectedApprovedId(null);
    setApprovedSearch('');
    setView('create');

    if (category === 'approved') {
      setApprovedLoading(true);
      try {
        const q = query(
          collection(db, 'approvedSongs'),
          where('members', 'array-contains', user.nickname)
        );
        const snap = await getDocs(q);
        const songs = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: typeof data.title === 'string' ? data.title : '',
            titleNoSpace: typeof data.titleNoSpace === 'string' ? data.titleNoSpace : '',
            members: Array.isArray(data.members)
              ? data.members.map((m: unknown) => String(m).trim()).filter(Boolean)
              : [],
            createdAt: data.createdAt,
            createdBy: data.createdBy,
            createdByRole: data.createdByRole,
          } as ApprovedSong;
        });
        songs.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
        setMyApprovedSongs(songs);
      } catch (error) {
        console.error('내 합격곡 로드 실패:', error);
        toast.error('합격곡 목록을 불러오지 못했습니다.');
        setMyApprovedSongs([]);
      } finally {
        setApprovedLoading(false);
      }
    }
  };

  const openDetail = (id: string, seed?: SongWorkspace) => {
    setSelectedId(id);
    if (seed) {
      upsertLocalItem({ ...seed, id });
    } else {
      setSelectedSeed(null);
    }
    loadedStampRef.current = seed
      ? updatedStamp(seed.updatedAt)
      : updatedStamp(items.find((item) => item.id === id)?.updatedAt ?? null);
    setRemoteNewer(false);
    setReloadToken((n) => n + 1);
    setView('detail');
  };

  const backToList = () => {
    setView('list');
    setSelectedId(null);
    setSelectedSeed(null);
    setRemoteNewer(false);
  };

  const emptyAnnotations = (): Pick<
    SongWorkspace,
    'linePartIds' | 'highlights' | 'notes' | 'partAssignments' | 'harmonyNote' | 'memo'
  > => ({
    linePartIds: [],
    highlights: [],
    notes: [],
    partAssignments: {},
    harmonyNote: '',
    memo: '',
  });

  const findSharedPractice = (title: string, members: string[]) => {
    const titleKey = normalizeSongTitle(title);
    const shareKey = membersShareKey(members);

    return (
      items.find(
        (item) =>
          item.category === 'practice' &&
          item.titleNoSpace === titleKey &&
          membersShareKey(item.members) === shareKey
      ) ?? null
    );
  };

  const handleCreatePractice = async () => {
    if (!user) return;
    const title = createTitle.trim();
    if (!title) {
      toast.error('곡 제목을 입력해주세요.');
      return;
    }

    const members = ensureSelfInMembers(
      normalizeMemberNicknames(createMembers, memberCandidates),
      user.nickname
    );
    const invalid = findInvalidMemberNicknames(members, memberCandidates);
    if (invalid.length > 0) {
      toast.error(`존재하지 않는 닉네임: ${invalid.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      const shared = findSharedPractice(title, members);
      if (shared) {
        toast.info('같은 멤버·곡의 공유 연습장을 열었습니다.');
        openDetail(shared.id, shared);
        return;
      }

      const ref = await addDoc(collection(db, SONG_WORKSPACE_COLLECTION), {
        category: 'practice',
        title,
        titleNoSpace: normalizeSongTitle(title),
        members,
        lyrics: '',
        linePartIds: [],
        highlights: [],
        notes: [],
        partAssignments: {},
        harmonyNote: '',
        memo: '',
        createdByUid: user.uid,
        createdByNickname: user.nickname,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByNickname: user.nickname,
      });
      toast.success('연습곡을 추가했습니다. 멤버와 같은 화면을 공유합니다.');
      openDetail(ref.id, {
        id: ref.id,
        category: 'practice',
        title,
        titleNoSpace: normalizeSongTitle(title),
        members,
        approvedSongId: null,
        lyrics: '',
        ...emptyAnnotations(),
        createdByUid: user.uid,
        createdByNickname: user.nickname,
        createdAt: null,
        updatedAt: null,
        updatedByNickname: user.nickname,
      });
    } catch (error) {
      console.error('연습곡 추가 실패:', error);
      toast.error(formatFirestoreWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateApproved = async () => {
    if (!user || !selectedApprovedId) {
      toast.error('합격곡을 선택해주세요.');
      return;
    }

    const song = myApprovedSongs.find((s) => s.id === selectedApprovedId);
    if (!song) {
      toast.error('선택한 합격곡을 찾을 수 없습니다.');
      return;
    }

    const title = (song.title || '').trim();
    if (!title) {
      toast.error('제목이 없는 합격곡입니다. 합격곡조회에서 제목을 확인해 주세요.');
      return;
    }

    const songMembers = Array.isArray(song.members)
      ? song.members.map((m) => String(m).trim()).filter(Boolean)
      : [];
    const members = mergeUniqueMembers(songMembers, [user.nickname]);
    const workspaceId = approvedWorkspaceDocId(song.id);
    const workspaceRef = doc(db, SONG_WORKSPACE_COLLECTION, workspaceId);

    setSaving(true);
    try {
      // 예전(랜덤 ID)으로 만든 연습장이 있으면 그걸 우선 연결
      const legacy = items.find(
        (item) => item.category === 'approved' && item.approvedSongId === song.id
      );
      if (legacy) {
        const nextMembers = mergeUniqueMembers(legacy.members, members);
        const opened: SongWorkspace = { ...legacy, members: nextMembers };
        if (membersShareKey(nextMembers) !== membersShareKey(legacy.members)) {
          await updateDoc(doc(db, SONG_WORKSPACE_COLLECTION, legacy.id), {
            members: nextMembers,
            updatedAt: serverTimestamp(),
            updatedByNickname: user.nickname,
          });
        }
        toast.info('이미 가져온 합격곡 연습장을 열었습니다.');
        openDetail(legacy.id, opened);
        return;
      }

      const existingSnap = await getDoc(workspaceRef);
      if (existingSnap.exists()) {
        const parsed = parseSongWorkspaceDoc(
          existingSnap.id,
          existingSnap.data() as Record<string, unknown>
        );
        const nextMembers = mergeUniqueMembers(parsed.members, members);
        const opened: SongWorkspace = { ...parsed, members: nextMembers };
        if (membersShareKey(nextMembers) !== membersShareKey(parsed.members)) {
          await updateDoc(workspaceRef, {
            members: nextMembers,
            updatedAt: serverTimestamp(),
            updatedByNickname: user.nickname,
          });
        }
        toast.info('함께 합격한 멤버와 같은 연습장을 열었습니다.');
        openDetail(workspaceId, opened);
        return;
      }

      const created: SongWorkspace = {
        id: workspaceId,
        category: 'approved',
        title,
        titleNoSpace: song.titleNoSpace || normalizeSongTitle(title),
        members,
        approvedSongId: song.id,
        lyrics: '',
        ...emptyAnnotations(),
        createdByUid: user.uid,
        createdByNickname: user.nickname,
        createdAt: null,
        updatedAt: null,
        updatedByNickname: user.nickname,
      };

      await setDoc(workspaceRef, {
        category: 'approved',
        title,
        titleNoSpace: created.titleNoSpace,
        members,
        approvedSongId: song.id,
        lyrics: '',
        linePartIds: [],
        highlights: [],
        notes: [],
        partAssignments: {},
        harmonyNote: '',
        memo: '',
        createdByUid: user.uid,
        createdByNickname: user.nickname,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByNickname: user.nickname,
      });
      toast.success('합격곡 연습장을 만들었습니다. 합격 멤버와 공유됩니다.');
      openDetail(workspaceId, created);
    } catch (error) {
      console.error('합격곡 추가 실패:', error);
      toast.error(formatFirestoreWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePaper = async (
    payload: {
      title: string;
      members: string[];
      lyrics: string;
      highlights: LyricHighlight[];
      notes: LyricNote[];
      partAssignments: LyricPartAssignments;
      memo: string;
    },
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const silent = Boolean(options?.silent);
    if (!user || !selected) return false;
    if (!canEditSongWorkspace(selected, user.nickname)) {
      if (!silent) toast.error('함께하는 멤버만 수정할 수 있습니다.');
      return false;
    }

    const title = payload.title.trim();
    if (!title) {
      if (!silent) toast.error('곡 제목을 입력해주세요. (우측 상단 설정)');
      return false;
    }

    const membersNormalized = ensureSelfInMembers(
      normalizeMemberNicknames(payload.members, memberCandidates),
      user.nickname
    );
    const invalid = findInvalidMemberNicknames(membersNormalized, memberCandidates);
    let members = membersNormalized;
    if (invalid.length > 0) {
      if (silent) {
        // 자동저장은 멤버 검증 실패 시 기존 멤버 유지하고 가사만 저장
        members = selected.members.length > 0 ? selected.members : [user.nickname];
      } else {
        toast.error(`존재하지 않는 닉네임: ${invalid.join(', ')}`);
        return false;
      }
    }

    if (!silent) setSaving(true);
    try {
      await updateDoc(doc(db, SONG_WORKSPACE_COLLECTION, selected.id), {
        title,
        titleNoSpace: normalizeSongTitle(title),
        members,
        lyrics: payload.lyrics,
        highlights: payload.highlights,
        notes: payload.notes,
        partAssignments: payload.partAssignments,
        linePartIds: [],
        harmonyNote: '',
        memo: payload.memo,
        updatedAt: serverTimestamp(),
        updatedByNickname: user.nickname,
      });
      upsertLocalItem({
        ...selected,
        title,
        titleNoSpace: normalizeSongTitle(title),
        members,
        lyrics: payload.lyrics,
        highlights: payload.highlights,
        notes: payload.notes,
        partAssignments: payload.partAssignments,
        linePartIds: [],
        harmonyNote: '',
        memo: payload.memo,
        updatedByNickname: user.nickname,
      });
      loadedStampRef.current = Math.floor(Date.now() / 1000) + 30;
      ignoreRemoteUntilRef.current = Date.now() + 4000;
      setRemoteNewer(false);
      if (!silent) {
        toast.success('저장했습니다. 멤버와 같은 화면에 반영됩니다.');
      }
      return true;
    } catch (error) {
      console.error('저장 실패:', error);
      if (!silent) toast.error(formatFirestoreWriteError(error));
      return false;
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !selected) return;
    if (!canEditSongWorkspace(selected, user.nickname)) {
      toast.error('함께하는 멤버만 삭제할 수 있습니다.');
      return;
    }
    const ok = window.confirm(
      `"${selected.title}" 연습장을 삭제할까요?\n함께하는 멤버 전원에게서 사라집니다.`
    );
    if (!ok) return;

    setSaving(true);
    try {
      await deleteDoc(doc(db, SONG_WORKSPACE_COLLECTION, selected.id));
      toast.success('삭제했습니다.');
      backToList();
    } catch (error) {
      console.error('삭제 실패:', error);
      toast.error(formatFirestoreWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="song-workspace">
        <div className="song-workspace__shell">
          <div className="song-workspace__empty">로그인이 필요합니다.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <GlobalLoadingScreen message="연습장을 불러오는 중..." />;
  }

  return (
    <div className="song-workspace">
      <div className="song-workspace__shell">
        {view === 'list' && (
          <>
            <header className="song-workspace__header">
              <h1>
                <BookOpen size={22} aria-hidden />
                연습장
              </h1>
              <p>
                함께 연습·합격한 멤버와 A4 용지처럼 가사·색칠·메모를 공유합니다.
              </p>
            </header>

            <div className="song-workspace__tabs" role="tablist" aria-label="카테고리">
              <button
                type="button"
                role="tab"
                aria-selected={category === 'practice'}
                className={`song-workspace__tab${category === 'practice' ? ' is-active' : ''}`}
                onClick={() => setCategory('practice')}
              >
                연습곡
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={category === 'approved'}
                className={`song-workspace__tab${category === 'approved' ? ' is-active' : ''}`}
                onClick={() => setCategory('approved')}
              >
                합격곡
              </button>
            </div>

            <div className="song-workspace__toolbar">
              <span className="song-workspace__count">{filteredItems.length}곡</span>
              <button type="button" className="song-workspace__btn song-workspace__btn--primary" onClick={openCreate}>
                <Plus size={16} aria-hidden />
                {category === 'practice' ? '연습곡 추가' : '합격곡 가져오기'}
              </button>
            </div>

            {filteredItems.length === 0 ? (
              <div className="song-workspace__empty">
                {category === 'practice'
                  ? '연습 중인 곡이 없습니다. 멤버를 넣고 추가하면 같은 연습장을 공유합니다.'
                  : '관리 중인 합격곡이 없습니다. 가져오면 합격 멤버와 같은 화면을 공유합니다.'}
              </div>
            ) : (
              <div className="song-workspace__list">
                {filteredItems.map((item) => {
                  const updated = formatUpdatedAt(item.updatedAt);
                  const shared = item.members.length > 1;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="song-workspace__card"
                      onClick={() => openDetail(item.id)}
                    >
                      <h2 className="song-workspace__card-title">
                        {item.title}
                        {shared && <span className="song-workspace__badge">공유</span>}
                      </h2>
                      <p className="song-workspace__card-meta">
                        멤버: {item.members.join(', ') || '-'}
                        {updated ? ` · ${updated}` : ''}
                        {item.updatedByNickname ? ` · ${item.updatedByNickname}` : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === 'create' && (
          <div className="song-workspace__panel">
            <button type="button" className="song-workspace__back" onClick={backToList}>
              <ChevronLeft size={18} aria-hidden />
              목록으로
            </button>

            <header className="song-workspace__header">
              <h1>
                {category === 'practice' ? '연습곡 추가' : '합격곡 가져오기'}
                <span className="song-workspace__badge">
                  {category === 'practice' ? '연습곡' : '합격곡'}
                </span>
              </h1>
              <p>
                {category === 'practice'
                  ? '같은 곡·같은 멤버 조합이면 새 문서를 만들지 않고 공유 연습장을 엽니다.'
                  : '함께 합격한 멤버가 이미 만든 연습장이 있으면 자동으로 연결됩니다.'}
              </p>
            </header>

            {category === 'practice' ? (
              <>
                <div className="song-workspace__field">
                  <label htmlFor="sw-create-title">곡 제목</label>
                  <input
                    id="sw-create-title"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="연습할 곡 제목"
                    maxLength={120}
                  />
                </div>

                <div className="song-workspace__field">
                  <label>함께 연습할 멤버</label>
                  <p className="song-workspace__hint">본인({user.nickname})은 자동으로 포함됩니다.</p>
                  {createMembers.map((member, index) => (
                    <div key={`create-member-${index}`} className="song-workspace__member-row">
                      <NicknameSuggestInput
                        value={member}
                        onChange={(value) => {
                          setCreateMembers((prev) => {
                            const next = [...prev];
                            next[index] = value;
                            return next;
                          });
                        }}
                        candidates={memberCandidates}
                        excludeNicknames={[
                          user.nickname,
                          ...createMembers.filter((_, i) => i !== index),
                        ]}
                        placeholder="닉네임 검색"
                      />
                      <button
                        type="button"
                        className="song-workspace__member-remove"
                        aria-label="멤버 칸 삭제"
                        onClick={() =>
                          setCreateMembers((prev) =>
                            prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="song-workspace__btn"
                    onClick={() => setCreateMembers((prev) => [...prev, ''])}
                  >
                    <Plus size={14} aria-hidden />
                    멤버 추가
                  </button>
                </div>

                <div className="song-workspace__actions">
                  <button
                    type="button"
                    className="song-workspace__btn song-workspace__btn--primary"
                    disabled={saving}
                    onClick={handleCreatePractice}
                  >
                    <Plus size={16} aria-hidden />
                    {saving ? '추가 중...' : '추가하기'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {approvedLoading ? (
                  <p className="song-workspace__status">내 합격곡을 불러오는 중...</p>
                ) : myApprovedSongs.length === 0 ? (
                  <div className="song-workspace__empty">가져올 수 있는 합격곡이 없습니다.</div>
                ) : (
                  <>
                    <div className="song-workspace__field">
                      <label htmlFor="sw-approved-search">합격곡 검색</label>
                      <div className="song-workspace__search">
                        <Search size={16} aria-hidden className="song-workspace__search-icon" />
                        <input
                          id="sw-approved-search"
                          type="search"
                          value={approvedSearch}
                          onChange={(e) => {
                            setApprovedSearch(e.target.value);
                            setSelectedApprovedId(null);
                          }}
                          placeholder="곡 제목 또는 멤버 닉네임"
                          autoComplete="off"
                        />
                        {approvedSearch.trim() ? (
                          <button
                            type="button"
                            className="song-workspace__search-clear"
                            aria-label="검색어 지우기"
                            onClick={() => {
                              setApprovedSearch('');
                              setSelectedApprovedId(null);
                            }}
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                      <p className="song-workspace__hint">
                        {approvedSearch.trim()
                          ? `검색 결과 ${filteredApprovedSongs.length}곡`
                          : '곡 제목이나 멤버를 검색해 합격곡을 찾아 가져오세요.'}
                      </p>
                    </div>

                    {approvedSearch.trim() ? (
                      <div className="song-workspace__approved-pick">
                        {filteredApprovedSongs.length === 0 ? (
                          <div className="song-workspace__empty">검색 결과가 없습니다.</div>
                        ) : (
                          filteredApprovedSongs.map((song) => {
                            const already = items.some(
                              (item) =>
                                item.category === 'approved' && item.approvedSongId === song.id
                            );
                            return (
                              <button
                                key={song.id}
                                type="button"
                                className={`song-workspace__approved-option${
                                  selectedApprovedId === song.id ? ' is-selected' : ''
                                }`}
                                onClick={() => setSelectedApprovedId(song.id)}
                              >
                                <strong>
                                  {song.title}
                                  {already ? (
                                    <span className="song-workspace__badge">등록됨</span>
                                  ) : null}
                                </strong>
                                <span className="song-workspace__card-meta">
                                  {Array.isArray(song.members) ? song.members.join(', ') : ''}
                                  {already ? ' · 가져오면 기존 연습장을 엽니다' : ''}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </>
                )}

                <div className="song-workspace__actions">
                  <button
                    type="button"
                    className="song-workspace__btn song-workspace__btn--primary"
                    disabled={saving || !selectedApprovedId}
                    onClick={handleCreateApproved}
                  >
                    <Plus size={16} aria-hidden />
                    {saving
                      ? '처리 중...'
                      : items.some(
                            (item) =>
                              item.category === 'approved' &&
                              item.approvedSongId === selectedApprovedId
                          )
                        ? '연습장 열기'
                        : '가져오기'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {view === 'detail' && selected && (
          <SongWorkspacePaper
            workspace={selected}
            memberCandidates={memberCandidates}
            saving={saving}
            remoteNewer={remoteNewer}
            reloadToken={reloadToken}
            onBack={backToList}
            onReloadRemote={() => {
              loadedStampRef.current = updatedStamp(selected.updatedAt);
              setRemoteNewer(false);
              setReloadToken((n) => n + 1);
            }}
            onSave={handleSavePaper}
            onDelete={handleDelete}
          />
        )}

        {view === 'detail' && !selected && (
          <div className="song-workspace__empty">
            곡을 찾을 수 없습니다.
            <div className="song-workspace__actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="song-workspace__btn" onClick={backToList}>
                목록으로
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SongWorkspaceManage;
