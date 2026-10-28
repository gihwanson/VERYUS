import React from 'react';
import { contestTypeLabel } from '../types/contest';
import type { ContestType } from '../types/contest';

export type ContestListItemContest = {
  id: string;
  title: string;
  type: ContestType;
  deadline: { seconds?: number } | null;
  isStarted: boolean;
  ended?: boolean;
  top3?: Array<{ rank: number; name: string; score: number }>;
};

type Props = {
  contest: ContestListItemContest;
  /** 마감·수동 종료 등 목록에서 「종료됨」 섹션에 넣을지 */
  inEndedSection: boolean;
  deadlineText: string;
  onDetail: () => void;
  onParticipate?: () => void;
  /** 최종 제출 완료 시 참여 버튼 대신 표시 */
  finalSubmitted?: boolean;
  onQuickEnd?: () => void;
  showQuickEnd?: boolean;
  rankLabel: (rank: number) => string;
};

const ContestListItem: React.FC<Props> = ({
  contest,
  inEndedSection,
  deadlineText,
  onDetail,
  onParticipate,
  finalSubmitted = false,
  onQuickEnd,
  showQuickEnd,
  rankLabel,
}) => {
  const statusLabel = inEndedSection
    ? '종료됨'
    : contest.isStarted
      ? '개최됨'
      : '대기 중';

  const statusClass = inEndedSection
    ? 'contest-list-card__status--ended'
    : contest.isStarted
      ? 'contest-list-card__status--live'
      : 'contest-list-card__status--waiting';

  return (
    <article
      className={`contest-card contest-list-card${inEndedSection ? ' ended' : ''}`}
    >
      <div className="contest-list-card__body">
        <div className="contest-list-card__header">
          <h4 className="contest-card-title">{contest.title}</h4>
          <span className={`contest-list-card__status ${statusClass}`}>{statusLabel}</span>
        </div>

        {inEndedSection && Array.isArray(contest.top3) && contest.top3.length > 0 && (
          <div className="contest-top3 contest-list-card__top3">
            {contest.top3.map((item) => (
              <span key={item.rank} className={`contest-top3-badge rank-${item.rank}`}>
                {rankLabel(item.rank)} {item.name} ({item.score ? item.score.toFixed(1) : '-'})
              </span>
            ))}
          </div>
        )}

        <div className="contest-list-card__meta">
          <span className="contest-tag type">{contestTypeLabel(contest.type)}</span>
          {!inEndedSection && deadlineText ? (
            <span className="contest-list-card__deadline">마감 {deadlineText}</span>
          ) : null}
        </div>
      </div>

      <div className="contest-list-card__actions contest-buttons">
        {!inEndedSection && finalSubmitted ? (
          <span className="contest-submit-done-note contest-list-card__submit-done" title="제출을 완료하였습니다.">
            제출완료
          </span>
        ) : null}
        {!inEndedSection && !finalSubmitted && onParticipate ? (
          <button type="button" className="contest-button participate" onClick={onParticipate}>
            참여
          </button>
        ) : null}
        <button type="button" className="contest-button detail" onClick={onDetail}>
          상세
        </button>
        {!inEndedSection && showQuickEnd && onQuickEnd ? (
          <button type="button" className="contest-button end" onClick={onQuickEnd}>
            종료
          </button>
        ) : null}
      </div>
    </article>
  );
};

export default ContestListItem;
