import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../firebase';
import type { ParticipantRecord, RoundDoc, RoundVote } from '../../types/contest';
import {
  parseRoundVoteFromDoc,
  participantMatchesRoundVote,
} from '../../utils/contestParticipant';

interface Props {
  contestId: string;
  currentRoundId: string | null | undefined;
  participants: ParticipantRecord[];
  ended: boolean;
  onEndContest: () => void;
}

const RoundMatchLeaderPanel: React.FC<Props> = ({
  contestId,
  currentRoundId,
  participants,
  ended,
  onEndContest,
}) => {
  const [round, setRound] = useState<RoundDoc | null>(null);
  const [votes, setVotes] = useState<RoundVote[]>([]);
  const [allRounds, setAllRounds] = useState<RoundDoc[]>([]);
  const [nextTeamA, setNextTeamA] = useState('A팀');
  const [nextTeamB, setNextTeamB] = useState('B팀');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!contestId) return;
    const unsub = onSnapshot(
      query(collection(db, 'contests', contestId, 'rounds'), orderBy('roundNumber', 'asc')),
      (snap) => {
        setAllRounds(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RoundDoc[]);
      }
    );
    return () => unsub();
  }, [contestId]);

  useEffect(() => {
    if (!contestId || !currentRoundId) {
      setRound(null);
      setVotes([]);
      return;
    }
    const unsubRound = onSnapshot(doc(db, 'contests', contestId, 'rounds', currentRoundId), (snap) => {
      if (snap.exists()) {
        setRound({ id: snap.id, ...snap.data() } as RoundDoc);
      } else {
        setRound(null);
      }
    });
    const unsubVotes = onSnapshot(
      collection(db, 'contests', contestId, 'rounds', currentRoundId, 'votes'),
      (snap) => {
        setVotes(snap.docs.map((d) => parseRoundVoteFromDoc(d.id, d.data())));
      }
    );
    return () => {
      unsubRound();
      unsubVotes();
    };
  }, [contestId, currentRoundId]);

  const voteStats = useMemo(() => {
    const total = participants.length;
    const participantVotes = votes.filter((v) =>
      participants.some((p) => participantMatchesRoundVote(p, v))
    );
    const voted = participants.filter((p) => participantVotes.some((v) => participantMatchesRoundVote(p, v)));
    const notVoted = participants.filter((p) => !participantVotes.some((v) => participantMatchesRoundVote(p, v)));
    const votesA = participantVotes.filter((v) => v.choice === 'A').length;
    const votesB = participantVotes.filter((v) => v.choice === 'B').length;
    const progress = total > 0 ? Math.round((voted.length / total) * 100) : 0;
    return { total, voted, notVoted, votesA, votesB, progress };
  }, [participants, votes]);

  const handleTeamNameChange = useCallback(
    async (field: 'teamAName' | 'teamBName', value: string) => {
      if (!contestId || !currentRoundId || !round || round.status !== 'voting') return;
      await updateDoc(doc(db, 'contests', contestId, 'rounds', currentRoundId), {
        [field]: value,
      });
    },
    [contestId, currentRoundId, round]
  );

  const handleCloseRound = useCallback(async () => {
    if (!contestId || !currentRoundId || !round) return;
    if (!window.confirm('라운드 투표를 종료하시겠습니까? 종료 후 참가자는 투표·수정이 불가합니다.')) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'contests', contestId, 'rounds', currentRoundId), {
        status: 'closed',
        closedAt: new Date(),
      });
    } finally {
      setBusy(false);
    }
  }, [contestId, currentRoundId, round]);

  const handlePublish = useCallback(async () => {
    if (!contestId || !currentRoundId || !round) return;
    const { votesA, votesB } = voteStats;
    let winner: 'A' | 'B' | 'draw';
    let winnerTeamName: string;
    if (votesA > votesB) {
      winner = 'A';
      winnerTeamName = round.teamAName;
    } else if (votesB > votesA) {
      winner = 'B';
      winnerTeamName = round.teamBName;
    } else {
      winner = 'draw';
      winnerTeamName = '무승부';
    }
    if (!window.confirm(`결과를 공개하시겠습니까?\n${winner === 'draw' ? '무승부' : `${winnerTeamName} 승리`}`)) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'contests', contestId, 'rounds', currentRoundId), {
        status: 'published',
        winner,
        winnerTeamName,
        votesA,
        votesB,
        publishedAt: new Date(),
      });
    } finally {
      setBusy(false);
    }
  }, [contestId, currentRoundId, round, voteStats]);

  const handleNextRound = useCallback(async () => {
    if (!contestId || !round) return;
    if (round.status !== 'published') {
      alert('현재 라운드 결과를 먼저 공개해주세요.');
      return;
    }
    if (!nextTeamA.trim() || !nextTeamB.trim()) {
      alert('다음 라운드 팀 이름을 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const nextNumber = (round.roundNumber || 1) + 1;
      const roundId = uuidv4();
      await setDoc(doc(db, 'contests', contestId, 'rounds', roundId), {
        roundNumber: nextNumber,
        teamAName: nextTeamA.trim(),
        teamBName: nextTeamB.trim(),
        status: 'voting',
        createdAt: new Date(),
      });
      await updateDoc(doc(db, 'contests', contestId), {
        currentRoundId: roundId,
        currentRoundNumber: nextNumber,
      });
      setNextTeamA('A팀');
      setNextTeamB('B팀');
    } finally {
      setBusy(false);
    }
  }, [contestId, round, nextTeamA, nextTeamB]);

  if (!currentRoundId || !round) {
    return (
      <section className="contest-detail-section rm-leader-panel">
        <h3 className="contest-detail-section-title">⚔️ 라운드매치 관리</h3>
        <p className="contest-empty-message">콘테스트 개최 후 라운드가 시작됩니다.</p>
      </section>
    );
  }

  return (
    <section className="contest-detail-section rm-leader-panel">
      <h3 className="contest-detail-section-title">
        ⚔️ 라운드 {round.roundNumber} 관리
      </h3>
      <hr className="contest-detail-section-divider" />

      <div className="rm-status-row">
        <span className={`rm-status-badge status-${round.status}`}>
          {round.status === 'voting' && '🗳️ 투표 진행중'}
          {round.status === 'closed' && '🔒 투표 마감'}
          {round.status === 'published' && '📢 결과 공개됨'}
        </span>
      </div>

      <div className="rm-team-edit-grid">
        <label className="rm-field">
          <span>A팀 이름</span>
          <input
            className="contest-detail-add-input"
            value={round.teamAName}
            disabled={round.status !== 'voting'}
            onChange={(e) =>
              setRound((r) => (r ? { ...r, teamAName: e.target.value } : r))
            }
            onBlur={(e) => handleTeamNameChange('teamAName', e.target.value.trim() || 'A팀')}
          />
        </label>
        <label className="rm-field">
          <span>B팀 이름</span>
          <input
            className="contest-detail-add-input"
            value={round.teamBName}
            disabled={round.status !== 'voting'}
            onChange={(e) =>
              setRound((r) => (r ? { ...r, teamBName: e.target.value } : r))
            }
            onBlur={(e) => handleTeamNameChange('teamBName', e.target.value.trim() || 'B팀')}
          />
        </label>
      </div>

      <div className="rm-progress-card">
        <div className="rm-progress-head">
          <span>투표 진행</span>
          <strong>
            {voteStats.voted.length} / {voteStats.total}명 ({voteStats.progress}%)
          </strong>
        </div>
        <div className="rm-progress-bar">
          <div className="rm-progress-fill" style={{ width: `${voteStats.progress}%` }} />
        </div>
        <div className="rm-vote-counts">
          <span>{round.teamAName}: {voteStats.votesA}표</span>
          <span>{round.teamBName}: {voteStats.votesB}표</span>
        </div>
      </div>

      <div className="rm-voter-lists">
        <div className="rm-voter-col">
          <h4>✅ 투표 완료 ({voteStats.voted.length})</h4>
          <ul>
            {voteStats.voted.map((p) => {
              const v = votes.find((x) => participantMatchesRoundVote(p, x));
              const choiceLabel =
                v?.choice === 'A' ? round.teamAName : v?.choice === 'B' ? round.teamBName : '-';
              return (
                <li key={p.uid}>
                  {p.nickname} → {choiceLabel}
                </li>
              );
            })}
            {voteStats.voted.length === 0 && <li className="rm-muted">없음</li>}
          </ul>
        </div>
        <div className="rm-voter-col">
          <h4>⏳ 미투표 ({voteStats.notVoted.length})</h4>
          <ul>
            {voteStats.notVoted.map((p) => (
              <li key={p.uid}>{p.nickname}</li>
            ))}
            {voteStats.notVoted.length === 0 && <li className="rm-muted">전원 투표 완료</li>}
          </ul>
        </div>
      </div>

      <div className="rm-leader-actions">
        {round.status === 'voting' && (
          <button type="button" className="btn btn-warning" disabled={busy} onClick={handleCloseRound}>
            라운드 종료 (투표 마감)
          </button>
        )}
        {round.status === 'closed' && (
          <button type="button" className="btn btn-success" disabled={busy} onClick={handlePublish}>
            결과 공개
          </button>
        )}
        {round.status === 'published' && !ended && (
          <>
            <div className="rm-next-round-form">
              <p className="rm-next-label">다음 라운드 팀 이름</p>
              <div className="rm-team-edit-grid">
                <input
                  className="contest-detail-add-input"
                  placeholder="A팀 / C팀 등"
                  value={nextTeamA}
                  onChange={(e) => setNextTeamA(e.target.value)}
                />
                <input
                  className="contest-detail-add-input"
                  placeholder="B팀 / D팀 등"
                  value={nextTeamB}
                  onChange={(e) => setNextTeamB(e.target.value)}
                />
              </div>
            </div>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleNextRound}>
              다음 라운드 시작
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={onEndContest}>
              콘테스트 종료
            </button>
          </>
        )}
      </div>

      {allRounds.length > 0 && (
        <div className="rm-history-mini">
          <h4>📜 라운드 기록</h4>
          <ul>
            {allRounds.map((r) => (
              <li key={r.id}>
                R{r.roundNumber}: {r.teamAName} vs {r.teamBName}
                {r.status === 'published' && r.winnerTeamName && (
                  <span className="rm-history-result"> → {r.winnerTeamName}</span>
                )}
                {r.status !== 'published' && (
                  <span className="rm-muted"> ({r.status === 'voting' ? '진행중' : '마감'})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default RoundMatchLeaderPanel;
