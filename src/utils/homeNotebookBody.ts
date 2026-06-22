import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/** 댓글·좋아요용 가상 게시글 (posts 컬렉션) */
export const HOME_NOTEBOOK_BODY_POST_ID = 'home-notebook-body';
export const HOME_NOTEBOOK_BODY_POST_TITLE = '본문';
export const HOME_NOTEBOOK_BODY_WRITER_UID = 'home-notebook';

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
  /** 사진 업로드 시각 (ms) — 연대기·NEW 표시용 */
  uploadedAt?: number;
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

/** 블록 ID·order로 업로드 시각 추정 (기존 사진 호환) */
export function getImageUploadedAt(block: HomeNotebookBlock): number {
  if (typeof block.uploadedAt === 'number' && block.uploadedAt > 0) {
    return block.uploadedAt;
  }
  const match = block.id.match(/^nb_(\d+)_/);
  if (match) return Number(match[1]);
  return typeof block.order === 'number' ? block.order : 0;
}

/** 최신순(왼쪽 위가 가장 최근) 사진 블록 */
export function getImageBlocksChronological(blocks: HomeNotebookBlock[]): HomeNotebookBlock[] {
  return blocks
    .filter((block) => block.type === 'image' && block.imageUrl)
    .sort((a, b) => getImageUploadedAt(b) - getImageUploadedAt(a));
}

export function splitNotebookBlocks(blocks: HomeNotebookBlock[]): {
  imageBlocks: HomeNotebookBlock[];
  contentBlocks: HomeNotebookBlock[];
} {
  const imageBlocks = getImageBlocksChronological(blocks);
  const contentBlocks = blocks.filter((block) => block.type !== 'image');
  return { imageBlocks, contentBlocks };
}

/** Firestore는 undefined 필드를 허용하지 않음 */
function sanitizeBlockForFirestore(
  block: HomeNotebookBlock,
  order: number
): Record<string, string | number> {
  const doc: Record<string, string | number> = {
    id: block.id,
    type: block.type,
    order,
  };
  if (block.text !== undefined) doc.text = block.text;
  if (block.body !== undefined) doc.body = block.body;
  if (block.imageUrl !== undefined) doc.imageUrl = block.imageUrl;
  if (block.date !== undefined) doc.date = block.date;
  if (block.uploadedAt !== undefined) doc.uploadedAt = block.uploadedAt;
  return doc;
}

export async function fetchHomeNotebookBody(): Promise<HomeNotebookBlock[]> {
  const snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1]));
  if (!snap.exists()) return [];
  const data = snap.data() as HomeNotebookBodyDoc;
  return sortNotebookBlocks(Array.isArray(data.blocks) ? data.blocks : []);
}

export function getHomeNotebookPhotoPostId(blockId: string): string {
  return `home-nb-photo-${blockId}`;
}

/** 사진별 댓글용 posts 문서 */
export async function ensureHomeNotebookPhotoPost(block: HomeNotebookBlock): Promise<void> {
  const postId = getHomeNotebookPhotoPostId(block.id);
  const postRef = doc(db, 'posts', postId);
  const snap = await getDoc(postRef);
  if (snap.exists()) return;

  await setDoc(postRef, {
    title: block.body?.trim() || '활동 사진',
    content: '',
    writerNickname: 'VERYUS',
    writerUid: HOME_NOTEBOOK_BODY_WRITER_UID,
    boardType: 'home',
    photoBlockId: block.id,
    likes: [],
    likesCount: 0,
    commentCount: 0,
    views: 0,
    createdAt: serverTimestamp(),
  });
}

/** 댓글·좋아요 카운트용 posts 문서가 없으면 생성 */
export async function ensureHomeNotebookBodyPost(): Promise<void> {
  const postRef = doc(db, 'posts', HOME_NOTEBOOK_BODY_POST_ID);
  const snap = await getDoc(postRef);
  if (snap.exists()) return;

  await setDoc(postRef, {
    title: HOME_NOTEBOOK_BODY_POST_TITLE,
    content: '',
    writerNickname: 'VERYUS',
    writerUid: HOME_NOTEBOOK_BODY_WRITER_UID,
    boardType: 'home',
    likes: [],
    likesCount: 0,
    commentCount: 0,
    views: 0,
    createdAt: serverTimestamp(),
  });
}

export async function saveHomeNotebookBody(
  blocks: HomeNotebookBlock[],
  editorNickname: string
): Promise<void> {
  const normalized = sortNotebookBlocks(blocks).map((block, index) =>
    sanitizeBlockForFirestore(block, index)
  );

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
