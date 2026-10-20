/** 10점 구간(0, 10, …, 100) — 중심 평균용 */
export const CONTEST_SCORE_CLUSTER_BIN = 10;

function validScores(scores: number[]): number[] {
  return scores.filter((s) => Number.isFinite(s));
}

export function computeOverallMean(scores: number[]): number | null {
  const valid = validScores(scores);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function binStartForContestScore(
  score: number,
  binWidth = CONTEST_SCORE_CLUSTER_BIN
): number {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped >= 100) return 100;
  return Math.floor(clamped / binWidth) * binWidth;
}

/** UI용 점수 구간 라벨 (예: 90~99점, 100점) */
export function formatContestScoreBinLabel(
  binStart: number,
  binWidth = CONTEST_SCORE_CLUSTER_BIN
): string {
  if (binStart >= 100) return '100점';
  return `${binStart}~${binStart + binWidth - 1}점`;
}

export type ContestScoreBinScoreEntry = {
  score: number;
  weight: number;
};

export type ContestScoreBinStat = {
  binStart: number;
  label: string;
  /** 구간 선택·막대용 가중치 합 */
  count: number;
  rawVoteCount: number;
  scoreEntries: ContestScoreBinScoreEntry[];
  /** @deprecated 표시 호환 — scoreEntries와 동일 정보 */
  scores: number[];
  isSelected: boolean;
  tiedForMax: boolean;
};

export type ClusterMeanBreakdown = {
  binWidth: number;
  totalVotes: number;
  totalEffectiveWeight: number;
  weighted: boolean;
  clusterMean: number | null;
  selectedBinStart: number | null;
  selectedBinLabel: string | null;
  scoresInCluster: number[];
  clusterScoreEntries: ContestScoreBinScoreEntry[];
  reason: 'empty' | 'single' | 'mode_bin';
  bins: ContestScoreBinStat[];
  tieNote: string | null;
};

export type WeightedScoreVote = {
  score: number;
  weight: number;
  evaluator?: string;
  evaluatorGradeEmoji?: string;
  valid: boolean;
  invalidReason?: 'flat_scores';
};

export function computeWeightedOverallMean(votes: WeightedScoreVote[]): number | null {
  const active = votes.filter((v) => v.valid && v.weight > 0 && Number.isFinite(v.score));
  const totalWeight = active.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return null;
  return active.reduce((s, v) => s + v.score * v.weight, 0) / totalWeight;
}

