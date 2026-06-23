/** 모든 플레이어가 동일한 파이프 배치를 보기 위한 고정 시드 */
export const FLAPPY_PIPE_SEED = 42_061;

export const PIPE_CANVAS_H = 520;
export const PIPE_GROUND_H = 48;
export const PIPE_GAP = 128;
export const PIPE_MAX_GAP_DELTA = 100;

const seededUnit = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43_758.5453;
  return x - Math.floor(x);
};

/** 파이프 인덱스별 gapY — 클라이언트마다 동일한 결과 */
export const getDeterministicPipeGapY = (pipeIndex: number): number => {
  const minGap = PIPE_GAP / 2 + 40;
  const maxGap = PIPE_CANVAS_H - PIPE_GROUND_H - PIPE_GAP / 2 - 40;

  let gapY = PIPE_CANVAS_H / 2;
  for (let i = 0; i <= pipeIndex; i++) {
    const r = seededUnit(FLAPPY_PIPE_SEED + i * 9_973);
    const delta = (r * 2 - 1) * PIPE_MAX_GAP_DELTA;
    gapY = Math.max(minGap, Math.min(maxGap, gapY + delta));
  }
  return gapY;
};
