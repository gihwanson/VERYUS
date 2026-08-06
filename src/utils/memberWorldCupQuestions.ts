import { getCurrentWeekMondayKey, kstToUtcDate } from './gameWeek';

export interface MemberWorldCupQuestion {
  id: string;
  text: string;
  order: number;
}

/** 매주 노출할 질문 수 */
export const MEMBER_WORLD_CUP_QUESTIONS_PER_WEEK = 5;

/** 첫 주차(2026-08-04~) — 이번 주 5개, 다음 월요일부터 주차별 로테이션 */
export const MEMBER_WORLD_CUP_ROTATION_ANCHOR_WEEK_KEY = '2026-08-04';

/**
 * 이번 주(오픈 주) 전용 — 예전 앱에서 쓰던 ID와 완전히 분리.
 * Firestore에 남아 있는 구 투표/집계와 섞이지 않도록 신규 ID만 사용.
 */
const MEMBER_WORLD_CUP_OPEN_WEEK_QUESTIONS: Omit<MemberWorldCupQuestion, 'order'>[] = [
  { id: '20260804-q1', text: '주인공 오라 제일 강한 사람은?' },
  { id: '20260804-q2', text: '첫인상이랑 실제 성격이 완전 반대인 사람은?' },
  { id: '20260804-q3', text: '"이 사람 왜 이렇게 매력 있지?" 뜻밖에 끌리는 사람은?' },
  { id: '20260804-q4', text: '드라마로 치면 악역 맡을 것 같은 사람은?' },
  { id: '20260804-q5', text: '무인도에 딱 한 명만 데려간다면?' },
];

/** 자극형 · 관계 확장 질문 (오픈 주 5개 제외) */
const MEMBER_WORLD_CUP_SPICY_QUESTION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] = [
  { id: 'secret-talent', text: '겉으론 평범한데 알고 보니 실력이 제일 무서운 사람은?' },
  { id: 'quiet-bomb', text: '말수 적은데 한마디 할 때마다 분위기 터뜨리는 사람은?' },
  { id: 'cool-but-soft', text: '겉은 쿨한데 속은 엄청 다정한 사람은?' },
  { id: 'soft-but-bold', text: '겉은 순한데 무대/연습에선 야수인 사람은?' },
  { id: 'hidden-competitive', text: '겉으론 안 그런 척 하는데 승부욵 제일 센 사람은?' },
  { id: 'unexpected-leader', text: '리더 아닌데 실질적 대장인 사람은?' },
  { id: 'biggest-surprise', text: '베리어스 들어온 뒤 이미지가 가장 바뀐 사람은?' },
  { id: 'main-character', text: '주인공 오라가 가장 강한 사람은?' },
  { id: 'different-inside', text: '알고 보니 성격이 완전 반대인 사람은?' },
  { id: 'villain-role', text: '드라마 악역 캐스팅 1순위는?' },
  { id: 'comic-relief', text: '코믹 담당 1티어는?' },
  { id: 'chaos-maker', text: '갑자기 분위기를 뒤집는 사람은?' },
  { id: 'talk-show-guest', text: '토크쇼 나가면 말 많이 할 사람은?' },
  { id: 'mystery-person', text: '가장 알 수 없는 사람은?' },
  { id: 'team-mascot', text: '팀 마스코트 역할인 사람은?' },
  { id: 'zombie-survivor', text: '좀비 터지면 제일 오래 살 사람은?' },
  { id: 'argument-winner', text: '팀 내 논쟁 나면 이길 것 같은 사람은?' },
  { id: 'secret-keeper', text: '비밀 맡기면 절대 안 새는 사람은?' },
  { id: 'secret-spiller', text: '비밀 실수로 털릴 것 같은 사람은?' },
  { id: 'crisis-leader', text: '갑자기 사고 나면 먼저 나서는 사람은?' },
  { id: 'panic-first', text: '위기 상황에서 제일 당황할 것 같은 사람은?' },
  { id: 'negotiator', text: '협상/중재 맡기면 믿을 사람은?' },
  { id: 'stage-aura', text: '무대 올라가면 사람이 바뀌는 사람은?' },
  { id: 'offstage-vs-on', text: '평소랑 공연 때 차이가 가장 큰 사람은?' },
  { id: 'crowd-magnet', text: '관객 시선 다 뺏을 사람은?' },
  { id: 'stage-nervous', text: '공연 전 긴장 제일 티 나는 사람은?' },
  { id: 'afterglow', text: '공연 끝나도 여운 남는 사람은?' },
  { id: 'one-scene', text: '한 장면만 기억에 남는 사람은? (누구?)' },
  { id: 'encore-wanted', text: '앵콜 한 번 더 보고 싶은 사람은?' },
  { id: 'style-icon', text: '무대 스타일/포스 제일 기억에 남는 사람은?' },
  { id: 'ideal-type', text: '이상형에 가장 가까운 사람은?' },
  { id: 'best-chemistry', text: '둘이 있으면 케미 터지는 조합의 한 명은? (누구?)' },
  { id: 'trust-back', text: '등 뒤 맡기면 든든한 사람은?' },
  { id: 'want-duet', text: '듀엣/이어부르기 꼭 하고 싶은 사람은?' },
  { id: 'underrated', text: '실력/매력 제일 과소평가되는 사람은?' },
  { id: 'overrated-joke', text: '(장난 반 진심 반) 자신감 제일 넘치는 사람은?' },
  { id: 'representative', text: '베리어스 대표 캐릭터는?' },
  { id: 'miss-if-gone', text: '베리어스에서 없어지면 제일 아쉬울 사람은?' },
  { id: 'closest-quiet', text: '말 많이 안 해도 묘하게 가장 가까운 사람은?' },
  { id: 'vent-after-bad-day', text: '기분 안 좋을 때 제일 먼저 털어놓고 싶은 사람은?' },
  { id: 'good-news-first', text: '좋은 일 생기면 제일 먼저 알려주고 싶은 사람은?' },
  { id: 'off-meet-want', text: '오프 모임에서 꼭 같이 있고 싶은 사람은?' },
  { id: 'natural-duo', text: '둘이 있으면 찰떡인 사람은? (파트너 느낌)' },
  { id: 'protect-instinct', text: '왠지 챙겨주고 싶은 사람은?' },
  { id: 'honest-feedback', text: '내 노래/무대 솔직한 피드백 들을 때 제일 믿는 사람은?' },
  { id: 'rival-but-close', text: '겉으론 라이벌 같은데 실은 가까운 사람은?' },
  { id: 'sit-next-to', text: '연습/모임에서 옆자리 맡고 싶은 사람은?' },
  { id: 'late-night-talk', text: '새벽까지 얘기할 수 있을 것 같은 사람은?' },
  { id: 'introduce-to-friends', text: '베리어스 밖 친구한테 소개해 주고 싶은 사람은?' },
  { id: 'meme-lord', text: '밈/드립 제조기 1위는?' },
  { id: 'desert-island', text: '무인도에 한 명만 고른다면?' },
];

