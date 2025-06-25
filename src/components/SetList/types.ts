export interface Song {
  id: string;
  title: string;
  members: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface SetListItem {
  songId: string;
  title: string;
  members: string[];
  order: number;
  completedAt?: any; // 완료 시간 (선택적)
}

// 유연한 카드의 각 슬롯 정보
export interface FlexibleSlot {
  id: string; // 슬롯 고유 ID
  type: 'solo' | 'duet' | 'chorus' | 'empty'; // 곡 유형
  songId?: string; // 선택된 곡 ID (있는 경우)
  title?: string; // 곡 제목 (직접 입력 가능)
  members: string[]; // 참여자들
  isCompleted?: boolean; // 완료 여부
}

// 닉네임 기반 유연한 카드
export interface FlexibleCard {
  id: string; // 카드 고유 ID
  type: 'flexible'; // 카드 타입 구분
  nickname: string; // 주인 닉네임
  totalSlots: number; // 총 곡수
  slots: FlexibleSlot[]; // 각 슬롯들
  order: number; // 셋리스트 내 순서
  completedAt?: any; // 전체 완료 시간
}

// 셋리스트 아이템 (기존 곡 또는 유연한 카드)
export type SetListEntry = SetListItem | FlexibleCard;

export interface SetListData {
  id?: string;
  name: string;
  participants: string[];
  songs: SetListItem[]; // 기존 곡들
  flexibleCards?: FlexibleCard[]; // 유연한 카드들 (별도 필드)
  completedSongs?: SetListItem[]; // 완료된 곡들
  completedFlexibleCards?: FlexibleCard[]; // 완료된 유연한 카드들
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  isActive: boolean;
  currentSongIndex?: number;
}

export interface DragData {
  type: 'song' | 'flexible';
  id: string; // songId 또는 flexibleCardId
  x: number;
  y: number;
}

export interface TouchData {
  x: number;
  y: number;
} 