import type { SetListData } from './types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatSetListDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

export function buildSetListName(iso: string): string {
  return `셋리스트 ${formatSetListDateLabel(iso)}`;
}

function parseNameDate(name: string): string | null {
  const match = name.match(/셋리스트\s*(\d{1,2})[./](\d{1,2})/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = new Date().getFullYear();
  return toLocalDateISO(new Date(year, month - 1, day));
}

function createdAtToISO(createdAt: SetListData['createdAt']): string | null {
  if (!createdAt) return null;
  let ms = 0;
  if (typeof createdAt === 'object' && createdAt !== null && 'toMillis' in createdAt) {
    ms = (createdAt as { toMillis: () => number }).toMillis();
  } else if (typeof createdAt === 'number') {
    ms = createdAt > 1_000_000_000_000 ? createdAt : createdAt * 1000;
  } else if (typeof createdAt === 'object' && createdAt !== null && 'seconds' in createdAt) {
    ms = (createdAt as { seconds: number }).seconds * 1000;
  }
  if (!ms) return null;
  return toLocalDateISO(new Date(ms));
}

/** Firestore 문서에서 세션 날짜(YYYY-MM-DD, 로컬) 추론 */
export function getSetListSessionDateISO(list: SetListData): string {
  if (list.sessionDate && ISO_DATE_RE.test(list.sessionDate)) {
    return list.sessionDate;
  }
  const fromName = parseNameDate(list.name || '');
  if (fromName) return fromName;
  const fromCreated = createdAtToISO(list.createdAt);
  if (fromCreated) return fromCreated;
  return toLocalDateISO(new Date());
}
