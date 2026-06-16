export const ROOM_ID = 'locked-practice-room';

/** false이면 게임 허브·직접 URL 진입 모두 차단 */
export const LOCKED_PRACTICE_ROOM_AVAILABLE = false;

export const CODES = {
  bag: '92',
  drawer: '9218',
  door: '7391',
  fakeChair: '4382',
  trapDoor: '7328',
} as const;

export const ITEMS = {
  metronome_card: {
    id: 'metronome_card',
    label: '메트로놈 카드',
    emoji: '🎵',
    inspect:
      '앞면: BPM 92 · 4/4\n뒷면을 눌러 뒤집어 보세요.\n\n뒷면: 「서랍 비번은 앞두 자리 + 뒤두 자리. BPM은 가운데에 끼워 넣어.」',
  },
  magnet_key: {
    id: 'magnet_key',
    label: '자석 열쇠',
    emoji: '🧲',
    inspect: '자석이 달린 작은 열쇠. 금속이나 클립에 붙을 것 같다.',
  },
} as const;

export type ItemId = keyof typeof ITEMS;

export const HINTS = [
  {
    id: 'h1',
    label: '가방·서랍',
    text: '가방 비번은 옆 메모의 「오늘 연습 템포」. 숫자 두 자리예요.',
  },
  {
    id: 'h2',
    label: '서랍',
    text: '키보드 스티커 9·1·8 사이에 BPM 92를 끼워 넣어 네 자리를 만들어 보세요.',
  },
  {
    id: 'h3',
    label: '문',
    text: '7328은 불완전해요. 앰프 뒤 스티커와 책상의 연습실 번호를 다시 확인하세요.',
  },
] as const;

export const INTRO_CARDS = [
  '목요일 밤 10시. 너는 연습실에서 혼자 스케일 연습 중이었다.',
  '갑자기 형광등이 꺼지고, 문 쪽 전자록이 「삐—」 하고 잠겼다.',
  '비상등만 남았다. 연습실 곳곳에 누군가 단서를 남긴 것 같다. 서두르지 말고 찾아보자.',
] as const;

export type HotspotId =
  | 'door'
  | 'bag'
  | 'desk'
  | 'keyboard'
  | 'whiteboard'
  | 'clock'
  | 'amp'
  | 'chair'
  | 'trash'
  | 'phone';

export interface HotspotDef {
  id: HotspotId;
  label: string;
  emoji: string;
}

export const HOTSPOTS: HotspotDef[] = [
  { id: 'door', label: '문', emoji: '🚪' },
  { id: 'bag', label: '가방', emoji: '🎒' },
  { id: 'desk', label: '책상', emoji: '🗄️' },
  { id: 'keyboard', label: '키보드', emoji: '🎹' },
  { id: 'whiteboard', label: '화이트보드', emoji: '📋' },
  { id: 'clock', label: '시계', emoji: '🕰️' },
  { id: 'amp', label: '앰프', emoji: '🔊' },
  { id: 'chair', label: '의자', emoji: '🪑' },
  { id: 'trash', label: '휴지통', emoji: '🗑️' },
  { id: 'phone', label: '핸드폰', emoji: '📱' },
];

export const calcRankScore = (
  clearTimeSec: number,
  hintsUsed: number,
  wrongAttempts: number
): number =>
  clearTimeSec + hintsUsed * 60 + Math.floor(wrongAttempts / 5) * 10;

export const calcGrade = (
  hintsUsed: number,
  wrongAttempts: number
): 'S' | 'A' | 'B' | 'C' => {
  if (hintsUsed === 0 && wrongAttempts <= 3) return 'S';
  if (hintsUsed <= 1) return 'A';
  if (hintsUsed <= 2) return 'B';
  return 'C';
};

export const formatElapsed = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
};
