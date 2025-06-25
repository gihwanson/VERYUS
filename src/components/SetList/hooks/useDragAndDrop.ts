import { useState, useEffect, useCallback } from 'react';
import type { DragData, TouchData, Song, FlexibleCard } from '../types';

export const useDragAndDrop = (
  onDropSong?: (song: Song, insertAtIndex?: number) => void,
  onDropFlexibleCard?: (card: FlexibleCard, insertAtIndex?: number) => void,
  availableSongs?: Song[],
  availableFlexibleCards?: FlexibleCard[],
  setListLength?: number
) => {
  const [availableCardDrag, setAvailableCardDrag] = useState<DragData | null>(null);
  const [dragStartTimer, setDragStartTimer] = useState<number | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<TouchData | null>(null);
  const [insertIndex, setInsertIndex] = useState<number>(-1);

  // 삽입 인덱스 계산 함수 (단순화된 버전)
  const calculateInsertIndex = useCallback((clientX: number, clientY: number): number => {
    if (!setListLength || setListLength === 0) return 0;
    
    const mainCardArea = document.querySelector('.main-card-area');
    if (!mainCardArea) return -1;
    
    const rect = mainCardArea.getBoundingClientRect();
    
    // 메인 카드 영역 내부에 있는지 확인 (여유 공간 추가)
    const margin = 50; // 50px 여유 공간
    if (clientX < rect.left - margin || clientX > rect.right + margin || 
        clientY < rect.top - margin || clientY > rect.bottom + margin) {
      return -1;
    }
    
    // 가로 위치를 기준으로 삽입 인덱스 계산 (단순화)
    const relativeX = Math.max(0, clientX - rect.left);
    const cardWidth = rect.width;
    const progress = Math.min(1, relativeX / cardWidth); // 0 ~ 1 사이의 값
    
    // 구간별로 명확하게 나누기
    const index = Math.floor(progress * (setListLength + 1));
    
    // 최종 범위 제한
    return Math.max(0, Math.min(setListLength, index));
  }, [setListLength]);

  // 삽입 인덱스 업데이트 (변경될 때만)
  const updateInsertIndex = useCallback((newIndex: number) => {
    setInsertIndex(prevIndex => prevIndex !== newIndex ? newIndex : prevIndex);
  }, []);

  // 전역 마우스 이벤트 리스너 (드래그 중일 때)
  useEffect(() => {
    if (!availableCardDrag) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      setAvailableCardDrag(prev => prev ? {
        ...prev,
        x: e.clientX,
        y: e.clientY
      } : null);
      
      // 삽입 인덱스 업데이트
      const newInsertIndex = calculateInsertIndex(e.clientX, e.clientY);
      updateInsertIndex(newInsertIndex);
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      // 전역 드롭 처리
      if (availableCardDrag) {
        const finalInsertIndex = calculateInsertIndex(e.clientX, e.clientY);

        if (finalInsertIndex >= 0) {
          if (availableCardDrag.type === 'song' && onDropSong && availableSongs) {
            const draggedSong = availableSongs.find(s => s.id === availableCardDrag.id);
            if (draggedSong) {
              onDropSong(draggedSong, finalInsertIndex);
            }
          } else if (availableCardDrag.type === 'flexible' && onDropFlexibleCard && availableFlexibleCards) {
            const draggedCard = availableFlexibleCards.find(c => c.id === availableCardDrag.id);
            if (draggedCard) {
              onDropFlexibleCard(draggedCard, finalInsertIndex);
            }
          }
        }
      }
      
      setAvailableCardDrag(null);
      setInsertIndex(-1);
    };

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [availableCardDrag, calculateInsertIndex, updateInsertIndex, onDropSong, availableSongs]);

  // 드래그 중일 때 전체 페이지 스크롤 방지 및 전역 터치 이벤트
  useEffect(() => {
    if (availableCardDrag) {
      const originalStyle = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      
      // 전역 터치 이벤트 핸들러
      const handleGlobalTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        setAvailableCardDrag(prev => prev ? {
          ...prev,
          x: touch.clientX,
          y: touch.clientY
        } : null);
        
        // 삽입 인덱스 업데이트
        const newInsertIndex = calculateInsertIndex(touch.clientX, touch.clientY);
        updateInsertIndex(newInsertIndex);
        
        e.preventDefault();
      };

      const handleGlobalTouchEnd = (e: TouchEvent) => {
        // 전역 터치 드롭 처리
        if (availableCardDrag) {
          const touch = e.changedTouches[0];
          const finalInsertIndex = calculateInsertIndex(touch.clientX, touch.clientY);

          if (finalInsertIndex >= 0) {
            if (availableCardDrag.type === 'song' && onDropSong && availableSongs) {
              const draggedSong = availableSongs.find(s => s.id === availableCardDrag.id);
              if (draggedSong) {
                onDropSong(draggedSong, finalInsertIndex);
              }
            } else if (availableCardDrag.type === 'flexible' && onDropFlexibleCard && availableFlexibleCards) {
              const draggedCard = availableFlexibleCards.find(c => c.id === availableCardDrag.id);
              if (draggedCard) {
                onDropFlexibleCard(draggedCard, finalInsertIndex);
              }
            }
          }
        }
        
        setAvailableCardDrag(null);
        setInsertIndex(-1);
      };

      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      document.addEventListener('touchend', handleGlobalTouchEnd);
      
      return () => {
        document.body.style.overflow = originalStyle;
        document.body.style.touchAction = '';
        document.removeEventListener('touchmove', handleGlobalTouchMove);
        document.removeEventListener('touchend', handleGlobalTouchEnd);
      };
    }
  }, [availableCardDrag, calculateInsertIndex, updateInsertIndex, onDropSong, availableSongs]);

  // 터치 드래그 핸들러들
  const handleAvailableCardTouchStart = (e: React.TouchEvent, song: Song) => {
    const touch = e.touches[0];
    
    setTouchStartPos({
      x: touch.clientX,
      y: touch.clientY
    });
    
    const currentTarget = e.currentTarget;
    
    if (dragStartTimer) {
      clearTimeout(dragStartTimer);
    }
    
    const timer = window.setTimeout(() => {
      setAvailableCardDrag({
        type: 'song',
        id: song.id,
        x: touch.clientX,
        y: touch.clientY
      });
      
      if (currentTarget) {
        currentTarget.setAttribute('data-dragging', 'true');
      }
      setDragStartTimer(null);
    }, 300);
    
    setDragStartTimer(timer);
  };

  const handleAvailableCardTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    
    if (!availableCardDrag && touchStartPos && dragStartTimer) {
      const deltaX = Math.abs(touch.clientX - touchStartPos.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.y);
      
      // 가로 스크롤 감지 (가로 이동이 세로 이동보다 크면 스크롤로 판단)
      if (deltaX > deltaY && deltaX > 10) {
        clearTimeout(dragStartTimer);
        setDragStartTimer(null);
        setTouchStartPos(null);
        return; // 가로 스크롤로 판단하여 드래그 취소
      }
      
      // 세로 스크롤 감지
      if (deltaY > deltaX && deltaY > 10) {
        clearTimeout(dragStartTimer);
        setDragStartTimer(null);
        setTouchStartPos(null);
        return;
      }
    }
    
    if (availableCardDrag) {
      setAvailableCardDrag(prev => prev ? {
        ...prev,
        x: touch.clientX,
        y: touch.clientY
      } : null);
      
      // 삽입 인덱스 업데이트
      const newInsertIndex = calculateInsertIndex(touch.clientX, touch.clientY);
      updateInsertIndex(newInsertIndex);
      
      // React 이벤트에서는 preventDefault를 안전하게 호출하기 어려우므로 제거
      // 대신 전역 이벤트에서 처리
    }
  };

  const handleAvailableCardTouchEnd = (e: React.TouchEvent) => {
    const currentTarget = e.currentTarget;
    
    setTouchStartPos(null);
    
    if (dragStartTimer) {
      clearTimeout(dragStartTimer);
      setDragStartTimer(null);
      return;
    }
    
    if (availableCardDrag) {
      const touch = e.changedTouches[0];
      const finalInsertIndex = calculateInsertIndex(touch.clientX, touch.clientY);

      // 인덱스가 0 이상이거나 메인 카드 영역 내부라면 드롭 처리
      if (finalInsertIndex >= 0) {
        if (availableCardDrag.type === 'song' && onDropSong && availableSongs) {
          const draggedSong = availableSongs.find(s => s.id === availableCardDrag.id);
          if (draggedSong) {
            onDropSong(draggedSong, finalInsertIndex);
          }
        } else if (availableCardDrag.type === 'flexible' && onDropFlexibleCard && availableFlexibleCards) {
          const draggedCard = availableFlexibleCards.find(c => c.id === availableCardDrag.id);
          if (draggedCard) {
            onDropFlexibleCard(draggedCard, finalInsertIndex);
          }
        }
      }
      
      setAvailableCardDrag(null);
      setInsertIndex(-1);
      
      setTimeout(() => {
        if (currentTarget) {
          currentTarget.removeAttribute('data-dragging');
        }
      }, 100);
    }
  };

  // 마우스 드래그 핸들러들
  const handleAvailableCardMouseDown = (e: React.MouseEvent, song: Song) => {
    setAvailableCardDrag({
      type: 'song',
      id: song.id,
      x: e.clientX,
      y: e.clientY
    });
    e.preventDefault();
  };

  const handleAvailableCardMouseMove = (e: React.MouseEvent) => {
    if (!availableCardDrag) return;
    
    setAvailableCardDrag(prev => prev ? {
      ...prev,
      x: e.clientX,
      y: e.clientY
    } : null);
    
    // 삽입 인덱스 업데이트
    const newInsertIndex = calculateInsertIndex(e.clientX, e.clientY);
    updateInsertIndex(newInsertIndex);
    
    e.preventDefault();
  };

  const handleAvailableCardMouseUp = (e: React.MouseEvent) => {
    if (availableCardDrag) {
      const finalInsertIndex = calculateInsertIndex(e.clientX, e.clientY);

      if (finalInsertIndex >= 0) {
        if (availableCardDrag.type === 'song' && onDropSong && availableSongs) {
          const draggedSong = availableSongs.find(s => s.id === availableCardDrag.id);
          if (draggedSong) {
            onDropSong(draggedSong, finalInsertIndex);
          }
        } else if (availableCardDrag.type === 'flexible' && onDropFlexibleCard && availableFlexibleCards) {
          const draggedCard = availableFlexibleCards.find(c => c.id === availableCardDrag.id);
          if (draggedCard) {
            onDropFlexibleCard(draggedCard, finalInsertIndex);
          }
        }
      }

      setAvailableCardDrag(null);
      setInsertIndex(-1);
      e.preventDefault();
    }
  };

  // 유연한 카드 터치 드래그 핸들러들
  const handleFlexibleCardTouchStart = (e: React.TouchEvent, card: FlexibleCard) => {
    const touch = e.touches[0];
    
    setTouchStartPos({
      x: touch.clientX,
      y: touch.clientY
    });
    
    const currentTarget = e.currentTarget;
    
    if (dragStartTimer) {
      clearTimeout(dragStartTimer);
    }
    
    const timer = window.setTimeout(() => {
      setAvailableCardDrag({
        type: 'flexible',
        id: card.id,
        x: touch.clientX,
        y: touch.clientY
      });
      
      if (currentTarget) {
        currentTarget.setAttribute('data-dragging', 'true');
      }
      setDragStartTimer(null);
    }, 300);
    
    setDragStartTimer(timer);
  };

  // 유연한 카드 마우스 드래그 핸들러들
  const handleFlexibleCardMouseDown = (e: React.MouseEvent, card: FlexibleCard) => {
    setAvailableCardDrag({
      type: 'flexible',
      id: card.id,
      x: e.clientX,
      y: e.clientY
    });
    e.preventDefault();
  };

  return {
    availableCardDrag,
    dragStartTimer,
    touchStartPos,
    insertIndex,
    handleAvailableCardTouchStart,
    handleAvailableCardTouchMove,
    handleAvailableCardTouchEnd,
    handleAvailableCardMouseDown,
    handleAvailableCardMouseMove,
    handleAvailableCardMouseUp,
    handleFlexibleCardTouchStart,
    handleFlexibleCardMouseDown
  };
}; 