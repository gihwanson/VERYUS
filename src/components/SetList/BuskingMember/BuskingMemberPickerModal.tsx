import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { filterBuskingMembers, getBuskingMemberDisplayMeta, useBuskingMemberList } from './useBuskingMemberList';

interface BuskingMemberPickerModalProps {
  open: boolean;
  initialSelected: string[];
  onClose: () => void;
  onConfirm: (selected: string[]) => void | Promise<void>;
  title?: string;
  saving?: boolean;
}

const BuskingMemberPickerModal: React.FC<BuskingMemberPickerModalProps> = ({
  open,
  initialSelected,
  onClose,
  onConfirm,
  title = '참가 멤버 선택',
  saving = false,
}) => {
  const { members, loading, error, reload } = useBuskingMemberList(open);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setDraft(initialSelected);
      setSearch('');
    }
  }, [open, initialSelected]);

  const filtered = useMemo(() => filterBuskingMembers(members, search), [members, search]);
  const draftSet = useMemo(() => new Set(draft), [draft]);

  const toggle = (nickname: string) => {
    if (saving) return;
    setDraft((prev) =>
      prev.includes(nickname) ? prev.filter((n) => n !== nickname) : [...prev, nickname]
    );
  };

  if (!open) return null;

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  return (
    <div className="busking-member-modal-backdrop" onClick={handleClose} role="presentation">
      <div
        className="busking-member-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="busking-member-modal-title"
      >
        <div className="busking-member-modal__header">
          <h3 id="busking-member-modal-title" className="busking-member-modal__title">
            {title}
          </h3>
          <button
            type="button"
            className="busking-member-modal__close"
            onClick={handleClose}
            disabled={saving}
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
            placeholder="닉네임 검색"
            className="busking-member-modal__search-input"
            enterKeyHint="search"
            autoComplete="off"
            disabled={saving}
          />
        </div>

        <div className="busking-member-modal__body">
          {loading ? (
            <p className="busking-member-modal__status">멤버 목록 불러오는 중…</p>
          ) : error ? (
            <div className="busking-member-modal__status">
              <p>{error}</p>
              <button type="button" className="free-song-btn free-song-btn--submit" onClick={reload}>
                다시 시도
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="busking-member-modal__status">검색 결과가 없습니다.</p>
          ) : (
            <ul className="busking-member-modal__list">
              {filtered.map((member) => {
                const selected = draftSet.has(member.nickname);
                const meta = getBuskingMemberDisplayMeta(member.grade, member.role);
                return (
                  <li key={member.nickname}>
                    <button
                      type="button"
                      className={`busking-member-modal__item${selected ? ' busking-member-modal__item--selected' : ''}`}
                      onClick={() => toggle(member.nickname)}
                      disabled={saving}
                    >
                      <span className="busking-member-modal__item-name">{member.nickname}</span>
                      {meta && <span className="busking-member-modal__item-meta">{meta}</span>}
                      {selected && <span className="busking-member-modal__check">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="busking-member-modal__footer">
          <span className="busking-member-modal__count">{draft.length}명 선택</span>
          <div className="busking-member-modal__actions">
            <button
              type="button"
              className="free-song-btn free-song-btn--ghost"
              onClick={handleClose}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="button"
              className="free-song-btn free-song-btn--submit"
              disabled={saving}
              onClick={() => void onConfirm(draft.slice().sort((a, b) => a.localeCompare(b, 'ko')))}
            >
              {saving ? '저장 중…' : '확인'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuskingMemberPickerModal;
