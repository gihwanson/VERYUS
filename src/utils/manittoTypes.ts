export type ManittoSeasonStatus =
  | 'recruiting'
  | 'closed'
  | 'drawn'
  | 'archived'
  | 'cancelled';

export type ManittoSeason = {
  id: string;
  title: string;
  status: ManittoSeasonStatus;
  giftGuide?: string;
  recruitEndsAt?: { seconds: number; nanoseconds?: number } | null;
  eventDate?: { seconds: number; nanoseconds?: number } | null;
  createdBy: string;
  createdByNickname: string;
  createdAt?: { seconds: number; nanoseconds?: number };
  drawnAt?: { seconds: number; nanoseconds?: number };
  participantCount?: number;
};

export type ManittoParticipant = {
  uid: string;
  nickname: string;
  joinedAt?: { seconds: number; nanoseconds?: number };
};

export type ManittoAssignment = {
  receiverUid: string;
  receiverNickname: string;
};

export type ManittoAssignmentRow = {
  giverUid: string;
  giverNickname: string;
  receiverUid: string;
  receiverNickname: string;
};

export const MANITTO_MIN_PARTICIPANTS = 3;

export const MANITTO_STATUS_LABEL: Record<ManittoSeasonStatus, string> = {
  recruiting: '참가 모집 중',
  closed: '모집 마감 · 추첨 대기',
  drawn: '추첨 완료',
  archived: '종료',
  cancelled: '취소됨',
};
