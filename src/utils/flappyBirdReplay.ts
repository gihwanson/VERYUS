/** 리플레이 체크포인트: t=경과ms, y=새 Y좌표, s=당시 점수 */
export type FlappyReplayPoint = { t: number; y: number; s: number };

export const REPLAY_SAMPLE_MS = 120;
export const MAX_REPLAY_POINTS = 400;
export const MAX_REPLAY_DURATION_MS = 120_000;

export const CANVAS_H_FOR_REPLAY = 520;
export const GROUND_H_FOR_REPLAY = 48;

export class FlappyReplayRecorder {
  private points: FlappyReplayPoint[] = [];
  private lastSampleAt = -Infinity;
  private lastScore = -1;

  reset(): void {
    this.points = [];
    this.lastSampleAt = -Infinity;
    this.lastScore = -1;
  }

  sample(elapsedMs: number, birdY: number, score: number): void {
    const should =
      this.points.length === 0 ||
      elapsedMs - this.lastSampleAt >= REPLAY_SAMPLE_MS ||
      score !== this.lastScore;
    if (!should) return;

    this.points.push({
      t: Math.round(elapsedMs),
      y: Math.round(Math.max(0, Math.min(CANVAS_H_FOR_REPLAY - GROUND_H_FOR_REPLAY, birdY))),
      s: score,
    });
    this.lastSampleAt = elapsedMs;
    this.lastScore = score;

    if (this.points.length > MAX_REPLAY_POINTS) {
      this.points.shift();
    }
  }

  getPoints(): FlappyReplayPoint[] {
    return this.points;
  }
}

export const parseReplay = (raw: unknown): FlappyReplayPoint[] => {
  if (!Array.isArray(raw)) return [];
  const points: FlappyReplayPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = Number((item as FlappyReplayPoint).t);
    const y = Number((item as FlappyReplayPoint).y);
    const s = Number((item as FlappyReplayPoint).s);
    if (
      !Number.isFinite(t) ||
      !Number.isFinite(y) ||
      !Number.isFinite(s) ||
      t < 0 ||
      t > MAX_REPLAY_DURATION_MS ||
      y < 0 ||
      y > CANVAS_H_FOR_REPLAY ||
      s < 0 ||
      s > 9999
    ) {
      continue;
    }
    points.push({ t: Math.round(t), y: Math.round(y), s: Math.round(s) });
    if (points.length >= MAX_REPLAY_POINTS) break;
  }
  return points.sort((a, b) => a.t - b.t);
};

export type ReplaySample = {
  y: number;
  score: number;
  finished: boolean;
};

/** 경과 시간에 맞춰 리플레이 위치·점수 보간 */
export const sampleReplay = (
  points: FlappyReplayPoint[],
  elapsedMs: number
): ReplaySample | null => {
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];

  if (elapsedMs <= first.t) {
    return { y: first.y, score: first.s, finished: false };
  }

  if (elapsedMs >= last.t) {
    return { y: last.y, score: last.s, finished: true };
  }

  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    if (b.t < elapsedMs) continue;
    const a = points[i - 1];
    const ratio = (elapsedMs - a.t) / (b.t - a.t);
    return {
      y: a.y + (b.y - a.y) * ratio,
      score: a.s + (b.s - a.s) * ratio,
      finished: false,
    };
  }

  return { y: last.y, score: last.s, finished: true };
};

export const getReplayFinalScore = (points: FlappyReplayPoint[]): number => {
  if (points.length === 0) return 0;
  return points[points.length - 1].s;
};
