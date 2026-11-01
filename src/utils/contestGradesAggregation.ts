import { getGradeEmoji } from './gradeDisplay';
import { getContestEvaluatorVoteWeight } from './contestVoteWeight';
import { pickApplyContestMean } from './contestGrade';
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

function buildVote(
  grade: ContestGradeRecord,
  evaluatorGradeByNickname: Record<string, string> | undefined
): WeightedScoreVote {
  const score = Number(grade.score);
  const emoji = resolveGradeEmoji(grade, evaluatorGradeByNickname);
  const weight = getContestEvaluatorVoteWeight(emoji);
  return {
    score,
    weight,
    evaluator: grade.evaluator,
    evaluatorGradeEmoji: emoji,
    valid: Number.isFinite(score),
  };
}

export function buildContestAggregationContext(
  grades: ContestGradeRecord[],
  evaluatorGradeByNickname?: Record<string, string>
): ContestAggregationContext {
  const commentsByTarget: Record<string, string[]> = {};
  const votesByTarget: Record<string, WeightedScoreVote[]> = {};

  for (const g of grades) {
    if (!votesByTarget[g.target]) votesByTarget[g.target] = [];
    votesByTarget[g.target].push(buildVote(g, evaluatorGradeByNickname));

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

  return { byTarget };
}

export function computeContestTop3Targets(
  grades: ContestGradeRecord[],
  evaluatorGradeByNickname?: Record<string, string>
): { target: string; avg: number }[] {
  const { byTarget } = buildContestAggregationContext(grades, evaluatorGradeByNickname);
  return Object.entries(byTarget)
    .map(([target, data]) => ({
      target,
      avg: pickApplyContestMean(data.overallMean, data.clusterMean) ?? 0,
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);
}
