import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ApprovedSong } from '../../ApprovedSongsUtils';
import { formatMembers, SongRow } from './FreeSongShared';

function filterAvailableSongs(songs: ApprovedSong[], query: string): ApprovedSong[] {
  const q = query.trim().toLowerCase();
  if (!q) return songs;
  return songs.filter((song) => {
    const title = (song.title || '').toLowerCase();
    const titleNoSpace = (song.titleNoSpace || '').toLowerCase();
    const members = formatMembers(song.members).toLowerCase();
    return title.includes(q) || titleNoSpace.includes(q) || members.includes(q);
  });
}

interface FreeSongSubmitModalProps {
  open: boolean;
  songs: ApprovedSong[];
  totalApprovedCount: number;
  quotaSubmissionCount: number;
  submissionLimit: number;
  actionLoading: boolean;
  canSubmitMore: boolean;
  onClose: () => void;
  onSubmit: (song: ApprovedSong) => Promise<void>;
}

const FreeSongSubmitModal: React.FC<FreeSongSubmitModalProps> = ({
  open,
  songs,
  totalApprovedCount,
  quotaSubmissionCount,
  submissionLimit,
  actionLoading,
  canSubmitMore,
  onClose,
  onSubmit,
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const filtered = useMemo(() => filterAvailableSongs(songs, search), [songs, search]);

  if (!open) return null;

  return (
    <div className="busking-member-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="busking-member-modal free-song-submit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-song-submit-modal-title"
      >
        <div className="busking-member-modal__header">
          <h3 id="free-song-submit-modal-title" className="busking-member-modal__title">
            합격곡 전송
          </h3>
          <button type="button" className="busking-member-modal__close" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="busking-member-modal__search">
          <Search size={18} className="busking-member-modal__search-icon" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="곡 제목·멤버 검색"
            className="busking-member-modal__search-input"
            autoFocus
          />
        </div>

        <div className="busking-member-modal__body free-song-submit-modal__body">
          {filtered.length === 0 ? (
            <p className="busking-member-modal__status">
              {songs.length === 0 ? '전송 가능한 합격곡이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <div className="free-song-list free-song-submit-modal__list">
              {filtered.map((song) => (
                <SongRow
                  key={song.id}
                  title={song.title}
                  members={song.members}
                  action={
                    <button
                      type="button"
                      className="free-song-btn free-song-btn--submit"
                      disabled={actionLoading || !canSubmitMore}
                      onClick={() => void onSubmit(song)}
                    >
                      전송
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="busking-member-modal__footer">
          <span className="busking-member-modal__count">
            내 합격곡 {totalApprovedCount}곡 · {quotaSubmissionCount}/{submissionLimit}
            {search.trim() ? ` · 검색 ${filtered.length}곡` : ''}
          </span>
          <div className="busking-member-modal__actions">
            <button type="button" className="free-song-btn free-song-btn--ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FreeSongSubmitModal;
