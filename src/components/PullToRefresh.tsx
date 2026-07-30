import React, { useCallback, useEffect, useRef, useState } from 'react';
import './PullToRefresh.css';

const PULL_THRESHOLD = 72;
const PULL_MAX = 112;

type PullToRefreshProps = {
  onRefresh: () => void | Promise<void>;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * 창 스크롤 상단에서 아래로 당기면 새로고침.
 * 당기는 동안 음표가 따라 올라옵니다.
 */
const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  disabled = false,
  children,
  className = '',
}) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPullBoth = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (disabled) return;

    const scrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (scrollTop() > 4) {
        pullingRef.current = false;
        return;
      }
      startYRef.current = e.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current) return;
      if (scrollTop() > 4) {
        pullingRef.current = false;
        setPullBoth(0);
        return;
      }
      const y = e.touches[0]?.clientY ?? 0;
      const dy = y - startYRef.current;
      if (dy <= 0) {
        setPullBoth(0);
        return;
      }
      const distance = Math.min(PULL_MAX, dy * 0.42);
      setPullBoth(distance);
      if (distance > 10) {
        e.preventDefault();
      }
    };

    const finish = async () => {
      if (!pullingRef.current && pullRef.current === 0) return;
      pullingRef.current = false;
      const reached = pullRef.current >= PULL_THRESHOLD;
      if (!reached || refreshingRef.current) {
        setPullBoth(0);
        return;
      }
      setRefreshing(true);
      setPullBoth(PULL_THRESHOLD);
      try {
        await onRefreshRef.current();
      } catch (error) {
        console.error('당겨서 새로고침 실패:', error);
      } finally {
        setRefreshing(false);
        setPullBoth(0);
      }
    };

    const onTouchEnd = () => {
      void finish();
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [disabled, setPullBoth]);

  const progress = Math.min(1, pull / PULL_THRESHOLD);
  const ready = pull >= PULL_THRESHOLD || refreshing;
  const indicatorHeight = refreshing ? PULL_THRESHOLD : pull;

  return (
    <div className={`pull-to-refresh ${className}`.trim()}>
      <div
        className={`pull-to-refresh__indicator${ready ? ' is-ready' : ''}${refreshing ? ' is-refreshing' : ''}`}
        style={{ height: indicatorHeight }}
        aria-hidden
      >
        <span
          className="pull-to-refresh__note-wrap"
          style={{
            opacity: refreshing ? 1 : Math.max(0.15, progress),
            transform: refreshing
              ? undefined
              : `translateY(${Math.max(0, 28 - pull * 0.35)}px) scale(${0.85 + progress * 0.2})`,
          }}
        >
          <span className="pull-to-refresh__note">♪</span>
        </span>
        <span className="pull-to-refresh__hint">
          {refreshing ? '새로고침 중' : ready ? '놓으면 새로고침' : '당겨서 새로고침'}
        </span>
      </div>
      <div
        className="pull-to-refresh__content"
        style={{
          transform: pull > 0 || refreshing ? `translateY(${indicatorHeight}px)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
