import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export type HomeNotebookBlockType = 'heading' | 'text' | 'image' | 'timeline';

export interface HomeNotebookBlock {
  id: string;
  type: HomeNotebookBlockType;
  /** 제목·소제목·타임라인 제목 */
  text?: string;
  /** 본문·캡션·활동 설명 */
  body?: string;
  imageUrl?: string;
  /** 활동 이력 날짜 라벨 (예: 2025.03) */
  date?: string;
  order: number;
}

export interface HomeNotebookBodyDoc {
  blocks: HomeNotebookBlock[];
  updatedAt?: unknown;
  updatedBy?: string;
}

const DOC_PATH = ['homeNotebook', 'body'] as const;

export function createNotebookBlockId(): string {
  return `nb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function sortNotebookBlocks(blocks: HomeNotebookBlock[]): HomeNotebookBlock[] {
  return [...blocks].sort((a, b) => a.order - b.order);
}

export async function fetchHomeNotebookBody(): Promise<HomeNotebookBlock[]> {
  const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
  if (!snap.exists()) return [];
  const data = snap.data() as HomeNotebookBodyDoc;
  return sortNotebookBlocks(Array.isArray(data.blocks) ? data.blocks : []);
}

export async function saveHomeNotebookBody(
  blocks: HomeNotebookBlock[],
  editorNickname: string
): Promise<void> {
  const normalized = sortNotebookBlocks(blocks).map((block, index) => ({
    ...block,
    order: index,
  }));

  await setDoc(
    doc(db, DOC_PATH[0], DOC_PATH[1]),
    {
      blocks: normalized,
      updatedAt: serverTimestamp(),
      updatedBy: editorNickname,
    },
    { merge: true }
  );
}
