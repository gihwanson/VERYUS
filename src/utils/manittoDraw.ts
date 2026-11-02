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
