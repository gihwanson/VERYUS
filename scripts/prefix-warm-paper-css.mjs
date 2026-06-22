/**
 * warm-paper CSS — html[data-ui-style="warm-paper"] 접두사
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const files = [
  'src/styles/warm-paper-theme.css',
  'src/styles/warm-paper-features.css',
  'src/styles/warm-paper-mypage.css',
  'src/styles/warm-paper-typography.css',
  'src/styles/warm-paper-notifications-cc.css',
  'src/styles/warm-paper-home-notebook.css',
  'src/styles/warm-paper-approved-songs.css',
  'src/styles/warm-paper-contest.css',
  'src/styles/warm-paper-practice-room.css',
  'src/styles/warm-paper-setlist.css',
];

const PREFIX = 'html[data-ui-style="warm-paper"] ';

function splitSelectors(selectorText) {
  const parts = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < selectorText.length; i++) {
    const char = selectorText[i];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth = Math.max(0, depth - 1);
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  if (current) parts.push(current);
  return parts;
}

function prefixSelectorList(selectorText) {
  return splitSelectors(selectorText)
    .map((part) => {
      const lines = part.split('\n');
      const firstIdx = lines.findIndex((l) => l.trim().length > 0);
      if (firstIdx === -1) return part;
      const first = lines[firstIdx].trim();
      if (first.startsWith('html[data-ui-style="warm-paper"]')) return part;
      lines[firstIdx] = lines[firstIdx].replace(/^\s*/, (m) => m + PREFIX);
      return lines.join('\n');
    })
    .join(',');
}

function prefixCss(css) {
  let out = '';
  let i = 0;

  while (i < css.length) {
    if (/\s/.test(css[i])) {
      out += css[i];
      i++;
      continue;
    }

    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const close = end === -1 ? css.length : end + 2;
      out += css.slice(i, close);
      i = close;
      continue;
    }

    const brace = css.indexOf('{', i);
    if (brace === -1) {
      out += css.slice(i);
      break;
    }

    const head = css.slice(i, brace).trim();
    if (head === ':root') {
      const close = findMatchingBrace(css, brace);
      out += 'html[data-ui-style="warm-paper"]' + css.slice(brace, close + 1);
      i = close + 1;
      continue;
    }

    if (css[i] === '@') {
      const head = css.slice(i, brace).trim();
      const close = findMatchingBrace(css, brace);
      const inner = css.slice(brace + 1, close);

      if (head.startsWith('@keyframes') || head.startsWith('@font-face')) {
        out += css.slice(i, close + 1);
      } else if (head.startsWith('@media') || head.startsWith('@supports')) {
        out += css.slice(i, brace + 1) + prefixCss(inner) + '}';
      } else {
        out += css.slice(i, close + 1);
      }
      i = close + 1;
      continue;
    }

    const selector = css.slice(i, brace);
    const close = findMatchingBrace(css, brace);
    const body = css.slice(brace, close + 1);

    if (!selector.trim()) {
      out += css.slice(i, close + 1);
    } else {
      out += prefixSelectorList(selector) + body;
    }
    i = close + 1;
  }

  return out;
}

function findMatchingBrace(str, openIndex) {
  let depth = 0;
  for (let j = openIndex; j < str.length; j++) {
    if (str[j] === '{') depth++;
    else if (str[j] === '}') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return str.length - 1;
}

for (const rel of files) {
  const filePath = path.join(root, rel);
  const original = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, prefixCss(original), 'utf8');
  console.log('prefixed:', rel);
}

console.log('done');
