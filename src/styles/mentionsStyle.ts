import type { CSSProperties } from 'react';

const sharedFont = {
  fontSize: 14,
  fontFamily: 'inherit',
  lineHeight: 1.5,
  letterSpacing: 'normal',
} as const;

/**
 * 입력 글자는 항상 보이게 두고(투명 금지),
 * 하이라이터는 멘션 칩 배경만 그린다.
 * → @ 입력 중에도 골뱅이가 사라지지 않음.
 */
const mentionsStyle = {
  control: {
    ...sharedFont,
    backgroundColor: 'var(--comment-input-bg, #fffdf8)',
    borderRadius: 12,
    border: '2px solid var(--comment-input-border, #E5E7EB)',
    padding: 0,
    minHeight: 100,
    color: 'var(--comment-input-color, #1F2937)',
  },
  highlighter: {
    ...sharedFont,
    padding: 14,
    overflow: 'hidden',
    border: '2px solid transparent',
    boxSizing: 'border-box' as const,
    // 중복 글자 숨김 — 칩 배경만 보이게
    color: 'transparent',
  },
  input: {
    ...sharedFont,
    margin: 0,
    padding: 14,
    minHeight: 100,
    outline: 0,
    border: '2px solid transparent',
    boxSizing: 'border-box' as const,
    width: '100%',
    background: 'transparent',
    // @ 및 일반 입력 글자 항상 표시
    color: 'var(--comment-input-color, #1F2937)',
    caretColor: 'var(--comment-input-color, #1F2937)',
  },
  suggestions: {
    list: {
      backgroundColor: 'var(--card-bg, #fff)',
      border: '1px solid var(--border-color, #E5E7EB)',
      fontSize: 14,
      borderRadius: 10,
      zIndex: 100,
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      overflow: 'hidden',
      maxHeight: 240,
      overflowY: 'auto' as const,
    },
    item: {
      padding: '10px 14px',
      borderBottom: '1px solid var(--border-color, #F3F4F6)',
      color: 'var(--text-primary, #1F2937)',
      cursor: 'pointer',
    },
    itemFocused: {
      backgroundColor: 'var(--comment-mention-bg, #f0e6d6)',
      color: 'var(--comment-mention-text, #8b5a2b)',
    },
  },
};

/**
 * 하이라이터 칩: 배경만 (글자는 투명 → 입력창 글자와 겹침/깨짐 방지)
 * padding을 넣으면 입력·하이라이터 위치가 어긋나므로 쓰지 않음.
 */
export const mentionChipStyle: CSSProperties = {
  backgroundColor: 'var(--comment-mention-bg, #f0e6d6)',
  color: 'transparent',
  fontWeight: 700,
  borderRadius: 6,
  boxShadow: 'inset 0 0 0 1px var(--comment-mention-border, #e8dcc8)',
  boxDecorationBreak: 'clone',
  WebkitBoxDecorationBreak: 'clone',
};

export default mentionsStyle;
