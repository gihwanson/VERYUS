export type ContestType = '정규등급전' | '세미등급전' | '경연' | '라운드매치';

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

export interface ParticipantRecord {
  uid: string;
  nickname: string;
  joinedAt?: unknown;
}
