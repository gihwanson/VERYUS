import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, getDocs, query, where, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  canAutoJoinBeforeStart,
  CONTEST_NOT_REGISTERED_MESSAGE,
  isRegisteredParticipant,
  registerOnParticipateClick,
} from '../utils/contestParticipant';
import { getContestGradeFromScore } from '../utils/contestGrade';
import { formatContestStageLines, contestGradeTargetIds, contestBothMainUids } from '../utils/contestStage';
import { contestTypeLabel } from '../types/contest';
import { getGradeEmoji, getGradeName } from '../utils/gradeDisplay';
import ContestAccessBlock from './ContestAccessBlock';
import RoundMatchVoteView from './roundMatch/RoundMatchVoteView';
import '../styles/contest-ui-refresh.css';
const contestGradeEvaluatorFields = (u: { nickname: string; role: string; grade?: string }) => ({
  evaluator: u.nickname,
  evaluatorRole: u.role,
  evaluatorGrade: getGradeEmoji(u.grade),
});

function ContestMemberName({
  nickname,
  gradeByNickname,
}: {
  nickname: string;
  gradeByNickname: Record<string, string>;
}) {
  const trimmed = nickname.trim();
  const gradeRaw = gradeByNickname[trimmed];
  const emoji = getGradeEmoji(gradeRaw);
  const title = getGradeName(gradeRaw);
  return (
    <span className="contest-participate-member-inline">
      <span className="contest-participate-grade" title={title} aria-label={`등급 ${title}`}>
        {emoji}
      </span>
      <span className="contest-participate-nickname">{trimmed}</span>
    </span>
  );
}

function ContestStageLineText({
  line,
  gradeByNickname,
  className,
}: {
  line: string;
  gradeByNickname: Record<string, string>;
  className?: string;
}) {
  const match = line.match(/^(메인|서브)\s+(.+)$/);
  if (!match) {
    return <span className={className}>{line}</span>;
  }
  const [, role, rest] = match;
  const parenMatch = rest.match(/^(.+?)(\s*\(.+\))$/);
  const nameSegment = parenMatch ? parenMatch[1] : rest;
  const paren = parenMatch ? parenMatch[2] : '';
  const names = nameSegment.split(/,\s*/).filter(Boolean);
  return (
    <span className={className}>
      {role}{' '}
      {names.map((name, index) => (
        <React.Fragment key={`${name}-${index}`}>
          {index > 0 ? ', ' : null}
          <ContestMemberName nickname={name} gradeByNickname={gradeByNickname} />
        </React.Fragment>
      ))}
      {paren}
    </span>
  );
}

