import type { Timestamp } from 'firebase/firestore';

export interface FreeSongSubmission {
  id: string;
  approvedSongId: string;
  title: string;
  members: string[];
  submittedBy: string;
  submittedByUid: string;
  createdAt: Timestamp;
}

/** 관리자가 선택한 자유곡 진행 순서 항목 */
export interface FreeSongLineupItem {
  submissionId: string;
  approvedSongId: string;
  title: string;
  members: string[];
  submittedBy: string;
  order: number;
  completedAt?: Timestamp;
  completedBy?: string;
}

/** 멤버가 진행 순서에서 스스로 제거한 기록 (관리자 알림용) */
export interface FreeSongSelfWithdrawalNotice {
  id: string;
  submissionId: string;
  title: string;
  members: string[];
  submittedBy: string;
  withdrawnBy: string;
  withdrawnAt: Timestamp;
  dismissedAt?: Timestamp;
}

export interface FreeSongPerformerStats {
  performers: Record<string, number>;
  updatedAt?: Timestamp;
}
