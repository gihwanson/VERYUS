import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { contestTypeLabel } from '../types/contest';
import {
  buildContestAggregationContext,
  rankContestTargets,
  type ContestGradeRecord,
} from './contestGradesAggregation';
import { contestBothMainUids, contestGradeTargetIds, contestStageRoles } from './contestStage';

export type ContestGradeHistoryComment = {
  comment: string;
};

export type ContestGradeHistoryRecord = {
  id: string;
  contestId: string;
  contestTitle: string;
  contestType: string;
  appliedGrade: string;
  appliedScore: number;
  overallMean: number | null;
  clusterMean: number | null;
  comments: ContestGradeHistoryComment[];
  targetLabel: string;
  rank: number | null;
  rankedCount: number | null;
  appliedAt: { seconds?: number } | null;
};

export type ContestGradeHistoryWrite = {
  contestId: string;
  contestTitle: string;
  contestType: string;
  appliedGrade: string;
  appliedScore: number;
  overallMean: number | null;
  clusterMean: number | null;
  comments: ContestGradeHistoryComment[];
  targetLabel: string;
  rank: number | null;
  rankedCount: number | null;
};

export function commentsFromContestGrades(
  grades: Array<{ target?: string; comment?: string }>,
  target: string
): ContestGradeHistoryComment[] {
  return grades
    .filter((g) => g.target === target && String(g.comment || '').trim())
    .map((g) => ({
      comment: String(g.comment).trim(),
    }));
}

export async function saveContestGradeHistory(
  uid: string,
  payload: ContestGradeHistoryWrite
): Promise<void> {
  if (!uid || !payload.contestId) return;
  await setDoc(doc(db, 'users', uid, 'contestGradeHistory', payload.contestId), {
    contestId: payload.contestId,
    contestTitle: payload.contestTitle,
    contestType: payload.contestType,
    appliedGrade: payload.appliedGrade,
    appliedScore: payload.appliedScore,
    overallMean: payload.overallMean,
    clusterMean: payload.clusterMean,
    comments: payload.comments,
    targetLabel: payload.targetLabel,
    rank: payload.rank,
    rankedCount: payload.rankedCount,
    appliedAt: serverTimestamp(),
  });
}

export function subscribeContestGradeHistory(
  uid: string,
  onChange: (records: ContestGradeHistoryRecord[]) => void,
  onError?: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', uid, 'contestGradeHistory'),
    (snap) => {
      const records = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          contestId: String(data.contestId || d.id),
          contestTitle: String(data.contestTitle || '등급전'),
          contestType: String(data.contestType || ''),
          appliedGrade: String(data.appliedGrade || ''),
          appliedScore: Number(data.appliedScore),
          overallMean: data.overallMean == null ? null : Number(data.overallMean),
          clusterMean: data.clusterMean == null ? null : Number(data.clusterMean),
          comments: Array.isArray(data.comments)
            ? data.comments
                .map((item: { comment?: string }) => ({
                  comment: String(item?.comment || '').trim(),
                }))
                .filter((item: ContestGradeHistoryComment) => item.comment)
            : [],
          targetLabel: String(data.targetLabel || ''),
          rank: Number.isFinite(Number(data.rank)) ? Number(data.rank) : null,
          rankedCount: Number.isFinite(Number(data.rankedCount)) ? Number(data.rankedCount) : null,
          appliedAt: data.appliedAt || null,
        } satisfies ContestGradeHistoryRecord;
      });
      records.sort((a, b) => contestGradeHistoryAppliedAtMs(b.appliedAt) - contestGradeHistoryAppliedAtMs(a.appliedAt));
      onChange(records);
    },
    (error) => onError?.(error)
  );
}

export function contestGradeHistoryAppliedAtMs(appliedAt: { seconds?: number } | null): number {
  if (appliedAt && typeof appliedAt.seconds === 'number') return appliedAt.seconds * 1000;
  return 0;
}

export function formatContestGradeHistoryDate(appliedAt: { seconds?: number } | null): string {
  const ms = contestGradeHistoryAppliedAtMs(appliedAt);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('ko-KR');
}

export function formatContestGradeHistoryType(type: string): string {
  return contestTypeLabel(type) || '등급전';
}

export function formatContestGradeHistoryRank(rank: number | null | undefined): string {
  if (!Number.isFinite(rank) || (rank as number) < 1) return '-';
  return `${rank}위`;
}

function mainTargetIdsForUid(
  uid: string,
  teams: Array<{ id: string; members?: string[]; mainUid?: string; coMainUid?: string; subUid?: string; partnerRole?: string }>
): string[] {
  const targets: string[] = [];
  for (const team of teams) {
    const gradeTargets = contestGradeTargetIds(team);
    if (gradeTargets.includes(uid)) {
      targets.push(uid);
      continue;
    }
    const bothMains = contestBothMainUids(team);
    const mains = bothMains ?? contestStageRoles(team)?.mainUids ?? (team.mainUid ? [team.mainUid] : []);
    if (gradeTargets.includes(team.id) && mains.includes(uid)) {
      targets.push(team.id);
    }
  }
  return targets.length > 0 ? targets : [uid];
}

async function loadContestRankLookup(contestId: string): Promise<{
  ranks: ReturnType<typeof rankContestTargets>;
  teams: Array<{ id: string; members?: string[]; mainUid?: string; coMainUid?: string; subUid?: string; partnerRole?: string }>;
} | null> {
  if (!contestId) return null;
  const [gradesSnap, teamsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'contests', contestId, 'grades')),
    getDocs(collection(db, 'contests', contestId, 'teams')),
    getDocs(collection(db, 'users')),
  ]);
  const evaluatorGradeByNickname: Record<string, string> = {};
  usersSnap.forEach((d) => {
    const data = d.data();
    const nick = String(data.nickname || '').trim();
    if (nick) evaluatorGradeByNickname[nick] = String(data.grade ?? '');
  });
  const grades = gradesSnap.docs.map((d) => d.data()) as ContestGradeRecord[];
  const ctx = buildContestAggregationContext(grades, evaluatorGradeByNickname);
  return {
    ranks: rankContestTargets(ctx),
    teams: teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

/** 이미 저장된 기록에 순위가 없으면 해당 콘테스트 집계로 채운다. */
export async function fillMissingContestGradeRanks(
  uid: string,
  records: ContestGradeHistoryRecord[]
): Promise<ContestGradeHistoryRecord[]> {
  const missingIds = [...new Set(records.filter((r) => r.rank == null).map((r) => r.contestId))];
  if (!uid || missingIds.length === 0) return records;
  const lookups = await Promise.all(
    missingIds.map(async (contestId) => {
      try {
        return [contestId, await loadContestRankLookup(contestId)] as const;
      } catch (error) {
        console.error('등급전 순위 불러오기 실패:', contestId, error);
        return [contestId, null] as const;
      }
    })
  );
  const lookupByContest = new Map(lookups);
  return records.map((record) => {
    if (record.rank != null) return record;
    const lookup = lookupByContest.get(record.contestId);
    if (!lookup) return record;
    const candidateTargets = mainTargetIdsForUid(uid, lookup.teams);
    const match =
      lookup.ranks.find((row) => candidateTargets.includes(row.target)) ||
      lookup.ranks.find(
        (row) =>
          record.appliedScore != null &&
          row.applyScore != null &&
          Math.abs(row.applyScore - record.appliedScore) < 0.05
      );
    if (!match) {
      return { ...record, rankedCount: lookup.ranks.length };
    }
    return {
      ...record,
      rank: match.rank,
      rankedCount: lookup.ranks.length,
    };
  });
}
