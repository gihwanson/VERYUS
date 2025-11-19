import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, query, where, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const ContestParticipate: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState<any>(null);
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;
  const isAdmin = user && ['리더', '운영진', '부운영진'].includes(user.role);
  const [score, setScore] = useState<number | ''>('');
  const [suggestedGrade, setSuggestedGrade] = useState('');
  const [nickname, setNickname] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [ended, setEnded] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]); // 평가하는 인원
  const [evaluationTargets, setEvaluationTargets] = useState<any[]>([]); // 평가받는 대상
  const [gradedTargets, setGradedTargets] = useState<string[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { score: string; comment: string }>>({});
  const [grading, setGrading] = useState<Record<string, boolean>>({});
  const [successMsgMap, setSuccessMsgMap] = useState<Record<string, string>>({});
  const [allSubmitted, setAllSubmitted] = useState(false);
  const [showSubmitMsg, setShowSubmitMsg] = useState(false);
  const [entryRestricted, setEntryRestricted] = useState(false);
  const [songTitles, setSongTitles] = useState<Record<string, string>>({}); // targetId -> songTitle
  const [editingSongTitle, setEditingSongTitle] = useState<string | null>(null); // 현재 수정 중인 targetId

  useEffect(() => {
    if (!id) return;
    
    // 콘테스트 정보 실시간 구독 (개최 상태 변경 감지)
    const unsubContest = onSnapshot(doc(db, 'contests', id), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setContest({ id: snap.id, ...data });
        setEnded(!!data.ended);
        setEntryRestricted(!!data.entryRestricted);
      } else {
        setContest(null);
      }
    });
    // 참가자 목록 실시간 구독 (평가하는 인원)
    const unsub = onSnapshot(collection(db, 'contests', id, 'participants'), snap => {
      setParticipants(snap.docs.map(doc => doc.data()));
    });
    // 평가받는 대상 목록 실시간 구독
    const unsubEvaluationTargets = onSnapshot(collection(db, 'contests', id, 'evaluationTargets'), snap => {
      setEvaluationTargets(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    });
    // 팀 목록 실시간 구독
    const unsubTeams = onSnapshot(collection(db, 'contests', id, 'teams'), snap => {
      setTeams(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    // 입장 제한 상태는 위의 unsubContest에서 이미 처리됨
    return () => { 
      unsubContest();
      unsub(); 
      unsubEvaluationTargets(); 
      unsubTeams(); 
    };
  }, [id]);

  // 곡 제목 실시간 구독
  useEffect(() => {
    if (!id) return;
    
    // 평가받는 대상들의 곡 제목 구독
    const unsubSongTitles = onSnapshot(collection(db, 'contests', id, 'evaluationTargets'), snap => {
      const titles: Record<string, string> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.songTitle) {
          titles[doc.id] = data.songTitle;
        } else {
          titles[doc.id] = ''; // 빈 값도 저장하여 초기화
        }
      });
      setSongTitles(prev => ({ ...prev, ...titles }));
    });
    
    // 팀들의 곡 제목 구독
    const unsubTeamSongTitles = onSnapshot(collection(db, 'contests', id, 'teams'), snap => {
      const titles: Record<string, string> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.songTitle) {
          titles[doc.id] = data.songTitle;
        } else {
          titles[doc.id] = ''; // 빈 값도 저장하여 초기화
        }
      });
      setSongTitles(prev => ({ ...prev, ...titles }));
    });
    
    return () => { unsubSongTitles(); unsubTeamSongTitles(); };
  }, [id]);

  // 곡 제목 저장 함수
  const handleSaveSongTitle = async (targetId: string, songTitle: string, isTeam: boolean = false) => {
    if (!id) return;
    
    try {
      if (isTeam) {
        await updateDoc(doc(db, 'contests', id, 'teams', targetId), {
          songTitle: songTitle.trim() || '',
          updatedAt: new Date()
        });
      } else {
        await updateDoc(doc(db, 'contests', id, 'evaluationTargets', targetId), {
          songTitle: songTitle.trim() || '',
          updatedAt: new Date()
        });
      }
      setEditingSongTitle(null);
    } catch (error) {
      console.error('곡 제목 저장 중 오류:', error);
      alert('곡 제목 저장 중 오류가 발생했습니다.');
    }
  };

  useEffect(() => {
    if (!id || !user) return;
    // "너래"는 예외로 모두 평가 가능
    if (user.nickname === '너래') return;
    // 실시간 구독으로 변경 - 이미 제출한 평가의 점수와 코멘트도 불러오기
    const unsub = onSnapshot(
      query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname)),
      (snap) => {
        const targets: string[] = [];
        const submittedGrades: Record<string, { score: string; comment: string }> = {};
        
        snap.docs.forEach(doc => {
          const data = doc.data();
          const targetId = data.target;
          targets.push(targetId);
          // 이미 제출한 평가의 점수와 코멘트를 gradeInputs에 설정
          submittedGrades[targetId] = {
            score: String(data.score || ''),
            comment: data.comment || ''
          };
        });
        
        setGradedTargets(prev => Array.from(new Set([...prev, ...targets])));
        // 이미 제출한 평가의 점수와 코멘트를 입력 필드에 표시
        setGradeInputs(prev => {
          const updated = { ...prev };
          Object.keys(submittedGrades).forEach(targetId => {
            updated[targetId] = submittedGrades[targetId];
          });
          return updated;
        });
      }
    );
    return () => unsub();
  }, [id, user]);

  // 점수에 따른 등급 계산 함수
  const getGradeFromScore = (score: number) => {
    if (score >= 1 && score <= 30) return '🫐 블루베리';
    else if (score <= 40) return '🥝 키위';
    else if (score <= 50) return '🍎 사과';
    else if (score <= 60) return '🍈 멜론';
    else if (score <= 70) return '🍉 수박';
    else if (score <= 80) return '🌍 지구';
    else if (score <= 90) return '🪐 토성';
    else if (score <= 100) return '☀️ 태양';
    else return '';
  };

  const handleScoreChange = (val: string) => {
    const num = Number(val);
    if (val === '') {
      setScore('');
      setSuggestedGrade('');
      return;
    }
    if (num < 0 || num > 100) {
      setScore(num);
      setSuggestedGrade('');
      setError('점수는 0~100점 사이만 입력 가능합니다.');
      return;
    }
    setScore(num);
    setError('');
    // 등급표에 따라 추천등급 계산
    setSuggestedGrade(getGradeFromScore(num));
  };

  // 참가자 목록 중복 제거 유틸 (평가하는 인원)
  const uniqueParticipants = participants.filter((p, idx, arr) => arr.findIndex(pp => pp.nickname === p.nickname) === idx);
  
  // 평가받는 대상 목록 중복 제거 유틸
  const uniqueEvaluationTargets = evaluationTargets.filter((t, idx, arr) => 
    arr.findIndex(tt => tt.nickname === t.nickname) === idx
  );

  // 평가하지 않은 대상 목록 계산 (이미 평가된 참가자, 본인, 이미 평가받은 참가자 제외)
  const ungradedTargets = uniqueParticipants
    .filter((p: any) =>
      p.nickname !== user?.nickname &&
      // 닉네임 기반으로도 본인 제외
      !(p.nickname && user?.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim()) &&
      (user?.nickname === '너래' || !gradedTargets.includes(p.nickname)) &&
      // 이미 평가받은 참가자 제외 (grades에 target으로 이미 존재하는 경우)
      !uniqueParticipants.some((other: any) => other.nickname === p.nickname && gradedTargets.includes(p.nickname))
    );
  const allGraded = ungradedTargets.length === 0;
  const hasEvaluatableTargets = ungradedTargets.length > 0;
  
  // 본인이 참가자 목록에 있는지 확인
  const isParticipant = user && uniqueParticipants.some((p: any) => 
    p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim()
  );

  // 경연 유형: 입장 제한 확인 (이미 참가한 사람은 입장 가능) - hooks 규칙을 위해 early return 이전에 선언
  const isContestParticipant = useMemo(() => {
    if (!user || !contest || contest.type !== '경연') return false;
    return participants.some(p =>
      (p.uid === user.uid) ||
      (p.nickname && user.nickname && p.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim())
    );
  }, [user, participants, contest]);

  // 닉네임 추출 함수 (custom_닉네임_... 또는 target_닉네임_... 형태 지원)
  function extractNickname(uidOrNickname: string): string {
    if (uidOrNickname.startsWith('custom_')) {
      const parts = uidOrNickname.split('_');
      if (parts.length >= 2) return parts[1];
    }
    if (uidOrNickname.startsWith('target_')) {
      const parts = uidOrNickname.split('_');
      if (parts.length >= 2) return parts[1];
    }
    return uidOrNickname;
  }

  // 팀 멤버 닉네임 추출 함수
  const getMemberNicknames = (team: any) => {
    return (Array.isArray(team.members) ? team.members : []).map((uidOrNickname: string) => {
      // 평가받는 대상에서 먼저 찾기 (정확한 uid 매칭)
      const target = uniqueEvaluationTargets.find(tt => tt.uid === uidOrNickname);
      if (target && target.nickname) {
        return target.nickname;
      }
      
      // 평가받는 대상에서 닉네임으로도 찾기 (uid가 다른 경우 대비)
      const targetByNickname = uniqueEvaluationTargets.find(tt => {
        const extractedNickname = extractNickname(uidOrNickname);
        return tt.nickname && tt.nickname.toLowerCase().trim() === extractedNickname.toLowerCase().trim();
      });
      if (targetByNickname && targetByNickname.nickname) {
        return targetByNickname.nickname;
      }
      
      // 참가자에서 찾기
      const p = uniqueParticipants.find(pp => pp.uid === uidOrNickname);
      if (p && p.nickname) {
        return p.nickname;
      }
      
      // 참가자에서 닉네임으로도 찾기
      const pByNickname = uniqueParticipants.find(pp => {
        const extractedNickname = extractNickname(uidOrNickname);
        return pp.nickname && pp.nickname.toLowerCase().trim() === extractedNickname.toLowerCase().trim();
      });
      if (pByNickname && pByNickname.nickname) {
        return pByNickname.nickname;
      }
      
      // 모두 찾지 못한 경우 uid에서 닉네임 추출 시도
      return extractNickname(uidOrNickname);
    }).filter(Boolean); // 빈 값 제거
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!nickname || score === '' || score < 0 || score > 100) return setError('닉네임과 0~100점 사이의 점수를 입력하세요.');
    if (nickname === user.nickname) return setError('본인 평가는 불가합니다.');
    if (!id) return setError('잘못된 콘테스트 접근입니다.');
    // '너래'는 중복 평가 허용
    if (user.nickname !== '너래') {
      const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', nickname));
      const snap = await getDocs(q);
      if (!snap.empty) return setError('이미 이 참가자를 평가하셨습니다.');
    }
    await addDoc(collection(db, 'contests', id, 'grades'), {
      evaluator: user.nickname,
      evaluatorRole: user.role,
      target: nickname,
      score,
      comment: comment ?? '',
      createdAt: new Date()
    });
    setSuccessMsg('제출이 완료되었습니다. 계속 다른 참가자를 평가할 수 있습니다.');
    setNickname('');
    setScore('');
    setComment('');
    setSuggestedGrade('');
    // setSubmitted(true); // 정규등급전에서는 사용하지 않음
  };

  const handleComplete = () => {
    if (window.confirm('평가를 모두 완료하시겠습니까?')) {
      setSubmitted(true);
    }
  };

  // 경연 평가 제출
  const handleSubmitGrade = async (targetId: string) => {
    if (!id || !user) return;
    const { score, comment } = gradeInputs[targetId] || {};
    const numScore = Number(score);
    if (!score || isNaN(numScore) || numScore < 0 || numScore > 100) {
      alert('0~100점 사이의 점수를 입력하세요.');
      return;
    }
    setGrading(g => ({ ...g, [targetId]: true }));
    // 중복 평가 방지: 이미 평가한 경우 DB에 추가하지 않음
    const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', targetId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      setGrading(g => ({ ...g, [targetId]: false }));
      setSuccessMsgMap(msgs => ({ ...msgs, [targetId]: '이미 제출하셨습니다.' }));
      return;
    }
    await addDoc(collection(db, 'contests', id, 'grades'), {
      evaluator: user.nickname,
      evaluatorRole: user.role,
      target: targetId,
      score: numScore,
      comment: comment ?? '',
      createdAt: new Date()
    });
    setGrading(g => ({ ...g, [targetId]: false }));
    setSuccessMsgMap(msgs => ({ ...msgs, [targetId]: '✅ 제출완료' }));
    setGradedTargets(prev => Array.from(new Set([...prev, targetId])));
    
    // 성공 메시지 3초 후 자동 제거
    setTimeout(() => {
      setSuccessMsgMap(msgs => {
        const newMsgs = { ...msgs };
        delete newMsgs[targetId];
        return newMsgs;
      });
    }, 3000);
  };

  // 평가 완료(전체) 버튼 핸들러
  const handleAllSubmit = async () => {
    if (!window.confirm('정말 제출완료 하시겠습니까? 제출 후 수정할 수 없습니다.')) {
      return;
    }

    if (!id || !user) return;

    try {
      // 1. 평가해야 할 모든 대상 목록 수집 (본인 제외)
      const allTargetsToEvaluate: Array<{ targetId: string; displayName: string }> = [];
      
      // 팀 평가 대상 수집
      for (const team of teams) {
        const isMyTeam = user && (
          team.members.includes(user.uid) ||
          getMemberNicknames(team).some((nick: string) =>
            extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
          )
        );
        if (!isMyTeam) {
          const memberNames = getMemberNicknames(team).join(' & ');
          allTargetsToEvaluate.push({
            targetId: team.id,
            displayName: memberNames || `팀 (${team.members?.length || 0}명)`
          });
        }
      }

      // 솔로 평가받는 대상 수집
      const soloTargets = uniqueEvaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)));
      for (const target of soloTargets) {
        const isMe = user && target.uid === user.uid;
        const isMeByNickname = user && target.nickname && user.nickname && target.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
        
        if (!isMe && !isMeByNickname) {
          allTargetsToEvaluate.push({
            targetId: target.uid,
            displayName: target.nickname || extractNickname(target.uid)
          });
        }
      }

      // 2. DB에서 이미 제출한 평가 목록 가져오기
      const submittedGradesQuery = query(
        collection(db, 'contests', id, 'grades'),
        where('evaluator', '==', user.nickname)
      );
      const submittedGradesSnap = await getDocs(submittedGradesQuery);
      const submittedTargetIds = submittedGradesSnap.docs.map(doc => doc.data().target);

      // 3. 제출하지 않은 평가 확인
      const unsubmittedTargets = allTargetsToEvaluate.filter(
        target => !submittedTargetIds.includes(target.targetId)
      );

      // 4. 제출하지 않은 평가가 있으면 알림창 표시
      if (unsubmittedTargets.length > 0) {
        const unsubmittedNames = unsubmittedTargets.map(t => t.displayName).join(', ');
        alert(`아직 제출하지 않은 평가가 있습니다:\n${unsubmittedNames}\n\n모든 평가를 제출한 후 다시 시도해주세요.`);
        return;
      }

      // 5. 현재 입력된 평가 데이터 수집 및 제출 (혹시 모를 경우를 대비)
      const submissionsToProcess = [];
      
      // 팀 평가 데이터 수집
      for (const team of teams) {
        const input = gradeInputs[team.id];
        if (input && input.score && !submittedTargetIds.includes(team.id)) {
          const numScore = Number(input.score);
          if (!isNaN(numScore) && numScore >= 0 && numScore <= 100) {
            const isMyTeam = user && (
              team.members.includes(user.uid) ||
              getMemberNicknames(team).some((nick: string) =>
                extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
              )
            );
            if (!isMyTeam) {
              submissionsToProcess.push({
                target: team.id,
                score: numScore,
                comment: input.comment || ''
              });
            }
          }
        }
      }

      // 솔로 평가받는 대상 평가 데이터 수집
      for (const target of soloTargets) {
        const input = gradeInputs[target.uid];
        if (input && input.score && !submittedTargetIds.includes(target.uid)) {
          const numScore = Number(input.score);
          if (!isNaN(numScore) && numScore >= 0 && numScore <= 100) {
            const isMe = user && target.uid === user.uid;
            const isMeByNickname = user && target.nickname && user.nickname && target.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
            
            if (!isMe && !isMeByNickname) {
              submissionsToProcess.push({
                target: target.uid,
                score: numScore,
                comment: input.comment || ''
              });
            }
          }
        }
      }

      // 혹시 모를 제출할 평가가 있으면 제출
      if (submissionsToProcess.length > 0) {
        for (const submission of submissionsToProcess) {
          const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', submission.target));
          const snap = await getDocs(q);
          
          if (snap.empty) {
            await addDoc(collection(db, 'contests', id, 'grades'), {
              evaluator: user.nickname,
              evaluatorRole: user.role,
              target: submission.target,
              score: submission.score,
              comment: submission.comment,
              createdAt: new Date()
            });
          }
        }
      }

      // 6. 모든 평가가 완료되었으면 "제출을 완료했습니다!" 알림 후 메인보드로 이동
      alert('제출을 완료했습니다!');
      setShowSubmitMsg(true);
      setTimeout(() => {
        navigate('/');
      }, 500);
    } catch (error) {
      console.error('평가 제출 중 오류:', error);
      alert('평가 제출 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  if (ended) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.8)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 700 }}>이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 600 }}>콘테스트 정보를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  // 경연 유형이고 입장 제한 상태이며 참가자가 아닌 경우
  if (contest && contest.type === '경연' && entryRestricted && !isContestParticipant && !(user && user.role === '리더')) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          background: 'rgba(244, 63, 94, 0.8)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '40px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <div style={{ color: 'white', fontSize: '20px', fontWeight: 600, marginBottom: '12px' }}>입장이 제한되었습니다</div>
          <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '16px', marginBottom: '24px' }}>
            현재 이 경연은 입장이 제한된 상태입니다.<br />
            관리자에게 문의해주세요.
          </div>
          <button
            style={{ 
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white', 
              borderRadius: '12px', 
              padding: '12px 24px', 
              fontWeight: 600, 
              fontSize: 16, 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onClick={() => navigate(`/contests/${id}`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ← 콘테스트 상세로
          </button>
        </div>
      </div>
    );
  }

  // 콘테스트가 개최되지 않은 경우 - 준비 화면 표시 (리더는 평가지 미리보기 가능)
  if (!contest.isStarted && !(user && user.role === '리더')) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundAttachment: 'fixed',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        {/* 배경 패턴 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
          `,
          pointerEvents: 'none'
        }} />
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          padding: '60px 40px',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          textAlign: 'center',
          maxWidth: '600px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}>
          {/* 애니메이션 아이콘 */}
          <div style={{ 
            fontSize: '80px', 
            marginBottom: '24px',
            animation: 'pulse 2s ease-in-out infinite'
          }}>
            🎭
          </div>
          
          <h2 style={{ 
            color: 'white', 
            fontSize: '32px', 
            fontWeight: 700, 
            marginBottom: '16px',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)'
          }}>
            {contest.title}
          </h2>
          
          <div style={{
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '32px',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            <div style={{ 
              fontSize: '64px', 
              marginBottom: '20px',
              animation: 'bounce 2s ease-in-out infinite'
            }}>
              ⏳
            </div>
            <div style={{ 
              color: 'white', 
              fontSize: '24px', 
              fontWeight: 600, 
              marginBottom: '12px',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              콘테스트 준비 중입니다
            </div>
            <div style={{ 
              color: 'rgba(255, 255, 255, 0.9)', 
              fontSize: '16px', 
              lineHeight: '1.6',
              marginBottom: '8px'
            }}>
              관리자가 콘테스트를 개최하면<br />
              평가를 시작할 수 있습니다.
            </div>
            <div style={{
              marginTop: '20px',
              padding: '12px',
              background: 'rgba(138, 85, 204, 0.3)',
              borderRadius: '12px',
              border: '1px solid rgba(138, 85, 204, 0.5)'
            }}>
              <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                💡 곧 평가가 시작됩니다. 잠시만 기다려주세요!
              </div>
            </div>
          </div>
          
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center'
          }}>
            <button
              style={{ 
                background: 'rgba(255, 255, 255, 0.25)',
                backdropFilter: 'blur(10px)',
                color: 'white', 
                borderRadius: '12px', 
                padding: '14px 32px', 
                fontWeight: 600, 
                fontSize: 16, 
                border: '2px solid rgba(255, 255, 255, 0.4)', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                width: '100%',
                maxWidth: '300px'
              }}
              onClick={() => navigate(`/contests/${id}`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ← 콘테스트 상세로 돌아가기
            </button>
          </div>
        </div>
        
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundAttachment: 'fixed',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
        `,
        pointerEvents: 'none'
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '20px',
        maxWidth: '800px',
        margin: '0 auto'
      }}>
        {/* 뒤로가기 버튼 */}
        <div style={{ marginBottom: '20px' }}>
          <button
            style={{ 
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(10px)',
              color: 'white', 
              borderRadius: '12px', 
              padding: '12px 24px', 
              fontWeight: 600, 
              fontSize: 16, 
              border: '1px solid rgba(255, 255, 255, 0.3)', 
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
            onClick={() => navigate(`/contests/${id}`)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            ← 콘테스트 메인으로
          </button>
        </div>

        {/* 메인 콘텐츠 */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(15px)',
          borderRadius: '20px',
          padding: '30px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          <h2 style={{ 
            color: 'white', 
            fontWeight: 700, 
            fontSize: 28, 
            marginBottom: 8, 
            textAlign: 'center',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>
            {contest.title}
          </h2>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.9)', 
            fontWeight: 500, 
            marginBottom: 8, 
            textAlign: 'center',
            fontSize: '16px'
          }}>
            {contest.type}
          </div>
          <div style={{ 
            color: 'rgba(255, 255, 255, 0.8)', 
            fontSize: 15, 
            marginBottom: 24, 
            textAlign: 'center' 
          }}>
            📅 마감: {contest.deadline && (contest.deadline.seconds ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR') : '')}
          </div>
          
          {/* 리더 전용 개최 전 안내 */}
          {!contest.isStarted && user && user.role === '리더' && (
            <div style={{ 
              background: 'rgba(251, 191, 36, 0.2)',
              backdropFilter: 'blur(10px)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              textAlign: 'center'
            }}>
              <div style={{ 
                color: 'white', 
                fontWeight: 600, 
                fontSize: '16px',
                marginBottom: '4px'
              }}>
                ⚠️ 콘테스트가 아직 개최되지 않았습니다
              </div>
              <div style={{ 
                color: 'rgba(255, 255, 255, 0.8)', 
                fontSize: '14px'
              }}>
                리더님은 개최 전에도 미리보기할 수 있습니다. 다른 참가자들은 개최 후에만 입장 가능합니다.
              </div>
            </div>
          )}
          
          {submitted ? (
            <div style={{ 
              color: '#10B981', 
              fontWeight: 700, 
              fontSize: 20, 
              margin: '32px 0', 
              textAlign: 'center',
              background: 'rgba(16, 185, 129, 0.1)',
              backdropFilter: 'blur(5px)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              ✅ 제출이 완료되었습니다.
            </div>
          ) : (
            (contest.type === '정규등급전' || contest.type === '세미등급전') ? (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', width: '100%' }}>
                <div style={{ width: '100%' }}>
                  <label style={{ fontWeight: 600 }}>피평가자 닉네임{contest.type === '정규등급전' ? '' : ' (직접 입력)'}</label>
                  {contest.type === '정규등급전' ? (
                    <select
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}
                      disabled={!hasEvaluatableTargets}
                    >
                      <option value="">선택</option>
                      {ungradedTargets.map((p: any) => (
                        <option key={p.nickname} value={p.nickname}>{p.nickname}</option>
                      ))}
                      {!hasEvaluatableTargets && (
                        <option value="" disabled>평가할 대상이 없습니다</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      placeholder="피평가자 닉네임을 입력하세요"
                      style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 6 }}
                    />
                  )}
                </div>
                <div style={{ width: '100%' }}>
                  <label style={{ fontWeight: 600, marginBottom: 4, display: 'block' }}>점수 (0~100점 입력)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={score}
                    onChange={e => handleScoreChange(e.target.value)}
                    style={{ width: '100%', padding: 14, fontSize: 18, borderRadius: 8, border: '1px solid #E5DAF5', marginTop: 2, marginBottom: 2, boxSizing: 'border-box' }}
                    placeholder="0~100 사이의 점수를 입력하세요"
                    disabled={!hasEvaluatableTargets}
                  />
                  {suggestedGrade && (
                    <div style={{ marginTop: 8, color: '#8A55CC', fontWeight: 700, fontSize: 18 }}>추천등급: {suggestedGrade}</div>
                  )}
                </div>
                <div style={{ width: '100%' }}>
                  <label style={{ fontWeight: 600 }}>심사내용(선택)</label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="심사 코멘트를 입력하세요 (선택, Shift+Enter로 줄바꿈)"
                    style={{ 
                      width: '100%', 
                      padding: 14, 
                      fontSize: 18, 
                      borderRadius: 8, 
                      border: '1px solid #E5DAF5', 
                      marginTop: 6, 
                      minHeight: 120,
                      maxHeight: 300,
                      resize: 'none',
                      overflow: 'hidden',
                      lineHeight: '1.4',
                      fontFamily: 'inherit'
                    }}
                    disabled={!hasEvaluatableTargets}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = Math.min(Math.max(target.scrollHeight, 120), 300) + 'px';
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', width: '100%', flexDirection: 'row' }}>
                  <button type="submit" style={{ background: '#8A55CC', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} disabled={!hasEvaluatableTargets}>제출</button>
                  <button type="button" style={{ background: '#F43F5E', color: '#fff', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, border: 'none', cursor: 'pointer' }} onClick={handleComplete}>완료</button>
                </div>
                <div style={{ color: '#F43F5E', fontWeight: 600, marginTop: 8, textAlign: 'center' }}>본인 평가 불가, 제출 후 수정 불가</div>
                {isParticipant && (
                  <div style={{ marginTop: 16, padding: 16, background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>
                    <div style={{ color: '#DC2626', fontWeight: 600, marginBottom: 4, textAlign: 'center' }}>📢 참가자 안내</div>
                    <div style={{ color: '#7F1D1D', fontSize: 14, textAlign: 'center' }}>
                      본인({user?.nickname})은 이 콘테스트의 참가자로 등록되어 있어 자기 평가는 불가능합니다.
                    </div>
                  </div>
                )}
                {gradedTargets.length > 0 && (
                  <div style={{ marginTop: 16, padding: 16, background: '#F0F9FF', borderRadius: 8, border: '1px solid #BAE6FD' }}>
                    <div style={{ color: '#0369A1', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>이미 평가를 완료한 대상</div>
                    <div style={{ color: '#0F172A', fontSize: 14, textAlign: 'center' }}>
                      {gradedTargets.join(', ')}
                    </div>
                  </div>
                )}
                <div style={{ color: '#B497D6', fontSize: 13, marginTop: 8, textAlign: 'center' }}>* 실제 평가/참가/제출 로직은 추후 구현</div>
              </form>
            ) : contest.type === '경연' ? (
              <>
                <div style={{ color: '#8A55CC', fontWeight: 700, fontSize: 20, marginBottom: 24, textAlign: 'center' }}>경연 참가자/팀 평가</div>
                {/* 평가받는 대상이 없을 때 안내 */}
                {teams.length === 0 && uniqueEvaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid))).length === 0 && (
                  <div style={{
                    background: 'rgba(251, 191, 36, 0.15)',
                    border: '1px solid #FBBF24',
                    borderRadius: 12,
                    padding: '24px',
                    marginBottom: 24,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                    <div style={{ color: '#92400E', fontWeight: 600, fontSize: '18px', marginBottom: '8px' }}>
                      아직 참가자가 없습니다
                    </div>
                    <div style={{ color: '#78350F', fontSize: '14px' }}>
                      관리자가 평가받는 대상을 추가하면 평가를 시작할 수 있습니다.
                    </div>
                  </div>
                )}
                {/* 듀엣 팀 */}
                {teams.length > 0 && (
                  <div style={{ marginBottom: 32, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8, textAlign: 'center' }}>듀엣 팀</div>
                    {teams
                      .sort((a, b) => {
                        // createdAt 기준으로 정렬 (오래된 순)
                        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                        return aTime - bTime;
                      })
                      .map(team => {
                        const isMyTeam = user && (
                          team.members.includes(user.uid) ||
                          getMemberNicknames(team).some((nick: string) =>
                            extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
                          )
                        );
                        const alreadyGraded = gradedTargets.includes(team.id);
                        return (
                          <div key={team.id} style={{ 
                            background: alreadyGraded 
                              ? 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)' 
                              : 'linear-gradient(135deg, #F6F2FF 0%, #F0F4FF 100%)', 
                            borderRadius: 16, 
                            padding: '20px', 
                            marginBottom: 16, 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 12, 
                            width: '100%',
                            boxShadow: alreadyGraded 
                              ? '0 2px 8px rgba(0, 0, 0, 0.1)' 
                              : '0 4px 16px rgba(138, 85, 204, 0.1)',
                            border: alreadyGraded 
                              ? '1px solid #9CA3AF' 
                              : '1px solid rgba(138, 85, 204, 0.1)',
                            opacity: alreadyGraded ? 0.7 : 1
                          }}>
                            <div style={{ 
                              fontWeight: 700, 
                              color: alreadyGraded ? '#6B7280' : '#8A55CC', 
                              textAlign: 'center', 
                              fontSize: 18,
                              textDecoration: alreadyGraded ? 'line-through' : 'none'
                            }}>
                              {getMemberNicknames(team).join(' & ')}
                              {alreadyGraded && <span style={{ marginLeft: 8, fontSize: 14, color: '#10B981' }}>✅ 제출완료</span>}
                            </div>
                            {/* 곡 제목 입력 필드 */}
                            <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                              {isAdmin && editingSongTitle === team.id ? (
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    placeholder="곡 제목을 입력하세요"
                                    value={songTitles[team.id] || ''}
                                    onChange={(e) => setSongTitles(prev => ({ ...prev, [team.id]: e.target.value }))}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSaveSongTitle(team.id, songTitles[team.id] || '', true);
                                      }
                                    }}
                                    onBlur={() => handleSaveSongTitle(team.id, songTitles[team.id] || '', true)}
                                    autoFocus
                                    style={{
                                      flex: 1,
                                      padding: '8px 12px',
                                      borderRadius: '6px',
                                      border: '1px solid #E5DAF5',
                                      fontSize: '14px',
                                      background: '#fff'
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      handleSaveSongTitle(team.id, songTitles[team.id] || '', true);
                                    }}
                                    style={{
                                      padding: '8px 16px',
                                      background: '#8A55CC',
                                      color: '#fff',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '13px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    저장
                                  </button>
                                </div>
                              ) : (
                                <div 
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    background: songTitles[team.id] ? '#F6F2FF' : '#F9FAFB',
                                    border: '1px solid #E5DAF5',
                                    fontSize: '14px',
                                    color: songTitles[team.id] ? '#6B21A8' : '#9CA3AF',
                                    fontStyle: songTitles[team.id] ? 'normal' : 'italic',
                                    textAlign: 'center',
                                    cursor: isAdmin ? 'pointer' : 'default',
                                    minHeight: '36px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                  onClick={() => {
                                    if (isAdmin) {
                                      setEditingSongTitle(team.id);
                                      setSongTitles(prev => ({ ...prev, [team.id]: prev[team.id] || '' }));
                                    }
                                  }}
                                >
                                  {songTitles[team.id] || (isAdmin ? '곡 제목을 입력하세요 (클릭)' : '곡 제목')}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                              {isMyTeam ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                  <span style={{ color: '#F43F5E', fontWeight: 600, fontSize: 16 }}>본인이 속한 팀은 평가할 수 없습니다.</span>
                                  <span style={{ color: '#9CA3AF', fontSize: 14 }}>자기 평가는 금지되어 있습니다.</span>
                                </div>
                              ) : alreadyGraded ? (
                                <div style={{ 
                                  display: 'flex', 
                                  flexDirection: 'column', 
                                  alignItems: 'center', 
                                  gap: 8,
                                  padding: '16px',
                                  background: 'rgba(255, 255, 255, 0.5)',
                                  borderRadius: 8
                                }}>
                                  <div style={{ color: '#6B7280', fontWeight: 600, fontSize: 16, textAlign: 'center' }}>
                                    평가 제출 완료
                                  </div>
                                  {gradeInputs[team.id]?.score && (
                                    <div style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center' }}>
                                      점수: {gradeInputs[team.id].score}점
                                      {!isNaN(Number(gradeInputs[team.id]?.score)) && Number(gradeInputs[team.id]?.score) >= 1 && Number(gradeInputs[team.id]?.score) <= 100 && (
                                        <span style={{ marginLeft: 8, color: '#8A55CC' }}>
                                          ({getGradeFromScore(Number(gradeInputs[team.id]?.score))})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {gradeInputs[team.id]?.comment && (
                                    <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', fontStyle: 'italic' }}>
                                      "{gradeInputs[team.id].comment}"
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                                  <div>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      placeholder="0~100 사이의 점수 입력"
                                      value={gradeInputs[team.id]?.score || ''}
                                      onChange={e => setGradeInputs(inputs => ({ ...inputs, [team.id]: { ...inputs[team.id], score: e.target.value } }))}
                                      disabled={grading[team.id]}
                                      style={{ 
                                        width: '100%', 
                                        padding: '12px 16px', 
                                        borderRadius: 8, 
                                        border: '1px solid #E5DAF5', 
                                        fontSize: 16,
                                        boxSizing: 'border-box',
                                        background: '#FAFAFA'
                                      }}
                                    />
                                    {gradeInputs[team.id]?.score && !isNaN(Number(gradeInputs[team.id]?.score)) && Number(gradeInputs[team.id]?.score) >= 1 && Number(gradeInputs[team.id]?.score) <= 100 && (
                                      <div style={{ marginTop: 6, color: '#8A55CC', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>
                                        추천등급: {getGradeFromScore(Number(gradeInputs[team.id]?.score))}
                                      </div>
                                    )}
                                  </div>
                                  <input
                                    type="text"
                                    placeholder="코멘트(선택)"
                                    value={gradeInputs[team.id]?.comment || ''}
                                    onChange={e => setGradeInputs(inputs => ({ ...inputs, [team.id]: { ...inputs[team.id], comment: e.target.value } }))}
                                    disabled={grading[team.id]}
                                    style={{ 
                                      width: '100%', 
                                      padding: '12px 16px', 
                                      borderRadius: 8, 
                                      border: '1px solid #E5DAF5',
                                      fontSize: 16,
                                      boxSizing: 'border-box',
                                      background: '#FAFAFA'
                                    }}
                                  />
                                  <button
                                    style={{
                                      background: '#8A55CC',
                                      color: '#fff',
                                      borderRadius: 12,
                                      padding: '14px 24px',
                                      fontWeight: 600,
                                      fontSize: 16,
                                      border: 'none',
                                      cursor: grading[team.id] ? 'not-allowed' : 'pointer',
                                      transition: 'all 0.2s',
                                      boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                                      width: '100%'
                                    }}
                                    onClick={() => handleSubmitGrade(team.id)}
                                    disabled={grading[team.id]}
                                  >
                                    제출
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
                {/* 솔로 참가자 (평가받는 대상) */}
                {(() => {
                  const soloTargets = uniqueEvaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)));
                  if (soloTargets.length === 0) return null;
                  
                  return (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', maxHeight: 600, minHeight: 180, overflowY: 'auto', marginBottom: 24, paddingRight: 4 }}>
                      <div style={{ fontWeight: 600, color: '#7C4DBC', marginBottom: 8, textAlign: 'center' }}>솔로 참가자</div>
                      {soloTargets
                        .sort((a, b) => {
                          // createdAt 기준으로 정렬 (오래된 순)
                          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                          return aTime - bTime;
                        })
                        .map(t => {
                          const isMe = user && t.uid === user.uid;
                          // 닉네임 기반으로도 본인인지 확인
                          const isMeByNickname = user && t.nickname && user.nickname && t.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
                          const alreadyGraded = gradedTargets.includes(t.uid);
                      return (
                        <div
                          key={t.uid}
                          style={{
                            background: alreadyGraded 
                              ? 'linear-gradient(135deg, #E5E7EB 0%, #D1D5DB 100%)' 
                              : 'linear-gradient(135deg, #F6F2FF 0%, #F0F4FF 100%)',
                            borderRadius: 16,
                            padding: '20px',
                            marginBottom: 16,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            width: '100%',
                            boxShadow: alreadyGraded 
                              ? '0 2px 8px rgba(0, 0, 0, 0.1)' 
                              : '0 4px 16px rgba(138, 85, 204, 0.1)',
                            border: alreadyGraded 
                              ? '1px solid #9CA3AF' 
                              : '1px solid rgba(138, 85, 204, 0.1)',
                            opacity: alreadyGraded ? 0.7 : 1,
                            position: 'relative',
                          }}
                        >
                          <div style={{ 
                            fontWeight: 700, 
                            color: alreadyGraded ? '#6B7280' : '#8A55CC', 
                            textAlign: 'center', 
                            fontSize: 18, 
                            textDecoration: alreadyGraded ? 'line-through' : 'none' 
                          }}>
                            {t.nickname}
                            {alreadyGraded && <span style={{ marginLeft: 8, fontSize: 14, color: '#10B981' }}>✅ 제출완료</span>}
                          </div>
                          {/* 곡 제목 입력 필드 */}
                          <div style={{ marginTop: '8px', marginBottom: '8px' }}>
                            {isAdmin && editingSongTitle === t.uid ? (
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  placeholder="곡 제목을 입력하세요"
                                  value={songTitles[t.uid] || ''}
                                  onChange={(e) => setSongTitles(prev => ({ ...prev, [t.uid]: e.target.value }))}
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveSongTitle(t.uid, songTitles[t.uid] || '', false);
                                    }
                                  }}
                                  onBlur={() => handleSaveSongTitle(t.uid, songTitles[t.uid] || '', false)}
                                  autoFocus
                                  style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #E5DAF5',
                                    fontSize: '14px',
                                    background: '#fff'
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    handleSaveSongTitle(t.uid, songTitles[t.uid] || '', false);
                                  }}
                                  style={{
                                    padding: '8px 16px',
                                    background: '#8A55CC',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  저장
                                </button>
                              </div>
                            ) : (
                              <div 
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  background: songTitles[t.uid] ? '#F6F2FF' : '#F9FAFB',
                                  border: '1px solid #E5DAF5',
                                  fontSize: '14px',
                                  color: songTitles[t.uid] ? '#6B21A8' : '#9CA3AF',
                                  fontStyle: songTitles[t.uid] ? 'normal' : 'italic',
                                  textAlign: 'center',
                                  cursor: isAdmin ? 'pointer' : 'default',
                                  minHeight: '36px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                onClick={() => {
                                  if (isAdmin) {
                                    setEditingSongTitle(t.uid);
                                    setSongTitles(prev => ({ ...prev, [t.uid]: prev[t.uid] || '' }));
                                  }
                                }}
                              >
                                {songTitles[t.uid] || (isAdmin ? '곡 제목을 입력하세요 (클릭)' : '곡 제목')}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                            {(isMe || isMeByNickname) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                <span style={{ color: '#F43F5E', fontWeight: 600, fontSize: 16 }}>본인은 평가할 수 없습니다.</span>
                                <span style={{ color: '#9CA3AF', fontSize: 14 }}>자기 평가는 금지되어 있습니다.</span>
                              </div>
                            ) : alreadyGraded ? (
                              <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                gap: 8,
                                padding: '16px',
                                background: 'rgba(255, 255, 255, 0.5)',
                                borderRadius: 8
                              }}>
                                <div style={{ color: '#6B7280', fontWeight: 600, fontSize: 16, textAlign: 'center' }}>
                                  평가 제출 완료
                                </div>
                                {gradeInputs[t.uid]?.score && (
                                  <div style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center' }}>
                                    점수: {gradeInputs[t.uid].score}점
                                    {!isNaN(Number(gradeInputs[t.uid]?.score)) && Number(gradeInputs[t.uid]?.score) >= 1 && Number(gradeInputs[t.uid]?.score) <= 100 && (
                                      <span style={{ marginLeft: 8, color: '#8A55CC' }}>
                                        ({getGradeFromScore(Number(gradeInputs[t.uid]?.score))})
                                      </span>
                                    )}
                                  </div>
                                )}
                                {gradeInputs[t.uid]?.comment && (
                                  <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', fontStyle: 'italic' }}>
                                    "{gradeInputs[t.uid].comment}"
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                                <div>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    placeholder="0~100 사이의 점수 입력"
                                    value={gradeInputs[t.uid]?.score || ''}
                                    onChange={e => setGradeInputs(inputs => ({ ...inputs, [t.uid]: { ...inputs[t.uid], score: e.target.value } }))}
                                    disabled={grading[t.uid]}
                                    style={{ 
                                      width: '100%', 
                                      padding: '12px 16px', 
                                      borderRadius: 8, 
                                      border: '1px solid #E5DAF5', 
                                      fontSize: 16,
                                      boxSizing: 'border-box',
                                      background: '#FAFAFA'
                                    }}
                                  />
                                  {gradeInputs[t.uid]?.score && !isNaN(Number(gradeInputs[t.uid]?.score)) && Number(gradeInputs[t.uid]?.score) >= 1 && Number(gradeInputs[t.uid]?.score) <= 100 && (
                                    <div style={{ marginTop: 6, color: '#8A55CC', fontWeight: 600, fontSize: 14, textAlign: 'center' }}>
                                      추천등급: {getGradeFromScore(Number(gradeInputs[t.uid]?.score))}
                                    </div>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  placeholder="코멘트(선택)"
                                  value={gradeInputs[t.uid]?.comment || ''}
                                  onChange={e => setGradeInputs(inputs => ({ ...inputs, [t.uid]: { ...inputs[t.uid], comment: e.target.value } }))}
                                  disabled={grading[t.uid]}
                                  style={{ 
                                    width: '100%', 
                                    padding: '12px 16px', 
                                    borderRadius: 8, 
                                    border: '1px solid #E5DAF5',
                                    fontSize: 16,
                                    boxSizing: 'border-box',
                                    background: '#FAFAFA'
                                  }}
                                />
                                <button
                                  style={{
                                    background: '#8A55CC',
                                    color: '#fff',
                                    borderRadius: 12,
                                    padding: '14px 24px',
                                    fontWeight: 600,
                                    fontSize: 16,
                                    border: 'none',
                                    cursor: grading[t.uid] ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 12px rgba(138, 85, 204, 0.3)',
                                    width: '100%'
                                  }}
                                  onClick={() => handleSubmitGrade(t.uid)}
                                  disabled={grading[t.uid]}
                                >
                                  제출
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  );
                })()}
                {/* 평가 진행 상황 표시 */}
                {(() => {
                  const totalEvaluatable = teams.filter(team => {
                    const isMyTeam = user && (
                      team.members.includes(user.uid) ||
                      getMemberNicknames(team).some((nick: string) =>
                        extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
                      )
                    );
                    return !isMyTeam;
                  }).length + uniqueEvaluationTargets.filter(t => {
                    const isMe = user && t.uid === user.uid;
                    const isMeByNickname = user && t.nickname && user.nickname && t.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
                    return !isMe && !isMeByNickname && !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid));
                  }).length;
                  
                  const gradedCount = gradedTargets.length;
                  
                  if (totalEvaluatable > 0) {
                    return (
                      <div style={{
                        background: 'rgba(138, 85, 204, 0.1)',
                        border: '1px solid rgba(138, 85, 204, 0.3)',
                        borderRadius: 12,
                        padding: '16px',
                        marginBottom: 16,
                        textAlign: 'center'
                      }}>
                        <div style={{ color: '#8A55CC', fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                          평가 진행 상황: {gradedCount} / {totalEvaluatable}명
                        </div>
                        <div style={{ 
                          width: '100%', 
                          height: '8px', 
                          background: '#E5DAF5', 
                          borderRadius: '4px', 
                          overflow: 'hidden',
                          marginTop: '8px'
                        }}>
                          <div style={{
                            width: `${(gradedCount / totalEvaluatable) * 100}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #8A55CC 0%, #7C4DBC 100%)',
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* 평가 전체 제출완료 안내문구 */}
                {(() => {
                  // 평가가 남아있는 팀/참가자가 있는지 확인
                  const ungradedTeams = teams.filter(team => !gradedTargets.includes(team.id));
                  const ungradedSolo = uniqueEvaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)) && !gradedTargets.includes(t.uid));
                  if (ungradedTeams.length > 0 || ungradedSolo.length > 0) {
                    return (
                      <div style={{
                        color: '#F59E42',
                        background: 'rgba(251, 191, 36, 0.15)',
                        border: '1px solid #FBBF24',
                        borderRadius: 12,
                        padding: '12px 0',
                        marginBottom: 16,
                        textAlign: 'center',
                        fontWeight: 600,
                        fontSize: 16
                      }}>
                        아직 모든 인원에 대해 평가가 완료되지 않았습니다.<br />
                        제출 시 미평가 인원은 평가 없이 넘어갑니다.
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* 평가 전체 제출완료 버튼 */}
                {(() => {
                  // 평가 가능한 대상이 있는지 확인
                  const evaluatableTeams = teams.filter(team => {
                    const isMyTeam = user && (
                      team.members.includes(user.uid) ||
                      getMemberNicknames(team).some((nick: string) =>
                        extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
                      )
                    );
                    return !isMyTeam && !gradedTargets.includes(team.id);
                  });
                  
                  const evaluatableSolo = uniqueEvaluationTargets.filter(t => {
                    const isMe = user && t.uid === user.uid;
                    const isMeByNickname = user && t.nickname && user.nickname && t.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
                    return !isMe && !isMeByNickname && !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)) && !gradedTargets.includes(t.uid);
                  });
                  
                  const hasEvaluatableTargets = evaluatableTeams.length > 0 || evaluatableSolo.length > 0;
                  
                  if (!hasEvaluatableTargets && gradedTargets.length === 0) {
                    return null; // 평가할 대상이 없으면 버튼 숨김
                  }
                  
                  return (
                    <button
                      style={{
                        marginTop: 32,
                        background: hasEvaluatableTargets 
                          ? 'linear-gradient(135deg, #8A55CC 0%, #7C4DBC 100%)'
                          : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 16,
                        padding: '18px 24px',
                        fontWeight: 700,
                        fontSize: 18,
                        cursor: showSubmitMsg ? 'not-allowed' : 'pointer',
                        width: '100%',
                        boxShadow: '0 8px 24px rgba(138, 85, 204, 0.3)',
                        transition: 'all 0.3s ease',
                        opacity: showSubmitMsg ? 0.6 : 1
                      }}
                      onClick={handleAllSubmit}
                      disabled={showSubmitMsg}
                    >
                      {hasEvaluatableTargets ? '🎯 제출완료' : '✅ 모든 평가 완료'}
                    </button>
                  );
                })()}
                {showSubmitMsg && (
                  <div style={{ color: '#10B981', fontWeight: 700, fontSize: 20, margin: '32px 0', textAlign: 'center' }}>
                    제출이 완료되었습니다.
                  </div>
                )}
              </>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
};

export default ContestParticipate; 