function entriesFromScores(scores: number[]): ContestScoreBinScoreEntry[] {
  const map = new Map<number, number>();
  for (const score of scores) {
    map.set(score, (map.get(score) || 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([score, weight]) => ({ score, weight }));
}

function mergeScoreEntry(
  entries: ContestScoreBinScoreEntry[],
  score: number,
  weight: number
): ContestScoreBinScoreEntry[] {
  const map = new Map<number, number>();
  for (const e of entries) {
    map.set(e.score, (map.get(e.score) || 0) + e.weight);
  }
  map.set(score, (map.get(score) || 0) + weight);
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([s, w]) => ({ score: s, weight: w }));
}

function weightedMeanFromEntries(entries: ContestScoreBinScoreEntry[]): number | null {
  const tw = entries.reduce((s, e) => s + e.weight, 0);
  if (tw <= 0) return null;
  return entries.reduce((s, e) => s + e.score * e.weight, 0) / tw;
}

function flattenScoresFromEntries(entries: ContestScoreBinScoreEntry[]): number[] {
  return entries.flatMap((e) => Array.from({ length: e.weight }, () => e.score));
}

export function computeClusterBreakdownFromWeightedVotes(
  votes: WeightedScoreVote[],
  binWidth = CONTEST_SCORE_CLUSTER_BIN
): ClusterMeanBreakdown {
  const active = votes.filter((v) => v.valid && v.weight > 0 && Number.isFinite(v.score));
  const empty: ClusterMeanBreakdown = {
    binWidth,
    totalVotes: 0,
    totalEffectiveWeight: 0,
    weighted: true,
    clusterMean: null,
    selectedBinStart: null,
    selectedBinLabel: null,
    scoresInCluster: [],
    clusterScoreEntries: [],
    reason: 'empty',
    bins: [],
    tieNote: null,
  };
  if (active.length === 0) return empty;

  const totalEffectiveWeight = active.reduce((s, v) => s + v.weight, 0);

  if (active.length === 1) {
    const v = active[0];
    const bin = binStartForContestScore(v.score, binWidth);
    const entries = [{ score: v.score, weight: v.weight }];
    return {
      binWidth,
      totalVotes: 1,
      totalEffectiveWeight,
      weighted: true,
      clusterMean: v.score,
      selectedBinStart: bin,
      selectedBinLabel: formatContestScoreBinLabel(bin, binWidth),
      scoresInCluster: [v.score],
      clusterScoreEntries: entries,
      reason: 'single',
      bins: [
        {
          binStart: bin,
          label: formatContestScoreBinLabel(bin, binWidth),
          count: v.weight,
          rawVoteCount: 1,
          scoreEntries: entries,
          scores: [v.score],
          isSelected: true,
          tiedForMax: false,
        },
      ],
      tieNote: '유효 평가가 1표뿐이라 중심 평균은 그 점수와 같습니다.',
    };
  }

  type BinAcc = {
    weightSum: number;
    rawCount: number;
    entries: ContestScoreBinScoreEntry[];
  };
  const binsAcc = new Map<number, BinAcc>();

  for (const v of active) {
    const bin = binStartForContestScore(v.score, binWidth);
    const prev = binsAcc.get(bin) || { weightSum: 0, rawCount: 0, entries: [] };
    prev.weightSum += v.weight;
    prev.rawCount += 1;
    prev.entries = mergeScoreEntry(prev.entries, v.score, v.weight);
    binsAcc.set(bin, prev);
  }

  let bestBin = binStartForContestScore(active[0].score, binWidth);
  let bestWeight = -1;
  for (const [bin, acc] of binsAcc) {
    if (acc.weightSum > bestWeight || (acc.weightSum === bestWeight && bin < bestBin)) {
      bestWeight = acc.weightSum;
      bestBin = bin;
    }
  }

  const maxWeight = bestWeight;
  const tiedBins = [...binsAcc.keys()]
    .filter((bin) => (binsAcc.get(bin)?.weightSum ?? 0) === maxWeight)
    .sort((a, b) => a - b);

  const tieNote =
    tiedBins.length > 1
      ? `가중치 합이 같은 구간(${tiedBins
          .map((b) => formatContestScoreBinLabel(b, binWidth))
          .join(', ')}) 중 더 낮은 점수대(${formatContestScoreBinLabel(bestBin, binWidth)})를 선택했습니다.`
      : null;

  const selected = binsAcc.get(bestBin)!;
  const clusterScoreEntries = selected.entries;
  const clusterMean = weightedMeanFromEntries(clusterScoreEntries);

  const bins: ContestScoreBinStat[] = [...binsAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([binStart, acc]) => {
      const tiedForMax = acc.weightSum === maxWeight && binStart !== bestBin;
      return {
        binStart,
        label: formatContestScoreBinLabel(binStart, binWidth),
        count: acc.weightSum,
        rawVoteCount: acc.rawCount,
        scoreEntries: acc.entries,
        scores: acc.entries.map((e) => e.score),
        isSelected: binStart === bestBin,
        tiedForMax,
      };
    });

  return {
    binWidth,
    totalVotes: active.length,
    totalEffectiveWeight,
    weighted: true,
    clusterMean,
    selectedBinStart: bestBin,
    selectedBinLabel: formatContestScoreBinLabel(bestBin, binWidth),
    scoresInCluster: flattenScoresFromEntries(clusterScoreEntries),
    clusterScoreEntries,
    reason: 'mode_bin',
    bins,
    tieNote,
  };
}

export function computeClusterBreakdown(
  scores: number[],
  binWidth = CONTEST_SCORE_CLUSTER_BIN
): ClusterMeanBreakdown {
  const valid = validScores(scores);
  const empty: ClusterMeanBreakdown = {
    binWidth,
    totalVotes: 0,
    totalEffectiveWeight: 0,
    weighted: false,
    clusterMean: null,
    selectedBinStart: null,
    selectedBinLabel: null,
    scoresInCluster: [],
    clusterScoreEntries: [],
    reason: 'empty',
    bins: [],
    tieNote: null,
  };
  if (valid.length === 0) return empty;

  if (valid.length === 1) {
    const bin = binStartForContestScore(valid[0], binWidth);
    const entries = entriesFromScores(valid);
    return {
      binWidth,
      totalVotes: 1,
      totalEffectiveWeight: 1,
      weighted: false,
      clusterMean: valid[0],
      selectedBinStart: bin,
      selectedBinLabel: formatContestScoreBinLabel(bin, binWidth),
      scoresInCluster: [...valid],
      clusterScoreEntries: entries,
      reason: 'single',
      bins: [
        {
          binStart: bin,
          label: formatContestScoreBinLabel(bin, binWidth),
          count: 1,
          rawVoteCount: 1,
          scoreEntries: entries,
          scores: [...valid],
          isSelected: true,
          tiedForMax: false,
        },
      ],
      tieNote: '평가가 1표뿐이라 중심 평균은 그 점수와 같습니다.',
    };
  }

  const scoresByBin = new Map<number, number[]>();
  for (const score of valid) {
    const bin = binStartForContestScore(score, binWidth);
    const list = scoresByBin.get(bin) || [];
    list.push(score);
    scoresByBin.set(bin, list);
  }

  let bestBin = binStartForContestScore(valid[0], binWidth);
  let bestCount = -1;
  for (const [bin, list] of scoresByBin) {
    const count = list.length;
    if (count > bestCount || (count === bestCount && bin < bestBin)) {
      bestCount = count;
      bestBin = bin;
    }
  }

  const maxCount = bestCount;
  const tiedBins = [...scoresByBin.keys()]
    .filter((bin) => (scoresByBin.get(bin)?.length ?? 0) === maxCount)
    .sort((a, b) => a - b);

  const tieNote =
    tiedBins.length > 1
      ? `표 수가 같은 구간(${tiedBins
          .map((b) => formatContestScoreBinLabel(b, binWidth))
          .join(', ')}) 중 더 낮은 점수대(${formatContestScoreBinLabel(bestBin, binWidth)})를 선택했습니다.`
      : null;

  const inCluster = scoresByBin.get(bestBin) ?? [];
  const clusterMean = inCluster.reduce((a, b) => a + b, 0) / inCluster.length;

  const bins: ContestScoreBinStat[] = [...scoresByBin.entries()]
    .sort(([a], [b]) => a - b)
    .map(([binStart, binScores]) => {
      const count = binScores.length;
      const sortedScores = [...binScores].sort((a, b) => a - b);
      const tiedForMax = count === maxCount && binStart !== bestBin;
      return {
        binStart,
        label: formatContestScoreBinLabel(binStart, binWidth),
        count,
        rawVoteCount: count,
        scoreEntries: entriesFromScores(sortedScores),
        scores: sortedScores,
        isSelected: binStart === bestBin,
        tiedForMax,
      };
    });

  const clusterEntries = entriesFromScores(inCluster);

  return {
    binWidth,
    totalVotes: valid.length,
    totalEffectiveWeight: valid.length,
    weighted: false,
    clusterMean,
    selectedBinStart: bestBin,
    selectedBinLabel: formatContestScoreBinLabel(bestBin, binWidth),
    scoresInCluster: [...inCluster].sort((a, b) => a - b),
    clusterScoreEntries: clusterEntries,
    reason: 'mode_bin',
    bins,
    tieNote,
  };
}

/**
 * 평가가 가장 많이 모인 점수 구간만 모아 낸 평균.
 * 동점 구간이면 더 낮은 점수대를 선택.
 */
export function computeClusterMean(
  scores: number[],
  binWidth = CONTEST_SCORE_CLUSTER_BIN
): number | null {
  return computeClusterBreakdown(scores, binWidth).clusterMean;
}

export type ParticipantScoreSummary = {
  overallMean: number | null;
  clusterMean: number | null;
  voteCount: number;
  clusterBreakdown: ClusterMeanBreakdown;
};

export function summarizeParticipantScores(scores: number[]): ParticipantScoreSummary {
  const valid = validScores(scores);
  const clusterBreakdown = computeClusterBreakdown(valid);
  return {
    overallMean: computeOverallMean(valid),
    clusterMean: clusterBreakdown.clusterMean,
    voteCount: valid.length,
    clusterBreakdown,
  };
}
