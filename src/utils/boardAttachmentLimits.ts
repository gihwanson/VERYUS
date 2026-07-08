export const BOARD_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function isBoardAttachmentTooLarge(size: number): boolean {
  return size > BOARD_ATTACHMENT_MAX_BYTES;
}

export function alertBoardAttachmentTooLarge(fileName: string, size: number): void {
  alert(
    `첨부파일 용량이 20MB를 초과합니다.\n\n파일: ${fileName}\n크기: ${formatAttachmentSize(size)}\n\n20MB 이하의 파일만 업로드할 수 있습니다.`
  );
}

/** 20MB 초과 시 알림 후 true 반환 (업로드 중단) */
export function rejectBoardAttachmentIfTooLarge(
  file: File | Blob,
  fileName: string,
  input?: HTMLInputElement | null
): boolean {
  if (!isBoardAttachmentTooLarge(file.size)) return false;
  alertBoardAttachmentTooLarge(fileName, file.size);
  if (input) input.value = '';
  return true;
}
