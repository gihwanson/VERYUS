import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface BoardPreviewItem {
  id: string;
  title: string;
  writerNickname: string;
  createdAtMs: number;
}

function toCreatedAtMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string | number).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export type HomeBoardPreviewMap = Record<string, BoardPreviewItem[]>;

const PREVIEW_PER_BOARD = 1;

const POST_BOARDS: Array<{ boardType: string; postType: string }> = [
  { boardType: 'free', postType: 'free' },
  { boardType: 'recording', postType: 'recording' },
  { boardType: 'evaluation', postType: 'evaluation' },
  { boardType: 'partner', postType: 'partner' },
  { boardType: 'chorus', postType: 'chorus' },
];

async function fetchPostBoardPreviews(postType: string): Promise<BoardPreviewItem[]> {
  const snapshot = await getDocs(
    query(
      collection(db, 'posts'),
      where('type', '==', postType),
      orderBy('createdAt', 'desc'),
      limit(PREVIEW_PER_BOARD + 5)
    )
  );

  const items: BoardPreviewItem[] = [];
  for (const docSnap of snapshot.docs) {
    if (items.length >= PREVIEW_PER_BOARD) break;
    const data = docSnap.data();
    if (data.isHidden) continue;
    items.push({
      id: docSnap.id,
      title: String(data.title || '제목 없음').trim() || '제목 없음',
      writerNickname: String(data.writerNickname || '익명').trim() || '익명',
      createdAtMs: toCreatedAtMs(data.createdAt),
    });
  }
  return items;
}

export async function fetchHomeBoardPreviews(): Promise<HomeBoardPreviewMap> {
  const results: HomeBoardPreviewMap = {};

  await Promise.all(
    POST_BOARDS.map(async ({ boardType, postType }) => {
      try {
        results[boardType] = await fetchPostBoardPreviews(postType);
      } catch (error) {
        console.error(`홈 목차 미리보기 로드 실패 (${boardType}):`, error);
        results[boardType] = [];
      }
    })
  );

  return results;
}
