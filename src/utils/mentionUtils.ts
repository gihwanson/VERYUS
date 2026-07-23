import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { NotificationService } from './notificationService';

/**
 * react-mentions 저장값: @[닉네임](닉네임)
 * 화면/DB 정규화: @닉네임
 * 레거시: @{{닉네임}}
 */
const MENTION_MARKUP_CAPTURE =
  /@\[([^\]]+)\]\(([^)]+)\)|@\{\{([^}]+)\}\}|@\[([^\]]+)\]|@([가-힣a-zA-Z0-9_.-]+)/g;

export const MENTION_MARKUP = '@[__display__](__id__)';

export function displayMention(id: string, display?: string): string {
  return `@${display || id}`;
}

/** 어떤 형식이든 `@닉네임`으로 통일 (저장·표시·알림용) */
export function normalizeMentionMarkup(content: string): string {
  return (content || '').replace(
    /@\[([^\]]+)\]\(([^)]+)\)|@\{\{([^}]+)\}\}|@\[([^\]]+)\]/g,
    (_full, bracketDisplay, _id, braceId, bracketOnly) =>
      `@${bracketDisplay || braceId || bracketOnly}`
  );
}

/** 알림 미리보기에서 멘션 마크업을 읽기 좋게 */
export function mentionPreviewText(content: string): string {
  return normalizeMentionMarkup(content).replace(/\s+/g, ' ').trim();
}

/** 본문에서 멘션된 닉네임 목록 (중복 제거) */
export function extractMentionedNicknames(content: string): string[] {
  const nicknames = new Set<string>();
  const text = content || '';
  MENTION_MARKUP_CAPTURE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_MARKUP_CAPTURE.exec(text)) !== null) {
    const nick = (match[1] || match[2] || match[3] || match[4] || match[5] || '').trim();
    if (nick) nicknames.add(nick);
  }
  return [...nicknames];
}

/**
 * 평문 `@닉네임` / 레거시 형식을 MentionsInput이 하이라이트할 수 있는
 * `@[닉네임](닉네임)` 으로 변환 (수정 폼 진입 시 사용)
 */
export function toMentionInputValue(content: string, knownNicknames: string[]): string {
  let text = normalizeMentionMarkup(content || '');
  if (!knownNicknames.length) return text;

  const sorted = [...knownNicknames]
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const nick of sorted) {
    const escaped = nick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${escaped}(?![\\w가-힣_.-])`, 'g');
    text = text.replace(re, `@[${nick}](${nick})`);
  }
  return text;
}

export async function resolveNicknameToUid(nickname: string): Promise<string | null> {
  const trimmed = nickname.trim();
  if (!trimmed) return null;
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('nickname', '==', trimmed))
    );
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch (error) {
    console.error('닉네임 → uid 조회 실패:', error);
    return null;
  }
}

/**
 * 댓글/답글 본문의 @멘션 대상에게 mention 알림 전송.
 * 비밀 댓글은 대상이 내용을 볼 수 없어 알림하지 않음.
 * skipUids: 이미 comment/reply 알림을 받은 사용자(중복 방지).
 */
export async function notifyMentionedUsers(params: {
  content: string;
  fromUid: string;
  fromNickname: string;
  postId: string;
  postTitle: string;
  postType: string;
  commentId?: string;
  isSecret?: boolean;
  skipUids?: string[];
}): Promise<void> {
  const {
    content,
    fromUid,
    fromNickname,
    postId,
    postTitle,
    postType,
    commentId,
    isSecret,
    skipUids = []
  } = params;

  if (isSecret) return;

  const nicknames = extractMentionedNicknames(content);
  if (nicknames.length === 0) return;

  const skip = new Set(skipUids.filter(Boolean));
  skip.add(fromUid);

  await Promise.all(
    nicknames.map(async (nickname) => {
      try {
        const toUid = await resolveNicknameToUid(nickname);
        if (!toUid || skip.has(toUid)) return;
        skip.add(toUid);
        await NotificationService.createMentionNotification(
          toUid,
          fromUid,
          fromNickname,
          postId,
          postTitle,
          postType,
          {
            commentId,
            commentPreview: mentionPreviewText(content)
          }
        );
      } catch (error) {
        console.error('멘션 알림 실패:', nickname, error);
      }
    })
  );
}
