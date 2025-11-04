import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { collection as fbCollection, getDocs as fbGetDocs } from 'firebase/firestore';
import { GRADE_ORDER, GRADE_NAMES, type AdminUser } from './AdminTypes';
import type { ApprovedSong, UserMap, SongType, TabType } from './ApprovedSongsUtils';
import { Play, Pause } from 'lucide-react';
import { 
  filterSongsByType, 
  filterSongsBySearch, 
  searchBuskingSongs, 
  getUniqueMembers, 
  validateSongForm, 
  convertFirestoreData 
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
import './ApprovedSongs.css';

const ApprovedSongs: React.FC = () => {
  const [songs, setSongs] = useState<ApprovedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'register' | 'list' | 'busking'>('list');
  const [form, setForm] = useState({ title: '', members: [''] });
  const [editId, setEditId] = useState<string | null>(null);
  const [buskingMembers, setBuskingMembers] = useState<string[]>(['']);
  const [filteredSongs, setFilteredSongs] = useState<ApprovedSong[]>([]);
  const [songType, setSongType] = useState<SongType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [userMap, setUserMap] = useState<UserMap>({});
  const [buskingTab, setBuskingTab] = useState<TabType>('all');
  const [manageTab, setManageTab] = useState<TabType>('all');
  const [audioMap, setAudioMap] = useState<Record<string, { audioUrl: string; duration?: number }>>({});

  // 사용자 정보 및 권한
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && (user.role === '리더' || user.role === '운영진');
  const isLeader = user && user.role === '리더';
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSongs = async () => {
      const q = query(collection(db, 'approvedSongs'), orderBy('title'));
      const snap = await getDocs(q);
      const fetchedSongs = snap.docs.map(convertFirestoreData);
      setSongs(fetchedSongs);
      
      // 평가게시판 게시글에서 합격된 곡들의 오디오 정보 가져오기
      const audioDataMap: Record<string, { audioUrl: string; duration?: number }> = {};
      
      try {
        // 평가게시판에서 status가 '합격'인 게시글들 가져오기
        const evaluationQuery = query(
          collection(db, 'posts'),
          where('type', '==', 'evaluation'),
          where('status', '==', '합격')
        );
        const evaluationSnap = await getDocs(evaluationQuery);
        
        // 제목별로 그룹화하고 가장 최신 것만 선택
        const titleGroups: Record<string, { audioUrl: string; duration?: number; createdAt: any }> = {};
        
        evaluationSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.title && data.audioUrl) {
            const titleKey = data.title.trim();
            const createdAt = data.createdAt;
            
            // 같은 제목이 없거나, 더 최신 것일 때 업데이트
            if (!titleGroups[titleKey] || 
                (createdAt && titleGroups[titleKey].createdAt && 
                 createdAt.toMillis && titleGroups[titleKey].createdAt.toMillis &&
                 createdAt.toMillis() > titleGroups[titleKey].createdAt.toMillis())) {
              titleGroups[titleKey] = {
                audioUrl: data.audioUrl,
                duration: data.duration,
                createdAt: createdAt
              };
            }
          }
        });
        
        // 공백 제거한 버전도 매핑
        Object.keys(titleGroups).forEach(titleKey => {
          const titleNoSpace = titleKey.replace(/\s/g, '');
          audioDataMap[titleKey] = {
            audioUrl: titleGroups[titleKey].audioUrl,
            duration: titleGroups[titleKey].duration
          };
          
          if (titleNoSpace !== titleKey) {
            audioDataMap[titleNoSpace] = {
              audioUrl: titleGroups[titleKey].audioUrl,
              duration: titleGroups[titleKey].duration
            };
          }
        });
        
        setAudioMap(audioDataMap);
      } catch (error) {
        console.error('오디오 정보 가져오기 실패:', error);
      }
      
      setLoading(false);
    };
    fetchSongs();
  }, []);

  useEffect(() => {
    // 유저 등급 정보도 fetch
    (async () => {
      const snap = await fbGetDocs(fbCollection(db, 'users'));
      const map: UserMap = {};
      snap.docs.forEach(doc => {
        const d = doc.data();
        if (d.nickname) map[d.nickname] = { grade: d.grade };
      });
      setUserMap(map);
    })();
  }, []);

  const handleSave = async () => {
    if (!validateSongForm(form)) {
      alert('곡 제목과 모든 닉네임을 입력해주세요.');
      return;
    }
    try {
      const isEdit = !!editId;
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
      setForm({ title: '', members: [''] });
      setEditId(null);
      // 목록 새로고침
      const q = query(collection(db, 'approvedSongs'), orderBy('title'));
      const snap = await getDocs(q);
      setSongs(snap.docs.map(convertFirestoreData));
      // 저장 성공 메시지
      alert(isEdit ? '수정되었습니다.' : '등록되었습니다.');
    } catch (err) {
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleBuskingSearch = () => {
    const attendees = buskingMembers.map(m => m.trim()).filter(Boolean);
    const result = searchBuskingSongs(songs, attendees);
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
    for (const song of toDelete) {
      await deleteDoc(doc(db, 'approvedSongs', song.id));
    }
    setSongs(songs => songs.filter(song => !toDelete.some(s => s.id === song.id)));
  };

  // 필터링된 곡 리스트
  const displayedSongs = filterSongsBySearch(
    filterSongsByType(songs, songType), 
    searchTerm
  );

  // 중복 없는 닉네임 추출
  const uniqueMembers = getUniqueMembers(songs);

  if (loading) {
    return <div className="approved-songs-container">로딩 중...</div>;
  }

  return (
    <div className="approved-songs-container">
      {/* 배경 패턴 */}
      <div className="approved-songs-bg-pattern" />
      
      <div className="approved-songs-content">
        <h2 className="approved-songs-title">🎵 합격곡 관리 및 조회</h2>
        
        {/* 메인 탭 네비게이션 */}
        <div className={`approved-songs-tabs ${!isAdmin ? 'two' : 'three'}`}>
          {isAdmin && (
            <TabButton
              icon="➕"
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
            icon="📋"
            label="합격리스트"
            isActive={activeTab === 'list'}
            onClick={() => { 
              setActiveTab('list');
            }}
          />
          <TabButton
            icon="🎤"
            label="버스킹용 합격곡 조회"
            isActive={activeTab === 'busking'}
            onClick={() => { 
              setActiveTab('busking');
              setBuskingMembers(['']);
              setFilteredSongs([]);
            }}
          />
        </div>

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
              placeholder="🔍 곡 제목 또는 닉네임 검색"
            />
            
            {/* 필터 탭 */}
            <div className="approved-songs-filter-tabs">
              <FilterTab
                type="all"
                label="🎵 전체"
                isActive={manageTab === 'all'}
                onClick={() => { setSongType('all'); setManageTab('all'); }}
              />
              <FilterTab
                type="solo"
                label="🎤 솔로곡"
                isActive={manageTab === 'solo'}
                onClick={() => { setSongType('solo'); setManageTab('solo'); }}
              />
              <FilterTab
                type="duet"
                label="👥 듀엣/합창곡"
                isActive={manageTab === 'duet'}
                onClick={() => { setSongType('duet'); setManageTab('duet'); }}
              />
              {isAdmin && (
                <FilterTab
                  type="manage"
                  label="⚙️ 관리"
                  isActive={manageTab === 'manage'}
                  onClick={() => setManageTab('manage')}
                />
              )}
            </div>
            
            {/* 관리 탭: 닉네임별 합격곡 관리 */}
            {manageTab === 'manage' && isAdmin && (
              <div className="approved-songs-manage-section">
                <h4 className="approved-songs-manage-title">
                  👥 합격곡에 등재된 닉네임 목록
                </h4>
                <div className="approved-songs-card">
                  <ul className="approved-songs-manage-list">
                    {uniqueMembers.map(nickname => (
                      <li key={nickname} className="approved-songs-manage-item">
                        <span className="approved-songs-manage-nickname">{nickname}</span>
                        {isLeader && (
                          <button
                            className="approved-songs-manage-delete"
                            onClick={() => handleDeleteMember(nickname)}
                          >
                            🗑️ 삭제
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
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
              />
            )}
          </>
        )}

        {/* 버스킹용 합격곡 조회 폼 */}
        {activeTab === 'busking' && (
          <div className="approved-songs-busking-card">
            <h3 className="approved-songs-busking-title">🎤 버스킹용 합격곡 조회</h3>
            
            <MemberInput
              members={buskingMembers}
              onChange={setBuskingMembers}
            />
            
            {/* 합격곡 조회 버튼 별도 배치 */}
            <div className="approved-songs-busking-search">
              <button
                className="approved-songs-btn search"
                onClick={handleBuskingSearch}
              >
                🔍 합격곡 조회
              </button>
            </div>
            
            {/* 조회 결과 리스트 */}
            {filteredSongs.length > 0 && (
              <div className="approved-songs-busking-results">
                {/* 결과 탭 */}
                <div className="approved-songs-filter-tabs">
                  <FilterTab
                    type="all"
                    label="🎵 전체"
                    isActive={buskingTab === 'all'}
                    onClick={() => setBuskingTab('all')}
                  />
                  <FilterTab
                    type="solo"
                    label="🎤 솔로곡"
                    isActive={buskingTab === 'solo'}
                    onClick={() => setBuskingTab('solo')}
                  />
                  <FilterTab
                    type="duet"
                    label="👥 듀엣/합창곡"
                    isActive={buskingTab === 'duet'}
                    onClick={() => setBuskingTab('duet')}
                  />
                  <FilterTab
                    type="grade"
                    label="🏆 등급순"
                    isActive={buskingTab === 'grade'}
                    onClick={() => setBuskingTab('grade')}
                  />
                </div>
                
                {/* 곡 리스트 */}
                <SongList
                  songs={filterSongsByType(filteredSongs, buskingTab as SongType)}
                  isAdmin={false}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  showGrade={buskingTab === 'grade'}
                  userMap={userMap}
                  audioMap={audioMap}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovedSongs; 