import { getGradeEmoji } from './gradeDisplay';
import { getContestEvaluatorVoteWeight } from './contestVoteWeight';
import {
  computeClusterBreakdownFromWeightedVotes,
  computeWeightedOverallMean,
  type ClusterMeanBreakdown,
  type WeightedScoreVote,
} from './contestScoreAggregation';

export type ContestGradeRecord = {
  evaluator: string;
  target: string;
  score: number | string;
  comment?: string;
  evaluatorGrade?: string;
  evaluatorRole?: string;
};

export type FlatScoreInvalidation = {
  evaluator: string;
  score: number;
  voteCount: number;
};

export type ParticipantContestVotes = {
  votes: WeightedScoreVote[];
  comments: string[];
  rawVoteCount: number;
  effectiveWeight: number;
  overallMean: number | null;
  clusterMean: number | null;
  clusterBreakdown: ClusterMeanBreakdown;
};

export type ContestAggregationContext = {
  invalidatedEvaluators: FlatScoreInvalidation[];
  byTarget: Record<string, ParticipantContestVotes>;
};

function resolveGradeEmoji(
  grade: ContestGradeRecord,
  evaluatorGradeByNickname: Record<string, string> | undefined
): string {
  if (grade.evaluatorGrade) return getGradeEmoji(grade.evaluatorGrade);
  const fromUser = evaluatorGradeByNickname?.[grade.evaluator];
  return getGradeEmoji(fromUser);
}

export function findFlatScoreInvalidatedEvaluators(
  grades: ContestGradeRecord[]
): FlatScoreInvalidation[] {
  const byEvaluator = new Map<string, number[]>();
  for (const g of grades) {
    const score = Number(g.score);
    if (!Number.isFinite(score)) continue;
    const list = byEvaluator.get(g.evaluator) || [];
    list.push(score);
    byEvaluator.set(g.evaluator, list);
  }

  const result: FlatScoreInvalidation[] = [];
  for (const [evaluator, scores] of byEvaluator) {
    if (scores.length < 2) continue;
    const first = scores[0];
    if (scores.every((s) => s === first)) {
      result.push({ evaluator, score: first, voteCount: scores.length });
    }
  }
  return result.sort((a, b) => a.evaluator.localeCompare(b.evaluator));
}

function buildVote(
  grade: ContestGradeRecord,
  invalidatedSet: Set<string>,
  evaluatorGradeByNickname: Record<string, string> | undefined
): WeightedScoreVote {
  const score = Number(grade.score);
  const emoji = resolveGradeEmoji(grade, evaluatorGradeByNickname);
  const weight = getContestEvaluatorVoteWeight(emoji);
  const invalidFlat = invalidatedSet.has(grade.evaluator);
  return {
    score,
    weight,
    evaluator: grade.evaluator,
    evaluatorGradeEmoji: emoji,
    valid: !invalidFlat && Number.isFinite(score),
    invalidReason: invalidFlat ? 'flat_scores' : undefined,
  };
}

export function buildContestAggregationContext(
  grades: ContestGradeRecord[],
  evaluatorGradeByNickname?: Record<string, string>
): ContestAggregationContext {
  const invalidatedEvaluators = findFlatScoreInvalidatedEvaluators(grades);
  const invalidatedSet = new Set(invalidatedEvaluators.map((x) => x.evaluator));

  const commentsByTarget: Record<string, string[]> = {};
  const votesByTarget: Record<string, WeightedScoreVote[]> = {};

  for (const g of grades) {
    if (!votesByTarget[g.target]) votesByTarget[g.target] = [];
    votesByTarget[g.target].push(buildVote(g, invalidatedSet, evaluatorGradeByNickname));

    if (g.comment) {
      if (!commentsByTarget[g.target]) commentsByTarget[g.target] = [];
      commentsByTarget[g.target].push(g.comment);
    }
  }

  const byTarget: Record<string, ParticipantContestVotes> = {};
  for (const [target, votes] of Object.entries(votesByTarget)) {
    const validVotes = votes.filter((v) => v.valid);
    const effectiveWeight = validVotes.reduce((s, v) => s + v.weight, 0);
    const clusterBreakdown = computeClusterBreakdownFromWeightedVotes(votes);
    byTarget[target] = {
      votes,
      comments: commentsByTarget[target] || [],
      rawVoteCount: votes.length,
      effectiveWeight,
      overallMean: computeWeightedOverallMean(votes),
      clusterMean: clusterBreakdown.clusterMean,
      clusterBreakdown,
    };
  }

  return { invalidatedEvaluators, byTarget };
}

export function computeContestTop3Targets(
  grades: ContestGradeRecord[],
  evaluatorGradeByNickname?: Record<string, string>
): { target: string; avg: number }[] {
  const { byTarget } = buildContestAggregationContext(grades, evaluatorGradeByNickname);
  return Object.entries(byTarget)
    .map(([target, data]) => ({
      target,
      avg: data.overallMean ?? 0,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
}
