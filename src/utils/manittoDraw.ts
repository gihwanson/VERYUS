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

/**
 * 한 사람의 마니또를 바꾼다.
 * 그 사람을 이미 맡고 있던 쪽은 다른 사람으로 옮기고, 전원은 한 명씩만 맡는다.
 * 맞바꾸면 본인이 되는 경우에는 한 명을 더 돌려 빈칸을 메운다.
 */
export function reassignManittoReceiver(
  assignments: Map<string, string>,
  giverUid: string,
  newReceiverUid: string
): Map<string, string> {
  if (giverUid === newReceiverUid) {
    throw new Error('본인에게 배정할 수 없습니다.');
  }

  const oldReceiver = assignments.get(giverUid);
  if (!oldReceiver) throw new Error('해당 참가자의 배정을 찾을 수 없습니다.');
  if (oldReceiver === newReceiverUid) return new Map(assignments);

  let otherGiver: string | undefined;
  for (const [giver, receiver] of assignments) {
    if (receiver === newReceiverUid) {
      otherGiver = giver;
      break;
    }
  }
  if (!otherGiver) throw new Error('배정을 교환할 상대를 찾을 수 없습니다.');

  const next = new Map(assignments);

  if (otherGiver !== oldReceiver) {
    next.set(giverUid, newReceiverUid);
    next.set(otherGiver, oldReceiver);
  } else {
    const displacedReceiver = assignments.get(newReceiverUid);
    if (!displacedReceiver) throw new Error('배정을 맞출 수 없습니다.');
    next.set(giverUid, newReceiverUid);
    next.set(newReceiverUid, oldReceiver);
    next.set(oldReceiver, displacedReceiver);
  }

  const uids = [...next.keys()];
  if (!isCompleteDerangement(uids, next)) {
    throw new Error('겹치지 않게 마니또를 맞추지 못했습니다.');
  }
  return next;
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
