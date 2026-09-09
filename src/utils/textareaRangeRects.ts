const MIRROR_STYLE_PROPS = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
] as const;

export type TextareaRangeRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function createMirror(textarea: HTMLTextAreaElement): HTMLDivElement {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  for (const prop of MIRROR_STYLE_PROPS) {
    mirror.style.setProperty(prop, style.getPropertyValue(prop));
  }

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = style.overflowWrap;
  mirror.style.wordBreak = style.wordBreak;
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  return mirror;
}

/** textarea 내 [start, end) 범위의 화면 좌표(스크롤·패딩 반영, editor 기준) */
export function getTextareaRangeRects(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number
): TextareaRangeRect[] {
  if (start >= end) return [];

  const value = textarea.value;
  const clampedStart = Math.max(0, Math.min(start, value.length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, value.length));
  if (clampedStart >= clampedEnd) return [];

  const mirror = createMirror(textarea);
  mirror.textContent = value.substring(0, clampedStart);

  const marker = document.createElement('span');
  marker.textContent = value.substring(clampedStart, clampedEnd) || '\u200b';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const rects = Array.from(marker.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      top: rect.top - textareaRect.top + textarea.scrollTop,
      left: rect.left - textareaRect.left + textarea.scrollLeft,
      width: rect.width,
      height: rect.height,
    }));

  document.body.removeChild(mirror);
  return rects;
}
