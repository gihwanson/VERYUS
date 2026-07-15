import type { Timestamp } from 'firebase/firestore';

export type FreeSongSubmissionStatus = 'pending' | 'rejected';

export interface FreeSongSubmission {
  id: string;
  approvedSongId: string;
  title: string;
  members: string[];
  submittedBy: string;
  submittedByUid: string;
  createdAt: Timestamp;
  status?: FreeSongSubmissionStatus;
  rejectedAt?: Timestamp;
  rejectedBy?: string;
  /** 리더가 대신 전송한 곡 — 멤버 3곡 한도 집계에서 제외 */
  quotaExempt?: boolean;
}

export type FreeSongLineupItemKind = 'approved' | 'request' | 'openMic' | 'other' | 'custom';

/** 관리자가 선택한 자유곡 진행 순서 항목 */
export interface FreeSongLineupItem {
  submissionId: string;
  approvedSongId?: string;
  title: string;
  members: string[];
  submittedBy: string;
  order: number;
  /** approved(기본): 멤버 전송·선정, request/openMic/other/custom: 관리자 수기 입력 */
  kind?: FreeSongLineupItemKind;
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