/** 클래식 카테고리 질문 (1~10번, 중복 항목 제외) */
const MEMBER_WORLD_CUP_CLASSIC_QUESTION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] = [
  { id: 'first-impression', text: '첫인상이 가장 좋았던 사람은?' },
  { id: 'different-image', text: '실제로 알고 보니 이미지와 가장 다른 사람은?' },
  { id: 'quiet-presence', text: '말수는 적은데 존재감 있는 사람은?' },
  { id: 'mood-maker', text: '분위기 메이커 1위는?' },
  { id: 'calm-stable', text: '가장 차분하고 안정적인 사람은?' },
  { id: 'energetic', text: '가장 에너지 넘치는 사람은?' },
  { id: 'funniest', text: '웃음을 가장 많이 주는 사람은?' },
  { id: 'time-flies-talk', text: '누구랑 얘기하면 시간 가는 줄 모르는 사람은?' },
  { id: 'friendly-approach', text: '가장 친근하게 다가오는 사람은?' },
  { id: 'best-singer', text: '노래를 가장 잘 부르는 사람은?' },
  { id: 'high-note', text: '고음이 가장 인상적인 사람은?' },
  { id: 'low-mid-voice', text: '저음/중음이 가장 좋은 사람은?' },
  { id: 'emotional-express', text: '감정 표현이 가장 뛰어난 사람은?' },
  { id: 'live-better', text: '라이브로 들을수록 더 좋아지는 사람은?' },
  { id: 'unique-voice', text: '목소리 톤이 가장 독특한 사람은?' },
  { id: 'harmony-master', text: '하모니를 가장 잘 맞추는 사람은?' },
  { id: 'solo-part', text: '솔로 파트를 가장 잘 소화하는 사람은?' },
  { id: 'running-bridge', text: '러닝/브릿지가 가장 안정적인 사람은?' },
  { id: 'recording-talent', text: '녹음 들어보면 실력이 더 대단한 사람은?' },
  { id: 'stage-presence', text: '무대 위 존재감 1위는?' },
  { id: 'cool-on-stage', text: '공연할 때 가장 멋있어 보이는 사람은?' },
  { id: 'expressive-body', text: '표정/몸짓이 가장 살아있는 사람은?' },
  { id: 'crowd-reaction-lead', text: '관객 반응을 가장 잘 이끄는 사람은?' },
  { id: 'stage-fashion', text: '무대 의상/스타일이 가장 기억에 남는 사람은?' },
  { id: 'most-diligent', text: '연습에 가장 성실한 사람은?' },
  { id: 'practice-focus', text: '연습실에서 가장 집중 잘하는 사람은?' },
  { id: 'feedback-receiver', text: '피드백을 가장 잘 받아들이는 사람은?' },
  { id: 'team-caretaker', text: '팀원을 가장 잘 챙기는 사람은?' },
  { id: 'stays-late', text: '늦어도 끝까지 남는 사람은?' },
  { id: 'practice-vibe', text: '연습 분위기를 가장 좋게 만드는 사람은?' },
  { id: 'duet-partner-match', text: '파트너랑 합주/이어 부르기 잘 맞는 사람은?' },
  { id: 'eval-active', text: '평가게시판 참여가 가장 열심인 사람은?' },
  { id: 'chat-active', text: '단톡/게시판에서 가장 활발한 사람은?' },
  { id: 'sudden-funny', text: '갑자기 웃긴 말 해서 분위기 터뜨리는 사람은?' },
  { id: 'catchphrase-maker', text: '베리어스만의 유행어를 만들 것 같은 사람은?' },
  { id: 'drinking-mood', text: '술자리/회식 분위기 담당은?' },
  { id: 'photo-frequent', text: '사진/영상에 자주 등장하는 사람은?' },
  { id: 'profile-unique', text: '프로필 사진이 가장 개성 있는 사람은?' },
  { id: 'leader-vibe', text: '리더/대장 기질이 있는 사람은?' },
  { id: 'quiet-pro', text: '조용한 실력파는?' },
  { id: 'jokester-pro', text: '겉은 장난꾸러기, 속은 프로인 사람은?' },
  { id: 'kindest', text: '가장 다정한 사람은?' },
  { id: 'most-honest', text: '가장 솔직한 사람은?' },
  { id: 'most-cautious', text: '가장 신중한 사람은?' },
  { id: 'most-adventurous', text: '가장 모험적인 사람은?' },
  { id: 'fashion-sense', text: '패션/스타일 sense 1위는?' },
  { id: 'unique-hobby', text: '취미가 가장 독특한 사람은?' },
  { id: 'food-lover', text: '먹는 걸 가장 좋아하는 사람은?' },
  { id: 'travel-lover', text: '여행/외출 많이 다닐 것 같은 사람은?' },
  { id: 'homebody', text: '집순이/집돌이일 것 같은 사람은?' },
  { id: 'pet-person', text: '애완동물 키울 것 같은 사람은?' },
  { id: 'gamer-ott', text: '게임/OTT 많이 할 것 같은 사람은?' },
  { id: 'quiz-show', text: '퀴즈쇼 대표 출전 시킬 사람은?' },
  { id: 'celebrity-debut', text: '연예인 데뷔하면 잘 될 사람은?' },
  { id: 'youtube-creator', text: '유튜브/콘텐츠 크리에이터 하면 잘 할 사람은?' },
  { id: 'mc-trust', text: 'MC/사회자 맡기면 믿을 수 있는 사람은?' },
  { id: 'navigator-lost', text: '길 잃었을 때 내비게이터 역할은?' },
  { id: 'mood-lifter-cold', text: '분위기 싸해지면 분위기 푸는 사람은?' },
  { id: 'recording-expected', text: '녹음게시판 업로드가 가장 기대되는 사람은?' },
  { id: 'hall-of-fame-potential', text: '명예의전당에 오를 가능성이 가장 높은 사람은?' },
  { id: 'chorus-want-hear', text: '이어 부르기 게시판에서 가장 듣고 싶은 사람은?' },
  { id: 'partner-post-frequent', text: '파트너모집글에 가장 많이 올 것 같은 사람은?' },
  { id: 'rookie-talent', text: '신입 때부터 실력이 눈에 띈 사람은?' },
  { id: 'fast-growth', text: '성장 속도가 가장 빠른 사람은?' },
  { id: 'history-maker', text: '베리어스 역사에 남을 사람은?' },
  { id: 'ten-year-connection', text: '10년 뒤에도 베리어스와 연결돼 있을 사람은?' },
  { id: 'reliable-together', text: '함께 있으면 든든한 사람은?' },
  { id: 'advice-wanted', text: '고민 상담 받고 싶은 사람은?' },
  { id: 'learn-from', text: '가장 배울 점이 많은 사람은?' },
  { id: 'positive-influence', text: '팀에 긍정적 영향을 가장 많이 주는 사람은?' },
  { id: 'glad-to-have', text: '"베리어스에 있어서 다행"이라고 생각한 사람은?' },
  { id: 'off-meet-glad', text: '오프 모임에서 만나면 반가운 사람은?' },
  { id: 'want-same-stage', text: '다음 공연에서 꼭 같이 무대에 서고 싶은 사람은?' },
];

