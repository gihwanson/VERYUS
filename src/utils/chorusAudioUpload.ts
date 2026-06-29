import { ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, storage } from '../firebase';
import { prepareChorusAudioForUpload } from './chorusAudioTranscode';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'audio.webm';
}

function blobContentType(blob: Blob, fileName: string): string {
  if (blob.type && blob.type.startsWith('audio/')) return blob.type;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/webm';
}

export async function waitForFirebaseAuth(timeoutMs = 8000): Promise<string> {
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsub();
      reject(new Error('AUTH_TIMEOUT'));
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user?.uid || settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(user.uid);
    });
  });
}

export function formatUploadError(error: unknown): string {
  const code = String((error as { code?: string })?.code || '');
  const message = String((error as { message?: string })?.message || '');

  if (code === 'AUTH_TIMEOUT' || message === 'AUTH_TIMEOUT') {
    return '로그인 세션이 만료되었습니다. 다시 로그인한 뒤 시도해 주세요.';
  }
  if (code.includes('unauthorized') || code.includes('permission-denied')) {
    return '오디오 업로드 권한이 없습니다. 다시 로그인하거나 잠시 후 다시 시도해 주세요.';
  }
  if (code.includes('unauthenticated')) {
    return '로그인이 필요합니다. 다시 로그인해 주세요.';
  }
  if (code.includes('canceled')) {
    return '업로드가 취소되었습니다.';
  }
  if (code.includes('retry-limit-exceeded') || code.includes('network')) {
    return '네트워크 오류로 업로드에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.';
  }
  return '등록 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}

export async function uploadChorusAudio(
  userId: string,
  blob: Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const prepared = await prepareChorusAudioForUpload(blob, fileName);
  const uploadBlob = prepared.blob;
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const safeName = sanitizeFileName(`${baseName}.${prepared.extension}`);
  const path = `chorus/${userId}/${Date.now()}_${safeName}`;
  const fileRef = storageRef(storage, path);
  const metadata = { contentType: blobContentType(uploadBlob, safeName) };

  if (onProgress) {
    const task = uploadBytesResumable(fileRef, uploadBlob, metadata);
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          const total = snapshot.totalBytes;
          if (total > 0) {
            onProgress((snapshot.bytesTransferred / total) * 100);
          } else {
            onProgress(0);
          }
        },
        reject,
        () => resolve()
      );
    });
    return getDownloadURL(task.snapshot.ref);
  }

  await uploadBytes(fileRef, uploadBlob, metadata);
  return getDownloadURL(fileRef);
}

export function recordingBlobFileName(ext = 'webm'): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `chorus_${y}${m}${d}_${hh}${mm}${ss}.${ext}`;
}
