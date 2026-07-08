import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { GRADE_ORDER, GRADE_NAMES, GRADE_SYSTEM, type AdminUser } from './AdminTypes';
import type { ApprovedSong, UserMap, SongType, TabType } from './ApprovedSongsUtils';
import { Play, Pause, Trophy } from 'lucide-react';
import { 
  filterSongsByType, 
  filterSongsBySearch, 
  searchBuskingSongs, 
  getBuskingMembers,
  getRegularMembers,
  getMemberFirstApprovedDates,
  formatApprovedDateKorean,
  isApprovedInCurrentMonth,
  validateSongForm, 
  convertFirestoreData,
  findDuplicateApprovedSong,
  confirmDuplicateApprovedSongRegistration,
  buildUserMapFromSnapshot,
  filterSongsWithExistingMembers,
} from './ApprovedSongsUtils';
import {
  TabButton,
  FilterTab,
  SongList,
  SearchInput,
  FormInput,
  MemberInput,
  ActionButtons
} from './ApprovedSongsComponents';
import GlobalLoadingScreen from './GlobalLoadingScreen';
import {
  approvedSongCountsByNicknameFromDocs,
  notifyStaffOnApprovedSongCountMilestones
} from '../utils/approvedSongMilestone';
import ApprovedSongDeletionHistory from './ApprovedSongDeletionHistory';

