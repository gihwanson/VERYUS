import { useState } from 'react';
import type { TouchData, SetListData } from '../types';

export const useSwipeGestures = (
  isLeader: boolean,
  currentCardIndex: number,
  activeSetList: SetListData | null,
  setCurrentCardIndex: (index: number) => void,
  completeCurrentSong: () => void,
  deleteCurrentSong: () => void,
  totalItemsCount: number = 0,
  goToNextCard?: () => void,
  goToPrevCard?: () => void,
  dragEnabled: boolean = false
) => {
  const [touchStart, setTouchStart] = useState<TouchData | null>(null);
  const [touchEnd, setTouchEnd] = useState<TouchData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDistance, setDragDistance] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isReadyToComplete, setIsReadyToComplete] = useState(false);
  const [isReadyToDelete, setIsReadyToDelete] = useState(false);

  const minSwipeDistance = 60; // 스와이프 감지 거리를 줄여서 더 민감하게 만들기
  const completionThreshold = 60; // 완료 임계점 (픽셀)
  const deletionThreshold = 60; // 삭제 임계점 (픽셀)

  const handleTouchStart = (e: React.TouchEvent) => {
    console.log('🖐️ TouchStart - currentCardIndex:', currentCardIndex, 'dragEnabled:', dragEnabled);
    
    // dragEnabled가 false이면 스와이프 불가 (흰색 실선 상태)
    if (!dragEnabled) {
      console.log('❌ dragEnabled가 false - 스와이프 불가능');
      // 터치 상태를 초기화하여 다른 핸들러들이 작동하지 않도록 함
      setTouchStart(null);
      setTouchEnd(null);
      setIsDragging(false);
      setDragDistance({ x: 0, y: 0 });
      setIsReadyToComplete(false);
      setIsReadyToDelete(false);
      return;
    }
    
    setTouchEnd(null);
    setIsDragging(false);
    setDragDistance({ x: 0, y: 0 });
    setIsReadyToComplete(false);
    setIsReadyToDelete(false);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
    
    setTouchEnd(null);
    setIsDragging(false);
    setDragDistance({ x: 0, y: 0 });
    setIsReadyToComplete(false);
    setIsReadyToDelete(false);
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // dragEnabled가 false이면 스와이프 불가 (흰색 실선 상태)
    if (!dragEnabled) {
      // 터치 상태를 초기화하여 다른 핸들러들이 작동하지 않도록 함
      setTouchStart(null);
      setTouchEnd(null);
      setIsDragging(false);
      setDragDistance({ x: 0, y: 0 });
      setIsReadyToComplete(false);
      setIsReadyToDelete(false);
      return;
    }
    
    if (!touchStart) return;

    const currentTouch = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY
    };

    setTouchEnd(currentTouch);

    // 드래그 거리 계산
    const deltaX = touchStart.x - currentTouch.x;
    const deltaY = touchStart.y - currentTouch.y;
    
    setDragDistance({ x: deltaX, y: deltaY });

    // 최소 이동 거리 이상이면 드래그 시작 (모든 사용자에게 적용)
    if (!isDragging && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      setIsDragging(true);
    }

    // 위로 드래그 중이고 리더인 경우 완료 준비 상태 확인 (dragEnabled가 true일 때만)
    if (isLeader && dragEnabled && deltaY > 0 && Math.abs(deltaX) < Math.abs(deltaY)) {
      const upwardDistance = deltaY;
      setIsReadyToComplete(upwardDistance >= completionThreshold);
      setIsReadyToDelete(false);
      
      // 햅틱 피드백 (지원되는 기기에서만)
      if (upwardDistance >= completionThreshold && window.navigator && 'vibrate' in window.navigator) {
        window.navigator.vibrate(50);
      }
    } 
    // 아래로 드래그 중이고 리더인 경우 삭제 준비 상태 확인 (dragEnabled가 true일 때만)
    else if (isLeader && dragEnabled && deltaY < 0 && Math.abs(deltaX) < Math.abs(deltaY)) {
      const downwardDistance = Math.abs(deltaY);
      setIsReadyToDelete(downwardDistance >= deletionThreshold);
      setIsReadyToComplete(false);
      
      // 햅틱 피드백 (지원되는 기기에서만)
      if (downwardDistance >= deletionThreshold && window.navigator && 'vibrate' in window.navigator) {
        window.navigator.vibrate(50);
      }
    } 
    else {
      // 일반 사용자나 위아래 드래그가 아닌 경우 완료/삭제 준비 상태 해제
      setIsReadyToComplete(false);
      setIsReadyToDelete(false);
    }
  };

  const handleTouchEnd = () => {
    // dragEnabled가 false이면 스와이프 불가 (흰색 실선 상태)
    if (!dragEnabled) {
      resetDragState();
      return;
    }
    
    // touchStart가 null이면 터치가 시작되지 않았거나 비활성화된 카드에서 시작된 것
    if (!touchStart) {
      resetDragState();
      return;
    }
    
    if (!touchEnd) {
      resetDragState();
      return;
    }
    
    const distanceX = touchEnd.x - touchStart.x;
    const distanceY = touchEnd.y - touchStart.y;
    
    const isLeftSwipe = distanceX < -minSwipeDistance;
    const isRightSwipe = distanceX > minSwipeDistance;
    const isUpSwipe = distanceY < -minSwipeDistance;
    const isDownSwipe = distanceY > minSwipeDistance;

    console.log('📊 스와이프 감지 - distanceX:', distanceX, 'distanceY:', distanceY, 'minSwipeDistance:', minSwipeDistance);
    console.log('📊 스와이프 상태 - isLeftSwipe:', isLeftSwipe, 'isRightSwipe:', isRightSwipe, 'isUpSwipe:', isUpSwipe, 'isDownSwipe:', isDownSwipe);

    // 리더인 경우 위로 스와이프로 다음 곡 진행 가능 (dragEnabled가 true일 때만)
    if (isUpSwipe && isLeader && dragEnabled && Math.abs(distanceX) < minSwipeDistance) {
      completeCurrentSong();
    } 
    // 리더인 경우 아래로 스와이프로 곡 삭제 가능 (dragEnabled가 true일 때만)
    else if (isDownSwipe && isLeader && dragEnabled && Math.abs(distanceX) < minSwipeDistance) {
      deleteCurrentSong();
    } 
    // 좌우 스와이프로 카드 이동 가능 (dragEnabled가 true일 때만)
    else if (isLeftSwipe && dragEnabled && Math.abs(distanceY) < minSwipeDistance * 1.5) {
      console.log('⬅️ 왼쪽 스와이프 감지 - 다음 카드로 이동');
      if (goToNextCard) {
        goToNextCard();
      } else {
        // 기본 동작 (외부 함수가 제공되지 않은 경우)
        if (currentCardIndex < totalItemsCount - 1) {
          setCurrentCardIndex(currentCardIndex + 1);
        }
      }
    } else if (isRightSwipe && dragEnabled && Math.abs(distanceY) < minSwipeDistance * 1.5) {
      console.log('➡️ 오른쪽 스와이프 감지 - 이전 카드로 이동');
      console.log('➡️ 오른쪽 스와이프 조건 확인 - isRightSwipe:', isRightSwipe, 'dragEnabled:', dragEnabled, 'Math.abs(distanceY):', Math.abs(distanceY), 'minSwipeDistance:', minSwipeDistance);
      if (goToPrevCard) {
        console.log('🔄 goToPrevCard 함수 호출');
        goToPrevCard();
      } else {
        console.log('🔄 기본 goToPrevCard 동작 실행');
        // 기본 동작 (외부 함수가 제공되지 않은 경우)
        if (currentCardIndex > 0) {
          setCurrentCardIndex(currentCardIndex - 1);
        }
      }
    } else {
      console.log('❌ 스와이프 조건 불만족 - isRightSwipe:', isRightSwipe, 'dragEnabled:', dragEnabled, 'Math.abs(distanceY):', Math.abs(distanceY), 'minSwipeDistance:', minSwipeDistance);
    }

    resetDragState();
  };

  const resetDragState = () => {
    setIsDragging(false);
    setDragDistance({ x: 0, y: 0 });
    setIsReadyToComplete(false);
    setIsReadyToDelete(false);
    setTouchStart(null);
    setTouchEnd(null);
  };

  const defaultGoToNextCard = () => {
    if (currentCardIndex < totalItemsCount - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
    }
  };

  const defaultGoToPrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
    }
  };

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    goToNextCard: defaultGoToNextCard,
    goToPrevCard: defaultGoToPrevCard,
    isDragging,
    dragDistance,
    isReadyToComplete,
    isReadyToDelete,
    completionThreshold,
    deletionThreshold
  };
}; 