/** 2주차부터 순환하는 로테이션 풀 (중복 ID·유사 문구 제거) */
const MEMBER_WORLD_CUP_ROTATION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] = [
  ...MEMBER_WORLD_CUP_SPICY_QUESTION_POOL,
  ...MEMBER_WORLD_CUP_CLASSIC_QUESTION_POOL,
];

/** 전체 질문 목록 (오픈 주 + 로테이션) */
export const MEMBER_WORLD_CUP_QUESTION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] = [
  ...MEMBER_WORLD_CUP_OPEN_WEEK_QUESTIONS,
  ...MEMBER_WORLD_CUP_ROTATION_POOL,
];

export const MEMBER_WORLD_CUP_COLLECTION = 'memberWorldCupQuestions';
export const MEMBER_WORLD_CUP_VOTES_COLLECTION = 'memberWorldCupVotes';

export const MEMBER_WORLD_CUP_WEEKLY_RESET_NOTICE =
  '매주 월요일 00시(KST)에 질문 5개가 바뀌고, 투표·집계가 초기화됩니다. (월~일 한 주)';

function parseWeekKeyToUtc(weekKey: string): Date {
  const [y, m, d] = weekKey.split('-').map(Number);
  return kstToUtcDate(y, m, d);
}

/** 앵커 주(2026-08-04)부터 몇 주째인지 (0 = 오픈 주) */
export function getMemberWorldCupWeekIndex(at = new Date()): number {
  const currentWeekKey = getCurrentWeekMondayKey(at);
  const anchorMs = parseWeekKeyToUtc(MEMBER_WORLD_CUP_ROTATION_ANCHOR_WEEK_KEY).getTime();
  const currentMs = parseWeekKeyToUtc(currentWeekKey).getTime();
  const weeksSinceAnchor = Math.round((currentMs - anchorMs) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, weeksSinceAnchor);
}

