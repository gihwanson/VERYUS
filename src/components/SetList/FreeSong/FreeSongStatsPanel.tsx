import React, { useMemo, useState } from 'react';
import type { SetListData } from '../types';
import { formatBuskingSessionLabel } from '../buskingSessionUtils';
import { getFreeSongParticipants } from '../BuskingMember/buskingParticipantsUtils';
import { useFreeSongLineup, useGlobalFreeSongStats } from './useFreeSongLineup';
import {
  buildRosterSessionStats,
  collectCompletedSongsForMember,
  computeStatsFromLineup,
  type CompletedMemberSong,
} from './freeSongStatsUtils';
import { formatMembers, FreeSongEmptyState } from './FreeSongShared';

interface FreeSongStatsPanelProps {
  activeSetList: SetListData | null;
  setLists?: SetListData[];
  canManage?: boolean;
  userUid?: string;
  userNickname?: string;
  userRole?: string | null;
}

function songMeta(song: CompletedMemberSong, showSession: boolean): string {
  const members = formatMembers(song.members);
  if (showSession && song.sessionLabel) {
    return members ? `${song.sessionLabel} · ${members}` : song.sessionLabel;
  }
  return members;
}

const MemberStatsList: React.FC<{
  rows: [string, number][];
  songsFor: (nickname: string) => CompletedMemberSong[];
  expandedNickname: string | null;
  onToggle: (nickname: string) => void;
  showSession: boolean;
}> = ({ rows, songsFor, expandedNickname, onToggle, showSession }) => (
  <div className="free-song-stats-list">
    {rows.map(([nickname, count], index) => {
      const open = expandedNickname === nickname;
      const songs = open ? songsFor(nickname) : [];
      return (
        <div key={nickname}>
          <button
            type="button"
            className={`free-song-stats-row${open ? ' free-song-stats-row--open' : ''}`}
            aria-expanded={open}
            onClick={() => onToggle(nickname)}
          >
            <span className="free-song-stats-rank">{index + 1}</span>
            <span className="free-song-stats-name">{nickname}</span>
            <span className="free-song-stats-count">{count}곡</span>
          </button>
          {open && (
            songs.length === 0 ? (
              <p className="free-song-empty-sub" style={{ margin: '6px 8px 0' }}>완료한 곡이 없습니다.</p>
            ) : (
              <ul className="free-song-stats-songs">
                {songs.map((song) => {
                  const meta = songMeta(song, showSession);
                  return (
                    <li key={song.key} className="free-song-stats-song">
                      <div className="free-song-stats-song__title">{song.title}</div>
                      {meta ? <div className="free-song-stats-song__meta">{meta}</div> : null}
                    </li>
                  );
                })}
              </ul>
            )
          )}
        </div>
      );
    })}
  </div>
);

