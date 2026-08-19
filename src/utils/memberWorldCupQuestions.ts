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

/** 2주차부터 — 자극형 질문 풀 (120개, 매주 weekKey 시드로 랜덤 5개) */
const MEMBER_WORLD_CUP_ROTATION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] = [
  // A. 연애 · 고백 · 매력
  { id: 'prov-most-player', text: '여기서 가장 주당일 것 같은 사람은?' },
  { id: 'prov-most-confessions', text: '여기서 이성에게 고백 제일 많이 받아봤을 것 같은 사람은?' },
  { id: 'prov-dating-experience', text: '연애 경험 제일 많을 것 같은 사람은?' },
  { id: 'prov-many-some', text: '썸 타는 사람 제일 많을 것 같은 사람은?' },
  { id: 'prov-most-rejected', text: '고백 거절 제일 많이 당해봤을 것 같은 사람은?' },
  { id: 'prov-ideal-type', text: '이상형에 가장 가까운 사람은?' },
  { id: 'prov-unexpected-charm', text: '"이 사람 왜 이렇게 매력 있지?" 뜻밖에 끌리는 사람은?' },
  { id: 'prov-popular-outside', text: '베리어스 밖에서도 인기 많을 것 같은 사람은?' },
  { id: 'prov-long-relationship', text: '연애하면 오래 갈 것 같은 사람은?' },
  { id: 'prov-short-relationship', text: '연애하면 금방 식을 것 같은 사람은?' },
  { id: 'prov-most-exes', text: '전 애인 제일 많을 것 같은 사람은?' },
  { id: 'prov-secret-crush', text: '지금 누군가 몰래 좋아하고 있을 것 같은 사람은?' },
  { id: 'prov-good-dater', text: '데이트하면 분위기 제일 잘 살릴 것 같은 사람은?' },
  { id: 'prov-confess-first', text: '좋아하면 먼저 고백할 것 같은 사람은?' },
  { id: 'prov-quick-yes', text: '고백받으면 바로 받아줄 것 같은 사람은?' },
  { id: 'prov-friend-to-lover', text: '친구에서 연인될 것 같은 사람은?' },
  { id: 'prov-drunk-confess', text: '술 마시면 고백할 것 같은 사람은?' },
  { id: 'prov-keep-dating-secret', text: '연애 비밀 제일 잘 지킬 것 같은 사람은?' },
  { id: 'prov-jealous-type', text: '연애할 때 질투 제일 많을 것 같은 사람은?' },
  { id: 'prov-cool-lover', text: '연애할 때 가장 여유로울 것 같은 사람은?' },
  { id: 'prov-never-cheat', text: '절대 바람 안 필 것 같은 사람은?' },
  { id: 'prov-attractive-honest', text: '솔직히 가장 매력적인 사람은?' },
  { id: 'prov-couple-photo', text: '인스타에 커플샷 올릴 것 같은 사람은?' },
  { id: 'prov-no-couple-photo', text: '인스타에 커플샷 절대 안 올릴 것 같은 사람은?' },
  { id: 'prov-love-advice', text: '연애 고민 상담 맡기면 믿을 사람은?' },

  // B. 썸 · 연애판 · 솔직한 한마디
  { id: 'prov-some-master', text: '썸 잘 탈 것 같은 사람은?' },
  { id: 'prov-ghosting', text: '읽씹 잘할 것 같은 사람은?' },
  { id: 'prov-late-night-text', text: '새벽에 "자?" 톡 보낼 것 같은 사람은?' },
  { id: 'prov-love-triangle', text: '삼각관계 휘말릴 것 같은 사람은?' },
  { id: 'prov-back-up', text: '차선책으로 연애할 것 같은 사람은?' },
  { id: 'prov-one-sided', text: '짝사랑 오래할 것 같은 사람은?' },
  { id: 'prov-move-fast', text: '연애 속도 제일 빠를 것 같은 사람은?' },
  { id: 'prov-move-slow', text: '연애 속도 제일 느릴 것 같은 사람은?' },
  { id: 'prov-flirt-master', text: '플러팅 잘할 것 같은 사람은?' },
  { id: 'prov-clueless-flirt', text: '플러팅 와도 못 알아챌 것 같은 사람은?' },
  { id: 'prov-ex-stalker', text: '전 애인한테 연락 올 것 같은 사람은?' },
  { id: 'prov-dating-app', text: '소개팅앱 잘 쓸 것 같은 사람은?' },
  { id: 'prov-blind-date-star', text: '소개팅 나가면 잘 될 것 같은 사람은?' },
  { id: 'prov-valentine-panic', text: '발렌타인데이 혼자일 것 같은 사람은?' },
  { id: 'prov-white-day-hero', text: '화이트데이에 선물 폭탄 맞을 것 같은 사람은?' },
  { id: 'prov-anniversary-forget', text: '기념일 까먹을 것 같은 사람은?' },
  { id: 'prov-anniversary-perfect', text: '기념일 챙기면 전설 될 것 같은 사람은?' },
  { id: 'prov-breakup-text', text: '카톡으로 차일 것 같은 사람은?' },
  { id: 'prov-breakup-drama', text: '이별 드라마 주인공 될 것 같은 사람은?' },
  { id: 'prov-get-back-ex', text: '전 애인이랑 다시 사귈 것 같은 사람은?' },

  // C. 겉 vs 속 · 반전
  { id: 'prov-opposite-personality', text: '첫인상이랑 실제 성격 완전 반대인 사람은?' },
  { id: 'prov-secret-talent', text: '겉으론 평범한데 알고 보니 실력 무서운 사람은?' },
  { id: 'prov-quiet-bomb', text: '말수 적은데 한마디에 분위기 터뜨리는 사람은?' },
  { id: 'prov-cool-but-soft', text: '겉은 차가운데 속은 엄청 다정한 사람은?' },
  { id: 'prov-soft-but-wild', text: '겉은 순한데 속은 야수인 사람은?' },
  { id: 'prov-hidden-player', text: '겉으론 순둥한데 연애는 야무진 사람은?' },
  { id: 'prov-biggest-surprise', text: '베리어스 들어온 뒤 이미지가 가장 바뀐 사람은?' },
  { id: 'prov-different-image', text: '실제로 알고 보니 이미지와 가장 다른 사람은?' },
  { id: 'prov-secret-rich', text: '숨겨진 재력(?) 있을 것 같은 사람은?' },
  { id: 'prov-secret-celebrity', text: '알고 보니 인스타 팔로워 많을 것 같은 사람은?' },
  { id: 'prov-looks-innocent', text: '얼굴만 보면 순해 보이는데 절대 아닌 사람은?' },
  { id: 'prov-looks-tough', text: '얼굴만 보면 센데 속은 반전인 사람은?' },
  { id: 'prov-different-drunk', text: '술 마시면 사람 바뀌는 사람은?' },
  { id: 'prov-different-stage', text: '무대 올라가면 사람 바뀌는 사람은?' },
  { id: 'prov-hidden-competitive', text: '겉으론 안 그런 척 하는데 승부욕 센 사람은?' },

  // D. 캐릭터 · 드라마 · 밈
  { id: 'prov-main-character', text: '주인공 오라 제일 강한 사람은?' },
  { id: 'prov-villain', text: '드라마로 치면 악역 맡을 것 같은 사람은?' },
  { id: 'prov-second-lead', text: '드라마로 치면 서브 주연인 사람은?' },
  { id: 'prov-chaos-maker', text: '갑자기 분위기 뒤집는 사람은?' },
  { id: 'prov-meme-lord', text: '밈/드립 제조기 1위는?' },
  { id: 'prov-mystery', text: '가장 알 수 없는 사람은?' },
  { id: 'prov-gossip-source', text: '팀 소문 제일 많이 아는 사람은?' },
  { id: 'prov-gossip-spread', text: '소문 제일 빨리 퍼뜨릴 것 같은 사람은?' },
  { id: 'prov-drama-queen', text: '사소한 일도 드라마 만들 사람은?' },
  { id: 'prov-peacemaker', text: '싸움 나면 중재 잘할 사람은?' },
  { id: 'prov-trouble-maker', text: '무슨 일이든 터지면 거기 있을 사람은?' },
  { id: 'prov-lucky-charm', text: '옆에 있으면 운 좋아질 것 같은 사람은?' },
  { id: 'prov-jinx', text: '옆에 있으면 일 꼬일 것 같은 사람은?' },
  { id: 'prov-representative', text: '베리어스 대표 캐릭터는?' },
  { id: 'prov-team-mascot', text: '팀 마스코트 1위는?' },

  // E. "만약에" · 시나리오
  { id: 'prov-desert-island', text: '무인도에 딱 한 명만 데려간다면?' },
  { id: 'prov-desert-island-exclude', text: '무인도에 절대 안 데려갈 사람은?' },
  { id: 'prov-zombie', text: '좀비 터지면 제일 오래 살 사람은?' },
  { id: 'prov-zombie-first', text: '좀비 터지면 제일 먼저 죽을 것 같은 사람은?' },
  { id: 'prov-lottery-win', text: '로또 1등 터지면 제일 먼저 알려줄 사람은?' },
  { id: 'prov-lottery-hide', text: '로또 1등 터져도 숨길 것 같은 사람은?' },
  { id: 'prov-celebrity-debut', text: '연예인 데뷔하면 잘 될 사람은?' },
  { id: 'prov-youtube-couple', text: '커플 유튜브 하면 대박 날 것 같은 사람은?' },
  { id: 'prov-reality-show', text: '연애 리얼리티 나가면 화제 될 사람은?' },
  { id: 'prov-hide-relationship', text: '연애해도 절대 안 밝힐 것 같은 사람은?' },
  { id: 'prov-public-relationship', text: '연애하면 바로 공개할 것 같은 사람은?' },
  { id: 'prov-office-romance', text: '베리어스 내 연애 터질 것 같은 사람은?' },
  { id: 'prov-forbidden-crush', text: '안 되는 사람 좋아할 것 같은 사람은?' },
  { id: 'prov-argument-winner', text: '팀 내 논쟁 나면 이길 것 같은 사람은?' },
  { id: 'prov-argument-loser', text: '팀 내 논쟁 나면 질 것 같은 사람은?' },

  // F. 관계 · 케미 · 솔직한 호감
  { id: 'prov-best-chemistry', text: '둘이 있으면 케미 터지는 사람은?' },
  { id: 'prov-secret-couple', text: '몰래 썸/연애 중일 것 같은 커플의 한 명은?' },
  { id: 'prov-should-date', text: '솔직히 둘이 사귀면 좋겠는 사람은?' },
  { id: 'prov-never-date', text: '절대 안 어울리는데 자꾸 엮일 사람은?' },
  { id: 'prov-rival-close', text: '겉으론 라이벌인데 실은 가까운 사람은?' },
  { id: 'prov-want-duet', text: '듀엣/이어부르기 꼭 하고 싶은 사람은?' },
  { id: 'prov-miss-if-gone', text: '없어지면 제일 아쉬울 사람은?' },
  { id: 'prov-trust-secret', text: '비밀 맡기면 절대 안 새는 사람은?' },
  { id: 'prov-spill-secret', text: '비밀 실수로 털릴 것 같은 사람은?' },
  { id: 'prov-late-night-call', text: '새벽에 전화 받아줄 것 같은 사람은?' },
  { id: 'prov-off-meet-crush', text: '오프 모임에서 꼭 보고 싶은 사람은?' },
  { id: 'prov-introduce-parents', text: '부모님께 소개하고 싶은 사람은?' },
  { id: 'prov-introduce-friends', text: '내 친구한테 소개해 주고 싶은 사람은?' },
  { id: 'prov-underrated-charm', text: '매력 제일 과소평가되는 사람은?' },
  { id: 'prov-overconfident', text: '(장난 반) 자신감 제일 넘치는 사람은?' },

  // G. 무대 · 존재감 · 추가 자극
  { id: 'prov-stage-aura', text: '무대 위 존재감 1위는?' },
  { id: 'prov-crowd-magnet', text: '관객 시선 다 뺏을 사람은?' },
  { id: 'prov-sexy-on-stage', text: '공연할 때 제일 섹시해 보이는 사람은?' },
  { id: 'prov-cute-on-stage', text: '공연할 때 제일 귀여워 보이는 사람은?' },
  { id: 'prov-stage-nervous', text: '공연 전 긴장 제일 티 나는 사람은?' },
  { id: 'prov-best-singer', text: '노래 제일 잘 부르는 사람은?' },
  { id: 'prov-best-dancer', text: '춤 추면 제일 볼만한 사람은?' },
  { id: 'prov-best-style', text: '패션/스타일 감각 1위는?' },
  { id: 'prov-best-smile', text: '웃을 때 제일 설레는 사람은?' },
  { id: 'prov-best-voice-message', text: '목소리만 들어도 설릴 것 같은 사람은?' },
  { id: 'prov-best-hug', text: '포옹하면 설릴 것 같은 사람은?' },
  { id: 'prov-best-scent', text: '향수/체취(?) 좋을 것 같은 사람은?' },
  { id: 'prov-most-touchy', text: '스킨십 많을 것 같은 사람은?' },
  { id: 'prov-most-tsundere', text: '츤데레일 것 같은 사람은?' },
  { id: 'prov-most-deredere', text: '갑자기 직진할 것 같은 사람은?' },
];

