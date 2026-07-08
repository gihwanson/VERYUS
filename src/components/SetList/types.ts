import type { FreeSongLineupItem, FreeSongSelfWithdrawalNotice, FreeSongSubmission } from './FreeSong/types';

export interface Song {
  id: string;
  title: string;
  artist?: string;
  songId?: string;
  members: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface SetListItem {
  id?: string;
  songId?: string;
  title: string;
  artist?: string;
  members: string[];
  order: number;
  completedAt?: any; // 완료 시간 (선택적)
  // 닉네임카드 관련 필드들
  nickname?: string;
  totalSlots?: number;
  slots?: FlexibleSlot[];
  allParticipants?: string[];
  totalSlotsCompleted?: number;
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

// 신청곡 카드
export interface RequestSongCard {
  id: string; // 카드 고유 ID
  type: 'requestSong'; // 카드 타입 구분
  songs: RequestSong[]; // 신청곡 목록
  order: number; // 셋리스트 내 순서
  completedAt?: any; // 완료 시간
}

// 개별 신청곡
export interface RequestSong {
  id: string; // 신청곡 고유 ID
  title: string; // 곡 제목
  requestedBy: string; // 신청자 닉네임
}

// 셋리스트 아이템 (기존 곡, 유연한 카드, 또는 신청곡 카드)
export type SetListEntry = SetListItem | FlexibleCard | RequestSongCard;

export interface SetListData {
  id?: string;
  name: string;
  /** 세션 날짜 (YYYY-MM-DD, 로컬 타임존) */
  sessionDate?: string;
  participants: string[];
  songs: SetListItem[]; // 기존 곡들
  flexibleCards?: FlexibleCard[]; // 유연한 카드들 (별도 필드)
  requestSongCards?: RequestSongCard[]; // 신청곡 카드들 (별도 필드)
  completedSongs?: SetListItem[]; // 완료된 곡들
  completedFlexibleCards?: FlexibleCard[]; // 완료된 유연한 카드들
  completedRequestSongCards?: RequestSongCard[]; // 완료된 신청곡 카드들
  createdBy: string;
  createdAt: any;
  updatedAt: any;
  /** @deprecated 전역 활성 플래그 — status 사용 권장 */
  isActive: boolean;
  isCompleted?: boolean; // 완료 여부
  /** 버스킹 세션 상태: live(진행 중) | ended(종료) */
  status?: 'live' | 'ended';
  /** 세션 호스트(조장) uid */
  hostUid?: string;
  /** 세션 호스트 닉네임 */
  hostNickname?: string;
  /** 현장명 (예: 홍대 버스킹존) */
  venueLabel?: string;
  completedAt?: any;
  currentSongIndex?: number;
  /** 관리 탭에서 참가자 확정(완료) 후 true — 그 전에는 진행 탭에서 곡 등록 UI를 쓰지 않음 */
  participantRegistrationComplete?: boolean;
  /** 관리자가 선택한 자유곡 진행 순서 */
  freeSongLineup?: FreeSongLineupItem[];
  /** 사용자가 전송한 자유곡 합격곡 목록 */
  freeSongSubmissions?: FreeSongSubmission[];
  /** 멤버 스스로 진행 순서에서 제거한 알림 */
  freeSongSelfWithdrawals?: FreeSongSelfWithdrawalNotice[];
  /** 이번 세션 자유곡 완료 통계 (닉네임 → 곡 수) */
  freeSongMemberStats?: Record<string, number>;
}

/** 곡·카드 등록 가능 여부 (참가 멤버가 있거나 기존 등록 데이터가 있으면 true) */
export function isSongRegistrationPhase(list: SetListData | null): boolean {
  if (!list) return false;
  const participants = (list.participants ?? []).map((p) => String(p).trim()).filter(Boolean);
  if (participants.length > 0) return true;
  if ((list.songs?.length ?? 0) > 0) return true;
  if ((list.flexibleCards?.length ?? 0) > 0) return true;
  if ((list.requestSongCards?.length ?? 0) > 0) return true;
  return false;
}

export interface DragData {
  type: 'song' | 'flexible' | 'requestSong';
  id: string; // songId, flexibleCardId, 또는 requestSongCardId
  x: number;
  y: number;
}

export interface TouchData {
  x: number;
  y: number;
} 