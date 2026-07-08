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

export interface FreeSongPerformerStats {
  performers: Record<string, number>;
  updatedAt?: Timestamp;
}