/** 전체 질문 목록 (오픈 주 + 로테이션) */
export const MEMBER_WORLD_CUP_QUESTION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] = [
  ...MEMBER_WORLD_CUP_OPEN_WEEK_QUESTIONS,
  ...MEMBER_WORLD_CUP_ROTATION_POOL,
];

/** 리더가 고를 수 있는 질문 풀 (120개) */
export const MEMBER_WORLD_CUP_SELECTABLE_QUESTION_POOL: Omit<MemberWorldCupQuestion, 'order'>[] =
  MEMBER_WORLD_CUP_ROTATION_POOL;

export interface MemberWorldCupWeeklyConfig {
  weekKey: string;
  questionIds: string[];
  source: 'leader' | 'random';
  selectedBy?: string;
  selectedByNickname?: string;
  selectedAt?: unknown;
}

export const MEMBER_WORLD_CUP_COLLECTION = 'memberWorldCupQuestions';
export const MEMBER_WORLD_CUP_VOTES_COLLECTION = 'memberWorldCupVotes';
export const MEMBER_WORLD_CUP_WEEKLY_CONFIG_COLLECTION = 'memberWorldCupWeeklyConfig';

export const MEMBER_WORLD_CUP_WEEKLY_RESET_NOTICE =
  '매주 월요일 00시(KST)에 질문 5개가 바뀌고, 투표·집계가 초기화됩니다. (월~일 한 주)';

