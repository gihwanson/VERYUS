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
  const [autoScrollInterval, setAutoScrollInterval] = useState<number | null>(null);
  const [lastScrollPosition, setLastScrollPosition] = useState<number>(0);
  const [scrollFailCount, setScrollFailCount] = useState<number>(0);

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

  // 자동 스크롤 함수 (모바일 최적화)
  const handleAutoScroll = useCallback((clientY: number) => {
    const scrollZone = 80; // 상하 80px 영역에서 자동 스크롤
    const maxScrollSpeed = 8; // 모바일에서 적당한 스크롤 속도
    const viewportHeight = window.innerHeight;
    
    let scrollSpeed = 0;
    let direction = 0; // -1: 위로, 1: 아래로
    
    // 화면 상단 근처에서 위로 스크롤
    if (clientY < scrollZone) {
      direction = -1;
      scrollSpeed = Math.max(2, maxScrollSpeed * (1 - clientY / scrollZone));
    }
    // 화면 하단 근처에서 아래로 스크롤
    else if (clientY > viewportHeight - scrollZone) {
      direction = 1;
      const distanceFromBottom = viewportHeight - clientY;
      scrollSpeed = Math.max(2, maxScrollSpeed * (1 - distanceFromBottom / scrollZone));
    }
    
    // 기존 스크롤 인터벌 정리
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      setAutoScrollInterval(null);
    }
    
    // 스크롤이 필요한 경우 인터벌 설정
    if (scrollSpeed > 0) {
      console.log('자동 스크롤 시작:', { direction, scrollSpeed, clientY });
      
      // 스크롤 실패 카운터 초기화
      setScrollFailCount(0);
      setLastScrollPosition(window.pageYOffset || 0);
      
      const interval = window.setInterval(() => {
        const currentScrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0;
        const scrollAmount = direction * scrollSpeed;
        
        // 스크롤이 실제로 변했는지 확인
        if (Math.abs(currentScrollPosition - lastScrollPosition) < 1) {
          setScrollFailCount(prev => {
            const newCount = prev + 1;
            console.log('스크롤 실패 카운트:', newCount);
            
            // 5번 연속 실패하면 자동 스크롤 중단
            if (newCount >= 5) {
              console.log('스크롤이 불가능하므로 자동 스크롤 중단');
              if (autoScrollInterval) {
                clearInterval(autoScrollInterval);
                setAutoScrollInterval(null);
              }
              return 0;
            }
            return newCount;
          });
        } else {
          setScrollFailCount(0); // 성공하면 카운터 리셋
        }
        
        setLastScrollPosition(currentScrollPosition);
        
        try {
          console.log('스크롤 시도:', scrollAmount, '현재 위치:', currentScrollPosition);
          
          // 가장 간단하고 확실한 방법만 사용
          window.scrollBy(0, scrollAmount);
          
          // 스크롤 한계 체크
          if (direction === -1 && currentScrollPosition <= 0) {
            console.log('페이지 최상단 도달, 자동 스크롤 중단');
            clearInterval(interval);
            setAutoScrollInterval(null);
            return;
          }
          
          const maxScroll = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            0
          ) - window.innerHeight;
          
          if (direction === 1 && currentScrollPosition >= maxScroll) {
            console.log('페이지 최하단 도달, 자동 스크롤 중단');
            clearInterval(interval);
            setAutoScrollInterval(null);
            return;
          }
          
        } catch (error) {
          console.error('스크롤 오류:', error);
          clearInterval(interval);
          setAutoScrollInterval(null);
        }
      }, 50); // 빈도를 줄여서 안정성 향상
      
      setAutoScrollInterval(interval);
    }
  }, [autoScrollInterval]);

  // 자동 스크롤 정리 함수
  const clearAutoScroll = useCallback(() => {
    if (autoScrollInterval) {
      console.log('자동 스크롤 정리');
      clearInterval(autoScrollInterval);
      setAutoScrollInterval(null);
      setScrollFailCount(0);
      setLastScrollPosition(0);
    }
  }, [autoScrollInterval]);

  // 드래그 중일 때 전체 페이지 스크롤 방지 및 전역 터치 이벤트
  useEffect(() => {
    if (availableCardDrag) {
      console.log('드래그 시작됨 - 전역 이벤트 리스너 등록');
      
      // 전역 터치 이벤트 리스너 제거 - React 이벤트만 사용
      // 전역 리스너가 스크롤을 방해하는 문제 해결
      
      return () => {
        console.log('드래그 종료됨 - 전역 이벤트 리스너 제거');
        // 자동 스크롤 정리
        clearAutoScroll();
      };
    }
  }, [availableCardDrag, calculateInsertIndex, updateInsertIndex, onDropSong, availableSongs]);

  // 컴포넌트 언마운트 시 cleanup
  useEffect(() => {
    return () => {
      // 컴포넌트가 언마운트될 때 모든 상태 초기화
      console.log('SetList 컴포넌트 언마운트 - 모든 드래그 상태 정리');
      setAvailableCardDrag(null);
      setInsertIndex(-1);
      setTouchStartPos(null);
      if (dragStartTimer) {
        clearTimeout(dragStartTimer);
        setDragStartTimer(null);
      }
      clearAutoScroll();
      
      // 전역 이벤트 리스너 강제 제거 (혹시 남아있을 경우)
      const handleGlobalTouchMove = (e: TouchEvent) => {};
      const handleGlobalTouchEnd = (e: TouchEvent) => {};
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [dragStartTimer]);

  // 강력한 cleanup - 모든 터치 이벤트 리스너 제거
  useEffect(() => {
    return () => {
      console.log('강력한 cleanup 실행 - 모든 터치 이벤트 리스너 제거');
      
      // 모든 가능한 터치 이벤트 리스너 제거
      const removeAllTouchListeners = () => {
        // 빈 함수로 모든 터치 이벤트 리스너 제거 시도
        const emptyHandler = () => {};
        
        // capture와 non-capture 모두 제거
        document.removeEventListener('touchstart', emptyHandler, true);
        document.removeEventListener('touchstart', emptyHandler, false);
        document.removeEventListener('touchmove', emptyHandler, true);
        document.removeEventListener('touchmove', emptyHandler, false);
        document.removeEventListener('touchend', emptyHandler, true);
        document.removeEventListener('touchend', emptyHandler, false);
        
        // window에도 적용
        window.removeEventListener('touchstart', emptyHandler, true);
        window.removeEventListener('touchstart', emptyHandler, false);
        window.removeEventListener('touchmove', emptyHandler, true);
        window.removeEventListener('touchmove', emptyHandler, false);
        window.removeEventListener('touchend', emptyHandler, true);
        window.removeEventListener('touchend', emptyHandler, false);
      };
      
      removeAllTouchListeners();
      
      // body 스타일 복원
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      document.body.style.pointerEvents = '';
      
      // 잠시 후 한 번 더 실행 (비동기적으로 남아있을 수 있는 리스너들 제거)
      setTimeout(removeAllTouchListeners, 100);
    };
  }, []);

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
    }, 150); // 타이머 시간을 단축하여 더 빠른 반응성 제공
    
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
      
      // 세로 스크롤 감지 - 임계값을 높여서 더 명확한 드래그 의도만 감지
      if (deltaY > deltaX && deltaY > 20) {
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
      
      // 자동 스크롤 처리 (React 이벤트에서도 처리)
      console.log('React 터치 이벤트 - Y 위치:', touch.clientY);
      handleAutoScroll(touch.clientY);
      
      // React 터치 이벤트에서는 preventDefault 호출하지 않음
      // 전역 터치 이벤트에서만 처리하여 브라우저 경고 방지
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
      // 자동 스크롤 정리
      clearAutoScroll();
      
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
    
    // 자동 스크롤 처리
    handleAutoScroll(e.clientY);
    
    e.preventDefault();
  };

  const handleAvailableCardMouseUp = (e: React.MouseEvent) => {
    if (availableCardDrag) {
      // 자동 스크롤 정리
      clearAutoScroll();
      
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