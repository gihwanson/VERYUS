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

const MEMBER_SPLIT_RE = /[,，、·/&+\s]+/;

function normalizeNick(value: unknown): string {
  return String(value ?? '').trim();
}

function toAllowedSet(allowed?: Set<string> | string[] | null): Set<string> | null {
  if (!allowed) return null;
  if (allowed instanceof Set) return allowed;
  return new Set(allowed.map((n) => normalizeNick(n)).filter(Boolean));
}

/**
 * "수지루이"처럼 구분자 없이 붙은 닉네임을
 * 현재 회원 닉네임(긴 것 우선)으로 탐욕 매칭해 분리합니다.
 */
function splitConcatenatedNicknames(text: string, known: Set<string>): string[] {
  const nicks = [...known]
    .map((n) => normalizeNick(n))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length || a.localeCompare(b, 'ko'));
  if (nicks.length === 0) return [];

  const found: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    let matched: string | null = null;
    for (const nick of nicks) {
      if (rest.startsWith(nick)) {
        matched = nick;
        break;
      }
    }
    if (!matched) return [];
    found.push(matched);
    rest = rest.slice(matched.length);
  }
  return found;
}

/** members 필드 토큰 → 실제 집계용 닉네임 목록 */
export function resolveMemberNicknames(
  raw: unknown,
  allowedNicknames?: Set<string> | string[] | null
): string[] {
  const allowed = toAllowedSet(allowedNicknames);
  const trimmed = normalizeNick(raw);
  if (!trimmed) return [];

  if (!allowed) {
    return [trimmed];
  }

  if (allowed.has(trimmed)) return [trimmed];

  const delimited = trimmed
    .split(MEMBER_SPLIT_RE)
    .map((p) => normalizeNick(p))
    .filter(Boolean);
  if (delimited.length > 1) {
    const resolved = delimited.flatMap((part) => resolveMemberNicknames(part, allowed));
    return [...new Set(resolved)];
  }

  const split = splitConcatenatedNicknames(trimmed, allowed);
  if (split.length > 0) return [...new Set(split)];

  return [];
}

function isBuskingEvaluationCategory(category: unknown): boolean {
  const value = String(category ?? '').trim();
  return value === 'busking' || value === '버스킹심사곡';
}

function collectEvaluationMemberNicks(
  data: Record<string, unknown>,
  allowedNicknames?: Set<string> | string[] | null
): string[] {
  const nicks = new Set<string>();
  for (const nick of resolveMemberNicknames(data.writerNickname, allowedNicknames)) {
    nicks.add(nick);
  }

  const members = data.members;
  if (Array.isArray(members)) {
    for (const raw of members) {
      for (const nick of resolveMemberNicknames(raw, allowedNicknames)) {
        nicks.add(nick);
      }
    }
  } else if (typeof members === 'string') {
    for (const nick of resolveMemberNicknames(members, allowedNicknames)) {
      nicks.add(nick);
    }
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
 *
 * @param allowedNicknames 지정 시 해당 닉네임(현재 회원)만 집계하고,
 *   members의 붙은 문자열도 회원 닉네임으로 분리합니다.
 */
export function computeMemberPassRatesFromDocs(params: {
  evaluationPosts: Array<QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }>;
  approvedSongs: Array<QueryDocumentSnapshot<DocumentData> | { id: string; data: () => DocumentData }>;
  allowedNicknames?: Set<string> | string[] | null;
}): Map<string, MemberPassRateStats> {
  const allowed = toAllowedSet(params.allowedNicknames);
  const map = new Map<string, MemberPassRateStats>();
  const countedEvalKeys = new Set<string>();

  for (const postDoc of params.evaluationPosts) {
    const data = postDoc.data() as Record<string, unknown>;
    if (!isBuskingEvaluationCategory(data.category)) continue;

    const status = String(data.status ?? '').trim();
    if (status !== '합격' && status !== '불합격') continue;

    const postId = 'id' in postDoc ? String(postDoc.id) : '';
    for (const nick of collectEvaluationMemberNicks(data, allowed)) {
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
    const members = data.members;
    const rawMembers: unknown[] = Array.isArray(members)
      ? members
      : typeof members === 'string'
        ? [members]
        : [];
    const seenInDoc = new Set<string>();
    for (const raw of rawMembers) {
      for (const nick of resolveMemberNicknames(raw, allowed)) {
        if (seenInDoc.has(nick)) continue;
        seenInDoc.add(nick);

        const key = `${songId}\0${nick}`;
        if (countedAdminKeys.has(key)) continue;
        countedAdminKeys.add(key);

        ensureStats(map, nick).adminDirectPasses += 1;
      }
    }
  }

  return finalizePassRates(map);
}

export async function fetchMemberPassRatesByNickname(
  allowedNicknames?: Set<string> | string[] | null
): Promise<Map<string, MemberPassRateStats>> {
  const [evaluationSnap, approvedSnap] = await Promise.all([
    getDocs(query(collection(db, 'posts'), where('type', '==', 'evaluation'))),
    getDocs(collection(db, 'approvedSongs')),
  ]);

  return computeMemberPassRatesFromDocs({
    evaluationPosts: evaluationSnap.docs,
    approvedSongs: approvedSnap.docs,
    allowedNicknames,
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

  // 본인 닉네임만 허용 — 붙은 문자열에 본인이 포함된 경우도 분리해 반영
  const map = computeMemberPassRatesFromDocs({
    evaluationPosts: [...evaluationById.values()],
    approvedSongs: approvedSnap.docs,
    allowedNicknames: new Set([nick]),
  });

  return map.get(nick) ?? emptyStats();
}

export function formatMemberPassRate(stats: MemberPassRateStats | undefined): string {
  if (!stats || stats.passRate == null) return '합격률 없음';
  const rateText =
    Number.isInteger(stats.passRate) ? `${stats.passRate}%` : `${stats.passRate.toFixed(1)}%`;
  return `합격률 ${rateText} (${stats.passes}/${stats.passes + stats.fails})`;
}
