/**
 * 등급 이모지/이름 표시 — DB·댓글에 저장된 이모지(또는 필요 시 한글 이름)를 일관되게 표시한다.
 * (기존에는 여러 컴포넌트에서 getGradeEmoji가 항상 🍒만 반환해 등급 변경이 화면에 반영되지 않았음.)
 */
import { GRADE_NAMES, GRADE_ORDER, GRADE_SYSTEM } from '../components/AdminTypes';
import { getSavedAppUiStyle } from './appUiStyleStorage';

const EMOJI_SET = new Set<string>(GRADE_ORDER as unknown as string[]);

function resolveEmojiFromKoreanName(label: string): string | undefined {
  for (const [emoji, name] of Object.entries(GRADE_NAMES) as Array<[string, string]>) {
    if (name === label) return emoji;
  }
  return undefined;
}

function resolveEmojiFromMixedLabel(raw: string): string | undefined {
  const compact = raw.replace(/\s+/g, '');
  for (const [emoji, name] of Object.entries(GRADE_NAMES) as Array<[string, string]>) {
    if (raw.includes(emoji) || compact.includes(name)) return emoji;
  }
  return undefined;
}

export function getGradeEmoji(grade: string | undefined | null): string {
  const g = (grade ?? '').trim();
  if (!g) return GRADE_SYSTEM.CHERRY;
  if (EMOJI_SET.has(g)) return g;
  const fromKo = resolveEmojiFromKoreanName(g);
  if (fromKo) return fromKo;
  const fromMixed = resolveEmojiFromMixedLabel(g);
  if (fromMixed) return fromMixed;
  return GRADE_SYSTEM.CHERRY;
}

export function getGradeName(emojiOrKoreanLabel: string | undefined | null): string {
  const raw = (emojiOrKoreanLabel ?? '').trim();
  if (!raw) return GRADE_NAMES[GRADE_SYSTEM.CHERRY];
  if (EMOJI_SET.has(raw)) return GRADE_NAMES[raw] || GRADE_NAMES[GRADE_SYSTEM.CHERRY];
  const resolvedEmoji = resolveEmojiFromKoreanName(raw);
  if (resolvedEmoji) return GRADE_NAMES[resolvedEmoji] || GRADE_NAMES[GRADE_SYSTEM.CHERRY];
  const resolvedMixedEmoji = resolveEmojiFromMixedLabel(raw);
  if (resolvedMixedEmoji) return GRADE_NAMES[resolvedMixedEmoji] || GRADE_NAMES[GRADE_SYSTEM.CHERRY];
  return GRADE_NAMES[GRADE_SYSTEM.CHERRY];
}

/** UI 배지용 — 이모지 대신 한글 등급명만 표시 */
export function getGradeBadgeLabel(grade: string | undefined | null): string {
  return getGradeName(grade);
}

export interface PostListGradeSpanProps {
  className: string;
  title: string;
  children: string;
}

/** 게시판 목록 — 클래식은 이모지, 노트북은 한글 등급명 */
export function getPostListGradeSpanProps(
  grade: string | undefined | null,
  variant: 'default' | 'balance' = 'default'
): PostListGradeSpanProps {
  const title = getGradeName(grade);
  const isClassic = getSavedAppUiStyle() === 'classic';

  if (isClassic) {
    return {
      className: variant === 'balance' ? 'balance-post-author-grade' : 'author-grade-emoji',
      title,
      children: getGradeEmoji(grade),
    };
  }

  return {
    className: 'author-grade-label',
    title,
    children: getGradeBadgeLabel(grade),
  };
}
