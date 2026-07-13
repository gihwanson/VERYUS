import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface MemberPassRateStats {
  passes: number;
  fails: number;
  /** 0–100, 판정 이력이 없으면 null */
  passRate: number | null;
  evalPasses: number;
  evalFails: number;
  adminDirectPasses: number;
}

function normalizeNick(value: unknown): string {
  return String(value ?? '').trim();
}

function isBuskingEvaluationCategory(category: unknown): boolean {
  const value = String(category ?? '').trim();
  return value === 'busking' || value === '버스킹심사곡';
}

function collectEvaluationMemberNicks(data: Record<string, unknown>): string[] {
  const nicks = new Set<string>();
  const writer = normalizeNick(data.writerNickname);
  if (writer) nicks.add(writer);
  const members = Array.isArray(data.members) ? data.members : [];
  for (const raw of members) {
    const nick = normalizeNick(raw);
    if (nick) nicks.add(nick);
  }
  return [...nicks];
}

function emptyStats(): MemberPassRateStats {
  return {
    passes: 0,
    fails: 0,
    passRate: null,
    evalPasses: 0,
    evalFails: 0,
    adminDirectPasses: 0,
  };
}

function ensureStats(
  map: Map<string, MemberPassRateStats>,
  nickname: string
): MemberPassRateStats {
  let stats = map.get(nickname);
  if (!stats) {
    stats = emptyStats();
    map.set(nickname, stats);
  }
  return stats;
}

function finalizePassRates(map: Map<string, MemberPassRateStats>): Map<string, MemberPassRateStats> {
  for (const stats of map.values()) {
    stats.passes = stats.evalPasses + stats.adminDirectPasses;
    stats.fails = stats.evalFails;
    const total = stats.passes + stats.fails;
    stats.passRate = total === 0 ? null : Math.round((stats.passes / total) * 1000) / 10;
  }
  return map;
}

/**
 * 평가게시판(버스킹심사) 합/불 + 관리자 직접 등록 합격곡을 합쳐
 * 닉네임별 합격률을 계산합니다. 듀엣·합창 멤버도 각각 1회로 집계합니다.
 */
export function computeMemberPassRatesFromDocs(params: {
  evaluationPosts: Array<QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }>;
  approvedSongs: Array<QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }>;
}): Map<string, MemberPassRateStats> {
  const map = new Map<string, MemberPassRateStats>();
  const countedEvalKeys = new Set<string>();

  for (const postDoc of params.evaluationPosts) {
    const data = postDoc.data() as Record<string, unknown>;
    if (!isBuskingEvaluationCategory(data.category)) continue;

    const status = String(data.status ?? '').trim();
    if (status !== '합격' && status !== '불합격') continue;

    const postId = 'id' in postDoc ? String(postDoc.id) : '';
    for (const nick of collectEvaluationMemberNicks(data)) {
      const key = `${postId}\0${nick}\0${status}`;
      if (countedEvalKeys.has(key)) continue;
      countedEvalKeys.add(key);

      const stats = ensureStats(map, nick);
      if (status === '합격') stats.evalPasses += 1;
      else stats.evalFails += 1;
    }
  }

  const countedAdminKeys = new Set<string>();
  for (const songDoc of params.approvedSongs) {
    const data = songDoc.data() as Record<string, unknown>;
    const approvedPostId = String(data.approvedPostId ?? '').trim();
    // 평가 합격으로 생성된 곡은 평가 집계에 이미 포함되므로 제외
    if (approvedPostId) continue;

    const songId = 'id' in songDoc ? String(songDoc.id) : '';
    const members = Array.isArray(data.members) ? data.members : [];
    const seenInDoc = new Set<string>();
    for (const raw of members) {
      const nick = normalizeNick(raw);
      if (!nick || seenInDoc.has(nick)) continue;
      seenInDoc.add(nick);

      const key = `${songId}\0${nick}`;
      if (countedAdminKeys.has(key)) continue;
      countedAdminKeys.add(key);

      ensureStats(map, nick).adminDirectPasses += 1;
    }
  }

  return finalizePassRates(map);
}

export async function fetchMemberPassRatesByNickname(): Promise<Map<string, MemberPassRateStats>> {
  const [evaluationSnap, approvedSnap] = await Promise.all([
    getDocs(query(collection(db, 'posts'), where('type', '==', 'evaluation'))),
    getDocs(collection(db, 'approvedSongs')),
  ]);

  return computeMemberPassRatesFromDocs({
    evaluationPosts: evaluationSnap.docs,
    approvedSongs: approvedSnap.docs,
  });
}

/** 특정 닉네임의 합격률만 조회 (마이페이지용) */
export async function fetchMemberPassRateForNickname(
  nickname: string
): Promise<MemberPassRateStats> {
  const nick = normalizeNick(nickname);
  if (!nick) return emptyStats();

  const [asWriterSnap, asMemberSnap, approvedSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'posts'),
        where('type', '==', 'evaluation'),
        where('writerNickname', '==', nick)
      )
    ),
    getDocs(
      query(
        collection(db, 'posts'),
        where('type', '==', 'evaluation'),
        where('members', 'array-contains', nick)
      )
    ),
    getDocs(
      query(collection(db, 'approvedSongs'), where('members', 'array-contains', nick))
    ),
  ]);

  const evaluationById = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  asWriterSnap.docs.forEach((d) => evaluationById.set(d.id, d));
  asMemberSnap.docs.forEach((d) => evaluationById.set(d.id, d));

  const map = computeMemberPassRatesFromDocs({
    evaluationPosts: [...evaluationById.values()],
    approvedSongs: approvedSnap.docs,
  });

  return map.get(nick) ?? emptyStats();
}

export function formatMemberPassRate(stats: MemberPassRateStats | undefined): string {
  if (!stats || stats.passRate == null) return '합격률 없음';
  const rateText =
    Number.isInteger(stats.passRate) ? `${stats.passRate}%` : `${stats.passRate.toFixed(1)}%`;
  return `합격률 ${rateText} (${stats.passes}/${stats.passes + stats.fails})`;
}