function parseWeekKeyToUtc(weekKey: string): Date {
  const [y, m, d] = weekKey.split('-').map(Number);
  return kstToUtcDate(y, m, d);
}

function hashWeekKeyToSeed(weekKey: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < weekKey.length; i += 1) {
    hash ^= weekKey.charCodeAt(i);
    hash = Math.imul(hash, 1_677_761_9);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 앵커 주(2026-08-04)부터 몇 주째인지 (0 = 오픈 주) */
export function getMemberWorldCupWeekIndex(at = new Date()): number {
  const currentWeekKey = getCurrentWeekMondayKey(at);
  const anchorMs = parseWeekKeyToUtc(MEMBER_WORLD_CUP_ROTATION_ANCHOR_WEEK_KEY).getTime();
  const currentMs = parseWeekKeyToUtc(currentWeekKey).getTime();
  const weeksSinceAnchor = Math.round((currentMs - anchorMs) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, weeksSinceAnchor);
}

function mapLeaderQuestionIds(questionIds: string[]): MemberWorldCupQuestion[] | null {
  if (questionIds.length !== MEMBER_WORLD_CUP_QUESTIONS_PER_WEEK) return null;

  const uniqueIds = new Set(questionIds);
  if (uniqueIds.size !== questionIds.length) return null;

  const selectableIds = new Set(MEMBER_WORLD_CUP_SELECTABLE_QUESTION_POOL.map((item) => item.id));
  const mapped: MemberWorldCupQuestion[] = [];

  for (let index = 0; index < questionIds.length; index += 1) {
    const id = questionIds[index];
    if (!selectableIds.has(id)) return null;
    const question = findMemberWorldCupQuestionById(id);
    if (!question) return null;
    mapped.push({ ...question, order: index + 1 });
  }

  return mapped;
}

/** weekKey 시드 기준 결정적 랜덤 5개 */
export function getRandomMemberWorldCupQuestions(
  weekKey: string,
  count = MEMBER_WORLD_CUP_QUESTIONS_PER_WEEK
): MemberWorldCupQuestion[] {
  const seed = hashWeekKeyToSeed(weekKey);
  const shuffled = shuffleWithSeed(MEMBER_WORLD_CUP_ROTATION_POOL, seed);
  return shuffled.slice(0, count).map((question, index) => ({
    ...question,
    order: index + 1,
  }));
}

/** Firestore 주간 설정 + 기본 규칙으로 이번 주 질문 결정 */
export function resolveActiveMemberWorldCupQuestions(
  config: MemberWorldCupWeeklyConfig | null | undefined,
  at = new Date()
): MemberWorldCupQuestion[] {
  const weekKey = getCurrentWeekMondayKey(at);
  const weekIndex = getMemberWorldCupWeekIndex(at);

  if (config?.weekKey === weekKey && config.source === 'leader') {
    const fromLeader = mapLeaderQuestionIds(config.questionIds);
    if (fromLeader) return fromLeader;
  }

  if (weekIndex === 0) {
    return MEMBER_WORLD_CUP_OPEN_WEEK_QUESTIONS.map((question, index) => ({
      ...question,
      order: index + 1,
    }));
  }

  return getRandomMemberWorldCupQuestions(weekKey);
}

/** @deprecated Firestore 설정 없이 호출 — 랜덤/오픈주만 반영 */
export function getActiveMemberWorldCupQuestions(at = new Date()): MemberWorldCupQuestion[] {
  return resolveActiveMemberWorldCupQuestions(null, at);
}

export function findMemberWorldCupQuestionById(id: string): MemberWorldCupQuestion | undefined {
  const poolItem = MEMBER_WORLD_CUP_QUESTION_POOL.find((item) => item.id === id);
  if (!poolItem) return undefined;
  return { ...poolItem, order: 0 };
}

export function isActiveMemberWorldCupQuestionId(id: string, at = new Date()): boolean {
  return getActiveMemberWorldCupQuestions(at).some((question) => question.id === id);
}
