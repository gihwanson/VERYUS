import React, { useMemo, useState } from 'react';
import { Download, Music, Search } from 'lucide-react';

export type MyPageApprovedSong = {
  id: string;
  title: string;
  members: string[];
  createdAt?: { seconds?: number };
  audioUrl?: string;
  fileName?: string;
};

type Props = {
  songs: MyPageApprovedSong[];
  rankedCount?: number | null;
  getSongGrade: (song: MyPageApprovedSong) => string;
};

function lineupLabel(members: string[]): string {
  if (members.length <= 1) return '솔로';
  if (members.length === 2) return '듀엣';
  return '합창';
}

function formatSongDate(createdAt?: { seconds?: number }): string {
  if (!createdAt?.seconds) return '';
  return new Date(createdAt.seconds * 1000).toLocaleDateString('ko-KR');
}

const MyPageApprovedSongs: React.FC<Props> = ({ songs, rankedCount, getSongGrade }) => {
  const [queryText, setQueryText] = useState('');

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((song) => {
      const title = String(song.title || '').toLowerCase();
      const members = (song.members || []).join(' ').toLowerCase();
      return title.includes(q) || members.includes(q);
    });
  }, [queryText, songs]);

  if (songs.length === 0) {
    return (
      <div className="mypage-approved-empty">
        <Music size={44} className="mypage-approved-empty-icon" aria-hidden />
        <h3>합격곡이 없습니다</h3>
        <p>합격 처리된 곡이 여기에 모입니다.</p>
      </div>
    );
  }

  return (
    <div className="mypage-approved">
      <div className="mypage-approved-head">
        <div>
          <div className="mypage-approved-count">목록 {songs.length}곡</div>
          <p className="mypage-approved-note">
            솔로·듀엣처럼 멤버가 다르면 같은 제목도 각각 보여 줍니다.
            {rankedCount != null ? ` 순위 집계는 같은 제목 ${rankedCount}곡입니다.` : ' 순위 집계는 같은 제목을 1곡으로 셉니다.'}
          </p>
        </div>
        <label className="mypage-approved-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="곡 제목·멤버 검색"
            aria-label="합격곡 검색"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="mypage-approved-empty-filter">검색 결과가 없습니다.</p>
      ) : (
        <ul className="mypage-approved-list">
          {filtered.map((song) => {
            const members = song.members.map((m) => String(m || '').trim()).filter(Boolean);
            return (
              <li key={song.id} className="mypage-approved-card">
                <div className="mypage-approved-grade" aria-hidden>
                  {getSongGrade(song)}
                </div>
                <div className="mypage-approved-body">
                  <div className="mypage-approved-title-row">
                    <h3 className="mypage-approved-title">{song.title}</h3>
                    <span className="mypage-approved-badge">{lineupLabel(members)}</span>
                  </div>
                  <div className="mypage-approved-meta">
                    {members.length > 0 ? members.join(', ') : '멤버 정보 없음'}
                    {song.createdAt?.seconds ? ` · ${formatSongDate(song.createdAt)}` : ''}
                  </div>
                  {song.audioUrl ? (
                    <audio className="mypage-approved-audio" controls preload="none" src={song.audioUrl}>
                      오디오를 재생할 수 없습니다.
                    </audio>
                  ) : null}
                </div>
                {song.audioUrl ? (
                  <a
                    className="mypage-approved-download"
                    href={song.audioUrl}
                    download={song.fileName || `${song.title}.mp3`}
                    title="녹음 파일 다운로드"
                  >
                    <Download size={16} />
                    <span>받기</span>
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default MyPageApprovedSongs;
