import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  GAME_ID,
  type DefenseLeaderboardEntry,
  type DefensePlayer,
} from '../../utils/veryusDefense/constants';
import { getGradeEmoji } from '../../utils/gradeDisplay';

const MEDALS = ['🥇', '🥈', '🥉'];

type SortKey = 'totalKills' | 'totalCapitalEarned' | 'roundWins' | 'bossKills';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'totalKills', label: '처치' },
  { key: 'totalCapitalEarned', label: '누적 자본' },
  { key: 'roundWins', label: '라운드 승리' },
  { key: 'bossKills', label: '보스 처치' },
];

type Props = {
  myUid: string;
  player: DefensePlayer | null;
};

const VeryusDefenseLeaderboard: React.FC<Props> = ({ myUid, player }) => {
  const [sortKey, setSortKey] = useState<SortKey>('totalKills');
  const [entries, setEntries] = useState<DefenseLeaderboardEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'games', GAME_ID, 'players'),
      orderBy(sortKey, 'desc'),
      limit(30)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        setEntries(
          snap.docs.map((d, index) => {
            const data = d.data() as Record<string, unknown>;
            const storedNick = String(data.nickname || '').trim();
            return {
              uid: d.id,
              nickname: storedNick || '알 수 없음',
              grade: data.grade as string | undefined,
              totalKills: Number(data.totalKills) || 0,
              totalCapitalEarned: Number(data.totalCapitalEarned) || 0,
              roundWins: Number(data.roundWins) || 0,
              bossKills: Number(data.bossKills) || 0,
              totalDeploys: Number(data.totalDeploys) || 0,
              rank: index + 1,
            };
          })
        );
      },
      (err) => {
        console.error('랭킹 불러오기 실패:', err);
        setLoadError('랭킹을 불러오지 못했습니다.');
      }
    );
    return () => unsub();
  }, [sortKey]);

  const myInList = useMemo(
    () => (myUid ? entries.find((e) => e.uid === myUid) : undefined),
    [entries, myUid]
  );

  const mySticky = useMemo(() => {
    if (!myUid || !player || myInList) return null;
    return {
      uid: myUid,
      nickname: player.nickname,
      totalKills: player.totalKills,
      totalCapitalEarned: player.totalCapitalEarned,
      roundWins: player.roundWins,
      bossKills: player.bossKills,
      value:
        sortKey === 'totalCapitalEarned'
          ? player.totalCapitalEarned
          : player[sortKey],
    };
  }, [myInList, myUid, player, sortKey]);

  const formatValue = (key: SortKey, entry: Pick<DefenseLeaderboardEntry, SortKey>) =>
    key === 'totalCapitalEarned' ? entry.totalCapitalEarned.toLocaleString() : entry[key];

  return (
    <section className="vd-leaderboard-panel">
      <p className="vd-action-desc">
        협동전 기여도 랭킹입니다. 패배해도 누적 기록은 유지됩니다.
      </p>
      <div className="vd-leaderboard-tabs">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={sortKey === opt.key ? 'active' : ''}
            onClick={() => setSortKey(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loadError && <p className="vd-leaderboard-empty vd-leaderboard-empty--error">{loadError}</p>}

      {!loadError && mySticky && (
        <div className="vd-leaderboard-my-strip">
          <span className="vd-leaderboard-my-label">내 기록 (30위 밖)</span>
          <span className="vd-leaderboard-my-value">
            {sortKey === 'totalCapitalEarned'
              ? mySticky.value.toLocaleString()
              : mySticky.value}
          </span>
        </div>
      )}

      <ol className="vd-leaderboard-list">
        {!loadError && entries.length === 0 && (
          <li className="vd-leaderboard-empty">아직 기록이 없습니다.</li>
        )}
        {entries.map((entry) => (
          <li
            key={entry.uid}
            className={`vd-leaderboard-row${entry.uid === myUid ? ' vd-leaderboard-row--me' : ''}`}
          >
            <span className="vd-leaderboard-rank">
              {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
            </span>
            <span className="vd-leaderboard-name">
              {getGradeEmoji(entry.grade)} {entry.nickname}
              {entry.uid === myUid ? ' (나)' : ''}
            </span>
            <span className="vd-leaderboard-value">{formatValue(sortKey, entry)}</span>
          </li>
        ))}
      </ol>

      {!loadError && myInList && (
        <p className="vd-leaderboard-my-rank">
          내 순위: <strong>{myInList.rank}위</strong> ({SORT_OPTIONS.find((o) => o.key === sortKey)?.label})
        </p>
      )}
    </section>
  );
};

export default VeryusDefenseLeaderboard;
