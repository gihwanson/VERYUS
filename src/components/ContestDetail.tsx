import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, setDoc, doc as firestoreDoc, updateDoc, onSnapshot, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { v4 as uuidv4 } from 'uuid';

const ContestDetail: React.FC = () => {
  const { id } = useParams();
  const [contest, setContest] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);
  const isLeader = user && user.role === '리더';
  const [ended, setEnded] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [selectedSolo, setSelectedSolo] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState<string>('');
  const [newParticipantNickname, setNewParticipantNickname] = useState('');
  const [addingParticipant, setAddingParticipant] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'contests', id)).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        setContest({ id: snap.id, ...data });
        setEnded(!!data.ended);
        // 마감일이 지났고 아직 종료되지 않았다면 자동 종료
        if (data.deadline && data.deadline.toDate) {
          const deadlineDate = data.deadline.toDate();
          const now = new Date();
          if (deadlineDate < now && !data.ended) {
            updateDoc(doc(db, 'contests', id), { ended: true });
            setEnded(true);
            setContest({ id: snap.id, ...data, ended: true });
          }
        }
      } else {
        setContest(null);
      }
    });
    // 참가자 목록 실시간 구독
    const unsub = onSnapshot(collection(db, 'contests', id, 'participants'), snap => {
      setParticipants(snap.docs.map(doc => doc.data()));
    });
    // 팀 목록 실시간 구독
    const unsubTeams = onSnapshot(collection(db, 'contests', id, 'teams'), snap => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsub(); unsubTeams(); };
  }, [id]);

  const handleParticipate = async () => {
    if (!user || !id) return;
    if (!window.confirm('참여하시겠습니까?')) return;
    // 닉네임 중복 체크(운영진이 미리 추가한 경우)
    const q = query(collection(db, 'contests', id, 'participants'), where('nickname', '==', user.nickname));
    const snap = await getDocs(q);
    if (!snap.empty) {
      // 기존 참가자 삭제(운영진이 추가한 custom_uid)
      for (const docSnap of snap.docs) {
        if (docSnap.id !== user.uid) {
          await deleteDoc(firestoreDoc(db, 'contests', id, 'participants', docSnap.id));
        }
      }
    }
    // 참가자 중복 방지
    await setDoc(firestoreDoc(db, 'contests', id, 'participants', user.uid), {
      nickname: user.nickname,
      uid: user.uid,
      joinedAt: new Date()
    });
    navigate(`/contests/${contest.id}/participate`);
  };

  const handleEndContest = async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 종료하시겠습니까? 종료 후에는 누구도 참여할 수 없습니다.')) {
      await updateDoc(doc(db, 'contests', id), { ended: true });
      setEnded(true);
    }
  };

  const handleDeleteContest = async () => {
    if (!id) return;
    if (window.confirm('정말로 이 콘테스트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      await deleteDoc(doc(db, 'contests', id));
      alert('콘테스트가 삭제되었습니다.');
      navigate('/contests');
    }
  };

  // 듀엣으로 묶기
  const handleMakeDuet = async () => {
    if (!id || selectedSolo.length !== 2) return;
    const teamId = uuidv4();
    const members = selectedSolo;
    const teamName = `듀엣${teams.length + 1}`;
    await setDoc(firestoreDoc(db, 'contests', id, 'teams', teamId), {
      teamName,
      members,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setSelectedSolo([]);
  };

  // 듀엣 해제(솔로로 전환)
  const handleBreakDuet = async (teamId: string) => {
    if (!id) return;
    await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', teamId));
  };

  // 팀명 수정 시작
  const handleEditTeamName = (team: any) => {
    setEditingTeamId(team.id);
    setEditingTeamName(team.teamName);
  };

  // 팀명 저장
  const handleSaveTeamName = async (team: any) => {
    if (!id || !editingTeamName.trim()) return;
    await updateDoc(firestoreDoc(db, 'contests', id, 'teams', team.id), {
      teamName: editingTeamName.trim(),
      updatedAt: new Date(),
    });
    setEditingTeamId(null);
    setEditingTeamName('');
  };

  // 참가자 추가
  const handleAddParticipant = async () => {
    if (!id || !newParticipantNickname.trim()) return;
    setAddingParticipant(true);
    // 닉네임 중복 체크
    const q = query(collection(db, 'contests', id, 'participants'), where('nickname', '==', newParticipantNickname.trim()));
    const snap = await getDocs(q);
    if (!snap.empty) {
      alert('이미 동일한 닉네임의 참가자가 있습니다.');
      setAddingParticipant(false);
      return;
    }
    // uid는 닉네임 기반으로 간단 생성(실제 서비스에서는 유저 검색/선택이 더 안전)
    const uid = 'custom_' + newParticipantNickname.trim();
    await setDoc(firestoreDoc(db, 'contests', id, 'participants', uid), {
      nickname: newParticipantNickname.trim(),
      uid,
      joinedAt: new Date(),
    });
    setNewParticipantNickname('');
    setAddingParticipant(false);
  };

  // 참가자 삭제
  const handleDeleteParticipant = async (uid: string) => {
    if (!id) return;
    if (!window.confirm('정말로 이 참가자를 삭제하시겠습니까?')) return;
    await deleteDoc(firestoreDoc(db, 'contests', id, 'participants', uid));
    // 해당 참가자가 듀엣 팀에 속해 있다면 팀도 해제
    const team = teams.find(t => Array.isArray(t.members) && t.members.includes(uid));
    if (team) await deleteDoc(firestoreDoc(db, 'contests', id, 'teams', team.id));
  };

  // 참가자 목록 중복 제거 유틸
  const uniqueParticipants = participants.filter((p, idx, arr) => arr.findIndex(pp => pp.nickname === p.nickname) === idx);

  if (!contest) return <div style={{ padding: 40, textAlign: 'center', color: '#B497D6' }}>콘테스트 정보를 불러오는 중...</div>;

  return (
    <div className="contest-card">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <button
          style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer', marginRight: 16 }}
          onClick={() => navigate('/contests')}
        >
          ← 이전
        </button>
        <h2 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 24, margin: 0 }}>{contest.title}</h2>
      </div>
      <div style={{ color: '#6B7280', fontWeight: 500, marginBottom: 12 }}>{contest.type}</div>
      <div style={{ color: '#B497D6', fontSize: 14, marginBottom: 24 }}>마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}</div>
      {/* <button style={{ background: '#E5DAF5', color: '#7C4DBC', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer', marginRight: 12 }} onClick={handleParticipate} disabled={ended}>참가/평가</button> */}
      <button style={{ background: '#fff', color: '#8A55CC', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: '1px solid #E5DAF5', cursor: 'pointer', marginRight: 12 }} onClick={() => navigate(`/contests/${contest.id}/results`)}>결과</button>
      {/* 종료/삭제 버튼 영역 */}
      {isLeader && (
        <>
          <button style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer', marginRight: 12 }} onClick={handleEndContest}>종료</button>
          <button style={{ background: '#B91C1C', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={handleDeleteContest}>삭제</button>
        </>
      )}
      {/* 경연 콘테스트일 때만 참가자/팀 관리 버튼 노출 */}
      {contest.type === '경연' && isAdmin && (
        <button
          style={{ background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, border: 'none', cursor: 'pointer', marginTop: 16, marginBottom: 8 }}
          onClick={() => setShowTeamModal(true)}
        >
          참가자/팀 관리
        </button>
      )}
      {showTeamModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowTeamModal(false)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, minWidth: 340, minHeight: 200, position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowTeamModal(false)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', fontSize: 22, color: '#8A55CC', cursor: 'pointer' }}>×</button>
            <h3 style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 16 }}>참가자/팀 관리 (경연)</h3>
            {/* 팀/참가자 목록 표시 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8 }}>듀엣 팀 목록</div>
              {teams.length === 0 && <div style={{ color: '#B497D6', marginBottom: 12 }}>아직 듀엣 팀이 없습니다.</div>}
              {teams.map(team => {
                const canEditTeamName = user && (team.members.includes(user.uid) || isAdmin);
                return (
                  <div key={team.id} style={{ background: '#F6F2FF', borderRadius: 8, padding: '8px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 600, color: '#8A55CC', minWidth: 60 }}>
                      팀명: {editingTeamId === team.id ? (
                        <>
                          <input
                            value={editingTeamName}
                            onChange={e => setEditingTeamName(e.target.value)}
                            style={{ width: 90, padding: '2px 6px', borderRadius: 6, border: '1px solid #E5DAF5', marginRight: 4 }}
                          />
                          <button style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 6, padding: '2px 8px', fontWeight: 600, marginRight: 2, cursor: 'pointer' }} onClick={() => handleSaveTeamName(team)}>저장</button>
                          <button style={{ background: '#E5E7EB', color: '#8A55CC', border: 'none', borderRadius: 6, padding: '2px 8px', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditingTeamId(null)}>취소</button>
                        </>
                      ) : (
                        <>
                          {team.teamName}
                          {canEditTeamName && (
                            <button style={{ background: 'none', color: '#8A55CC', border: 'none', marginLeft: 6, cursor: 'pointer', fontWeight: 600 }} onClick={() => handleEditTeamName(team)}>수정</button>
                          )}
                        </>
                      )}
                    </span>
                    <span style={{ color: '#6B7280' }}>팀원: {Array.isArray(team.members) ? team.members.map((uid: string) => {
                      const p = participants.find(pp => pp.uid === uid);
                      return p ? p.nickname : uid;
                    }).join(', ') : ''}</span>
                    <button style={{ marginLeft: 8, background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleBreakDuet(team.id)}>솔로로 전환</button>
                  </div>
                );
              })}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8 }}>솔로 참가자</div>
              {/* 참가자 추가 UI (운영진/리더만) */}
              {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text"
                    value={newParticipantNickname}
                    onChange={e => setNewParticipantNickname(e.target.value)}
                    placeholder="닉네임 입력"
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5DAF5', fontSize: 15 }}
                  />
                  <button
                    style={{ background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', fontWeight: 600, fontSize: 15, cursor: addingParticipant ? 'not-allowed' : 'pointer' }}
                    onClick={handleAddParticipant}
                    disabled={addingParticipant || !newParticipantNickname.trim()}
                  >
                    추가
                  </button>
                </div>
              )}
              {participants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).length === 0 && <div style={{ color: '#B497D6' }}>솔로 참가자가 없습니다.</div>}
              {participants.filter(p => !teams.some(t => Array.isArray(t.members) && t.members.includes(p.uid))).map(p => (
                <div key={p.uid} style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 16px', marginBottom: 8, color: '#8A55CC', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedSolo.includes(p.uid)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedSolo(prev => prev.length < 2 ? [...prev, p.uid] : prev);
                      } else {
                        setSelectedSolo(prev => prev.filter(uid => uid !== p.uid));
                      }
                    }}
                    disabled={selectedSolo.length === 2 && !selectedSolo.includes(p.uid)}
                    style={{ marginRight: 8 }}
                  />
                  {p.nickname}
                  {isAdmin && (
                    <button style={{ marginLeft: 8, background: '#F43F5E', color: '#fff', border: 'none', borderRadius: 8, padding: '2px 10px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }} onClick={() => handleDeleteParticipant(p.uid)}>삭제</button>
                  )}
                </div>
              ))}
              <button
                style={{ marginTop: 8, background: '#8A55CC', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 600, fontSize: 15, cursor: selectedSolo.length === 2 ? 'pointer' : 'not-allowed', width: '100%' }}
                onClick={handleMakeDuet}
                disabled={selectedSolo.length !== 2}
              >
                듀엣으로 묶기
              </button>
            </div>
          </div>
        </div>
      )}
      {isAdmin && <div style={{ marginTop: 24, color: '#8A55CC', fontWeight: 600 }}>관리자: 참가자/평가자 관리 및 전체 평가내역 확인 기능 예정</div>}
      {ended && <div style={{ color: '#F43F5E', fontWeight: 700, marginTop: 24 }}>이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>}
      {uniqueParticipants.length > 0 && (
        <div style={{ margin: '32px 0 0 0' }}>
          <h3 style={{ color: '#7C4DBC', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>참가자 목록</h3>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 16, listStyle: 'none', padding: 0 }}>
            {uniqueParticipants.map((p, i) => (
              <li key={i} style={{ background: '#F6F2FF', color: '#8A55CC', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>{p.nickname}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ContestDetail; 