import { useState } from 'react';
import type { TouchData, SetListData } from '../types';

export const useSwipeGestures = (
  isLeader: boolean,
  currentCardIndex: number,
  activeSetList: SetListData | null,
  setCurrentCardIndex: (index: number) => void,
  completeCurrentSong: () => void,
  deleteCurrentSong: () => void,
  totalItemsCount: number = 0
) => {
  const [touchStart, setTouchStart] = useState<TouchData | null>(null);
  const [touchEnd, setTouchEnd] = useState<TouchData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDistance, setDragDistance] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isReadyToComplete, setIsReadyToComplete] = useState(false);
  const [isReadyToDelete, setIsReadyToDelete] = useState(false);

  const minSwipeDistance = 80;
  const completionThreshold = 60; // 완료 임계점 (픽셀)
  const deletionThreshold = 60; // 삭제 임계점 (픽셀)

  const handleTouchStart = (e: React.TouchEvent) => {
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

    // 최소 이동 거리 이상이면 드래그 시작
    if (!isDragging && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      setIsDragging(true);
    }

    // 현재 진행 중인 카드인지 확인
    const isCurrentActiveCard = activeSetList && currentCardIndex === (activeSetList.currentSongIndex || 0);

    // 위로 드래그 중이고 리더이며 현재 진행 중인 카드인 경우 완료 준비 상태 확인
    if (isLeader && isCurrentActiveCard && deltaY > 0 && Math.abs(deltaX) < Math.abs(deltaY)) {
      const upwardDistance = deltaY;
      setIsReadyToComplete(upwardDistance >= completionThreshold);
      setIsReadyToDelete(false);
      
      // 햅틱 피드백 (지원되는 기기에서만)
      if (upwardDistance >= completionThreshold && window.navigator && 'vibrate' in window.navigator) {
        window.navigator.vibrate(50);
      }
    } 
    // 아래로 드래그 중이고 리더인 경우 삭제 준비 상태 확인 (모든 카드에서 가능)
    else if (isLeader && deltaY < 0 && Math.abs(deltaX) < Math.abs(deltaY)) {
      const downwardDistance = Math.abs(deltaY);
      setIsReadyToDelete(downwardDistance >= deletionThreshold);
      setIsReadyToComplete(false);
      
      // 햅틱 피드백 (지원되는 기기에서만)
      if (downwardDistance >= deletionThreshold && window.navigator && 'vibrate' in window.navigator) {
        window.navigator.vibrate(50);
      }
    } 
    else {
      setIsReadyToComplete(false);
      setIsReadyToDelete(false);
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      resetDragState();
      return;
    }
    
    const distanceX = touchStart.x - touchEnd.x;
    const distanceY = touchStart.y - touchEnd.y;
    
    const isLeftSwipe = distanceX > minSwipeDistance;
    const isRightSwipe = distanceX < -minSwipeDistance;
    const isUpSwipe = distanceY > minSwipeDistance;
    const isDownSwipe = distanceY < -minSwipeDistance;

    // 현재 진행 중인 카드인지 확인
    const isCurrentActiveCard = activeSetList && currentCardIndex === (activeSetList.currentSongIndex || 0);

    // 리더이며 현재 진행 중인 카드에서만 위로 스와이프로 다음 곡 진행 가능
    if (isUpSwipe && isLeader && isCurrentActiveCard && Math.abs(distanceX) < minSwipeDistance) {
      completeCurrentSong();
    } 
    // 리더이면 모든 카드에서 아래로 스와이프로 곡 삭제 가능
    else if (isDownSwipe && isLeader && Math.abs(distanceX) < minSwipeDistance) {
      deleteCurrentSong();
    } 
    else if (isLeftSwipe && Math.abs(distanceY) < minSwipeDistance) {
      goToNextCard();
    } else if (isRightSwipe && Math.abs(distanceY) < minSwipeDistance) {
      goToPrevCard();
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

  const goToNextCard = () => {
    if (currentCardIndex < totalItemsCount - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      console.log(`카드 스와이프: ${currentCardIndex} → ${currentCardIndex + 1} (총 ${totalItemsCount}개)`);
    }
  };

  const goToPrevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      console.log(`카드 스와이프: ${currentCardIndex} → ${currentCardIndex - 1} (총 ${totalItemsCount}개)`);
    }
  };

  return {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    goToNextCard,
    goToPrevCard,
    isDragging,
    dragDistance,
    isReadyToComplete,
    isReadyToDelete,
    completionThreshold,
    deletionThreshold
  };
}; 