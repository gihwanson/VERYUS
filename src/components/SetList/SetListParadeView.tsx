import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ParadeEntry } from './paradeUtils';
import { paradeEntryIncludesNickname } from './paradeUtils';
import {
  paradeHapticCelebrate,
  paradeHapticMyTurn,
  paradeHapticNav,
  paradeHapticRemoteSync
} from './paradeHaptics';
import { useParadeFlip } from './useParadeFlip';
import SetListParadeConfetti from './SetListParadeConfetti';
import './styles.css';

interface SetListParadeViewProps {
  entries: ParadeEntry[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  currentUserNickname?: string;
  fullscreen?: boolean;
  withChat?: boolean;
  /** 곡 완료·축하 시 증가 */
  celebrateTrigger?: number;
  /** Firestore 등에서 순서가 바뀌었을 때 증가 */
  orderSyncTrigger?: number;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onTouchEnd?: () => void;
}

const SetListParadeView: React.FC<SetListParadeViewProps> = ({
  entries,
  currentIndex,
  onSelectIndex,
  currentUserNickname = '',
  fullscreen = false,
  withChat = false,
  celebrateTrigger = 0,
  orderSyncTrigger = 0,
  onTouchStart,
  onTouchMove,
  onTouchEnd
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const prevIndexRef = useRef(currentIndex);
  const wasMyTurnRef = useRef(false);
  const prevCelebrateRef = useRef(celebrateTrigger);
  const prevOrderSyncRef = useRef(orderSyncTrigger);

  const [stepDirection, setStepDirection] = useState<'forward' | 'back' | 'idle'>('idle');
  const [orderSyncFlash, setOrderSyncFlash] = useState(false);

  const activeEntry = entries[currentIndex];
  const me = currentUserNickname.trim();
  const progressPct =
    entries.length > 1 ? ((currentIndex + 1) / entries.length) * 100 : 100;
  const layoutKey = entries.map((e) => e.id).join('|');

  useParadeFlip(trackRef, layoutKey);

  const updateStageLight = useCallback(() => {
    const wrap = wrapRef.current;
    const active = activeRef.current;
    if (!wrap || !active) return;
    const wrapRect = wrap.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const centerX = activeRect.left + activeRect.width / 2 - wrapRect.left;
    wrap.style.setProperty('--parade-spot-x', `${centerX}px`);
  }, []);

  useEffect(() => {
    if (currentIndex === prevIndexRef.current) return;
    const forward = currentIndex > prevIndexRef.current;
    setStepDirection(forward ? 'forward' : 'back');
    paradeHapticNav();
    prevIndexRef.current = currentIndex;
    const timer = window.setTimeout(() => setStepDirection('idle'), 520);
    return () => window.clearTimeout(timer);
  }, [currentIndex]);

  useEffect(() => {
    if (celebrateTrigger > prevCelebrateRef.current) {
      paradeHapticCelebrate();
    }
    prevCelebrateRef.current = celebrateTrigger;
  }, [celebrateTrigger]);

  useEffect(() => {
    if (orderSyncTrigger > prevOrderSyncRef.current) {
      paradeHapticRemoteSync();
      setOrderSyncFlash(true);
      const t = window.setTimeout(() => setOrderSyncFlash(false), 700);
      prevOrderSyncRef.current = orderSyncTrigger;
      return () => window.clearTimeout(t);
    }
    prevOrderSyncRef.current = orderSyncTrigger;
  }, [orderSyncTrigger]);

  const isMyTurn = Boolean(
    activeEntry && me && paradeEntryIncludesNickname(activeEntry, me)
  );

  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      paradeHapticMyTurn();
    }
    wasMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
    const t = window.requestAnimationFrame(updateStageLight);
    return () => window.cancelAnimationFrame(t);
  }, [currentIndex, layoutKey, updateStageLight]);

  useEffect(() => {
    const onResize = () => updateStageLight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [updateStageLight]);

  const handleSelect = useCallback(
    (index: number) => {
      onSelectIndex(index);
    },
    [onSelectIndex]
  );

  if (entries.length === 0) return null;

  const nowPlayingLabel = activeEntry
    ? `${currentIndex + 1}번째 · ${activeEntry.bubbleText}`
    : '';

  return (
    <div
      ref={wrapRef}
      className={[
        'setlist-parade-wrap',
        fullscreen ? 'setlist-parade-wrap--fullscreen' : '',
        withChat ? 'setlist-parade-wrap--with-chat' : '',
        orderSyncFlash ? 'setlist-parade-wrap--order-sync' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label="셋리스트 진행 순서"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <SetListParadeConfetti trigger={celebrateTrigger} />

      <div className="setlist-parade-stars" aria-hidden />
      <div className="setlist-parade-stage-light" aria-hidden />

      {orderSyncFlash && (
        <p className="setlist-parade-sync-toast" role="status">
          순서가 업데이트되었어요
        </p>
      )}

      <div
        className="setlist-parade-progress"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={entries.length}
        aria-label={`진행 ${currentIndex + 1}번째 곡`}
      >
        <div className="setlist-parade-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div
        key={currentIndex}
        className={[
          'setlist-parade-now-banner',
          stepDirection === 'forward' ? 'setlist-parade-now-banner--from-right' : '',
          stepDirection === 'back' ? 'setlist-parade-now-banner--from-left' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isMyTurn ? (
          <>
            <span className="setlist-parade-now-badge setlist-parade-now-badge--mine">✨ 내 차례</span>
            <span className="setlist-parade-now-text">{nowPlayingLabel}</span>
          </>
        ) : (
          <span className="setlist-parade-now-text setlist-parade-now-text--solo">{nowPlayingLabel}</span>
        )}
      </div>

      <p className="setlist-parade-hint">
        좌우로 밀거나 아래 버튼으로 순서를 바꿀 수 있어요 · 캐릭터를 눌러도 이동해요
      </p>

      <div
        ref={trackRef}
        className={[
          'setlist-parade-track',
          stepDirection === 'forward' ? 'setlist-parade-track--step-forward' : '',
          stepDirection === 'back' ? 'setlist-parade-track--step-back' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {entries.map((entry, index) => {
          const isSpotlight = index === currentIndex;
          const isNext = index === currentIndex + 1;
          const isMine = Boolean(me && paradeEntryIncludesNickname(entry, me));
          const memberNames = entry.memberGrades.map((m) => m.nickname).join(', ');
          const stepEnter =
            isSpotlight && (stepDirection === 'forward' || stepDirection === 'back');

          return (
            <button
              key={entry.id}
              data-parade-id={entry.id}
              ref={isSpotlight ? activeRef : undefined}
              type="button"
              className={[
                'setlist-parade-character',
                isSpotlight ? 'setlist-parade-character--spotlight' : 'setlist-parade-character--waiting',
                isSpotlight && isMine ? 'setlist-parade-character--my-turn' : '',
                stepEnter ? 'setlist-parade-character--step-enter' : '',
                isNext ? 'setlist-parade-character--next' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleSelect(index)}
              aria-label={`${index + 1}번 ${memberNames}, ${entry.bubbleText}`}
              aria-current={isSpotlight ? 'step' : undefined}
            >
              <div
                className={`setlist-parade-bubble${isSpotlight ? ' setlist-parade-bubble--active' : ''}${isSpotlight && isMine ? ' setlist-parade-bubble--mine' : ''}`}
              >
                <span className="setlist-parade-bubble-text">{entry.bubbleText}</span>
              </div>

              <div
                className={`setlist-parade-emoji-group${isSpotlight ? ' setlist-parade-emoji-group--active' : ''}${entry.memberGrades.length > 1 ? ' setlist-parade-emoji-group--duet' : ''}`}
                style={{ animationDelay: `${index * 0.12}s` }}
              >
                {entry.memberGrades.map((member) => {
                  const isMemberMe = isMine && member.nickname === me;
                  return (
                    <span
                      key={`${member.nickname}-${member.layoutSlot}`}
                      className={[
                        'setlist-parade-member-col',
                        `setlist-parade-member-col--${member.layoutSlot}`,
                        `setlist-parade-member-col--tier-${Math.min(member.sizeRank, 4)}`,
                        isMemberMe ? 'setlist-parade-member-col--me' : ''
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span
                        className={`setlist-parade-emoji-piece setlist-parade-emoji-piece--tier-${Math.min(member.sizeRank, 4)}${isMemberMe ? ' setlist-parade-emoji-piece--me' : ''}`}
                        title={member.nickname}
                      >
                        {member.gradeEmoji}
                      </span>
                      <span className="setlist-parade-member-name">{member.nickname}</span>
                    </span>
                  );
                })}
              </div>

              {isSpotlight && <div className="setlist-parade-spotlight-ring" aria-hidden />}

              <div className="setlist-parade-stage" aria-hidden />

              {entry.subLabel && <div className="setlist-parade-sublabel">{entry.subLabel}</div>}

              <span
                className={`setlist-parade-order${isSpotlight ? ' setlist-parade-order--active' : ''}`}
              >
                #{index + 1}
              </span>
            </button>
          );
        })}
      </div>

      <div className="setlist-parade-nav">
        <button
          type="button"
          className="setlist-parade-nav-btn"
          disabled={currentIndex <= 0}
          onClick={() => handleSelect(Math.max(0, currentIndex - 1))}
        >
          ← 이전
        </button>
        <span className="setlist-parade-nav-status">
          {currentIndex + 1} / {entries.length}
        </span>
        <button
          type="button"
          className="setlist-parade-nav-btn"
          disabled={currentIndex >= entries.length - 1}
          onClick={() => handleSelect(Math.min(entries.length - 1, currentIndex + 1))}
        >
          다음 →
        </button>
      </div>
    </div>
  );
};

export default SetListParadeView;
