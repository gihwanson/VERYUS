import { getMetadata, ref } from 'firebase/storage';
import { storage } from '../firebase';

/** Firebase Storage 다운로드 URL → Storage 객체 경로 */
export function storagePathFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('firebasestorage.googleapis.com')) return null;
    const marker = '/o/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

/** Firestore에 fileSizeBytes가 없는 예전 글 — Storage 메타데이터로 용량 조회 */
export async function resolveBoardAttachmentSizeBytes(downloadUrl: string): Promise<number | null> {
  const path = storagePathFromDownloadUrl(downloadUrl);
  if (path) {
    try {
      const meta = await getMetadata(ref(storage, path));
      if (typeof meta.size === 'number' && meta.size > 0) return meta.size;
    } catch (error) {
      console.warn('첨부파일 용량 조회(getMetadata) 실패:', error);
    }
  }

  try {
    const res = await fetch(downloadUrl, { method: 'HEAD' });
    if (res.ok) {
      const len = res.headers.get('content-length');
      if (len) {
        const bytes = Number.parseInt(len, 10);
        if (Number.isFinite(bytes) && bytes > 0) return bytes;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}
