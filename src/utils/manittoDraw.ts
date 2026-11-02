import { MANITTO_MIN_PARTICIPANTS } from './manittoTypes';

function isCompleteDerangement(uids: string[], map: Map<string, string>): boolean {
  if (map.size !== uids.length || uids.length < 2) return false;
  const receivers = new Set<string>();
  const uidSet = new Set(uids);
  for (const uid of uids) {
    const receiver = map.get(uid);
    if (!receiver || receiver === uid || !uidSet.has(receiver) || receivers.has(receiver)) {
      return false;
    }
    receivers.add(receiver);
  }
  return receivers.size === uids.length;
}

/**
 * 이미 맞는 짝은 유지한다.
 * 같은 인원이면 다시 섞지 않고, 들어오거나 빠진 사람만 순환에 넣거나 뺀다.
 */
export function assignManittoStable(
  participantUids: string[],
  existing: Map<string, string>
): Map<string, string> {
  const uids = [...new Set(participantUids)];
  if (uids.length < MANITTO_MIN_PARTICIPANTS) return new Map();

  if (isCompleteDerangement(uids, existing)) {
    const copy = new Map<string, string>();
    for (const uid of uids) copy.set(uid, existing.get(uid)!);
    return copy;
  }

  const prevList = [...existing.keys()];
  if (prevList.length >= MANITTO_MIN_PARTICIPANTS && isCompleteDerangement(prevList, existing)) {
    const working = new Map(existing);
    const nextSet = new Set(uids);

    for (const removed of prevList) {
      if (nextSet.has(removed)) continue;
      let giver: string | undefined;
      for (const [candidate, receiver] of working) {
        if (receiver === removed) {
          giver = candidate;
          break;
        }
      }
      const next = working.get(removed);
      working.delete(removed);
      if (giver && next && giver !== removed) {
        if (giver === next) working.delete(giver);
        else working.set(giver, next);
      }
    }

    for (const added of uids) {
      if (working.has(added)) continue;
      const givers = [...working.keys()];
      if (givers.length === 0) break;
      const giver = givers[Math.floor(Math.random() * givers.length)];
      const oldReceiver = working.get(giver)!;
      working.set(giver, added);
      working.set(added, oldReceiver);
    }

    if (isCompleteDerangement(uids, working)) return working;
  }

  return computeManittoAssignments(uids);
}

/** 참가자 UID 목록 → 마니또(받는 사람) UID. 본인에게 배정되지 않는 순열 */
export function computeManittoAssignments(giverUids: string[]): Map<string, string> {
  const n = giverUids.length;
  if (n < 2) {
    throw new Error('추첨하려면 참가자가 2명 이상 필요합니다.');
  }

  const tryRandom = (): Map<string, string> | null => {
    const receivers = [...giverUids];
    for (let i = receivers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }
    for (let i = 0; i < n; i++) {
      if (receivers[i] === giverUids[i]) return null;
    }
    const map = new Map<string, string>();
    for (let i = 0; i < n; i++) {
      map.set(giverUids[i], receivers[i]);
    }
    return map;
  };

  for (let attempt = 0; attempt < 200; attempt++) {
    const result = tryRandom();
    if (result) return result;
  }

  // 순환 이동 — 항상 derangement (n ≥ 2)
  const map = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    map.set(giverUids[i], giverUids[(i + 1) % n]);
  }
  return map;
}
