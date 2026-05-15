import React, { useEffect, useRef } from 'react';
import type { ParadeEntry } from './paradeUtils';
import { paradeEntryIncludesNickname } from './paradeUtils';
import './styles.css';

interface SetListParadeViewProps {
  entries: ParadeEntry[];
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  currentUserNickname?: string;
  fullscreen?: boolean;
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
  onTouchStart,
  onTouchMove,
  onTouchEnd
}) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  const activeEntry = entries[currentIndex];
  const me = currentUserNickname.trim();

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest'
    });
  }, [currentIndex]);

  if (entries.length === 0) return null;

  const isMyTurn = Boolean(
    activeEntry && me && paradeEntryIncludesNickname(activeEntry, me)
  );

  const nowPlayingLabel = activeEntry
    ? `${currentIndex + 1}번째 · ${activeEntry.bubbleText}`
    : '';

  return (
    <div
      className={`setlist-parade-wrap${fullscreen ? ' setlist-parade-wrap--fullscreen' : ''}`}
      role="region"
      aria-label="셋리스트 진행 순서"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="setlist-parade-stars" aria-hidden />

      <div className="setlist-parade-now-banner">
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

      <div className="setlist-parade-track">
        {entries.map((entry, index) => {
          const isSpotlight = index === currentIndex;
          const isMine = Boolean(me && paradeEntryIncludesNickname(entry, me));
          const memberNames = entry.memberGrades.map((m) => m.nickname).join(', ');

          return (
            <button
              key={entry.id}
              ref={isSpotlight ? activeRef : undefined}
              type="button"
              className={[
                'setlist-parade-character',
                isSpotlight ? 'setlist-parade-character--spotlight' : 'setlist-parade-character--waiting',
                isSpotlight && isMine ? 'setlist-parade-character--my-turn' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelectIndex(index)}
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

              <div className="setlist-parade-stage" aria-hidden />

              {entry.subLabel && <div className="setlist-parade-sublabel">{entry.subLabel}</div>}

              <span className="setlist-parade-order">#{index + 1}</span>
            </button>
          );
        })}
      </div>

      <div className="setlist-parade-nav">
        <button
          type="button"
          className="setlist-parade-nav-btn"
          disabled={currentIndex <= 0}
          onClick={() => onSelectIndex(Math.max(0, currentIndex - 1))}
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
          onClick={() => onSelectIndex(Math.min(entries.length - 1, currentIndex + 1))}
        >
          다음 →
        </button>
      </div>
    </div>
  );
};

export default SetListParadeView;
