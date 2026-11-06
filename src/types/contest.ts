export type ContestType = '정규등급전' | '세미등급전' | '경연' | '라운드매치' | '신청곡';

export function contestTypeLabel(type: string): string {
  return type === '경연' ? '등급전' : type;
}

export type RoundStatus = 'voting' | 'closed' | 'published';

export type RoundWinner = 'A' | 'B' | 'draw';

export interface ContestBase {
  id: string;
  title: string;
  type: ContestType;
  deadline: { seconds: number } | null;
  createdBy: string;
  ended?: boolean;
  isStarted: boolean;
  entryRestricted?: boolean;
  currentRoundId?: string | null;
  currentRoundNumber?: number;
  defaultTeamAName?: string;
  defaultTeamBName?: string;
  top3?: Array<{ rank: number; name: string; score: number }>;
}

export interface RoundDoc {
  id: string;
  roundNumber: number;
  teamAName: string;
  teamBName: string;
  status: RoundStatus;
  winner?: RoundWinner | null;
  winnerTeamName?: string;
  votesA?: number;
  votesB?: number;
  createdAt?: unknown;
  closedAt?: unknown;
  publishedAt?: unknown;
}

export interface RoundVote {
  uid: string;
  nickname: string;
  choice: 'A' | 'B';
  comment?: string;
  updatedAt?: unknown;
}

/** 신청곡 콘테스트 참여 역할 */
export type SongRequestParticipationRole = '출연자' | '관객';

export interface ParticipantRecord {
  uid: string;
  nickname: string;
  joinedAt?: unknown;
  /** 신청곡: 출연자(곡 수신) / 관객. 없으면 출연자로 취급(관리자 수동 등록 호환) */
  participationRole?: SongRequestParticipationRole | null;
  selectedSongRequestId?: string | null;
  selectedSongTitle?: string | null;
  selectedAt?: unknown;
}

export interface SongRequestRecord {
  id: string;
  targetUid: string;
  targetNickname: string;
  requesterUid: string;
  requesterNickname: string;
  songTitle: string;
  createdAt?: unknown;
}

export interface SongRequestLineupEntry {
  uid: string;
  nickname: string;
  selectedSongTitle: string | null;
}