/** 이번 주(월~일)에 노출할 질문 5개 */
export function getActiveMemberWorldCupQuestions(at = new Date()): MemberWorldCupQuestion[] {
  const weekIndex = getMemberWorldCupWeekIndex(at);
  const perWeek = MEMBER_WORLD_CUP_QUESTIONS_PER_WEEK;

  if (weekIndex === 0) {
    return MEMBER_WORLD_CUP_OPEN_WEEK_QUESTIONS.map((question, index) => ({
      ...question,
      order: index + 1,
    }));
  }

  const pool = MEMBER_WORLD_CUP_ROTATION_POOL;
  const start = ((weekIndex - 1) * perWeek) % pool.length;

  return Array.from({ length: perWeek }, (_, index) => {
    const item = pool[(start + index) % pool.length];
    return { ...item, order: index + 1 };
  });
}

export function findMemberWorldCupQuestionById(id: string): MemberWorldCupQuestion | undefined {
  const poolItem = MEMBER_WORLD_CUP_QUESTION_POOL.find((item) => item.id === id);
  if (!poolItem) return undefined;
  return { ...poolItem, order: 0 };
}

export function isActiveMemberWorldCupQuestionId(id: string, at = new Date()): boolean {
  return getActiveMemberWorldCupQuestions(at).some((question) => question.id === id);
}