const ApprovedSongsNotebook: React.FC = () => {
  type RepairFailureItem = {
    songId: string;
    title: string;
    members: string[];
    reason: string;
  };

  const [songs, setSongs] = useState<ApprovedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'register' | 'list' | 'busking' | 'deletions'>('list');
  const [form, setForm] = useState({ title: '', members: [''] });
  const [editId, setEditId] = useState<string | null>(null);
  const [buskingMembers, setBuskingMembers] = useState<string[]>(['']);
  const [filteredSongs, setFilteredSongs] = useState<ApprovedSong[]>([]);
  const [songType, setSongType] = useState<SongType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [userMap, setUserMap] = useState<UserMap>({});
  const [allNicknames, setAllNicknames] = useState<string[]>([]);
  const [buskingTab, setBuskingTab] = useState<TabType>('all');
  const [manageTab, setManageTab] = useState<TabType>('all');
  const [audioMap, setAudioMap] = useState<Record<string, { audioUrl: string; duration?: number }>>({});
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isRepairingAudioLinks, setIsRepairingAudioLinks] = useState(false);
  const [repairFailures, setRepairFailures] = useState<RepairFailureItem[]>([]);

  // 사용자 정보 및 권한
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && (user.role === '리더' || user.role === '운영진');
  const isLeader = user && user.role === '리더';
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, 'approvedSongs'), orderBy('title'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetchedSongs = snap.docs.map(convertFirestoreData);
      setSongs(fetchedSongs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const shouldLoadUsers = true;

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const { map, nicknames } = buildUserMapFromSnapshot(snap.docs);
        setUserMap(map);
        setAllNicknames(nicknames);
      },
      (error) => {
        console.error('유저 정보 로딩 실패:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  const validSongs = useMemo(
    () => filterSongsWithExistingMembers(songs, userMap),
    [songs, userMap]
  );

  const handleSave = async () => {
    if (!validateSongForm(form)) {
      alert('곡 제목과 모든 닉네임을 입력해주세요.');
      return;
    }
    const trimmedMembers = form.members.map((m) => m.trim()).filter(Boolean);
    if (!editId) {
      const duplicate = findDuplicateApprovedSong(validSongs, form.title, trimmedMembers);
      if (duplicate && !confirmDuplicateApprovedSongRegistration(duplicate)) {
        return;
      }
    }
    try {
      const isEdit = !!editId;
      const approvedSongsBeforeSnap = await getDocs(collection(db, 'approvedSongs'));
      const countsBeforeMilestone = approvedSongCountsByNicknameFromDocs(approvedSongsBeforeSnap.docs);
      const prevMembers =
        editId != null
          ? (songs.find((s) => s.id === editId)?.members || [])
              .map((m) => String(m || '').trim())
              .filter(Boolean)
          : [];

      if (editId) {
        await updateDoc(doc(db, 'approvedSongs', editId), {
          title: form.title,
          titleNoSpace: form.title.replace(/\s/g, ''),
          members: form.members.map(m => m.trim()),
          updatedAt: Timestamp.now(),
          updatedBy: user?.nickname || user?.email || '',
        });
      } else {
        await addDoc(collection(db, 'approvedSongs'), {
          title: form.title,
          titleNoSpace: form.title.replace(/\s/g, ''),
          members: form.members.map(m => m.trim()),
          createdAt: Timestamp.now(),
          createdBy: user?.nickname || user?.email || '',
          createdByRole: user?.role || '',
        });
      }

      const approvedSongsAfterSnap = await getDocs(collection(db, 'approvedSongs'));
      const countsAfterMilestone = approvedSongCountsByNicknameFromDocs(approvedSongsAfterSnap.docs);
      const newMembers = form.members.map((m) => m.trim()).filter(Boolean);
      const affectedNicknames = [...new Set([...prevMembers, ...newMembers])];
      void notifyStaffOnApprovedSongCountMilestones({
        countsByNicknameBefore: countsBeforeMilestone,
        countsByNicknameAfter: countsAfterMilestone,
        affectedNicknames
      }).catch((err) => console.error('합격곡 마일스톤 알림 실패:', err));

      setForm({ title: '', members: [''] });
      setEditId(null);
      // 저장 성공 메시지
      alert(isEdit ? '수정되었습니다.' : '등록되었습니다.');
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleBuskingSearch = () => {
    const attendees = buskingMembers.map(m => m.trim()).filter(Boolean);
    const result = searchBuskingSongs(validSongs, attendees);
    setFilteredSongs(result);
  };

  const handleEdit = (song: ApprovedSong) => {
    setForm({ title: song.title, members: Array.isArray(song.members) ? song.members : [''] });
    setEditId(song.id);
    setActiveTab('register');
  };

  const handleDelete = async (songId: string) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      await deleteDoc(doc(db, 'approvedSongs', songId));
      setSongs(songs => songs.filter(s => s.id !== songId));
    }
  };

  const handleDeleteMember = async (nickname: string) => {
    if (!window.confirm(`${nickname}의 모든 합격곡을 삭제할까요?`)) return;
    const toDelete = songs.filter(song => (song.members || []).includes(nickname));
    await Promise.all(toDelete.map(song => deleteDoc(doc(db, 'approvedSongs', song.id))));
    setSongs(songs => songs.filter(song => !toDelete.some(s => s.id === song.id)));
  };

  const normalizeTitle = (value: string) => value.replace(/\s/g, '').toLowerCase();

  const repairMissingAudioLinks = async () => {
    if (isRepairingAudioLinks) return;
    setIsRepairingAudioLinks(true);
    setRepairFailures([]);

    try {
      const postsSnap = await getDocs(collection(db, 'posts'));
      const candidatePosts = postsSnap.docs
        .map(postDoc => {
          const data = postDoc.data() as any;
          if (!data?.audioUrl || typeof data.audioUrl !== 'string' || !data.audioUrl.trim()) return null;
          return {
            id: postDoc.id,
            title: data.title || '',
            titleNoSpace: data.titleNoSpace || '',
            writerNickname: data.writerNickname || '',
            members: Array.isArray(data.members) ? data.members : [],
            status: data.status || '',
            audioUrl: data.audioUrl,
            duration: typeof data.duration === 'number' ? data.duration : undefined,
            fileName: data.fileName || '',
            createdAtSeconds: data.createdAt?.seconds || 0
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          title: string;
          titleNoSpace: string;
          writerNickname: string;
          members: string[];
          status: string;
          audioUrl: string;
          duration?: number;
          fileName: string;
          createdAtSeconds: number;
        }>;

      const targets = songs.filter(song => {
        const audioMissing = !song.audioUrl && !audioMap[song.id]?.audioUrl;
        const postMissing = !song.approvedPostId;
        const postBroken =
          !!song.approvedPostId &&
          !candidatePosts.some(post => post.id === song.approvedPostId);
        return audioMissing || postMissing || postBroken;
      });

      if (targets.length === 0) {
        alert('점검 결과: 연결 누락 항목이 없습니다.');
        return;
      }

      let repairedCount = 0;
      let failedCount = 0;
      const failures: RepairFailureItem[] = [];

      for (const song of targets) {
        const songTitleKey = normalizeTitle(song.title || '');
        const songMembers = Array.isArray(song.members) ? song.members.filter(Boolean) : [];

        const matched = candidatePosts
          .map(post => {
            const postTitleKey = normalizeTitle(post.titleNoSpace || post.title || '');
            const postMembers = [...post.members, post.writerNickname].filter(Boolean);
            const overlap = songMembers.filter(member => postMembers.includes(member)).length;
            const allMembersMatch = songMembers.length > 0 && songMembers.every(member => postMembers.includes(member));
            const titleMatched = postTitleKey === songTitleKey;
            const statusMatched = post.status === '합격';

            let score = 0;
            if (titleMatched) score += 5;
            if (allMembersMatch) score += 4;
            score += Math.min(overlap, 3);
            if (statusMatched) score += 2;
            if (song.approvedPostId && song.approvedPostId === post.id) score += 3;
            return { post, score, titleMatched, overlap };
          })
          .filter(item => item.titleMatched && item.overlap > 0)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.post.createdAtSeconds - a.post.createdAtSeconds;
          })[0];

        if (!matched) {
          const hasSameTitle = candidatePosts.some(post => {
            const postTitleKey = normalizeTitle(post.titleNoSpace || post.title || '');
            return postTitleKey === songTitleKey;
          });
          const hasMemberOverlap = candidatePosts.some(post => {
            const postMembers = [...post.members, post.writerNickname].filter(Boolean);
            return songMembers.some(member => postMembers.includes(member));
          });
          let reason = '제목/멤버 조건에 맞는 녹음 게시글을 찾지 못함';
          if (!hasSameTitle) {
            reason = '동일 제목의 오디오 게시글 없음';
          } else if (!hasMemberOverlap) {
            reason = '동일 제목은 있으나 멤버 정보가 일치하지 않음';
          }
          failures.push({
            songId: song.id,
            title: song.title || '(제목 없음)',
            members: songMembers,
            reason
          });
          failedCount += 1;
          continue;
        }

        await updateDoc(doc(db, 'approvedSongs', song.id), {
          approvedPostId: matched.post.id,
          audioUrl: matched.post.audioUrl,
          duration: matched.post.duration,
          fileName: matched.post.fileName,
          updatedAt: Timestamp.now(),
          updatedBy: user?.nickname || user?.email || 'system-repair'
        });

        setAudioMap(prev => ({
          ...prev,
          [song.id]: {
            audioUrl: matched.post.audioUrl,
            duration: matched.post.duration
          }
        }));
        repairedCount += 1;
      }

      setRepairFailures(failures);
      alert(`점검 완료\n- 점검 대상: ${targets.length}곡\n- 연결 복구: ${repairedCount}곡\n- 미매칭: ${failedCount}곡`);
    } catch (error) {
      console.error('합격곡 녹음 연결 점검 실패:', error);
      alert('점검/복구 중 오류가 발생했습니다. 콘솔 로그를 확인해주세요.');
    } finally {
      setIsRepairingAudioLinks(false);
    }
  };

  // 특정 곡의 오디오 정보를 가져오는 함수
  const loadAudioForSong = async (song: ApprovedSong) => {
    if (audioMap[song.id] || song.audioUrl) return;

    if (!song.approvedPostId) {
      alert('이 합격곡은 아직 녹음파일이 연결되지 않았습니다.');
      return;
    }

    try {
      const postRef = doc(db, 'posts', song.approvedPostId);
      const postSnap = await getDoc(postRef);

      if (!postSnap.exists()) {
        console.error('연결된 게시글을 찾지 못했습니다.');
        return;
      }

      const postData = postSnap.data();
      if (postData?.audioUrl) {
        setAudioMap(prev => ({
          ...prev,
          [song.id]: {
            audioUrl: postData.audioUrl,
            duration: postData.duration
          }
        }));
      }
    } catch (error) {
      console.error('오디오 정보 가져오기 실패:', error);
    }
  };

  // 필터링된 곡 리스트
  const displayedSongs = useMemo(
    () => filterSongsBySearch(filterSongsByType(validSongs, songType), searchTerm),
    [validSongs, songType, searchTerm]
  );

  const buskingDisplayedSongs = useMemo(
    () => filterSongsByType(filteredSongs, buskingTab as SongType),
    [filteredSongs, buskingTab]
  );

  // 관리 탭에서만 닉네임 집계 계산
  const uniqueMembers = useMemo(() => {
    if (manageTab !== 'manage') return [];
    return getBuskingMembers(validSongs, userMap);
  }, [validSongs, userMap, manageTab]);

  const uniqueMembersText = useMemo(() => uniqueMembers.join('\n'), [uniqueMembers]);

  const memberFirstApprovedDates = useMemo(() => {
    if (manageTab !== 'manage') return {};
    return getMemberFirstApprovedDates(validSongs);
  }, [validSongs, manageTab]);

  const otherMembers = useMemo(() => {
    if (manageTab !== 'manage') return [];
    return getRegularMembers(allNicknames, uniqueMembers, userMap);
  }, [allNicknames, uniqueMembers, userMap, manageTab]);

  const otherMembersText = useMemo(() => otherMembers.join('\n'), [otherMembers]);

  const feeExemptMembers = useMemo(() => {
    if (manageTab !== 'manage') return [];
    return allNicknames
      .filter(nickname => userMap[nickname]?.grade === GRADE_SYSTEM.CRESCENT)
      .sort((a, b) => a.localeCompare(b, 'ko'));
  }, [allNicknames, userMap, manageTab]);

  const feeExemptMembersText = useMemo(() => feeExemptMembers.join('\n'), [feeExemptMembers]);

  if (loading) {
    return <GlobalLoadingScreen message="합격곡을 불러오는 중..." />;
  }

  return (
    <div className="approved-songs-container">
      <div className="approved-songs-shell">
        <header className="approved-songs-header">
          <h1>
            <Trophy size={22} className="approved-songs-header__icon" aria-hidden />
            합격곡
          </h1>
          <p className="approved-songs-header__sub">합격 기록 · 버스킹 조회</p>
        </header>

        <nav className={`approved-songs-tabs ${!isAdmin ? 'two' : 'four'}`} aria-label="합격곡 메뉴">
          {isAdmin && (
            <TabButton
              label="합격곡 등록"
              isActive={activeTab === 'register'}
              onClick={() => { 
                setActiveTab('register');
                setEditId(null); 
                setForm({ title: '', members: [''] }); 
              }}
            />
          )}
          <TabButton
            label="합격리스트"
            isActive={activeTab === 'list'}
            onClick={() => { 
              setActiveTab('list');
            }}
          />
          <TabButton
            label="버스킹용 합격곡 조회"
            isActive={activeTab === 'busking'}
            onClick={() => { 
              setActiveTab('busking');
              setBuskingMembers(['']);
              setFilteredSongs([]);
            }}
          />
          {isAdmin && (
            <TabButton
              label="삭제 내역"
              isActive={activeTab === 'deletions'}
              onClick={() => setActiveTab('deletions')}
            />
          )}
        </nav>

        <section className="approved-songs-panel" aria-live="polite">
          {activeTab === 'register' && (
            <span className="approved-songs-panel__label">등록</span>
          )}
          {activeTab === 'list' && (
            <span className="approved-songs-panel__label">목록</span>
          )}
          {activeTab === 'busking' && (
            <span className="approved-songs-panel__label">버스킹</span>
          )}
          {activeTab === 'deletions' && (
            <span className="approved-songs-panel__label">삭제 내역</span>
          )}

        {/* 합격곡 등록/수정 폼 */}
        {activeTab === 'register' && isAdmin && (
          <>
            <FormInput
              label="곡 제목"
              value={form.title}
              onChange={(value) => setForm(f => ({ ...f, title: value }))}
              placeholder="곡 제목을 입력하세요"
            />
            
            <MemberInput
              members={form.members}
              onChange={(members) => setForm(f => ({ ...f, members }))}
            />
            
            <ActionButtons
              onSave={handleSave}
              onCancel={() => setEditId(null)}
            />
          </>
        )}

        {/* 합격곡 리스트 */}
        {activeTab === 'list' && (
          <>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="곡 제목 또는 닉네임 (듀엣: 너래, 민주)"
            />
            
            {/* 필터 탭 */}
            <div className="approved-songs-filter-tabs">
              <FilterTab
                type="all"
                label="전체"
                isActive={manageTab === 'all'}
                onClick={() => { setSongType('all'); setManageTab('all'); }}
              />
              <FilterTab
                type="solo"
                label="솔로곡"
                isActive={manageTab === 'solo'}
                onClick={() => { setSongType('solo'); setManageTab('solo'); }}
              />
              <FilterTab
                type="duet"
                label="듀엣/합창"
                isActive={manageTab === 'duet'}
                onClick={() => { setSongType('duet'); setManageTab('duet'); }}
              />
              {isAdmin && (
                <FilterTab
                  type="manage"
                  label="관리"
                  isActive={manageTab === 'manage'}
                  onClick={() => setManageTab('manage')}
                />
              )}
            </div>
            
            {/* 관리 탭: 닉네임별 합격곡 관리 */}
            {manageTab === 'manage' && isAdmin && (
              <div className="approved-songs-manage-section">
                <h4 className="approved-songs-manage-title">
                  합격곡에 등재된 닉네임
                </h4>
                <div className="approved-songs-manage-toolbar">
                  <button
                    type="button"
                    className="approved-songs-btn repair"
                    onClick={repairMissingAudioLinks}
                    disabled={isRepairingAudioLinks}
                  >
                    {isRepairingAudioLinks ? '연결 점검 중…' : '녹음 연결 점검/복구'}
                  </button>
                </div>
                {repairFailures.length > 0 && (
                  <div className="approved-songs-copy-box approved-songs-repair-failures">
                    <div className="approved-songs-copy-header">
                      <span>자동 복구 실패 ({repairFailures.length}곡)</span>
                    </div>
                    <ul className="approved-songs-manage-list">
                      {repairFailures.map(item => (
                        <li key={item.songId} className="approved-songs-manage-item">
                          <span className="approved-songs-manage-nickname">{item.title}</span>
                          <span className="approved-songs-repair-members">
                            멤버: {item.members.length > 0 ? item.members.join(', ') : '-'}
                          </span>
                          <span className="approved-songs-repair-reason">
                            사유: {item.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="approved-songs-card approved-songs-card--manage-list">
                  <ul className="approved-songs-manage-list">
                    {uniqueMembers.map(nickname => (
                      <li
                        key={nickname}
                        className={`approved-songs-manage-item${
                          isApprovedInCurrentMonth(memberFirstApprovedDates[nickname])
                            ? ' approved-songs-manage-item--current-month'
                            : ''
                        }`}
                      >
                        <span className="approved-songs-manage-nickname">
                          {nickname}
                          <span className="approved-songs-manage-date">
                            {formatApprovedDateKorean(memberFirstApprovedDates[nickname])}
                          </span>
                        </span>
                        {isLeader && (
                          <button
                            className="approved-songs-manage-delete"
                            onClick={() => handleDeleteMember(nickname)}
                          >
                            삭제
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="approved-songs-copy-box">
                  <div className="approved-songs-copy-header">
                    <span>버스킹멤버 ({uniqueMembers.length}명)</span>
                    <button
                      className="approved-songs-copy-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(uniqueMembersText);
                          alert('닉네임 목록이 복사되었습니다.');
                        } catch (error) {
                          console.error('복사 실패:', error);
                          alert('복사에 실패했습니다. 직접 선택해서 복사해주세요.');
                        }
                      }}
                    >
                      복사
                    </button>
                  </div>
                  <textarea
                    className="approved-songs-copy-textarea"
                    readOnly
                    value={uniqueMembersText}
                    placeholder="합격곡에 등재된 닉네임이 없습니다."
                  />
                </div>
                <div className="approved-songs-copy-box">
                  <div className="approved-songs-copy-header">
                    <span>일반멤버 ({otherMembers.length}명)</span>
                    <button
                      className="approved-songs-copy-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(otherMembersText);
                          alert('닉네임 목록이 복사되었습니다.');
                        } catch (error) {
                          console.error('복사 실패:', error);
                          alert('복사에 실패했습니다. 직접 선택해서 복사해주세요.');
                        }
                      }}
                    >
                      복사
                    </button>
                  </div>
                  <textarea
                    className="approved-songs-copy-textarea"
                    readOnly
                    value={otherMembersText}
                    placeholder="그 외 멤버가 없습니다."
                  />
                </div>
                <div className="approved-songs-copy-box">
                  <div className="approved-songs-copy-header">
                    <span>회비 면제멤버 ({feeExemptMembers.length}명)</span>
                    <button
                      className="approved-songs-copy-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(feeExemptMembersText);
                          alert('닉네임 목록이 복사되었습니다.');
                        } catch (error) {
                          console.error('복사 실패:', error);
                          alert('복사에 실패했습니다. 직접 선택해서 복사해주세요.');
                        }
                      }}
                    >
                      복사
                    </button>
                  </div>
                  <textarea
                    className="approved-songs-copy-textarea"
                    readOnly
                    value={feeExemptMembersText}
                    placeholder="초승달 등급 멤버가 없습니다."
                  />
                </div>
              </div>
            )}
            
            {/* 기존 곡 리스트는 관리 탭이 아닐 때만 노출 */}
            {manageTab !== 'manage' && (
              <SongList
                songs={displayedSongs}
                isAdmin={isAdmin}
                onEdit={handleEdit}
                onDelete={handleDelete}
                audioMap={audioMap}
                onLoadAudio={loadAudioForSong}
                currentPlayingId={currentPlayingId}
                onPlayChange={setCurrentPlayingId}
              />
            )}
          </>
        )}

        {/* 버스킹용 합격곡 조회 폼 */}
        {activeTab === 'busking' && (
          <div className="approved-songs-busking-card">
            <h3 className="approved-songs-busking-title">버스킹용 합격곡 조회</h3>
            
            <MemberInput
              members={buskingMembers}
              onChange={setBuskingMembers}
            />
            
            {/* 합격곡 조회 버튼 별도 배치 */}
            <div className="approved-songs-busking-search">
              <button
                type="button"
                className="approved-songs-btn search"
                onClick={handleBuskingSearch}
              >
                합격곡 조회
              </button>
            </div>
            
            {/* 조회 결과 리스트 */}
            {filteredSongs.length > 0 && (
              <div className="approved-songs-busking-results">
                {/* 결과 탭 */}
                <div className="approved-songs-filter-tabs">
                  <FilterTab
                    type="all"
                    label="전체"
                    isActive={buskingTab === 'all'}
                    onClick={() => setBuskingTab('all')}
                  />
                  <FilterTab
                    type="solo"
                    label="솔로곡"
                    isActive={buskingTab === 'solo'}
                    onClick={() => setBuskingTab('solo')}
                  />
                  <FilterTab
                    type="duet"
                    label="듀엣/합창"
                    isActive={buskingTab === 'duet'}
                    onClick={() => setBuskingTab('duet')}
                  />
                  <FilterTab
                    type="grade"
                    label="등급순"
                    isActive={buskingTab === 'grade'}
                    onClick={() => setBuskingTab('grade')}
                  />
                </div>
                
                {/* 곡 리스트 */}
                <SongList
                  songs={buskingDisplayedSongs}
                  isAdmin={false}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  showGrade={buskingTab === 'grade'}
                  userMap={userMap}
                  audioMap={audioMap}
                  onLoadAudio={loadAudioForSong}
                  currentPlayingId={currentPlayingId}
                  onPlayChange={setCurrentPlayingId}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'deletions' && isAdmin && (
          <ApprovedSongDeletionHistory isLeader={isLeader} />
        )}
        </section>
      </div>
    </div>
  );
};

export default ApprovedSongsNotebook; 