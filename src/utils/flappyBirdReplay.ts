/** 리플레이 체크포인트: t=경과ms, y=새 Y좌표, s=당시 점수 */
export type FlappyReplayPoint = { t: number; y: number; s: number };

export const REPLAY_SAMPLE_MS = 120;
export const MAX_REPLAY_POINTS = 400;
export const MAX_REPLAY_DURATION_MS = 120_000;

export const CANVAS_H_FOR_REPLAY = 520;
export const GROUND_H_FOR_REPLAY = 48;

/** 시작·끝을 유지한 채 균등 다운샘플 (앞부분 절단 금지 — 고스트 t=0 재생용) */
export const downsampleReplayPoints = (
  points: FlappyReplayPoint[],
  maxPoints: number
): FlappyReplayPoint[] => {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 2) return points.slice(0, maxPoints);

  const lastIndex = points.length - 1;
  const result: FlappyReplayPoint[] = [];
  let prevIndex = -1;

  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * lastIndex) / (maxPoints - 1));
    if (index === prevIndex) continue;
    result.push(points[index]);
    prevIndex = index;
  }

  return result;
};

/** 재생이 게임 시작(t=0)과 맞도록 타임스탬프 정규화 */
export const normalizeReplayTimestamps = (
  points: FlappyReplayPoint[]
): FlappyReplayPoint[] => {
  if (points.length === 0) return points;
  const offset = points[0].t;
  if (offset === 0) return points;
  return points.map((p) => ({ ...p, t: Math.max(0, p.t - offset) }));
};

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
      // 앞을 잘라내면 first.t ≫ 0 이 되어 고스트가 초반에 정지함 → 전체 구간 다운샘플
      this.points = downsampleReplayPoints(this.points, MAX_REPLAY_POINTS);
    }
  }

  getPoints(): FlappyReplayPoint[] {
    return normalizeReplayTimestamps(this.points);
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
  }

  const sorted = points.sort((a, b) => a.t - b.t);
  // 과거에 shift로 잘린 기록(first.t > 0)도 초반 정지 없이 재생
  const normalized = normalizeReplayTimestamps(sorted);
  return downsampleReplayPoints(normalized, MAX_REPLAY_POINTS);
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
    const dt = b.t - a.t;
    if (dt <= 0) {
      return { y: b.y, score: b.s, finished: false };
    }
    const ratio = (elapsedMs - a.t) / dt;
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
