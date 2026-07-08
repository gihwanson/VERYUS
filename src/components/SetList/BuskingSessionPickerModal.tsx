import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { SetListData } from './types';
import { formatBuskingSessionLabel } from './buskingSessionUtils';

interface BuskingSessionPickerModalProps {
  open: boolean;
  sessions: SetListData[];
  title?: string;
  onSelect: (sessionId: string) => void;
  onClose?: () => void;
}

const BuskingSessionPickerModal: React.FC<BuskingSessionPickerModalProps> = ({
  open,
  sessions,
  title = '버스킹 선택',
  onSelect,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="busking-member-modal-backdrop" role="presentation">
      <div
        className="busking-member-modal busking-session-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="busking-session-picker-title"
      >
        <div className="busking-member-modal__header">
          <h3 id="busking-session-picker-title" className="busking-member-modal__title">
            {title}
          </h3>
          {onClose && (
            <button type="button" className="busking-member-modal__close" onClick={onClose} aria-label="닫기">
              <X size={20} />
            </button>
          )}
        </div>
        <p className="busking-session-picker__desc">
          오늘 여러 곳에서 버스킹이 진행 중입니다. 참가할 버스킹을 선택해 주세요.
        </p>
        <div className="busking-member-modal__body">
          {sessions.length === 0 ? (
            <p className="busking-member-modal__status">선택할 수 있는 버스킹이 없습니다.</p>
          ) : (
            <ul className="busking-member-modal__list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className="busking-member-modal__item"
                    onClick={() => session.id && onSelect(session.id)}
                  >
                    <span className="busking-member-modal__item-name">{formatBuskingSessionLabel(session)}</span>
                    {session.venueLabel && (
                      <span className="busking-member-modal__item-meta">{session.venueLabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

interface BuskingSessionCreateModalProps {
  open: boolean;
  bootstrapping?: boolean;
  error?: string | null;
  onConfirm: (venueLabel: string) => void;
  onClose?: () => void;
}

export const BuskingSessionCreateModal: React.FC<BuskingSessionCreateModalProps> = ({
  open,
  bootstrapping = false,
  error,
  onConfirm,
  onClose,
}) => {
  const [venue, setVenue] = useState('');

  useEffect(() => {
    if (open) setVenue('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = venue.trim();
    if (!trimmed) {
      alert('현장명을 입력해 주세요.');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="busking-member-modal-backdrop" role="presentation">
      <div
        className="busking-member-modal busking-session-create"
        role="dialog"
        aria-modal="true"
        aria-labelledby="busking-session-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="busking-member-modal__header">
          <h3 id="busking-session-create-title" className="busking-member-modal__title">
            새 버스킹 열기
          </h3>
          {onClose && (
            <button type="button" className="busking-member-modal__close" onClick={onClose} aria-label="닫기">
              <X size={20} />
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="busking-session-create__form">
          <p className="busking-session-picker__desc">
            현장명을 입력하고 버스킹을 시작하세요. 다른 조장의 버스킹과 독립적으로 운영됩니다.
          </p>
          <label className="busking-session-create__label" htmlFor="busking-venue-input">
            현장명
          </label>
          <input
            id="busking-venue-input"
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="예: 홍대 버스킹존, 강남역 11번 출구"
            className="busking-member-modal__search-input busking-session-create__input"
            autoFocus
            maxLength={60}
          />
          {error && <p className="busking-session-create__error">{error}</p>}
          <div className="busking-member-modal__footer busking-session-create__footer">
            {onClose && (
              <button type="button" className="free-song-btn free-song-btn--ghost" onClick={onClose} disabled={bootstrapping}>
                취소
              </button>
            )}
            <button type="submit" className="free-song-btn free-song-btn--submit" disabled={bootstrapping}>
              {bootstrapping ? '만드는 중…' : '버스킹 시작'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BuskingSessionPickerModal;
