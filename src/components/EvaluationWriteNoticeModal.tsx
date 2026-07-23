import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import ModalPortal from './ModalPortal';
import '../styles/EvaluationWriteNoticeModal.css';

const NOTICE_HIDE_STORAGE_KEY = 'veryus_eval_write_notice_hide_until';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 일주일간 안내 숨김이 유효한지 */
export function isEvalWriteNoticeHidden(): boolean {
  try {
    const raw = localStorage.getItem(NOTICE_HIDE_STORAGE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) {
      localStorage.removeItem(NOTICE_HIDE_STORAGE_KEY);
      return false;
    }
    if (Date.now() >= until) {
      localStorage.removeItem(NOTICE_HIDE_STORAGE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 지금부터 일주일간 안내 모달 숨김 */
export function hideEvalWriteNoticeForWeek(): void {
  try {
    localStorage.setItem(NOTICE_HIDE_STORAGE_KEY, String(Date.now() + WEEK_MS));
  } catch {
    // ignore quota / private mode
  }
}

const NOTICE_ITEMS = [
  {
    title: "전문가가 아닌 '기획자'의 시선으로 봅니다.",
    body: '개인의 가창력이나 테크닉보다는, 현장에서 관객들의 반응을 이끌어낼 수 있는 곡인지를 최우선으로 판단합니다.',
  },
  {
    title: '피드백이 다소 날카로울 수 있습니다.',
    body: '무대 완성도를 위한 피드백이다 보니 조금 직설적일 수 있습니다. 반박 시 여러분의 의견이 다 맞으며, 저 역시 완벽해서 조언하는 것이 아니니 너무 무겁게 받아들이지 않으셨으면 합니다.',
  },
  {
    title: '상처받거나 과도하게 몰입하지 말아주세요.',
    body: '이 시스템은 여러분을 평가절하하려는 목적이 아닙니다. 팀의 더 나은 무대를 위한 과정일 뿐이니, 가벼운 마음과 진지한 태도를 균형 있게 유지하며 즐겁게 임해주시면 감사하겠습니다.',
  },
] as const;

interface EvaluationWriteNoticeModalProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const EvaluationWriteNoticeModal: React.FC<EvaluationWriteNoticeModalProps> = ({
  open,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const confirmId = useId();
  const hideWeekId = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [hideForWeek, setHideForWeek] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setHideForWeek(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleConfirm = () => {
    if (!confirmed || loading) return;
    if (hideForWeek) {
      hideEvalWriteNoticeForWeek();
    }
    onConfirm();
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="modal-overlay eval-write-notice-modal-overlay"
        role="presentation"
        onClick={() => {
          if (!loading) onClose();
        }}
      >
      <div
        className="message-modal eval-write-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-write-notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="eval-write-notice-modal__header">
          <div className="eval-write-notice-modal__title-row">
            <AlertCircle size={22} aria-hidden />
            <h2 id="eval-write-notice-title">평가 게시판 안내</h2>
          </div>
          <button
            type="button"
            className="eval-write-notice-modal__close"
            onClick={onClose}
            disabled={loading}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </header>

        <div className="eval-write-notice-modal__body">
          <div className="eval-write-notice-modal__letter">
            <p className="eval-write-notice-modal__greeting">안녕하세요, 너래입니다.</p>
            <p>
              &ldquo;노래도 전문적으로 하는 사람이 아닌데 왜 평가를 하지?&rdquo;라는 의문이 드실 수
              있습니다. 저 역시 제가 누구를 감히 평가할 실력이 아니라는 점을 잘 알고 있기에 늘
              조심스럽습니다.
            </p>
            <p>
              그럼에도 평가를 진행하는 이유는 단 하나입니다. 누구나 들어올 수 있는 우리 팀이지만,
              무대만큼은 책임감 있게 만들어가고 싶기 때문입니다. 누군가는 악역을 맡아서라도 중심을
              잡아주어야 우리 모두가 즐겁고, 관객도 만족하는 버스킹을 만들 수 있다는 신념으로
              자처하게 되었습니다.
            </p>
            <p className="eval-write-notice-modal__bridge">
              평가를 받아들이실 때 아래 내용만 꼭 참고해 주셨으면 합니다.
            </p>
          </div>

          <ol className="eval-write-notice-modal__list">
            {NOTICE_ITEMS.map((item, index) => (
              <li key={item.title} className="eval-write-notice-modal__item">
                <span className="eval-write-notice-modal__num" aria-hidden>
                  {index + 1}
                </span>
                <div className="eval-write-notice-modal__item-text">
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="eval-write-notice-modal__checks">
            <label htmlFor={confirmId} className="eval-write-notice-modal__check">
              <input
                id={confirmId}
                type="checkbox"
                checked={confirmed}
                disabled={loading}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>해당 안내를 확인하셨습니까?</span>
            </label>
            <label htmlFor={hideWeekId} className="eval-write-notice-modal__check eval-write-notice-modal__check--secondary">
              <input
                id={hideWeekId}
                type="checkbox"
                checked={hideForWeek}
                disabled={loading}
                onChange={(e) => setHideForWeek(e.target.checked)}
              />
              <span>일주일 동안 해당 안내 보지 않기</span>
            </label>
          </div>
        </div>

        <footer className="eval-write-notice-modal__footer">
          <button
            type="button"
            className="eval-write-notice-modal__btn eval-write-notice-modal__btn--ghost"
            onClick={onClose}
            disabled={loading}
          >
            취소
          </button>
          <button
            type="button"
            className="eval-write-notice-modal__btn eval-write-notice-modal__btn--primary"
            onClick={handleConfirm}
            disabled={!confirmed || loading}
          >
            {loading ? '등록 중…' : '확인하고 등록하기'}
          </button>
        </footer>
      </div>
    </div>
    </ModalPortal>
  );
};

export default EvaluationWriteNoticeModal;
