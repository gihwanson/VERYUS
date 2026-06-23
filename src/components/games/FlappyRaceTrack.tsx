import React, { useMemo } from 'react';
import type { FlappyActiveSession } from '../../utils/flappyBirdSessions';

interface Milestone {
  uid: string;
  nickname: string;
  score: number;
  isMe?: boolean;
}

interface FlappyRaceTrackProps {
  trackMax: number;
  myScore: number;
  ghostScore: number | null;
  ghostLabel?: string;
  activeSessions: FlappyActiveSession[];
  milestones: Milestone[];
  myUid?: string;
  showLive: boolean;
}

const pct = (score: number, max: number): number =>
  max <= 0 ? 0 : Math.min(100, Math.max(0, (score / max) * 100));

const FlappyRaceTrack: React.FC<FlappyRaceTrackProps> = ({
  trackMax,
  myScore,
  ghostScore,
  ghostLabel = '나의 분신',
  activeSessions,
  milestones,
  myUid,
  showLive,
}) => {
  const liveOthers = useMemo(
    () => activeSessions.filter((s) => s.uid !== myUid),
    [activeSessions, myUid]
  );

  return (
    <div className="flappy-race-track" aria-label="실시간 진행 현황">
      <div className="flappy-race-track-head">
        <span className="flappy-race-track-title">🏁 목표 지점 현황</span>
        <span className="flappy-race-track-max">최대 {trackMax}점</span>
      </div>
      <div className="flappy-race-track-bar">
        <div className="flappy-race-track-line" />
        {milestones.map((m) => (
          <span
            key={`ms-${m.uid}`}
            className={`flappy-race-milestone${m.isMe ? ' flappy-race-milestone--me' : ''}`}
            style={{ left: `${pct(m.score, trackMax)}%` }}
            title={`${m.nickname} 최고 ${m.score}점`}
          >
            <span className="flappy-race-milestone-tick" />
            <span className="flappy-race-milestone-label">{m.score}</span>
          </span>
        ))}
        {showLive &&
          liveOthers.map((s) => (
            <span
              key={`live-${s.uid}`}
              className="flappy-race-marker flappy-race-marker--live"
              style={{ left: `${pct(s.score, trackMax)}%` }}
              title={`${s.nickname} 플레이 중 · ${s.score}점`}
            >
              🐦
            </span>
          ))}
        {showLive && ghostScore != null && ghostScore > 0 && (
          <span
            className="flappy-race-marker flappy-race-marker--ghost"
            style={{ left: `${pct(ghostScore, trackMax)}%` }}
            title={`${ghostLabel} · ${Math.round(ghostScore)}점`}
          >
            👤
          </span>
        )}
        {showLive && (
          <span
            className="flappy-race-marker flappy-race-marker--me"
            style={{ left: `${pct(myScore, trackMax)}%` }}
            title={`나 · ${myScore}점`}
          >
            ⭐
          </span>
        )}
      </div>
      {liveOthers.length > 0 && (
        <ul className="flappy-race-live-list">
          {liveOthers.slice(0, 5).map((s) => (
            <li key={s.uid}>
              <span className="flappy-race-live-dot" aria-hidden />
              {s.nickname} · {s.score}점 진행 중
            </li>
          ))}
        </ul>
      )}
      {milestones.length > 0 && liveOthers.length === 0 && !showLive && (
        <p className="flappy-race-hint">다른 플레이어의 최고 기록 지점이 표시됩니다.</p>
      )}
    </div>
  );
};

export default FlappyRaceTrack;
