import React, { useState, useEffect } from 'react';
import { updateDoc, deleteDoc, doc, Timestamp, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import type { SetListData } from '../types';

/** 리더 워크스페이스 자동 준비(생성/활성화) 중복 실행 방지 — 스냅샷으로 activeSetList가 오면 해제 */
let setListLeaderWorkspaceBootstrapLock = false;

interface SetListFormProps {
  setLists: SetListData[];
  activeSetList: SetListData | null;
  isLeader: boolean;
  onSetListDeleted: () => void;
  onSetListActivated: () => void;
  /** 셋리스트를 활성화했을 때만 호출 — 진행 화면으로 안내할 때 사용 */
  onAfterSessionActivated?: () => void;
}

const SetListForm: React.FC<SetListFormProps> = ({
  setLists,
  activeSetList,
  isLeader,
  onSetListDeleted,
  onSetListActivated
}) => {
  const participantInputPhase = Boolean(
    activeSetList && activeSetList.participantRegistrationComplete !== true
  );
  const passedSongRegistrationPhase = Boolean(
    activeSetList && activeSetList.participantRegistrationComplete === true
  );

  const [participants, setParticipants] = useState<string[]>(['']);

  const [workspaceBootstrapping, setWorkspaceBootstrapping] = useState(false);
  const [workspaceBootstrapError, setWorkspaceBootstrapError] = useState<string | null>(null);

  const [showSetListModal, setShowSetListModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedSongParticipant, setSelectedSongParticipant] = useState<string>('');
  const [participantPassedSongs, setParticipantPassedSongs] = useState<any[]>([]);
  const [loadingPassedSongs, setLoadingPassedSongs] = useState(false);
  const [pendingAddedSongIds, setPendingAddedSongIds] = useState<Set<string>>(() => new Set());
  const [nicknameCardSlotCount, setNicknameCardSlotCount] = useState(3);
  const [addingNicknameCard, setAddingNicknameCard] = useState(false);
  const [reorderingSongIndex, setReorderingSongIndex] = useState<number | null>(null);

  // 활성 셋리스트가 생기면 자동 준비 락·로딩·에러 정리
  useEffect(() => {
    if (activeSetList) {
      setWorkspaceBootstrapping(false);
      setWorkspaceBootstrapError(null);
      setListLeaderWorkspaceBootstrapLock = false;
    }
  }, [activeSetList]);

  // 리더이고 활성 셋리스트가 없을 때: 미완료가 있으면 첫 항목을 조용히 활성화, 없으면 기본 셋리스트 1건 생성
  useEffect(() => {
    if (!isLeader || activeSetList) return;

    const incomplete = setLists.filter((l) => !l.isCompleted);
    const hasActiveIncomplete = incomplete.some((l) => l.isActive);
    if (hasActiveIncomplete) return;

    if (setListLeaderWorkspaceBootstrapLock) return;

    const activateSilently = async (setList: SetListData) => {
      const ops = setLists.map((list) =>
        updateDoc(doc(db, 'setlists', list.id!), {
          isActive: false,
          updatedAt: Timestamp.now()
        })
      );
      ops.push(
        updateDoc(doc(db, 'setlists', setList.id!), {
          isActive: true,
          updatedAt: Timestamp.now()
        })
      );
      await Promise.all(ops);
      onSetListActivated();
    };

    const createDefaultSetList = async () => {
      const userString = localStorage.getItem('veryus_user');
      const user = userString ? JSON.parse(userString) : null;
      const label = new Date().toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      await addDoc(collection(db, 'setlists'), {
        name: `셋리스트 ${label}`,
        participants: [''],
        songs: [],
        participantRegistrationComplete: false,
        createdBy: user?.nickname || user?.email || '리더',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isActive: true,
        isCompleted: false
      });
      onSetListActivated();
    };

    setListLeaderWorkspaceBootstrapLock = true;
    setWorkspaceBootstrapping(true);
    setWorkspaceBootstrapError(null);

    (async () => {
      try {
        if (incomplete.length >= 1) {
          await activateSilently(incomplete[0]);
        } else {
          await createDefaultSetList();
        }
      } catch (e) {
        console.error('셋리스트 자동 준비 실패:', e);
        setWorkspaceBootstrapError('셋리스트를 자동으로 준비하지 못했습니다. 네트워크를 확인하거나 잠시 후 다시 시도해 주세요.');
        setWorkspaceBootstrapping(false);
        setListLeaderWorkspaceBootstrapLock = false;
      }
    })();
  }, [isLeader, setLists, activeSetList, onSetListActivated]);

  // 기존 셋리스트가 있으면 참가자 목록 초기화
  useEffect(() => {
    if (activeSetList) {
      setParticipants(activeSetList.participants.length > 0 ? activeSetList.participants : ['']);
    } else {
      setParticipants(['']);
    }
  }, [activeSetList]);

  const confirmedParticipants = (activeSetList?.participants ?? participants)
    .map((p) => p.trim())
    .filter(Boolean);
  const participantsKey = confirmedParticipants.join('|');

  useEffect(() => {
    if (!passedSongRegistrationPhase || confirmedParticipants.length === 0) {
      setSelectedSongParticipant('');
      setParticipantPassedSongs([]);
      return;
    }
    if (!selectedSongParticipant || !confirmedParticipants.includes(selectedSongParticipant)) {
      setSelectedSongParticipant(confirmedParticipants[0]);
    }
  }, [passedSongRegistrationPhase, participantsKey]);

  useEffect(() => {
    setNicknameCardSlotCount(3);
  }, [selectedSongParticipant]);

  // Firestore 반영 후 pending 제거
  useEffect(() => {
    if (!activeSetList?.songs?.length) return;
    setPendingAddedSongIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      for (const id of prev) {
        if (activeSetList.songs.some((s) => s.songId === id)) next.delete(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [activeSetList?.songs]);

  useEffect(() => {
    if (!passedSongRegistrationPhase || !selectedSongParticipant || !activeSetList) {
      setParticipantPassedSongs([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingPassedSongs(true);
      try {
        const q = query(
          collection(db, 'approvedSongs'),
          where('members', 'array-contains', selectedSongParticipant)
        );
        const snap = await getDocs(q);
        const allSongs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const currentParticipants = activeSetList.participants.map((p) => p.trim()).filter(Boolean);
        const filtered = allSongs.filter((song: any) => {
          if (!song.members || !Array.isArray(song.members)) return false;
          return song.members.every((m: string) => currentParticipants.includes(m.trim()));
        });
        if (!cancelled) setParticipantPassedSongs(filtered);
      } catch (e) {
        console.error('합격곡 로드 실패:', e);
        if (!cancelled) setParticipantPassedSongs([]);
      } finally {
        if (!cancelled) setLoadingPassedSongs(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [passedSongRegistrationPhase, selectedSongParticipant, activeSetList?.id, participantsKey]);

  const addParticipant = () => {
    if (!participantInputPhase) return;
    setParticipants([...participants, '']);
  };

  const removeParticipant = (index: number) => {
    if (!participantInputPhase) return;
    if (participants.length > 1) {
      const updatedParticipants = participants.filter((_, i) => i !== index);
      setParticipants(updatedParticipants);
      
      // 활성 셋리스트가 있으면 참가자 업데이트
    if (activeSetList && isLeader && participantInputPhase) {
      const validParticipants = updatedParticipants.map(p => p.trim()).filter(Boolean);
      updateSetListParticipants(validParticipants);
    }
    }
  };

  const updateParticipant = (index: number, value: string) => {
    if (!participantInputPhase) return;
    const updated = [...participants];
    updated[index] = value;
    setParticipants(updated);
    
    // 활성 셋리스트가 있으면 참가자 업데이트
    if (activeSetList && isLeader && participantInputPhase) {
      const validParticipants = updated.map(p => p.trim()).filter(Boolean);
      updateSetListParticipants(validParticipants);
    }
  };

  const updateSetListParticipants = async (newParticipants: string[]) => {
    if (!activeSetList || !isLeader || !participantInputPhase) return;
    
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        participants: newParticipants,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('참가자 업데이트 실패:', error);
    }
  };

  const deleteSetList = async (setListId: string) => {
    if (!isLeader) return;
    
    if (!confirm('정말로 이 셋리스트를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'setlists', setListId));
      onSetListDeleted();
      alert('셋리스트가 삭제되었습니다.');
    } catch (error) {
      console.error('셋리스트 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const returnToParticipantPhase = async () => {
    if (!activeSetList || !isLeader || !passedSongRegistrationPhase) return;
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        participantRegistrationComplete: false,
        updatedAt: Timestamp.now()
      });
      onSetListActivated();
    } catch (error) {
      console.error('참가자 편집 복귀 실패:', error);
      alert('참가자 추가 화면으로 돌아가지 못했습니다.');
    }
  };

  const completeParticipantPhase = async () => {
    if (!activeSetList || !isLeader || !participantInputPhase) return;
    const valid = participants.map((p) => p.trim()).filter(Boolean);
    if (valid.length < 1) {
      alert('참가자를 1명 이상 입력해 주세요.');
      return;
    }
    if (!confirm('참가자를 확정하고 합격곡 등록 단계로 이동할까요?')) {
      return;
    }
    try {
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        participants: valid,
        participantRegistrationComplete: true,
        updatedAt: Timestamp.now()
      });
      onSetListActivated();
    } catch (error) {
      console.error('참가자 확정 실패:', error);
      alert('참가자 확정에 실패했습니다.');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const removeUndefinedValues = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(removeUndefinedValues).filter((item) => item !== null && item !== undefined);
    }
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) cleaned[key] = removeUndefinedValues(value);
    }
    return cleaned;
  };

  const participantHasNicknameCard = (nickname: string) => {
    if (!activeSetList || !nickname) return false;
    const inSongs = (activeSetList.songs || []).some((s: any) => s.nickname === nickname);
    const inFlexible = (activeSetList.flexibleCards || []).some(
      (c) => c.nickname === nickname && c.order >= 0
    );
    return inSongs || inFlexible;
  };

  const addNicknameCardToSetList = async () => {
    if (!activeSetList || !isLeader || !selectedSongParticipant) return;
    if (participantHasNicknameCard(selectedSongParticipant)) {
      showToast('이미 자유곡이 셋리스트에 있습니다.');
      return;
    }
    setAddingNicknameCard(true);
    try {
      const cardId = `flexible_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newCard = removeUndefinedValues({
        id: cardId,
        nickname: selectedSongParticipant,
        totalSlots: nicknameCardSlotCount,
        slots: Array.from({ length: nicknameCardSlotCount }, (_, index) => ({
          id: `slot_${Date.now()}_${index}`,
          type: 'empty',
          members: [],
          isCompleted: false
        })),
        members: [selectedSongParticipant],
        title: `${selectedSongParticipant} 자유곡`,
        order: (activeSetList.songs || []).length,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      const updatedSongs = [...(activeSetList.songs || []), newCard];
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
      showToast(`🎵 ${selectedSongParticipant} 자유곡 추가됨 (${nicknameCardSlotCount}곡)`);
    } catch (error) {
      console.error('자유곡 추가 실패:', error);
      showToast('자유곡 추가에 실패했습니다.');
    } finally {
      setAddingNicknameCard(false);
    }
  };

  const addSongToSetList = async (song: any) => {
    if (!activeSetList || !isLeader) {
      showToast('활성 셋리스트가 없거나 권한이 없습니다.');
      return;
    }
    const songId = song.id || song.songId;
    if (!songId) return;
    const alreadyInList = (activeSetList.songs || []).some((s) => s.songId === songId);
    if (alreadyInList || pendingAddedSongIds.has(songId)) return;

    setPendingAddedSongIds((prev) => new Set(prev).add(songId));
    try {
      const newSetListItem = removeUndefinedValues({
        title: song.title || '',
        artist: song.artist || '',
        members: Array.isArray(song.members) ? song.members : [],
        type: song.members && song.members.length > 1 ? 'duet' : 'solo',
        order: activeSetList.songs.length,
        songId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      const updatedSongs = [...(activeSetList.songs || []), newSetListItem];
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('곡 추가 실패:', error);
      setPendingAddedSongIds((prev) => {
        const next = new Set(prev);
        next.delete(songId);
        return next;
      });
      showToast('곡 추가에 실패했습니다.');
    }
  };

  const normalizeSongsOrder = (songs: SetListData['songs']) =>
    songs.map((song, index) => ({ ...song, order: index }));

  const moveSongInSetList = async (fromIndex: number, toIndex: number) => {
    if (!activeSetList?.id || !isLeader) {
      showToast('권한이 없습니다.');
      return;
    }
    const songs = activeSetList.songs || [];
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= songs.length) return;

    setReorderingSongIndex(fromIndex);
    try {
      const reordered = [...songs];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      const updatedSongs = normalizeSongsOrder(reordered);

      await updateDoc(doc(db, 'setlists', activeSetList.id), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('순서 변경 실패:', error);
      showToast('순서 변경에 실패했습니다.');
    } finally {
      setReorderingSongIndex(null);
    }
  };

  // 셋리스트에서 곡 제거
  const removeSongFromSetList = async (songIndex: number) => {
    if (!activeSetList || !isLeader) {
      showToast('권한이 없습니다.');
      return;
    }

    if (!confirm('이 곡을 셋리스트에서 제거하시겠습니까?')) {
      return;
    }

    try {
      const updatedSongs = activeSetList.songs.filter((_, index) => index !== songIndex);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        updatedAt: Timestamp.now()
      });

      showToast('곡이 셋리스트에서 제거되었습니다.');
    } catch (error) {
      console.error('곡 제거 실패:', error);
      showToast('곡 제거에 실패했습니다.');
    }
  };

  // 셋리스트에서 곡 완료 처리
  const completeSongFromSetList = async (songIndex: number): Promise<boolean> => {
    if (!activeSetList || !isLeader) {
      showToast('권한이 없습니다.');
      return false;
    }

    const song = activeSetList.songs[songIndex];
    if (!song) {
      showToast('곡을 찾을 수 없습니다.');
      return false;
    }

    const songTitle = (song as any).nickname ? `${(song as any).nickname}님의 자유곡` : song.title;
    
    if (!confirm(`"${songTitle}"을 완료 처리하시겠습니까?`)) {
      return false;
    }

    try {
      const completedSong = {
        ...song,
        completedAt: Timestamp.now(),
        isCompleted: true
      };

      const updatedCompletedSongs = [...(activeSetList.completedSongs || []), completedSong];
      const updatedSongs = activeSetList.songs.filter((_, index) => index !== songIndex);
      
      await updateDoc(doc(db, 'setlists', activeSetList.id!), {
        songs: updatedSongs,
        completedSongs: updatedCompletedSongs,
        updatedAt: Timestamp.now()
      });

      showToast(`"${songTitle}" 완료 🎉`);
      return true;
    } catch (error) {
      console.error('곡 완료 실패:', error);
      showToast('곡 완료에 실패했습니다.');
      return false;
    }
  };

  const completeSetList = async (setList: SetListData) => {
    if (!isLeader) return;
    
    if (!confirm(`"${setList.name}" 셋리스트를 완료(비활성화)하시겠습니까?`)) {
      return;
    }

    try {
      // 셋리스트를 완료 상태로 변경 (비활성화)
      await updateDoc(doc(db, 'setlists', setList.id!), {
        isActive: false,
        isCompleted: true,
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      
      onSetListActivated(); // 상태 업데이트
      alert(`"${setList.name}" 셋리스트가 완료 처리되었습니다! 🎉`);
    } catch (error) {
      console.error('셋리스트 완료 실패:', error);
      alert('셋리스트 완료에 실패했습니다.');
    }
  };

  return (
    <div style={{ marginBottom: '30px' }}>
      {isLeader && workspaceBootstrapping && !activeSetList && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(15px)',
            borderRadius: 20,
            padding: window.innerWidth < 768 ? '20px 16px' : '24px',
            marginBottom: 24,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'rgba(255,255,255,0.95)',
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 1.5
          }}
        >
          셋리스트를 준비하는 중입니다… 잠시만 기다려 주세요.
        </div>
      )}

      {isLeader && workspaceBootstrapError && !activeSetList && (
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(220, 38, 38, 0.15)',
            border: '1px solid rgba(252, 165, 165, 0.45)',
            color: 'rgba(255,255,255,0.95)',
            fontSize: 14,
            lineHeight: 1.5
          }}
        >
          {workspaceBootstrapError}
        </div>
      )}

      {/* 1단계: 참가자 입력 (리더) */}
      {isLeader && activeSetList && participantInputPhase && (
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(15px)',
        borderRadius: 20,
        padding: window.innerWidth < 768 ? '16px' : '24px',
        marginBottom: 24,
        border: '1px solid rgba(255, 255, 255, 0.2)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <h2 style={{ color: 'white', fontSize: 20, marginBottom: 16, fontWeight: 700 }}>
          👥 참가자 · <span style={{ fontWeight: 600, fontSize: 16, opacity: 0.95 }}>{activeSetList.name}</span>
        </h2>

        <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, margin: '0 0 16px 0', lineHeight: 1.5 }}>
          진행에 참여할 참가자 닉네임을 입력한 뒤, <strong style={{ color: 'white' }}>완료</strong>를 눌러 주세요.
        </p>

        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: 'white', fontSize: 16, marginBottom: 12, fontWeight: 600 }}>
            참가자 목록
          </h3>
          {participants.map((participant, index) => (
            <div key={index} style={{ 
              display: 'flex', 
              gap: window.innerWidth < 768 ? '4px' : '8px', 
              marginBottom: 8, 
              alignItems: 'center',
              width: '100%',
              flexWrap: window.innerWidth < 768 ? 'wrap' : 'nowrap'
            }}>
              <input
                type="text"
                placeholder={`참가자 ${index + 1}`}
                value={participant}
                onChange={(e) => updateParticipant(index, e.target.value)}
                style={{
                  flex: 1,
                  minWidth: window.innerWidth < 768 ? '120px' : '200px',
                  padding: window.innerWidth < 768 ? '6px 8px' : '8px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  fontSize: window.innerWidth < 768 ? '12px' : '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {participants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeParticipant(index)}
                  style={{
                    background: 'rgba(220, 38, 38, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: window.innerWidth < 768 ? '6px 8px' : '8px 12px',
                    cursor: 'pointer',
                    fontSize: window.innerWidth < 768 ? '10px' : '14px',
                    flexShrink: 0
                  }}
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
                  type="button"
                  onClick={addParticipant}
                  style={{
                    background: 'rgba(34, 197, 94, 0.8)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  + 참가자 추가
                </button>
                {participants.filter((p) => p.trim()).length >= 1 && (
                  <button
                    type="button"
                    onClick={completeParticipantPhase}
                    style={{
                      background: 'rgba(59, 130, 246, 0.9)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600
                    }}
                  >
                    완료
                  </button>
                )}
          </div>
        </div>
      </div>
      )}

      {/* 2단계: 합격곡 등록 (리더) */}
      {isLeader && activeSetList && passedSongRegistrationPhase && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(15px)',
            borderRadius: 20,
            padding: window.innerWidth < 768 ? '16px' : '24px',
            marginBottom: 24,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={returnToParticipantPhase}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.35)',
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              ← 이전 (참가자 추가)
            </button>
            <button
              type="button"
              onClick={() => setShowSetListModal(true)}
              style={{
                padding: '9px 18px',
                borderRadius: 10,
                border: '2px solid rgba(251,191,36,0.85)',
                background: 'linear-gradient(135deg, rgba(251,191,36,0.35) 0%, rgba(245,158,11,0.45) 100%)',
                backdropFilter: 'blur(8px)',
                color: 'white',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 0 12px rgba(251,191,36,0.3)',
                letterSpacing: '0.3px'
              }}
            >
              📋 셋리스트 보기{activeSetList.songs?.length ? ` (${activeSetList.songs.length}곡)` : ''}
            </button>
          </div>
          <h2 style={{ color: 'white', fontSize: 20, marginBottom: 8, fontWeight: 700 }}>
            🎵 합격곡 등록 · <span style={{ fontWeight: 600, fontSize: 16, opacity: 0.95 }}>{activeSetList.name}</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, margin: '0 0 20px 0', lineHeight: 1.5 }}>
            참가자를 선택한 뒤 합격곡을 셋리스트에 추가하세요. 멤버는 <strong style={{ color: 'white' }}>진행</strong> 탭에서 순서만 확인합니다.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            {confirmedParticipants.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedSongParticipant(name)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 20,
                  border: selectedSongParticipant === name ? '2px solid rgba(255,255,255,0.9)' : '1px solid rgba(255,255,255,0.35)',
                  background: selectedSongParticipant === name ? 'rgba(59, 130, 246, 0.55)' : 'rgba(255,255,255,0.12)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {name}
              </button>
            ))}
          </div>

          {selectedSongParticipant && (
            <div style={{ marginTop: 20 }}>
              <h3 style={{ color: 'white', fontSize: 16, margin: '0 0 12px 0', fontWeight: 600 }}>
                {selectedSongParticipant}님의 합격곡
              </h3>

              <div
                style={{
                  marginBottom: 16,
                  padding: 14,
                  borderRadius: 12,
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.35)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>🎵 자유곡</span>
                  {participantHasNicknameCard(selectedSongParticipant) && (
                    <span style={{
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: 12,
                      fontWeight: 600,
                      background: 'rgba(34,197,94,0.35)',
                      padding: '4px 10px',
                      borderRadius: 8
                    }}>
                      셋리스트에 추가됨
                    </span>
                  )}
                </div>
                {!participantHasNicknameCard(selectedSongParticipant) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <select
                      value={nicknameCardSlotCount}
                      onChange={(e) => setNicknameCardSlotCount(Number(e.target.value))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.3)',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n} style={{ color: '#111' }}>{n}곡</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={addingNicknameCard}
                      onClick={addNicknameCardToSetList}
                      style={{
                        background: addingNicknameCard ? 'rgba(107,114,128,0.6)' : 'rgba(168, 85, 247, 0.85)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 16px',
                        cursor: addingNicknameCard ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        fontWeight: 700
                      }}
                    >
                      {addingNicknameCard ? '추가 중…' : '🎵 자유곡 셋리스트에 추가'}
                    </button>
                  </div>
                )}
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
                  슬롯 수를 정한 뒤 추가하면 진행 탭에서 곡을 채울 수 있습니다.
                </p>
              </div>

              {loadingPassedSongs ? (
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: 0 }}>합격곡을 불러오는 중…</p>
              ) : participantPassedSongs.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                  등록 가능한 합격곡이 없습니다.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {participantPassedSongs.map((song: any, index: number) => {
                    const songId = song.id || song.songId;
                    const alreadyAdded =
                      (activeSetList.songs || []).some((s) => s.songId === songId) ||
                      pendingAddedSongIds.has(songId);
                    return (
                      <div
                        key={song.id || index}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 12,
                          padding: 14,
                          borderRadius: 12,
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.15)'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div>{song.title}</div>
                          {song.artist && (
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 4 }}>{song.artist}</div>
                          )}
                          {song.members?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                              {song.members.map((m: string, i: number) => (
                                <span
                                  key={i}
                                  style={{
                                    background: 'rgba(59, 130, 246, 0.5)',
                                    color: 'white',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 600
                                  }}
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => addSongToSetList(song)}
                          style={{
                            background: alreadyAdded ? 'rgba(107, 114, 128, 0.6)' : 'rgba(34, 197, 94, 0.85)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 14px',
                            cursor: alreadyAdded ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            flexShrink: 0,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {alreadyAdded ? '추가됨' : '셋리스트에 추가'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid rgba(255,255,255,0.2)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <button
              type="button"
              onClick={() => completeSetList(activeSetList)}
            style={{
              background: 'rgba(59, 130, 246, 0.65)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            셋리스트 세션 완료
          </button>
          <button
            type="button"
            onClick={() => activeSetList.id && deleteSetList(activeSetList.id)}
            style={{
              background: 'rgba(220, 38, 38, 0.55)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            이 셋리스트 삭제
          </button>
        </div>
      </div>
      )}

      {/* 토스트 메시지 */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            background: 'rgba(30,30,60,0.95)',
            border: '1px solid rgba(251,191,36,0.6)',
            borderRadius: 12,
            padding: '12px 22px',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* 셋리스트 보기 모달 */}
      {showSetListModal && activeSetList && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowSetListModal(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(30,30,60,0.97) 0%, rgba(20,20,50,0.97) 100%)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 20,
              padding: window.innerWidth < 768 ? '16px' : '24px',
              width: '100%',
              maxWidth: 520,
              maxHeight: '80vh',
              overflowY: 'auto',
              boxSizing: 'border-box'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>
                🎵 현재 셋리스트 ({activeSetList.songs?.length || 0}곡)
              </h2>
              <button
                type="button"
                onClick={() => setShowSetListModal(false)}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '4px 10px'
                }}
              >
                ✕
              </button>
            </div>
            {isLeader && (activeSetList.songs?.length ?? 0) > 1 && (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.45 }}>
                ↑↓ 버튼으로 순서를 바꿀 수 있어요. 변경 내용은 진행 탭에도 바로 반영됩니다.
              </p>
            )}

            {!activeSetList.songs || activeSetList.songs.length === 0 ? (
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
                아직 추가된 곡이 없습니다.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {activeSetList.songs.map((song, index) => {
                  const songKey =
                    (song as { songId?: string }).songId ||
                    (song as { id?: string }).id ||
                    (song as { nickname?: string }).nickname ||
                    `row-${index}`;
                  const isReordering = reorderingSongIndex !== null;
                  const isThisRow = reorderingSongIndex === index;

                  return (
                  <div
                    key={songKey}
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      border: '1px solid rgba(255,255,255,0.15)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      opacity: isThisRow ? 0.65 : 1
                    }}
                  >
                    {isLeader && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                        <button
                          type="button"
                          disabled={index === 0 || isReordering}
                          onClick={() => moveSongInSetList(index, index - 1)}
                          aria-label={`${index + 1}번 곡을 위로`}
                          style={{
                            background: 'rgba(255,255,255,0.14)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: 6,
                            color: 'white',
                            width: 32,
                            height: 28,
                            cursor: index === 0 || isReordering ? 'not-allowed' : 'pointer',
                            opacity: index === 0 || isReordering ? 0.35 : 1,
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index >= activeSetList.songs.length - 1 || isReordering}
                          onClick={() => moveSongInSetList(index, index + 1)}
                          aria-label={`${index + 1}번 곡을 아래로`}
                          style={{
                            background: 'rgba(255,255,255,0.14)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            borderRadius: 6,
                            color: 'white',
                            width: 32,
                            height: 28,
                            cursor:
                              index >= activeSetList.songs.length - 1 || isReordering
                                ? 'not-allowed'
                                : 'pointer',
                            opacity:
                              index >= activeSetList.songs.length - 1 || isReordering ? 0.35 : 1,
                            fontSize: 14,
                            fontWeight: 700,
                            lineHeight: 1
                          }}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                    <div style={{
                      background: 'rgba(34,197,94,0.8)',
                      color: 'white',
                      borderRadius: 8,
                      padding: '4px 8px',
                      fontSize: 13,
                      fontWeight: 700,
                      flexShrink: 0,
                      minWidth: 32,
                      textAlign: 'center'
                    }}>
                      #{index + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {!(song as any).nickname ? (
                        <>
                          <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>{song.title}</div>
                          {(song as any).artist && (
                            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{(song as any).artist}</div>
                          )}
                          {song.members?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {song.members.map((m: string, i: number) => (
                                <span key={i} style={{
                                  background: 'rgba(59,130,246,0.5)',
                                  color: 'white',
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600
                                }}>{m}</span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
                            🎵 {(song as any).nickname} 자유곡 ({(song as any).totalSlots || (song as any).slots?.length || 0}곡)
                          </div>
                        </>
                      )}
                    </div>
                    {isLeader && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          type="button"
                          disabled={isReordering}
                          onClick={async () => {
                            const ok = await completeSongFromSetList(index);
                            if (ok) setShowSetListModal(false);
                          }}
                          style={{
                            background: 'rgba(34,197,94,0.8)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 7,
                            padding: '5px 10px',
                            cursor: isReordering ? 'not-allowed' : 'pointer',
                            opacity: isReordering ? 0.45 : 1,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          완료
                        </button>
                        <button
                          type="button"
                          disabled={isReordering}
                          onClick={() => { removeSongFromSetList(index); }}
                          style={{
                            background: 'rgba(220,38,38,0.8)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 7,
                            padding: '5px 10px',
                            cursor: isReordering ? 'not-allowed' : 'pointer',
                            opacity: isReordering ? 0.45 : 1,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  );
};

export default SetListForm;
