/** 눈썰미: 비슷한 한글 음절 중 다른 하나 찾기 */

export const SESSION_ROUNDS = 5;

/** 시각적으로 헷갈리기 쉬운 음절 쌍 (공통 / 다른 하나) */
const SYLLABLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['가', '거'],
  ['나', '너'],
  ['다', '더'],
  ['라', '러'],
  ['마', '머'],
  ['바', '버'],
  ['사', '서'],
  ['아', '어'],
  ['자', '저'],
  ['차', '처'],
  ['카', '커'],
  ['타', '터'],
  ['파', '퍼'],
  ['하', '허'],
  ['고', '교'],
  ['노', '뇨'],
  ['도', '됴'],
  ['로', '료'],
  ['모', '묘'],
  ['보', '뵤'],
  ['소', '쇼'],
  ['오', '요'],
  ['조', '죠'],
  ['초', '쵸'],
  ['코', '쿄'],
  ['토', '툐'],
  ['포', '표'],
  ['호', '효'],
  ['구', '규'],
  ['누', '뉴'],
  ['두', '듀'],
  ['루', '류'],
  ['무', '뮤'],
  ['부', '뷰'],
  ['수', '슈'],
  ['우', '유'],
  ['주', '쥬'],
  ['추', '츄'],
  ['쿠', '큐'],
  ['투', '튜'],
  ['푸', '퓨'],
  ['후', '휴'],
  ['개', '게'],
  ['내', '네'],
  ['대', '데'],
  ['래', '레'],
  ['매', '메'],
  ['배', '베'],
  ['새', '세'],
  ['애', '에'],
  ['재', '제'],
  ['채', '체'],
  ['캐', '케'],
  ['태', '테'],
  ['패', '페'],
  ['해', '헤'],
  ['가', '까'],
  ['다', '따'],
  ['바', '빠'],
  ['사', '싸'],
  ['자', '짜'],
  ['고', '구'],
  ['노', '누'],
  ['도', '두'],
  ['로', '루'],
  ['모', '무'],
  ['보', '부'],
  ['소', '수'],
  ['오', '우'],
  ['조', '주'],
  ['초', '추'],
  ['코', '쿠'],
  ['토', '투'],
  ['포', '푸'],
  ['호', '후'],
  ['야', '여'],
  ['와', '워'],
  ['외', '위'],
  ['의', '이'],
  ['마', '아'],
  ['모', '오'],
  ['무', '우'],
  ['미', '이'],
  ['며', '여'],
  ['묘', '요'],
  ['뮤', '유'],
  ['므', '으'],
];

export interface NunSalMiRound {
  common: string;
  odd: string;
  /** 찾을 글자 안내 ("거" 찾기) */
  prompt: string;
  cells: string[];
  oddIndex: number;
  cols: number;
}

const ROUND_COLS = [4, 5, 6, 7, 8] as const;

const mulberry32 = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const pickPair = (rand: () => number): { common: string; odd: string } => {
  const pair = SYLLABLE_PAIRS[Math.floor(rand() * SYLLABLE_PAIRS.length)];
  const swap = rand() < 0.5;
  return swap
    ? { common: pair[1], odd: pair[0] }
    : { common: pair[0], odd: pair[1] };
};

/** 라운드 번호(0-based)에 맞는 그리드 생성 */
export const createNunSalMiRound = (roundIndex: number, seed?: number): NunSalMiRound => {
  const rand = mulberry32(
    seed ?? (Date.now() ^ (Math.floor(Math.random() * 0xffffffff) + roundIndex * 9973))
  );
  const cols = ROUND_COLS[Math.min(roundIndex, ROUND_COLS.length - 1)];
  const total = cols * cols;
  const { common, odd } = pickPair(rand);
  const oddIndex = Math.floor(rand() * total);
  const cells = Array.from({ length: total }, (_, i) => (i === oddIndex ? odd : common));

  return {
    common,
    odd,
    prompt: `"${odd}" 찾기`,
    cells,
    oddIndex,
    cols,
  };
};

export const createNunSalMiSession = (seed?: number): NunSalMiRound[] => {
  const base = seed ?? Math.floor(Math.random() * 0xffffffff);
  return Array.from({ length: SESSION_ROUNDS }, (_, i) =>
    createNunSalMiRound(i, (base + i * 7919) >>> 0)
  );
};
