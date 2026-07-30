import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { hasBuskingLyrics } from './freeSongLyricsUtils';

interface FreeSongLyricsModalProps {
  open: boolean;
  title: string;
  members?: string[];
  lyrics: string;
  canEdit: boolean;
  saving?: boolean;
  onClose: () => void;
  onSave?: (lyrics: string) => Promise<boolean>;
}

const FreeSongLyricsModal: React.FC<FreeSongLyricsModalProps> = ({
  open,
  title,
  members,
  lyrics,
  canEdit,
  saving = false,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState(lyrics);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(lyrics);
    setEditing(canEdit && !hasBuskingLyrics(lyrics));
  }, [open, lyrics, canEdit]);

  if (!open) return null;

  const busy = saving;
  const handleBackdropClose = () => {
    if (busy) return;
    onClose();
  };

  const handleSave = async () => {
    if (!onSave || busy) return;
    const ok = await onSave(draft);
    if (ok) {
      setEditing(false);
    }
  };

  const memberText = (members ?? []).map((m) => String(m).trim()).filter(Boolean).join(', ');
  const showEmpty = !editing && !hasBuskingLyrics(lyrics);

  return (
    <div className="busking-member-modal-backdrop" onClick={handleBackdropClose} role="presentation">
      <div
        className="busking-member-modal free-song-lyrics-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-song-lyrics-modal-title"
      >
        <div className="busking-member-modal__header">
          <div>
            <h3 id="free-song-lyrics-modal-title" className="busking-member-modal__title">
              {title}
            </h3>
            {memberText ? (
              <p className="free-song-lyrics-modal__members">{memberText}</p>
            ) : null}
          </div>
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

        <div className="busking-member-modal__body free-song-lyrics-modal__body">
          {editing ? (
            <>
              <label className="free-song-lyrics-modal__label" htmlFor="busking-lyrics-input">
                버스킹용 가사
              </label>
              <textarea
                id="busking-lyrics-input"
                className="free-song-lyrics-modal__textarea"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="버스킹에서 볼 가사를 입력하세요. (연습장 가사와는 별도입니다)"
                disabled={busy}
              />
              <p className="free-song-lyrics-modal__hint">
                이 가사는 이번 버스킹 세션용입니다. 연습장 내용과 자동으로 연결되지 않습니다.
              </p>
            </>
          ) : showEmpty ? (
            <p className="free-song-lyrics-modal__empty">아직 등록된 버스킹 가사가 없습니다.</p>
          ) : (
            <pre className="free-song-lyrics-modal__view">{lyrics}</pre>
          )}
        </div>

        <div className="busking-member-modal__footer free-song-lyrics-modal__footer">
          <div className="busking-member-modal__actions">
            {canEdit && !editing && (
              <button
                type="button"
                className="free-song-btn free-song-btn--ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(lyrics);
                  setEditing(true);
                }}
              >
                {hasBuskingLyrics(lyrics) ? '가사 수정' : '가사 등록'}
              </button>
            )}
            {editing && onSave && (
              <button
                type="button"
                className="free-song-btn free-song-btn--submit"
                disabled={busy}
                onClick={() => void handleSave()}
              >
                {busy ? '저장 중…' : '저장'}
              </button>
            )}
            {editing && hasBuskingLyrics(lyrics) && (
              <button
                type="button"
                className="free-song-btn free-song-btn--ghost"
                disabled={busy}
                onClick={() => {
                  setDraft(lyrics);
                  setEditing(false);
                }}
              >
                취소
              </button>
            )}
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

export default FreeSongLyricsModal;
