export interface MemberWorldCupQuestion {
  id: string;
  text: string;
  order: number;
}

export const MEMBER_WORLD_CUP_QUESTIONS: MemberWorldCupQuestion[] = [
  { id: 'first-impression', order: 1, text: '첫인상이 가장 좋았던 사람은?' },
  { id: 'best-singer', order: 2, text: '노래를 가장 잘 부르는 사람은?' },
  { id: 'ideal-type', order: 3, text: '이상형에 가까운 사람은?' },
  { id: 'mood-maker', order: 4, text: '분위기 메이커 1위는?' },
  { id: 'funniest', order: 5, text: '웃음을 가장 많이 주는 사람은?' },
];

export const MEMBER_WORLD_CUP_COLLECTION = 'memberWorldCupQuestions';
export const MEMBER_WORLD_CUP_VOTES_COLLECTION = 'memberWorldCupVotes';

export const MEMBER_WORLD_CUP_WEEKLY_RESET_NOTICE =
  '투표·집계는 매주 월요일 00시(KST)에 초기화됩니다. (월~일 한 주)';
