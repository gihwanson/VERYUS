import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { UserMention } from '../utils/getUserMentions';
import './NicknameSuggestInput.css';

interface NicknameSuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** 전체 후보 닉네임 목록 */
  candidates: UserMention[];
  /** 다른 필드에 이미 선택된 닉네임 (본인 입력칸 제외) */
  excludeNicknames?: string[];
  disabled?: boolean;
  maxSuggestions?: number;
}

function resolveMemberNickname(
  raw: string,
  candidates: UserMention[]
): UserMention | null {
  const t = raw.trim();
  if (!t) return null;
  const exact = candidates.find((u) => u.nickname === t);
  if (exact) return exact;
  const lower = t.toLowerCase();
  return candidates.find((u) => u.nickname.toLowerCase() === lower) || null;
}

const NicknameSuggestInput: React.FC<NicknameSuggestInputProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  candidates,
  excludeNicknames = [],
  disabled = false,
  maxSuggestions = 8,
}) => {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matched = useMemo(
    () => resolveMemberNickname(value, candidates),
    [value, candidates]
  );
  const isValid = Boolean(matched);
  const isInvalid = value.trim().length > 0 && !matched;

  const excludeSet = useMemo(
    () => new Set(excludeNicknames.map((n) => n.trim().toLowerCase()).filter(Boolean)),
    [excludeNicknames]
  );

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) {
      return candidates
        .filter((u) => !excludeSet.has(u.nickname.toLowerCase()))
        .slice(0, maxSuggestions);
    }
    return candidates
      .filter((u) => {
        const nick = u.nickname.toLowerCase();
        if (excludeSet.has(nick)) return false;
        return nick.includes(q);
      })
      .slice(0, maxSuggestions);
  }, [value, candidates, excludeSet, maxSuggestions]);

  useEffect(() => {
    setHighlight(0);
  }, [value, open]);

  useEffect(() => {
    const onDocPointer = (e: MouseEvent | TouchEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
        const resolved = resolveMemberNickname(value, candidates);
        if (resolved && value !== resolved.nickname) {
          onChange(resolved.nickname);
        }
      }
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('touchstart', onDocPointer);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('touchstart', onDocPointer);
    };
  }, [value, candidates, onChange]);

  const pick = (nickname: string) => {
    onChange(nickname);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const resolved = resolveMemberNickname(value, candidates);
        if (resolved) pick(resolved.nickname);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = suggestions[highlight];
      if (chosen) pick(chosen.nickname);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div
      className={`nickname-suggest ${isValid ? 'is-valid' : ''} ${isInvalid ? 'is-invalid' : ''} ${className}`.trim()}
      ref={wrapRef}
    >
      <input
        type="text"
        className={`nickname-suggest__input${isValid ? ' is-valid' : ''}${isInvalid ? ' is-invalid' : ''}`}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={isInvalid}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            const resolved = resolveMemberNickname(value, candidates);
            if (resolved && value !== resolved.nickname) {
              onChange(resolved.nickname);
            }
            setOpen(false);
          }, 120);
        }}
        onKeyDown={onKeyDown}
      />

      {isInvalid && (
        <p className="nickname-suggest__hint nickname-suggest__hint--error">
          앱에 없는 닉네임입니다. 목록에서 선택해 주세요.
        </p>
      )}

      {showList && (
        <ul id={listId} className="nickname-suggest__list" role="listbox">
          {suggestions.map((u, i) => (
            <li key={u.uid}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`nickname-suggest__option${i === highlight ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u.nickname)}
                onMouseEnter={() => setHighlight(i)}
              >
                {u.nickname}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default NicknameSuggestInput;

/** 제출 전 멤버 닉네임 검증 — 잘못된 닉네임 목록 반환 */
export function findInvalidMemberNicknames(
  members: string[],
  candidates: UserMention[]
): string[] {
  const invalid: string[] = [];
  for (const raw of members) {
    const t = raw.trim();
    if (!t) continue;
    if (!resolveMemberNickname(t, candidates)) {
      invalid.push(t);
    }
  }
  return invalid;
}

/** 유효 멤버만 정규화된 닉네임 배열로 */
export function normalizeMemberNicknames(
  members: string[],
  candidates: UserMention[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of members) {
    const resolved = resolveMemberNickname(raw, candidates);
    if (!resolved) continue;
    if (seen.has(resolved.nickname)) continue;
    seen.add(resolved.nickname);
    out.push(resolved.nickname);
  }
  return out;
}