function ContestGradeFields({
  targetId,
  sliceLabel,
  sliceMeta,
  gradeInputs,
  setGradeInputs,
  grading,
  alreadyGraded,
  isEditing,
  onSubmit,
  onEdit,
  onCancelEdit,
}: {
  targetId: string;
  /** 서로 메인 등 — 카드 상단과 겹치지 않는 짧은 구역 제목 */
  sliceLabel?: React.ReactNode;
  sliceMeta?: { index: number; total: number };
  gradeInputs: Record<string, { score: string; comment: string }>;
  setGradeInputs: React.Dispatch<React.SetStateAction<Record<string, { score: string; comment: string }>>>;
  grading: Record<string, boolean>;
  alreadyGraded: boolean;
  isEditing: boolean;
  onSubmit: (targetId: string) => void;
  onEdit: (targetId: string) => void;
  onCancelEdit: (targetId: string) => void;
}) {
  const score = gradeInputs[targetId]?.score || '';
  const comment = gradeInputs[targetId]?.comment || '';
  const scoreNumber = Number(score);
  const hasGradeHint = score !== '' && !isNaN(scoreNumber) && scoreNumber >= 1 && scoreNumber <= 100;
  const isSlice = Boolean(sliceLabel);

  return (
    <div
      className={`contest-participate-grade-block${isSlice ? ' contest-participate-grade-block--slice' : ''}`}
    >
      {sliceLabel ? (
        <div className="contest-participate-slice-head">
          {sliceMeta ? (
            <span className="contest-participate-slice-step" aria-hidden>
              {sliceMeta.index}/{sliceMeta.total}
            </span>
          ) : null}
          <span className="contest-participate-slice-label">{sliceLabel}</span>
          {alreadyGraded && !isEditing ? (
            <span className="contest-participate-slice-done">완료</span>
          ) : null}
        </div>
      ) : null}
      {alreadyGraded && !isEditing ? (
        <div className="contest-participate-done-card">
          <div className="contest-participate-done-title">평가 제출 완료</div>
          {score && (
            <div className="contest-participate-done-score">
              점수: {score}점
              {hasGradeHint && (
                <span className="contest-participate-grade-hint-inline">
                  ({getContestGradeFromScore(scoreNumber)})
                </span>
              )}
            </div>
          )}
          {comment && <div className="contest-participate-done-comment">&ldquo;{comment}&rdquo;</div>}
          <button type="button" className="contest-participate-cancel-btn" onClick={() => onEdit(targetId)}>
            제출취소
          </button>
        </div>
      ) : (
        <>
          <input
            type="number"
            min={0}
            max={100}
            placeholder="0~100 사이의 점수 입력"
            value={score}
            onChange={(e) =>
              setGradeInputs((inputs) => ({
                ...inputs,
                [targetId]: { ...inputs[targetId], score: e.target.value },
              }))
            }
            disabled={grading[targetId]}
            className="contest-participate-field"
          />
          {hasGradeHint && (
            <div className="contest-participate-grade-hint">
              추천등급: {getContestGradeFromScore(scoreNumber)}
            </div>
          )}
          <input
            type="text"
            placeholder="코멘트 (선택)"
            value={comment}
            onChange={(e) =>
              setGradeInputs((inputs) => ({
                ...inputs,
                [targetId]: { ...inputs[targetId], comment: e.target.value },
              }))
            }
            disabled={grading[targetId]}
            className="contest-participate-field"
          />
          <div className="contest-participate-submit-row">
            <button
              type="button"
              className="contest-participate-submit-btn"
              onClick={() => onSubmit(targetId)}
              disabled={grading[targetId]}
            >
              {alreadyGraded ? '수정 제출' : isSlice ? '이 멤버 채점 제출' : '제출'}
            </button>
            {alreadyGraded && (
              <button
                type="button"
                className="contest-participate-secondary-btn"
                onClick={() => onCancelEdit(targetId)}
              >
                취소
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

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
  const [editingSubmittedTargets, setEditingSubmittedTargets] = useState<Record<string, boolean>>({});
  const [allSubmitted, setAllSubmitted] = useState(false);
  const [showSubmitMsg, setShowSubmitMsg] = useState(false);
  const [entryRestricted, setEntryRestricted] = useState(false);
  const [songTitles, setSongTitles] = useState<Record<string, string>>({}); // targetId -> songTitle
  const [editingSongTitle, setEditingSongTitle] = useState<string | null>(null); // 현재 수정 중인 targetId
  const [gradeByNickname, setGradeByNickname] = useState<Record<string, string>>({});

  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const map: Record<string, string> = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const nick = String(data.nickname || '').trim();
          if (nick) map[nick] = String(data.grade ?? '');
        });
        setGradeByNickname(map);
      })
      .catch((err) => console.error('회원 등급 로드 실패:', err));
  }, []);

  useEffect(() => {
    if (!id || !user || !contest) return;
    void registerOnParticipateClick(
      id,
      { isStarted: !!contest.isStarted, type: contest.type },
      user
    ).catch((err) => {
      console.error('참가자 자동 등록 실패:', err);
    });
  }, [id, user?.uid, contest?.type, contest?.isStarted]);

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
    // 실시간 구독 - 이미 제출한 평가의 점수와 코멘트 복원
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
        
        // 재입장 시에도 DB 기준으로 정확히 복원
        setGradedTargets(Array.from(new Set(targets)));
        // 이미 제출한 평가의 점수와 코멘트를 입력 필드에 표시
        setGradeInputs(prev => {
          const updated = { ...prev };
          Object.keys(submittedGrades).forEach(targetId => {
            // "제출취소"로 수정 중인 항목은 사용자의 입력값을 보존
            if (editingSubmittedTargets[targetId]) return;
            updated[targetId] = submittedGrades[targetId];
          });
          return updated;
        });
      }
    );
    return () => unsub();
  }, [id, user, editingSubmittedTargets]);

  const getGradeFromScore = getContestGradeFromScore;

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
  const uniqueParticipants = useMemo(() => {
    const byUid = participants.filter((p, idx, arr) =>
      arr.findIndex((pp) => pp.uid === p.uid) === idx
    );
    return byUid.filter((p, idx, arr) => {
      if (!p.nickname) return true;
      return arr.findIndex((pp) => pp.nickname === p.nickname) === idx;
    });
  }, [participants]);
  
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

  const isLeader = Boolean(user && user.role === '리더');

  const isContestParticipant = useMemo(() => {
    if (!user) return false;
    return isRegisteredParticipant(participants, user);
  }, [user, participants]);

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

  const nicknameOfMember = (uidOrNickname: string) => {
    const target = uniqueEvaluationTargets.find((tt) => tt.uid === uidOrNickname);
    if (target?.nickname) return target.nickname;

    const targetByNickname = uniqueEvaluationTargets.find((tt) => {
      const extractedNickname = extractNickname(uidOrNickname);
      return tt.nickname && tt.nickname.toLowerCase().trim() === extractedNickname.toLowerCase().trim();
    });
    if (targetByNickname?.nickname) return targetByNickname.nickname;

    const participant = uniqueParticipants.find((pp) => pp.uid === uidOrNickname);
    if (participant?.nickname) return participant.nickname;

    const participantByNickname = uniqueParticipants.find((pp) => {
      const extractedNickname = extractNickname(uidOrNickname);
      return pp.nickname && pp.nickname.toLowerCase().trim() === extractedNickname.toLowerCase().trim();
    });
    if (participantByNickname?.nickname) return participantByNickname.nickname;

    return extractNickname(uidOrNickname);
  };

  const getMemberNicknames = (team: { members?: string[] }) => {
    return (Array.isArray(team.members) ? team.members : [])
      .map((uidOrNickname: string) => nicknameOfMember(uidOrNickname))
      .filter(Boolean);
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
      ...contestGradeEvaluatorFields(user),
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
    const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', targetId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const gradeDocRef = snap.docs[0].ref;
      await updateDoc(gradeDocRef, {
        score: numScore,
        comment: comment ?? '',
        evaluatorGrade: getGradeEmoji(user.grade),
        updatedAt: new Date()
      });
    } else {
      await addDoc(collection(db, 'contests', id, 'grades'), {
        ...contestGradeEvaluatorFields(user),
        target: targetId,
        score: numScore,
        comment: comment ?? '',
        createdAt: new Date()
      });
    }
    setGrading(g => ({ ...g, [targetId]: false }));
    setSuccessMsgMap(msgs => ({ ...msgs, [targetId]: snap.empty ? '✅ 제출완료' : '✅ 수정완료' }));
    setEditingSubmittedTargets(prev => ({ ...prev, [targetId]: false }));
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
      // DB에서 이미 제출한 평가 목록 가져오기
      const submittedGradesQuery = query(
        collection(db, 'contests', id, 'grades'),
        where('evaluator', '==', user.nickname)
      );
      const submittedGradesSnap = await getDocs(submittedGradesQuery);
      const submittedTargetIds = submittedGradesSnap.docs.map(doc => doc.data().target);

      // 현재 입력된 평가 데이터 수집 및 제출
      const submissionsToProcess = [];
      
      // 팀 평가 데이터 수집
      for (const team of teams) {
        const targetIds = contestGradeTargetIds(team);
        for (const targetId of targetIds) {
          const input = gradeInputs[targetId];
          if (input && input.score && !submittedTargetIds.includes(targetId)) {
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
                  target: targetId,
                  score: numScore,
                  comment: input.comment || ''
                });
              }
            }
          }
        }
      }

      // 솔로 평가받는 대상 평가 데이터 수집
      const soloTargets = uniqueEvaluationTargets.filter(t => !teams.some(team => Array.isArray(team.members) && team.members.includes(t.uid)));
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

      // 입력된 평가가 있으면 제출
      if (submissionsToProcess.length > 0) {
        for (const submission of submissionsToProcess) {
          const q = query(collection(db, 'contests', id, 'grades'), where('evaluator', '==', user.nickname), where('target', '==', submission.target));
          const snap = await getDocs(q);
          
          if (snap.empty) {
            await addDoc(collection(db, 'contests', id, 'grades'), {
              ...contestGradeEvaluatorFields(user),
              target: submission.target,
              score: submission.score,
              comment: submission.comment,
              createdAt: new Date()
            });
          }
        }
      }

      // 제출 완료 메시지 표시 및 메인보드로 이동
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
      <div className="contest-ui-refresh contest-participate-refresh contest-participate-state-screen">
        <div className="contest-participate-state-card contest-participate-state-card--ended">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <div className="contest-participate-state-msg">이 콘테스트는 종료되어 더 이상 참여할 수 없습니다.</div>
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="contest-ui-refresh contest-participate-refresh contest-participate-state-screen">
        <div className="contest-participate-state-card contest-participate-state-card--loading">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
          <div className="contest-participate-state-msg contest-participate-state-msg--loading">콘테스트 정보를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  if (
    id &&
    user &&
    !contest.isStarted &&
    !isLeader &&
    !canAutoJoinBeforeStart(contest.type) &&
    !isContestParticipant
  ) {
    return (
      <ContestAccessBlock
        contestId={id}
        message={CONTEST_NOT_REGISTERED_MESSAGE}
      />
    );
  }

  if (contest.type === '라운드매치' && id && user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--app-page-gradient)',
          backgroundAttachment: 'fixed',
        }}
      >
        <RoundMatchVoteView
          contestId={id}
          currentRoundId={contest.currentRoundId}
          user={user}
          isStarted={!!contest.isStarted}
        />
      </div>
    );
  }

  // 콘테스트가 개최되지 않은 경우 - 준비 화면 표시 (리더는 평가지 미리보기 가능)
  if (!contest.isStarted && !(user && user.role === '리더')) {
    const deadlineText =
      contest?.deadline && contest.deadline.seconds
        ? new Date(contest.deadline.seconds * 1000).toLocaleDateString('ko-KR')
        : '';

    return (
      <div
        className="contest-ui-refresh"
        style={{
          minHeight: '100vh',
          background: 'var(--app-page-gradient)',
          backgroundAttachment: 'fixed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            background: 'rgba(255, 255, 255, 0.14)',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            borderRadius: 20,
            padding: '34px 26px',
            boxShadow: '0 14px 40px rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(12px)',
            textAlign: 'center',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 38, marginBottom: 12 }}>⏳</div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{contest.title}</h2>
          <p style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 700 }}>아직 개최되지 않았습니다</p>
          <p style={{ margin: '8px 0 0', opacity: 0.9, lineHeight: 1.6 }}>
            리더가 콘테스트를 개최하면 참여가 가능합니다.
            <br />
            잠시 후 다시 확인해주세요.
          </p>
          {deadlineText && (
            <div
              style={{
                marginTop: 16,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.12)',
                fontSize: 14,
              }}
            >
              📅 마감일: {deadlineText}
            </div>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 18 }}
            onClick={() => navigate(`/contests/${id}`)}
          >
            콘테스트 상세로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="contest-ui-refresh contest-participate-refresh">
      <div className="contest-participate-bg-pattern" aria-hidden />

      <div className="contest-participate-inner">
        <button
          type="button"
          className="contest-back-button"
          onClick={() => navigate(`/contests/${id}`)}
        >
          ← 콘테스트 메인으로
        </button>

        <>
          <h2 className="contest-participate-hero-title">{contest.title}</h2>
          <div className="contest-participate-hero-type contest-participate-hero-type--tail">
            {contestTypeLabel(contest.type)}
          </div>

          {!contest.isStarted && user && user.role === '리더' && (
            <div className="contest-participate-leader-notice">
              <div className="contest-participate-leader-notice__title">⚠️ 콘테스트가 아직 개최되지 않았습니다</div>
              <div className="contest-participate-leader-notice__body">
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
                  <div style={{ marginBottom: 32, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    <h3 className="contest-section-label contest-participate-group-label">무대</h3>
                    {teams
                      .sort((a, b) => {
                        // order 기준으로 정렬 (order가 없으면 createdAt 기준)
                        const aOrder = a.order !== undefined ? a.order : (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
                        const bOrder = b.order !== undefined ? b.order : (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
                        return aOrder - bOrder;
                      })
                      .map(team => {
                        const isMyTeam = user && (
                          team.members.includes(user.uid) ||
                          getMemberNicknames(team).some((nick: string) =>
                            extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
                          )
                        );
                        const scoreTargetIds = contestGradeTargetIds(team);
                        const alreadyGraded = scoreTargetIds.every((targetId) => gradedTargets.includes(targetId));
                        return (
                          <div
                            key={team.id}
                            className={`contest-participate-stage-card${alreadyGraded ? ' is-done' : ''}`}
                          >
                            <div className="contest-participate-stage-head">
                              {(() => {
                                const stageLines = formatContestStageLines(team, nicknameOfMember);
                                const coMainUids = contestBothMainUids(team);
                                if (coMainUids && coMainUids.length >= 2) {
                                  return (
                                    <div className="contest-participate-co-main-head">
                                      <span className="contest-participate-co-main-badge">서로 메인</span>
                                      <div className="contest-participate-member-chips">
                                        {coMainUids.map((uid) => (
                                          <span key={uid} className="contest-participate-member-chip">
                                            <ContestMemberName
                                              nickname={nicknameOfMember(uid)}
                                              gradeByNickname={gradeByNickname}
                                            />
                                          </span>
                                        ))}
                                      </div>
                                      <p className="contest-participate-co-main-hint">
                                        두 분은 <strong>각각</strong> 점수·코멘트를 제출해 주세요.
                                      </p>
                                    </div>
                                  );
                                }
                                if (!stageLines) {
                                  return (
                                    <div className="contest-participate-stage-title">
                                      {getMemberNicknames(team).map((nick, i) => (
                                        <React.Fragment key={nick}>
                                          {i > 0 ? ' · ' : null}
                                          <ContestMemberName nickname={nick} gradeByNickname={gradeByNickname} />
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  );
                                }
                                return (
                                  <>
                                    <ContestStageLineText
                                      line={stageLines.title}
                                      gradeByNickname={gradeByNickname}
                                      className={`contest-participate-stage-title${alreadyGraded ? ' is-muted' : ''}`}
                                    />
                                    <ContestStageLineText
                                      line={stageLines.support}
                                      gradeByNickname={gradeByNickname}
                                      className="contest-participate-stage-sub"
                                    />
                                    {scoreTargetIds.length === 1 && (
                                      <p className="contest-participate-team-grade-hint">
                                        이 무대는 팀당 점수 <strong>1번</strong>만 제출하면 됩니다.
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                              {alreadyGraded && (
                                <span className="contest-participate-stage-badge">제출완료</span>
                              )}
                            </div>
                            {/* 곡 제목 입력 필드 */}
                            <div className="contest-participate-song-wrap">
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
                                      background: '#fff',
                                      color: '#1F2937'
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
                                  className={`contest-participate-song-display${songTitles[team.id] ? ' has-title' : ''}${isAdmin ? ' is-editable' : ''}`}
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
                            <div className="contest-participate-grade-stack">
                              {isMyTeam ? (
                                <div className="contest-participate-self-block">
                                  <span className="contest-participate-self-block__title">
                                    본인이 속한 팀은 평가할 수 없습니다.
                                  </span>
                                  <span className="contest-participate-self-block__sub">자기 평가는 금지되어 있습니다.</span>
                                </div>
                              ) : scoreTargetIds.map((targetId, sliceIndex) => (
                                <ContestGradeFields
                                  key={targetId}
                                  targetId={targetId}
                                  sliceLabel={
                                    scoreTargetIds.length > 1 ? (
                                      <>
                                        <ContestMemberName
                                          nickname={nicknameOfMember(targetId)}
                                          gradeByNickname={gradeByNickname}
                                        />
                                        <span className="contest-participate-slice-suffix">님 채점</span>
                                      </>
                                    ) : undefined
                                  }
                                  sliceMeta={
                                    scoreTargetIds.length > 1
                                      ? { index: sliceIndex + 1, total: scoreTargetIds.length }
                                      : undefined
                                  }
                                  gradeInputs={gradeInputs}
                                  setGradeInputs={setGradeInputs}
                                  grading={grading}
                                  alreadyGraded={gradedTargets.includes(targetId)}
                                  isEditing={!!editingSubmittedTargets[targetId]}
                                  onSubmit={handleSubmitGrade}
                                  onEdit={(tid) => setEditingSubmittedTargets((prev) => ({ ...prev, [tid]: true }))}
                                  onCancelEdit={(tid) => setEditingSubmittedTargets((prev) => ({ ...prev, [tid]: false }))}
                                />
                              ))}
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
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', maxHeight: 600, minHeight: 180, overflowY: 'auto', marginBottom: 24, paddingRight: 4 }}>
                    <h3 className="contest-section-label contest-participate-group-label">솔로 참가자</h3>
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
                          const isEditingSubmitted = !!editingSubmittedTargets[t.uid];
                      return (
                        <div
                          key={t.uid}
                          className={`contest-participate-stage-card${alreadyGraded ? ' is-done' : ''}`}
                        >
                          <div className="contest-participate-stage-head">
                            <div
                              className={`contest-participate-stage-title contest-participate-stage-title--solo${alreadyGraded ? ' is-muted' : ''}`}
                            >
                              <ContestMemberName nickname={t.nickname} gradeByNickname={gradeByNickname} />
                            </div>
                            {alreadyGraded && (
                              <span className="contest-participate-stage-badge">제출완료</span>
                            )}
                          </div>
                          {/* 곡 제목 입력 필드 */}
                          <div className="contest-participate-song-wrap">
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
                                    background: '#fff',
                                    color: '#1F2937'
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
                                className={`contest-participate-song-display${songTitles[t.uid] ? ' has-title' : ''}${isAdmin ? ' is-editable' : ''}`}
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
                          <div className="contest-participate-grade-stack">
                            {(isMe || isMeByNickname) ? (
                              <div className="contest-participate-self-block">
                                <span className="contest-participate-self-block__title">본인은 평가할 수 없습니다.</span>
                                <span className="contest-participate-self-block__sub">자기 평가는 금지되어 있습니다.</span>
                              </div>
                            ) : (
                              <ContestGradeFields
                                targetId={t.uid}
                                gradeInputs={gradeInputs}
                                setGradeInputs={setGradeInputs}
                                grading={grading}
                                alreadyGraded={alreadyGraded}
                                isEditing={isEditingSubmitted}
                                onSubmit={handleSubmitGrade}
                                onEdit={(tid) => setEditingSubmittedTargets((prev) => ({ ...prev, [tid]: true }))}
                                onCancelEdit={(tid) => setEditingSubmittedTargets((prev) => ({ ...prev, [tid]: false }))}
                              />
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
                  const isMyStage = (team: { members?: string[] }) => user && (
                    (team.members || []).includes(user.uid) ||
                    getMemberNicknames(team).some((nick: string) =>
                      extractNickname(nick).toLowerCase().replace(/\s/g, '') === user.nickname.toLowerCase().replace(/\s/g, '')
                    )
                  );
                  const evaluatableIds = [
                    ...teams.flatMap((team) => (isMyStage(team) ? [] : contestGradeTargetIds(team))),
                    ...uniqueEvaluationTargets
                      .filter((t) => {
                        const isMe = user && t.uid === user.uid;
                        const isMeByNickname = user && t.nickname && user.nickname && t.nickname.toLowerCase().trim() === user.nickname.toLowerCase().trim();
                        return !isMe && !isMeByNickname && !teams.some((team) => Array.isArray(team.members) && team.members.includes(t.uid));
                      })
                      .map((t) => t.uid),
                  ];
                  const totalEvaluatable = evaluatableIds.length;
                  const gradedCount = evaluatableIds.filter((id) => gradedTargets.includes(id)).length;
                  
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
                  const ungradedTeams = teams.filter((team) => contestGradeTargetIds(team).some((targetId) => !gradedTargets.includes(targetId)));
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
                    return !isMyTeam && contestGradeTargetIds(team).some((targetId) => !gradedTargets.includes(targetId));
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
        </>
      </div>
    </div>
  );
};

export default ContestParticipate; 