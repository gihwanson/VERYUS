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
  unlimitedQuota?: boolean;
  actionLoading: boolean;
  canSubmitMore: boolean;
  onClose: () => void;
  onSubmit: (song: ApprovedSong, lyrics: string) => Promise<boolean>;
}

const FreeSongSubmitModal: React.FC<FreeSongSubmitModalProps> = ({
  open,
  songs,
  totalApprovedCount,
  quotaSubmissionCount,
  submissionLimit,
  unlimitedQuota = false,
  actionLoading,
  canSubmitMore,
  onClose,
  onSubmit,
}) => {
  const [search, setSearch] = useState('');
  const [pendingSong, setPendingSong] = useState<ApprovedSong | null>(null);
  const [lyrics, setLyrics] = useState('');

  useEffect(() => {
    if (open) {
      setSearch('');
      setPendingSong(null);
      setLyrics('');
    }
  }, [open]);

  const filtered = useMemo(() => filterAvailableSongs(songs, search), [songs, search]);

  if (!open) return null;

  const busy = actionLoading;
  const handleBackdropClose = () => {
    if (busy) return;
    onClose();
  };

  const handleRequestSubmit = (song: ApprovedSong) => {
    if (busy || !canSubmitMore) return;
    setLyrics('');
    setPendingSong(song);
  };

  const handleConfirmSubmit = async () => {
    if (!pendingSong || busy) return;
    const song = pendingSong;
    const ok = await onSubmit(song, lyrics);
    if (ok) {
      setPendingSong(null);
      setLyrics('');
    }
  };

  return (
    <div className="busking-member-modal-backdrop" onClick={handleBackdropClose} role="presentation">
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
          <button
            type="button"
            className="busking-member-modal__close"
            onClick={handleBackdropClose}
            disabled={busy}
            aria-label="닫기"
          >
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
            enterKeyHint="search"
            autoComplete="off"
            disabled={busy || !!pendingSong}
          />
        </div>

        <div className="busking-member-modal__body free-song-submit-modal__body">
          {pendingSong ? (
            <div className="free-song-submit-confirm">
              <p className="free-song-submit-confirm__title">이 곡을 전송할까요?</p>
              <SongRow title={pendingSong.title} members={pendingSong.members} />
              <label className="free-song-submit-confirm__lyrics-label" htmlFor="free-song-submit-lyrics">
                버스킹용 가사 (선택)
              </label>
              <textarea
                id="free-song-submit-lyrics"
                className="free-song-submit-confirm__lyrics"
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="공연 중 볼 가사를 입력하세요. 나중에 수정할 수도 있습니다."
                disabled={busy}
                rows={8}
              />
              <p className="free-song-submit-confirm__hint">
                연습장 가사와는 별도로, 이번 버스킹용으로만 저장됩니다.
              </p>
              <div className="free-song-submit-confirm__actions">
                <button
                  type="button"
                  className="free-song-btn free-song-btn--ghost"
                  disabled={busy}
                  onClick={() => setPendingSong(null)}
                >
                  뒤로
                </button>
                <button
                  type="button"
                  className="free-song-btn free-song-btn--submit"
                  disabled={busy}
                  onClick={() => void handleConfirmSubmit()}
                >
                  {busy ? '전송 중…' : '전송하기'}
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
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
                      disabled={busy || !canSubmitMore}
                      onClick={() => handleRequestSubmit(song)}
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
            {unlimitedQuota
              ? `전송 가능 ${totalApprovedCount}곡 · 제한 없음`
              : `내 합격곡 ${totalApprovedCount}곡 · ${quotaSubmissionCount}/${submissionLimit}`}
            {search.trim() && !pendingSong ? ` · 검색 ${filtered.length}곡` : ''}
          </span>
          <div className="busking-member-modal__actions">
            <button
              type="button"
              className="free-song-btn free-song-btn--ghost"
              disabled={busy}
              onClick={handleBackdropClose}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FreeSongSubmitModal;