const FreeSongStatsPanel: React.FC<FreeSongStatsPanelProps> = ({
  activeSetList,
  setLists = [],
  canManage = false,
  userUid,
  userNickname,
  userRole,
}) => {
  const { globalStats, loading: globalLoading } = useGlobalFreeSongStats();
  const { actionLoading, resetSessionStats } = useFreeSongLineup(activeSetList?.id, activeSetList, {
    uid: userUid,
    nickname: userNickname,
    role: userRole,
  });

  const [confirmReset, setConfirmReset] = useState(false);
  const [expandedSessionMember, setExpandedSessionMember] = useState<string | null>(null);
  const [expandedGlobalMember, setExpandedGlobalMember] = useState<string | null>(null);

  const completedStats = useMemo(
    () => computeStatsFromLineup(activeSetList?.freeSongLineup),
    [activeSetList?.freeSongLineup]
  );

  const rosterSessionStats = useMemo(() => {
    const participants = getFreeSongParticipants(activeSetList);
    return buildRosterSessionStats(participants, completedStats);
  }, [activeSetList, completedStats]);

  const hasSessionStats = rosterSessionStats.some(([, count]) => count > 0);

  const handleResetSession = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const ok = await resetSessionStats(activeSetList?.freeSongLineup);
    if (ok === true) {
      setConfirmReset(false);
    } else if (ok !== 'busy') {
      alert('세션 통계 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  if (!activeSetList) {
    return (
      <FreeSongEmptyState
        title="활성 버스킹 세션이 없습니다."
        subtitle="세션이 시작되면 통계를 확인할 수 있습니다."
      />
    );
  }

  if (globalLoading) {
    return <FreeSongEmptyState title="통계 불러오는 중…" />;
  }

  const participants = getFreeSongParticipants(activeSetList);

  return (
    <div className="free-song-panel">
      <div className="setlist-manage-panel">
        <h2 className="setlist-manage-heading free-song-heading">통계</h2>
        <p className="setlist-manage-sub free-song-desc">
          진행 순서에서 <strong>완료</strong> 처리된 곡이 통계에 반영됩니다. 듀엣·합창은 참여 멤버 각각 1곡으로 집계됩니다.
        </p>
      </div>

      <div className="setlist-manage-panel">
        <div className="free-song-stats-header">
          <h3 className="free-song-section-title">이번 세션 · 참여 멤버</h3>
          {canManage && (
            <div className="free-song-stats-reset">
              {confirmReset && (
                <p className="free-song-stats-reset__hint">
                  완료 기록이 삭제되고 이번 세션 통계가 0이 됩니다. 누적 통계는 유지됩니다.
                </p>
              )}
              <button
                type="button"
                className={`free-song-btn free-song-btn--reset${confirmReset ? ' free-song-btn--cancel' : ''}`}
                disabled={actionLoading || !hasSessionStats}
                onClick={() => void handleResetSession()}
              >
                {actionLoading ? '처리 중…' : confirmReset ? '초기화 확인' : '세션 초기화'}
              </button>
              {confirmReset && (
                <button
                  type="button"
                  className="free-song-btn free-song-btn--ghost"
                  disabled={actionLoading}
                  onClick={() => setConfirmReset(false)}
                >
                  취소
                </button>
              )}
            </div>
          )}
        </div>
        <p className="free-song-desc free-song-desc--admin">
          버스킹에 편성된 멤버별 완료 곡 수입니다. 이름을 누르면 이번 세션에서 완료한 곡이 펼쳐집니다.
        </p>
        {participants.length === 0 ? (
          <p className="free-song-empty-sub">아직 참가 멤버가 편성되지 않았습니다.</p>
        ) : (
          <MemberStatsList
            rows={rosterSessionStats}
            expandedNickname={expandedSessionMember}
            showSession={false}
            onToggle={(nickname) =>
              setExpandedSessionMember((current) => (current === nickname ? null : nickname))
            }
            songsFor={(nickname) =>
              collectCompletedSongsForMember(
                [{ sessionId: activeSetList.id, lineup: activeSetList.freeSongLineup }],
                nickname
              )
            }
          />
        )}
      </div>

      <div className="setlist-manage-panel">
        <h3 className="free-song-section-title">전체 누적</h3>
        <p className="free-song-desc free-song-desc--admin">
          지금까지 자유곡 버스킹에서 완료한 누적 곡 수입니다. 이름을 누르면 완료한 곡이 모두 펼쳐집니다.
        </p>
        {Object.keys(globalStats).length === 0 ? (
          <p className="free-song-empty-sub">아직 누적 통계가 없습니다.</p>
        ) : (
          <MemberStatsList
            rows={buildRosterSessionStats(Object.keys(globalStats), globalStats)}
            expandedNickname={expandedGlobalMember}
            showSession
            onToggle={(nickname) =>
              setExpandedGlobalMember((current) => (current === nickname ? null : nickname))
            }
            songsFor={(nickname) =>
              collectCompletedSongsForMember(
                setLists.map((list) => ({
                  sessionId: list.id,
                  sessionLabel: formatBuskingSessionLabel(list),
                  lineup: list.freeSongLineup,
                })),
                nickname
              )
            }
          />
        )}
      </div>
    </div>
  );
};

export default FreeSongStatsPanel;
