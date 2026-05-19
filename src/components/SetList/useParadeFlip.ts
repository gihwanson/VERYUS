import { useLayoutEffect, useRef } from 'react';

/**
 * 퍼레이드 캐릭터 DOM 위치가 바뀔 때 FLIP 보간 (Firestore 순서 변경 등)
 */
export function useParadeFlip(
  trackRef: React.RefObject<HTMLElement | null>,
  layoutKey: string
): void {
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const nodes = track.querySelectorAll<HTMLElement>('[data-parade-id]');
    const nextRects = new Map<string, DOMRect>();

    nodes.forEach((node) => {
      const id = node.dataset.paradeId;
      if (!id) return;

      const rect = node.getBoundingClientRect();
      nextRects.set(id, rect);

      const prev = prevRectsRef.current.get(id);
      if (!prev) return;

      const dx = prev.left - rect.left;
      const dy = prev.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      node.classList.add('setlist-parade-character--flip');
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          node.style.transition = 'transform 0.5s cubic-bezier(0.34, 1.15, 0.64, 1)';
          node.style.transform = '';
          const onEnd = () => {
            node.classList.remove('setlist-parade-character--flip');
            node.style.transition = '';
            node.removeEventListener('transitionend', onEnd);
          };
          node.addEventListener('transitionend', onEnd);
        });
      });
    });

    prevRectsRef.current = nextRects;
  }, [layoutKey, trackRef]);
}
