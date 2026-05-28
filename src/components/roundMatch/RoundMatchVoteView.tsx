import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import type { RoundDoc } from '../../types/contest';
import RoundMatchResultOverlay from './RoundMatchResultOverlay';

interface Props {
  contestId: string;
  currentRoundId: string | null | undefined;
  user: { uid: string; nickname?: string };
  isStarted: boolean;
}

const RoundMatchVoteView: React.FC<Props> = ({
  contestId,
  currentRoundId,
  user,
  isStarted,
}) => {
  const navigate = useNavigate();
  const [round, setRound] = useState<RoundDoc | null>(null);
  const [myChoice, setMyChoice] = useState<'A' | 'B' | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [showResultOverlay, setShowResultOverlay] = useState(false);
  const [dismissedRoundId, setDismissedRoundId] = useState<string | null>(null);

  useEffect(() => {
    if (!contestId || !currentRoundId) {
      setRound(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'contests', contestId, 'rounds', currentRoundId), (snap) => {
      if (snap.exists()) {
        setRound({ id: snap.id, ...snap.data() } as RoundDoc);
      } else {
        setRound(null);
      }
    });
    return () => unsub();
  }, [contestId, currentRoundId]);

  useEffect(() => {
    if (!contestId || !currentRoundId || !user?.uid) return;
    const loadVote = async () => {
      const snap = await getDoc(
        doc(db, 'contests', contestId, 'rounds', currentRoundId, 'votes', user.uid)
      );
      if (snap.exists()) {
        const data = snap.data();
        setMyChoice(data.choice === 'B' ? 'B' : 'A');
        setComment(data.comment || '');
      } else {
        setMyChoice(null);
        setComment('');
      }
    };
    void loadVote();

    const unsub = onSnapshot(
      doc(db, 'contests', contestId, 'rounds', currentRoundId, 'votes', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setMyChoice(data.choice === 'B' ? 'B' : 'A');
          setComment(data.comment || '');
        }
      }
    );
    return () => unsub();
  }, [contestId, currentRoundId, user?.uid]);

  useEffect(() => {
    if (round?.status === 'published' && round.id !== dismissedRoundId) {
      setShowResultOverlay(true);
    } else if (round?.status !== 'published') {
      setShowResultOverlay(false);
    }
  }, [round?.status, round?.id, dismissedRoundId]);

  useEffect(() => {
    if (currentRoundId && currentRoundId !== dismissedRoundId) {
      setDismissedRoundId(null);
    }
  }, [currentRoundId]);

  const canVote = round?.status === 'voting' && isStarted;

  const saveVote = useCallback(
    async (choice: 'A' | 'B', commentText: string) => {
      if (!contestId || !currentRoundId || !user?.uid || !canVote) return;
      setSaving(true);
      try {
        await setDoc(
          doc(db, 'contests', contestId, 'rounds', currentRoundId, 'votes', user.uid),
          {
            uid: user.uid,
            nickname: user.nickname || '',
            choice,
            comment: commentText.trim(),
            updatedAt: new Date(),
          },
          { merge: true }
        );
        setMyChoice(choice);
      } finally {
        setSaving(false);
      }
    },
    [contestId, currentRoundId, user, canVote]
  );

  const handleSelect = useCallback(
    (choice: 'A' | 'B') => {
      void saveVote(choice, comment);
    },
    [saveVote, comment]
  );

  const handleCommentBlur = useCallback(() => {
    if (myChoice && canVote) {
      void saveVote(myChoice, comment);
    }
  }, [myChoice, canVote, saveVote, comment]);

  const resultWinner = useMemo(() => {
    if (!round || round.status !== 'published') return null;
    return round.winner || 'draw';
  }, [round]);

  if (!isStarted) {
    return (
      <div className="rm-vote-wait">
        <p>콘테스트가 아직 개최되지 않았습니다.</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/contests/${contestId}`)}>
          상세로 돌아가기
        </button>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="rm-vote-wait">
        <p>라운드 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="rm-vote-container contest-ui-refresh">
      <div className="rm-stage-lights" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="rm-round-pill-wrap">
        <span className="rm-round-pill">ROUND {round.roundNumber}</span>
      </div>
      <div className="rm-vote-header">
        <span className={`rm-round-state ${round.status}`}>
          {round.status === 'voting' && '실시간 투표 진행중'}
          {round.status === 'closed' && '투표 마감'}
          {round.status === 'published' && '결과 공개'}
        </span>
        <h2 className="rm-match-title">
          {round.teamAName} <span className="rm-vs">VS</span> {round.teamBName}
        </h2>
      </div>

      {round.status === 'voting' && (
        <>
          <p className="rm-vote-hint">마음에 드는 팀을 선택하세요. 마감 전까지 변경할 수 있습니다.</p>
          <div className="rm-vote-buttons">
            <button
              type="button"
              className={`rm-team-btn team-a ${myChoice === 'A' ? 'selected' : ''}`}
              disabled={saving}
              onClick={() => handleSelect('A')}
            >
              <span className="rm-corner-badge">TEAM A</span>
              <span className="rm-team-energy" aria-hidden />
              <span className="rm-team-btn-label">{round.teamAName}</span>
              {myChoice === 'A' && <span className="rm-check">✓ 선택됨</span>}
            </button>
            <button
              type="button"
              className={`rm-team-btn team-b ${myChoice === 'B' ? 'selected' : ''}`}
              disabled={saving}
              onClick={() => handleSelect('B')}
            >
              <span className="rm-corner-badge">TEAM B</span>
              <span className="rm-team-energy" aria-hidden />
              <span className="rm-team-btn-label">{round.teamBName}</span>
              {myChoice === 'B' && <span className="rm-check">✓ 선택됨</span>}
            </button>
          </div>
          <div className="rm-comment-wrap">
            <label htmlFor="rm-comment">코멘트 (선택)</label>
            <textarea
              id="rm-comment"
              className="rm-comment-input"
              placeholder="응원 메시지나 의견을 남겨보세요"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onBlur={handleCommentBlur}
              rows={2}
            />
          </div>
        </>
      )}

      {round.status === 'closed' && (
        <div className="rm-closed-msg">
          <span>🔒</span>
          <p>투표가 마감되었습니다.</p>
          <p className="rm-muted">결과 공개를 기다려주세요.</p>
        </div>
      )}

      {round.status === 'published' && resultWinner && (
        <>
          {showResultOverlay && (
            <RoundMatchResultOverlay
              winner={resultWinner}
              winnerTeamName={round.winnerTeamName || '무승부'}
              onDismiss={() => {
                setShowResultOverlay(false);
                setDismissedRoundId(round.id);
              }}
            />
          )}
          {!showResultOverlay && (
            <div className="rm-published-inline">
              <div className="rm-published-emoji">{resultWinner === 'draw' ? '🤝' : '🏆'}</div>
              <p className="rm-published-text">
                {resultWinner === 'draw' ? '무승부!' : `${round.winnerTeamName} 승리!`}
              </p>
              <p className="rm-muted">다음 라운드를 기다려주세요.</p>
            </div>
          )}
        </>
      )}

      <button type="button" className="btn btn-secondary rm-back-btn" onClick={() => navigate(`/contests/${contestId}`)}>
        상세로 돌아가기
      </button>
    </div>
  );
};

export default RoundMatchVoteView;
