import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { getGradeEmoji, getGradeName } from '../utils/gradeDisplay';
import {
  fillMissingContestGradeRanks,
  formatContestGradeHistoryDate,
  formatContestGradeHistoryRank,
  formatContestGradeHistoryType,
  subscribeContestGradeHistory,
  type ContestGradeHistoryRecord,
} from '../utils/contestGradeHistory';

type Props = {
  profileUid: string;
  isOwner: boolean;
};

const MyPageContestGrades: React.FC<Props> = ({ profileUid, isOwner }) => {
  const [records, setRecords] = useState<ContestGradeHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profileUid) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    let cancelled = false;
    const unsub = subscribeContestGradeHistory(
      profileUid,
      (next) => {
        setRecords(next);
        setLoading(false);
        void fillMissingContestGradeRanks(profileUid, next).then((filled) => {
          if (!cancelled) setRecords(filled);
        });
      },
      (err) => {
        console.error('등급전 기록 불러오기 실패:', err);
        setError('등급전 기록을 불러오지 못했습니다.');
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [profileUid]);

  if (loading) {
    return <div className="mypage-contest-grade-empty">등급전 기록을 불러오는 중…</div>;
  }
  if (error) {
    return <div className="mypage-contest-grade-empty">{error}</div>;
  }
  if (records.length === 0) {
    return (
      <div className="mypage-contest-grade-empty">
        <Award size={44} className="mypage-contest-grade-empty-icon" />
        <h3>아직 적용된 등급전이 없습니다</h3>
        <p>결과보기에서 적용하기를 누르면 여기에 기록됩니다.</p>
      </div>
    );
  }

  return (
    <div className="mypage-contest-grade-list">
      <p className="mypage-contest-grade-privacy">
        {isOwner
          ? '이 기록은 본인만 볼 수 있습니다.'
          : '이 기록은 본인과 너래만 볼 수 있습니다.'}
      </p>
      {records.map((record) => {
        const gradeEmoji = getGradeEmoji(record.appliedGrade);
        const scoreLabel = Number.isFinite(record.appliedScore)
          ? `${record.appliedScore.toFixed(1)}점`
          : '-';
        return (
          <article key={record.id} className="mypage-contest-grade-card">
            <header className="mypage-contest-grade-card-head">
              <div>
                <div className="mypage-contest-grade-type">
                  {formatContestGradeHistoryType(record.contestType)}
                </div>
                <h3 className="mypage-contest-grade-title">{record.contestTitle}</h3>
                {record.targetLabel ? (
                  <div className="mypage-contest-grade-stage">{record.targetLabel}</div>
                ) : null}
              </div>
              <div className="mypage-contest-grade-date">
                {formatContestGradeHistoryDate(record.appliedAt)}
              </div>
            </header>
            <div className="mypage-contest-grade-metrics">
              <div className="mypage-contest-grade-metric">
                <span className="mypage-contest-grade-metric-label">받은 등급</span>
                <span className="mypage-contest-grade-metric-value">
                  <span aria-hidden>{gradeEmoji}</span> {getGradeName(record.appliedGrade)}
                </span>
              </div>
              <div className="mypage-contest-grade-metric">
                <span className="mypage-contest-grade-metric-label">적용 점수</span>
                <span className="mypage-contest-grade-metric-value">{scoreLabel}</span>
              </div>
              <div className="mypage-contest-grade-metric">
                <span className="mypage-contest-grade-metric-label">
                  {record.rankedCount != null && record.rankedCount > 0
                    ? `순위 · ${record.rankedCount}팀`
                    : '순위'}
                </span>
                <span className="mypage-contest-grade-metric-value">
                  {formatContestGradeHistoryRank(record.rank)}
                </span>
              </div>
            </div>
            {record.comments.length > 0 ? (
              <div className="mypage-contest-grade-comments">
                <div className="mypage-contest-grade-comments-label">심사 코멘트</div>
                <ul>
                  {record.comments.map((item, index) => (
                    <li key={`${record.id}-${index}`}>
                      <span className="mypage-contest-grade-comment">{item.comment}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mypage-contest-grade-no-comment">남겨진 심사 코멘트가 없습니다.</p>
            )}
          </article>
        );
      })}
    </div>
  );
};

export default MyPageContestGrades;
