import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Pencil, Plus, Save, Settings, Trash2, X } from 'lucide-react';
import NicknameSuggestInput from './NicknameSuggestInput';
import type { UserMention } from '../utils/getUserMentions';
import {
  LYRIC_PART_OPTIONS,
  addOrReplaceHighlight,
  buildLyricSegments,
  createAnnotationId,
  getLyricPartOption,
  remapAnnotationsForLyricsChange,
  type LyricHighlight,
  type LyricNote,
  type LyricPartAssignments,
  type LyricPartId,
  type SongWorkspace,
} from '../utils/songWorkspace';

interface SelectionRange {
  start: number;
  end: number;
  top: number;
  left: number;
}

export type SongWorkspacePaperPayload = {
  title: string;
  members: string[];
  lyrics: string;
  highlights: LyricHighlight[];
  notes: LyricNote[];
  partAssignments: LyricPartAssignments;
  memo: string;
};

interface SongWorkspacePaperProps {
  workspace: SongWorkspace;
  memberCandidates: UserMention[];
  saving: boolean;
  remoteNewer: boolean;
  reloadToken: number;
  /** 공유 멤버가 아닐 때(리더 조회 등) 편집·삭제 잠금 */
  readOnly?: boolean;
  /** 상단 안내 배지 (예: 멤버 조회) */
  browseLabel?: string;
  onBack: () => void;
  onReloadRemote: () => void;
  onSave: (
    payload: SongWorkspacePaperPayload,
    options?: { silent?: boolean }
  ) => Promise<boolean> | boolean | Promise<void> | void;
  onDelete: () => void;
  /** 연습곡 → 합격곡으로 이동 (가사·색·메모 유지) */
  onMoveToApproved?: (payload: SongWorkspacePaperPayload) => void | Promise<void>;
}

type SaveSnapshot = {
  title: string;
  members: string[];
  lyrics: string;
  highlights: LyricHighlight[];
  notes: LyricNote[];
  partAssignments: LyricPartAssignments;
};

function snapshotKey(s: SaveSnapshot): string {
  return JSON.stringify({
    title: s.title.trim(),
    members: s.members.map((m) => m.trim()).filter(Boolean),
    lyrics: s.lyrics,
    highlights: s.highlights,
    notes: s.notes,
    partAssignments: s.partAssignments,
  });
}

const SongWorkspacePaper: React.FC<SongWorkspacePaperProps> = ({
  workspace,
  memberCandidates,
  saving,
  remoteNewer,
  reloadToken,
  readOnly = false,
  browseLabel,
  onBack,
  onReloadRemote,
  onSave,
  onDelete,
  onMoveToApproved,
}) => {
  const [title, setTitle] = useState(workspace.title);
  const [members, setMembers] = useState(
    workspace.members.length > 0 ? [...workspace.members] : ['']
  );
  const [lyrics, setLyrics] = useState(workspace.lyrics);
  const [highlights, setHighlights] = useState<LyricHighlight[]>(workspace.highlights ?? []);
  const [notes, setNotes] = useState<LyricNote[]>(workspace.notes ?? []);
  const [partAssignments, setPartAssignments] = useState<LyricPartAssignments>(
    workspace.partAssignments ?? {}
  );
  // 가사 내용이 없으면(한 번도 저장·작성 안 한 곡) 편집 모드로 시작 — 조회 전용은 제외
  const [isEditing, setIsEditing] = useState(() => !readOnly && !workspace.lyrics.trim());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [notePins, setNotePins] = useState<Array<{ id: string; top: number; left: number; preview: string }>>([]);
  const [autoSaveLabel, setAutoSaveLabel] = useState('');

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  /** 가사 onChange마다 동기 갱신 — setState 전에 prev로 하이라이트 오프셋 보정 */
  const lyricsSyncRef = useRef(workspace.lyrics);
  /** IME 조합 시작 시점 가사 — 조합 중엔 하이라이트 건드리지 않고 끝날 때 한 번에 보정 */
  const compositionBaseRef = useRef(workspace.lyrics);
  /** 하이라이트 리렌더 후 커서가 튀는 경우 복원 */
  const pendingCaretRef = useRef<{ start: number; end: number } | null>(null);
  /** 모바일에서 팔레트 탭 시 네이티브 선택이 붕괴돼도 색/메모 적용에 사용 */
  const selectionRef = useRef<SelectionRange | null>(null);
  /** 플로팅 팔레트 조작 중에는 selection state를 유지 */
  const preserveSelectionRef = useRef(false);
  const noteComposerOpenRef = useRef(noteComposerOpen);
  const isEditingRef = useRef(isEditing);
  const persistInFlightRef = useRef(false);
  const pendingSilentSaveRef = useRef(false);
  const lastSavedKeyRef = useRef('');
  const autoSaveTimerRef = useRef<number | undefined>(undefined);
  const persistRef = useRef<(options?: { silent?: boolean; exitEdit?: boolean }) => Promise<boolean>>(
    async () => false
  );
  const latestRef = useRef({
    title,
    members,
    lyrics,
    highlights,
    notes,
    partAssignments,
  });
  noteComposerOpenRef.current = noteComposerOpen;
  isEditingRef.current = isEditing;
  selectionRef.current = selection;
  latestRef.current = {
    title,
    members,
    lyrics,
    highlights,
    notes,
    partAssignments,
  };

  useEffect(() => {
    setTitle(workspace.title);
    setMembers(workspace.members.length > 0 ? [...workspace.members] : ['']);
    setLyrics(workspace.lyrics);
    lyricsSyncRef.current = workspace.lyrics;
    setHighlights(workspace.highlights ?? []);
    setNotes(workspace.notes ?? []);
    setPartAssignments(workspace.partAssignments ?? {});
    setIsEditing(!readOnly && !workspace.lyrics.trim());
    setSelection(null);
    setNoteComposerOpen(false);
    setActiveNoteId(null);
    setAutoSaveLabel('');
    pendingSilentSaveRef.current = false;
    lastSavedKeyRef.current = snapshotKey({
      title: workspace.title,
      members: workspace.members.length > 0 ? [...workspace.members] : [''],
      lyrics: workspace.lyrics,
      highlights: workspace.highlights ?? [],
      notes: workspace.notes ?? [],
      partAssignments: workspace.partAssignments ?? {},
    });
  }, [workspace.id, reloadToken, readOnly]);

  const buildPayload = () => {
    const cleanedAssignments: LyricPartAssignments = {};
    for (const opt of LYRIC_PART_OPTIONS) {
      const name = latestRef.current.partAssignments[opt.id]?.trim();
      if (name) cleanedAssignments[opt.id] = name;
    }
    const cur = latestRef.current;
    return {
      title: cur.title,
      members: cur.members,
      lyrics: cur.lyrics,
      highlights: cur.highlights,
      notes: cur.notes,
      partAssignments: cleanedAssignments,
      memo: workspace.memo || workspace.harmonyNote || '',
    };
  };

  const currentSnapshotKey = () => {
    const cur = latestRef.current;
    const cleanedAssignments: LyricPartAssignments = {};
    for (const opt of LYRIC_PART_OPTIONS) {
      const name = cur.partAssignments[opt.id]?.trim();
      if (name) cleanedAssignments[opt.id] = name;
    }
    return snapshotKey({
      title: cur.title,
      members: cur.members,
      lyrics: cur.lyrics,
      highlights: cur.highlights,
      notes: cur.notes,
      partAssignments: cleanedAssignments,
    });
  };

  const isDirty = () => currentSnapshotKey() !== lastSavedKeyRef.current;

  const persist = async (options?: { silent?: boolean; exitEdit?: boolean }) => {
    if (persistInFlightRef.current) {
      // 저장 중 추가 변경분 → 끝난 뒤 한 번 더 자동 저장
      if (options?.silent) pendingSilentSaveRef.current = true;
      return false;
    }
    if (options?.silent && !isDirty()) return true;

    persistInFlightRef.current = true;
    if (options?.silent) setAutoSaveLabel('자동 저장 중…');
    try {
      const payload = buildPayload();
      const result = await onSave(payload, { silent: options?.silent });
      if (result === false) {
        if (options?.silent) setAutoSaveLabel('자동 저장 실패');
        return false;
      }

      lastSavedKeyRef.current = snapshotKey({
        title: payload.title,
        members: payload.members,
        lyrics: payload.lyrics,
        highlights: payload.highlights,
        notes: payload.notes,
        partAssignments: payload.partAssignments,
      });

      if (options?.silent) {
        setAutoSaveLabel('자동 저장됨');
      }
      if (options?.exitEdit) {
        setIsEditing(false);
        setSelection(null);
        setNoteComposerOpen(false);
      }
      return true;
    } catch (error) {
      console.error('자동 저장 오류:', error);
      if (options?.silent) setAutoSaveLabel('자동 저장 실패');
      return false;
    } finally {
      persistInFlightRef.current = false;
      if (pendingSilentSaveRef.current && isEditingRef.current) {
        pendingSilentSaveRef.current = false;
        window.setTimeout(() => {
          if (isEditingRef.current && isDirty()) {
            void persistRef.current({ silent: true });
          }
        }, 300);
      }
    }
  };
  persistRef.current = persist;

  // 편집 중 변경 후 멈추면 자동 저장 (IME 조합 중이면 끝난 뒤 재시도)
  useEffect(() => {
    if (!isEditing) return;

    if (autoSaveTimerRef.current !== undefined) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = undefined;
    }

    const run = () => {
      autoSaveTimerRef.current = undefined;
      if (!isEditingRef.current) return;
      if (composingRef.current) {
        autoSaveTimerRef.current = window.setTimeout(run, 500);
        return;
      }
      if (!isDirty()) return;
      void persistRef.current({ silent: true });
    };

    autoSaveTimerRef.current = window.setTimeout(run, 1000);
    return () => {
      if (autoSaveTimerRef.current !== undefined) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = undefined;
      }
    };
  }, [isEditing, title, members, lyrics, highlights, notes, partAssignments]);

  // 앱 이탈·백그라운드 전환 시 즉시 저장 시도
  useEffect(() => {
    const flush = () => {
      if (!isEditingRef.current) return;
      if (!isDirty()) return;
      void persistRef.current({ silent: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!autoSaveLabel || autoSaveLabel === '자동 저장 중…') return;
    const t = window.setTimeout(() => setAutoSaveLabel(''), 2800);
    return () => window.clearTimeout(t);
  }, [autoSaveLabel]);

  const segments = useMemo(
    () => buildLyricSegments(lyrics, highlights, notes),
    [lyrics, highlights, notes]
  );

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  const setPartAssignee = (partId: LyricPartId, value: string) => {
    setPartAssignments((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (!trimmed) {
        delete next[partId];
      } else {
        next[partId] = value;
      }
      return next;
    });
  };

  const syncScroll = () => {
    const editor = editorRef.current;
    const backdrop = backdropRef.current;
    if (!editor || !backdrop) return;
    backdrop.scrollTop = editor.scrollTop;
    backdrop.scrollLeft = editor.scrollLeft;
    // textarea 스크롤바만큼 backdrop 오른쪽을 줄여 글·커서 가로 정렬
    const bar = Math.max(0, editor.offsetWidth - editor.clientWidth);
    backdrop.style.right = `${bar}px`;
    refreshNotePins();
  };

  const updateToolbarFromTextarea = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!isEditingRef.current) {
      selectionRef.current = null;
      setSelection(null);
      return;
    }

    const active = document.activeElement;
    const floatEl = floatRef.current;
    const focusInFloat = !!(floatEl && active && floatEl.contains(active));
    // 드래그 직후 포커스가 아직 반영 전일 수 있어 activeElement 검사는 완화
    // 팔레트(메모 입력 등)에 포커스가 있어도 기존 선택은 유지
    if (
      active !== editor &&
      active !== document.body &&
      !focusInFloat &&
      !preserveSelectionRef.current
    ) {
      return;
    }

    const start = editor.selectionStart ?? 0;
    const end = editor.selectionEnd ?? 0;
    if (end <= start) {
      // 모바일: 팔레트 탭 순간 네이티브 선택이 붕괴되어도 React 선택은 유지
      if (preserveSelectionRef.current || noteComposerOpenRef.current || focusInFloat) {
        return;
      }
      selectionRef.current = null;
      setSelection(null);
      return;
    }

    const style = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(style.lineHeight) || 28;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const textBefore = editor.value.slice(0, end);
    const lineIndex = textBefore.split('\n').length - 1;
    const top = paddingTop + (lineIndex + 1) * lineHeight - editor.scrollTop + 8;

    const next: SelectionRange = {
      start,
      end,
      top: Math.max(8, Math.min(top, editor.clientHeight - 8)),
      left: 12,
    };
    selectionRef.current = next;
    setSelection(next);
  };

  const offsetTopInEditor = (editor: HTMLTextAreaElement, offset: number) => {
    const style = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(style.lineHeight) || 28;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const textBefore = editor.value.slice(0, Math.max(0, offset));
    const lineIndex = textBefore.split('\n').length - 1;
    return paddingTop + (lineIndex + 1) * lineHeight - editor.scrollTop;
  };

  const refreshNotePins = () => {
    const editor = editorRef.current;
    if (!editor) {
      setNotePins([]);
      return;
    }
    setNotePins(
      notes.map((note, index) => {
        const top = Math.max(4, Math.min(offsetTopInEditor(editor, note.end) - 4, editor.clientHeight - 28));
        const preview = note.text.length > 18 ? `${note.text.slice(0, 18)}…` : note.text;
        return {
          id: note.id,
          top,
          left: 8 + (index % 3) * 8,
          preview,
        };
      })
    );
  };

  const scheduleToolbarUpdate = () => {
    // 브라우저가 selection을 반영한 뒤 툴바 표시 (드래그만으로 바로 뜸)
    requestAnimationFrame(() => {
      updateToolbarFromTextarea();
      requestAnimationFrame(updateToolbarFromTextarea);
    });
  };

  // selectionchange로 드래그 중·직후 툴바 즉시 갱신
  useEffect(() => {
    const onSelectionChange = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const active = document.activeElement;
      const floatEl = floatRef.current;
      if (
        active !== editor &&
        !(floatEl && active && floatEl.contains(active)) &&
        !preserveSelectionRef.current
      ) {
        return;
      }
      scheduleToolbarUpdate();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // 모바일: 가사 드래그(선택) 중 페이지·textarea 스크롤이 끼어들지 않도록 잠금
  useEffect(() => {
    if (!isEditing) return;
    const editor = editorRef.current;
    if (!editor) return;

    let fingerDown = false;
    let blockScroll = false;
    let longPressTimer: number | undefined;
    let startX = 0;
    let startY = 0;

    const setSelectingClass = (on: boolean) => {
      editor.classList.toggle('is-touch-selecting', on);
      if (on) {
        document.documentElement.classList.add('sw-lyric-selecting');
      } else if (!selectionRef.current) {
        // 팔레트가 떠 있으면 선택 effect가 잠금을 유지
        document.documentElement.classList.remove('sw-lyric-selecting');
      }
    };

    const clearLongPress = () => {
      if (longPressTimer !== undefined) {
        window.clearTimeout(longPressTimer);
        longPressTimer = undefined;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      fingerDown = true;
      blockScroll = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      // 이미 선택 팔레트가 떠 있으면 색칠·선택 조정 우선
      if (selectionRef.current) {
        blockScroll = true;
        setSelectingClass(true);
      }
      clearLongPress();
      longPressTimer = window.setTimeout(() => {
        if (!fingerDown) return;
        blockScroll = true;
        setSelectingClass(true);
      }, 200);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!fingerDown || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const dx = Math.abs(x - startX);
      const dy = Math.abs(y - startY);
      const hasRange = (editor.selectionStart ?? 0) !== (editor.selectionEnd ?? 0);

      if (!blockScroll && hasRange) {
        blockScroll = true;
        setSelectingClass(true);
      }

      if (!blockScroll && (dx > 10 || dy > 10)) {
        clearLongPress();
        // 가로 드래그는 선택 시도로 보고 스크롤 차단 (세로는 플리크 스크롤 허용)
        if (dx >= dy) {
          blockScroll = true;
          setSelectingClass(true);
        }
      }

      if (blockScroll) {
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      fingerDown = false;
      blockScroll = false;
      clearLongPress();
      setSelectingClass(false);
      scheduleToolbarUpdate();
    };

    editor.addEventListener('touchstart', onTouchStart, { passive: true });
    editor.addEventListener('touchmove', onTouchMove, { passive: false });
    editor.addEventListener('touchend', onTouchEnd, { passive: true });
    editor.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      clearLongPress();
      setSelectingClass(false);
      editor.removeEventListener('touchstart', onTouchStart);
      editor.removeEventListener('touchmove', onTouchMove);
      editor.removeEventListener('touchend', onTouchEnd);
      editor.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isEditing]);

  // 선택 팔레트가 떠 있는 동안 배경 스크롤로 화면이 흔들리지 않게 함
  useEffect(() => {
    if (!selection) return;
    const y = window.scrollY;
    const { body } = document;
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.width = '100%';
    document.documentElement.classList.add('sw-lyric-selecting');
    return () => {
      document.documentElement.classList.remove('sw-lyric-selecting');
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, y);
    };
  }, [selection]);

  useLayoutEffect(() => {
    syncScroll();
  }, [notes, lyrics, highlights, isEditing]);

  // 하이라이트 레이어 리렌더로 커서가 맨 앞 등으로 튀면 직전 위치로 복원 (IME 중에는 건드리지 않음)
  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending) return;
    pendingCaretRef.current = null;
    if (composingRef.current) return;
    const editor = editorRef.current;
    if (!editor || document.activeElement !== editor) return;
    const len = editor.value.length;
    const start = Math.max(0, Math.min(pending.start, len));
    const end = Math.max(0, Math.min(pending.end, len));
    if (editor.selectionStart === start && editor.selectionEnd === end) return;
    try {
      editor.setSelectionRange(start, end);
    } catch {
      /* ignore */
    }
  }, [lyrics, highlights, notes]);

  const clearDragSelection = (collapseAt: number) => {
    preserveSelectionRef.current = false;
    selectionRef.current = null;
    setSelection(null);
    setNoteComposerOpen(false);
    setNoteDraft('');
    const editor = editorRef.current;
    if (!editor) return;
    const pos = Math.max(0, Math.min(collapseAt, editor.value.length));
    try {
      editor.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
  };

  const applyAnnotationRemap = (value: string, prevLyrics: string) => {
    if (value.length === 0) {
      setHighlights([]);
      setNotes([]);
      return;
    }
    setHighlights((prev) => remapAnnotationsForLyricsChange(prev, value, prevLyrics));
    setNotes((prev) => remapAnnotationsForLyricsChange(prev, value, prevLyrics));
  };

  const commitLyricsChange = (
    value: string,
    options?: { prevLyrics?: string; caret?: { start: number; end: number } | null }
  ) => {
    const prevLyrics = options?.prevLyrics ?? lyricsSyncRef.current;
    lyricsSyncRef.current = value;
    if (options?.caret && !composingRef.current) {
      pendingCaretRef.current = options.caret;
    }
    setLyrics(value);
    applyAnnotationRemap(value, prevLyrics);
    // 타이핑 중에는 선택 툴바 숨김
    setSelection(null);
    setNoteComposerOpen(false);
  };

  const handleLyricsChange = (
    value: string,
    caret?: { start: number; end: number } | null
  ) => {
    if (composingRef.current) {
      // IME 조합 중: 가사만 반영. 하이라이트 remap은 compositionEnd에서 한 번에
      // (중간 remap + 리렌더가 커서를 앞으로 보내는 원인)
      setLyrics(value);
      return;
    }
    commitLyricsChange(value, { caret: caret ?? null });
  };

  const applyColor = (partId: LyricPartId | null) => {
    const sel = selectionRef.current ?? selection;
    if (!sel || sel.end <= sel.start) return;
    const { start, end } = sel;
    setHighlights((prev) => addOrReplaceHighlight(prev, start, end, partId));
    clearDragSelection(end);
  };

  const saveSelectionNote = () => {
    const sel = selectionRef.current ?? selection;
    if (!sel || sel.end <= sel.start) return;
    const text = noteDraft.trim();
    if (!text) return;
    const { start, end } = sel;
    const id = createAnnotationId('note');
    setNotes((prev) => [
      ...prev,
      {
        id,
        start,
        end,
        text,
      },
    ]);
    clearDragSelection(end);
    setActiveNoteId(id);
  };

  const preserveSelectionPointerDown = (e: React.PointerEvent) => {
    // 메모 입력창은 포커스가 필요하므로 제외
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('textarea')) return;
    e.preventDefault();
    preserveSelectionRef.current = true;
  };

  const handleSave = async () => {
    await persist({ exitEdit: true });
  };

  const handleBack = () => {
    if (isEditingRef.current && isDirty()) {
      void persist({ silent: true }).finally(() => onBack());
      return;
    }
    onBack();
  };

  const startEditing = () => {
    if (readOnly) return;
    setIsEditing(true);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  };

  useEffect(() => {
    if (readOnly && isEditing) {
      setIsEditing(false);
    }
  }, [readOnly, isEditing]);

  return (
    <div className="sw-paper-page">
      <div className="sw-paper-topbar">
        <button type="button" className="song-workspace__back" onClick={handleBack}>
          <ChevronLeft size={18} aria-hidden />
          목록
        </button>
        <div className="sw-paper-topbar__title" title={title}>
          <span>{title || '제목 없음'}</span>
          <span className="song-workspace__badge">
            {workspace.category === 'practice' ? '연습곡' : '합격곡'}
          </span>
          {browseLabel ? <span className="song-workspace__badge">{browseLabel}</span> : null}
        </div>
        <div className="sw-paper-topbar__actions">
          {autoSaveLabel && isEditing && (
            <span className="sw-paper-autosave" aria-live="polite">
              {autoSaveLabel}
            </span>
          )}
          {!readOnly &&
            (isEditing ? (
              <button
                type="button"
                className="song-workspace__btn song-workspace__btn--primary"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                <Save size={16} aria-hidden />
                {saving ? '저장 중' : '저장'}
              </button>
            ) : (
              <button
                type="button"
                className="song-workspace__btn song-workspace__btn--primary"
                onClick={startEditing}
              >
                <Pencil size={16} aria-hidden />
                편집
              </button>
            ))}
          {!readOnly && (
            <button
              type="button"
              className="sw-paper-icon-btn"
              aria-label="설정"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      </div>

      {remoteNewer && !readOnly && (
        <div className="song-workspace__remote">
          <span>다른 멤버가 수정했습니다.</span>
          <button type="button" className="song-workspace__btn" onClick={onReloadRemote}>
            최신 내용 불러오기
          </button>
        </div>
      )}

      <p className="sw-paper-toolbar__hint sw-paper-toolbar__hint--alone">
        {readOnly
          ? '조회 · 공유 멤버가 아니라 읽기만 가능합니다.'
          : isEditing
            ? '편집 · 드래그로 색칠·메모(모바일은 짧게 누른 뒤 드래그). 잠시 멈추면 자동 저장됩니다.'
            : '보기 · 편집을 누르면 가사·색·메모를 수정할 수 있습니다.'}
      </p>

      <div className={`sw-paper-sheet${isEditing ? '' : ' is-view'}`}>
        <div className="sw-paper-sheet__inner">
          <div className="sw-paper-editor">
            <div ref={backdropRef} className="sw-paper-backdrop" aria-hidden>
              {segments.length === 0 ? (
                <span className="sw-paper-backdrop__spacer">{'\u00a0'}</span>
              ) : (
                segments.map((seg, index) => {
                  const part = getLyricPartOption(seg.partId);
                  const hasNote = seg.noteIds.length > 0;
                  return (
                    <span
                      key={`${seg.start}-${seg.end}-${index}-${seg.partId || 'x'}`}
                      className={`sw-paper-seg${hasNote ? ' has-note' : ''}`}
                      style={
                        part
                          ? {
                              background: part.bg,
                            }
                          : hasNote
                            ? {
                                background: 'rgba(196, 146, 60, 0.18)',
                              }
                            : undefined
                      }
                    >
                      {seg.text}
                    </span>
                  );
                })
              )}
            </div>
            <textarea
              ref={editorRef}
              className={`sw-paper-textarea${isEditing ? '' : ' is-readonly'}`}
              value={lyrics}
              readOnly={!isEditing}
              onChange={(e) => {
                if (!isEditing) return;
                const el = e.target;
                handleLyricsChange(el.value, {
                  start: el.selectionStart ?? 0,
                  end: el.selectionEnd ?? 0,
                });
              }}
              onCompositionStart={() => {
                if (!isEditing) return;
                composingRef.current = true;
                compositionBaseRef.current = lyricsSyncRef.current;
                pendingCaretRef.current = null;
              }}
              onCompositionEnd={(e) => {
                if (!isEditing) return;
                composingRef.current = false;
                const value = e.currentTarget.value;
                const caret = {
                  start: e.currentTarget.selectionStart ?? value.length,
                  end: e.currentTarget.selectionEnd ?? value.length,
                };
                // 조합 시작 가사 → 확정 가사로 한 번에 오프셋 보정
                commitLyricsChange(value, {
                  prevLyrics: compositionBaseRef.current,
                  caret,
                });
              }}
              onScroll={syncScroll}
              onSelect={scheduleToolbarUpdate}
              onKeyUp={scheduleToolbarUpdate}
              onMouseUp={scheduleToolbarUpdate}
              onPointerUp={scheduleToolbarUpdate}
              onTouchEnd={scheduleToolbarUpdate}
              placeholder={
                isEditing
                  ? '가사를 여기에 붙여넣으세요.\n드래그하면 색칠·메모를 할 수 있습니다.'
                  : '저장된 가사가 없습니다. 편집을 눌러 작성하세요.'
              }
              spellCheck={false}
            />

            {notePins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                className={`sw-paper-note-pin${activeNoteId === pin.id ? ' is-active' : ''}`}
                style={{ top: pin.top, right: 8, left: 'auto' }}
                title={pin.preview}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setActiveNoteId(pin.id)}
              >
                메모 · {pin.preview}
              </button>
            ))}

            {isEditing && selection && (
              <div
                ref={floatRef}
                className="sw-paper-float"
                style={{ top: selection.top, left: Math.min(selection.left, 180) }}
                onPointerDown={preserveSelectionPointerDown}
              >
                <div className="sw-paper-float__colors">
                  {LYRIC_PART_OPTIONS.map((part) => {
                    const assignee = partAssignments[part.id]?.trim();
                    return (
                      <button
                        key={part.id}
                        type="button"
                        className="song-workspace__swatch"
                        title={assignee ? `${part.label} · ${assignee}` : part.label}
                        style={
                          {
                            '--swatch-color': part.color,
                            '--swatch-bg': part.bg,
                          } as React.CSSProperties
                        }
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          preserveSelectionRef.current = true;
                          applyColor(part.id);
                        }}
                      >
                        <span className="song-workspace__swatch-label">{part.label}</span>
                        {assignee ? (
                          <span className="song-workspace__swatch-name">{assignee}</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="song-workspace__swatch song-workspace__swatch--eraser"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      preserveSelectionRef.current = true;
                      applyColor(null);
                    }}
                  >
                    지우기
                  </button>
                </div>
                <div className="sw-paper-float__row">
                  <button
                    type="button"
                    className="song-workspace__btn"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      preserveSelectionRef.current = true;
                      setNoteComposerOpen(true);
                    }}
                  >
                    메모
                  </button>
                  <button
                    type="button"
                    className="song-workspace__btn song-workspace__btn--ghost"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      clearDragSelection(selectionRef.current?.end ?? selection.end);
                    }}
                  >
                    닫기
                  </button>
                </div>
                {noteComposerOpen && (
                  <div className="sw-paper-float__note">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="선택 구간에 남길 메모"
                      rows={3}
                    />
                    <button
                      type="button"
                      className="song-workspace__btn song-workspace__btn--primary"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        preserveSelectionRef.current = true;
                        saveSelectionNote();
                      }}
                    >
                      메모 저장
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="sw-paper-edge-legend" aria-label="색상 담당">
            {LYRIC_PART_OPTIONS.map((part) => {
              const name = partAssignments[part.id] ?? '';
              if (!isEditing && !name.trim()) return null;
              return (
                <label key={part.id} className="sw-paper-edge-legend__row">
                  <span
                    className="sw-paper-edge-legend__color"
                    style={{ backgroundColor: part.color }}
                    aria-hidden
                  />
                  <span className="sw-paper-edge-legend__sep">:</span>
                  {isEditing ? (
                    <input
                      className="sw-paper-edge-legend__input"
                      value={name}
                      onChange={(e) => setPartAssignee(part.id, e.target.value)}
                      placeholder="이름"
                      maxLength={12}
                      aria-label={`${part.label} 색 담당`}
                    />
                  ) : (
                    <span className="sw-paper-edge-legend__name">{name}</span>
                  )}
                </label>
              );
            })}
          </aside>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="sw-paper-notes-list">
          <h3>구간 메모</h3>
          <ul>
            {notes.map((note) => (
              <li key={note.id}>
                <button type="button" onClick={() => setActiveNoteId(note.id)}>
                  <strong>{lyrics.slice(note.start, note.end) || '(선택 구간)'}</strong>
                  <span>{note.text}</span>
                </button>
                {isEditing && (
                  <button
                    type="button"
                    className="song-workspace__member-remove"
                    aria-label="메모 삭제"
                    onClick={() => setNotes((prev) => prev.filter((n) => n.id !== note.id))}
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeNote && (
        <div className="sw-paper-note-pop" role="dialog">
          <div className="sw-paper-note-pop__card">
            <p className="sw-paper-note-pop__quote">
              “{lyrics.slice(activeNote.start, activeNote.end)}”
            </p>
            <p>{activeNote.text}</p>
            <button type="button" className="song-workspace__btn" onClick={() => setActiveNoteId(null)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="sw-settings-backdrop" onClick={() => setSettingsOpen(false)} role="presentation">
          <div
            className="sw-settings-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sw-settings-title"
          >
            <div className="sw-settings-modal__head">
              <h2 id="sw-settings-title">연습장 설정</h2>
              <button
                type="button"
                className="sw-paper-icon-btn"
                aria-label="닫기"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="song-workspace__field">
              <label htmlFor="sw-settings-title-input">곡 제목</label>
              <input
                id="sw-settings-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            <div className="song-workspace__field">
              <label>함께하는 멤버</label>
              <p className="song-workspace__hint">멤버는 같은 연습장을 함께 보고 수정할 수 있습니다.</p>
              {members.map((member, index) => (
                <div key={`settings-member-${index}`} className="song-workspace__member-row">
                  <NicknameSuggestInput
                    value={member}
                    onChange={(value) => {
                      setMembers((prev) => {
                        const next = [...prev];
                        next[index] = value;
                        return next;
                      });
                    }}
                    candidates={memberCandidates}
                    excludeNicknames={members.filter((_, i) => i !== index)}
                    placeholder="닉네임 검색"
                  />
                  <button
                    type="button"
                    className="song-workspace__member-remove"
                    aria-label="멤버 칸 삭제"
                    onClick={() =>
                      setMembers((prev) =>
                        prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="song-workspace__btn"
                onClick={() => setMembers((prev) => [...prev, ''])}
              >
                <Plus size={14} aria-hidden />
                멤버 추가
              </button>
            </div>

            {workspace.category === 'practice' && onMoveToApproved && (
              <div className="song-workspace__field">
                <label>합격곡으로 이동</label>
                <p className="song-workspace__hint">
                  합격한 곡을 고르면 이 연습장의 가사·색칠·메모를 그대로 옮기고, 연습곡 목록에서는 제거됩니다.
                </p>
                <button
                  type="button"
                  className="song-workspace__btn song-workspace__btn--primary"
                  disabled={saving}
                  onClick={() => {
                    void (async () => {
                      if (isEditingRef.current && isDirty()) {
                        const ok = await persist({ silent: true });
                        if (!ok) {
                          return;
                        }
                      }
                      setSettingsOpen(false);
                      await onMoveToApproved(buildPayload());
                    })();
                  }}
                >
                  합격곡 선택…
                </button>
              </div>
            )}

            <div className="song-workspace__actions">
              <button
                type="button"
                className="song-workspace__btn song-workspace__btn--primary"
                onClick={() => setSettingsOpen(false)}
              >
                완료
              </button>
              <button
                type="button"
                className="song-workspace__btn song-workspace__btn--danger"
                disabled={saving}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={16} aria-hidden />
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          className="sw-delete-confirm-backdrop"
          role="presentation"
          onClick={() => !saving && setDeleteConfirmOpen(false)}
        >
          <div
            className="sw-delete-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sw-delete-confirm-title"
            aria-describedby="sw-delete-confirm-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="sw-delete-confirm-title">연습장을 삭제할까요?</h3>
            <div id="sw-delete-confirm-desc" className="sw-delete-confirm__body">
              <p>
                <strong>“{title.trim() || workspace.title || '제목 없음'}”</strong> 연습장을
                삭제합니다.
              </p>
              {members.map((m) => m.trim()).filter(Boolean).length > 1 ? (
                <>
                  <p className="sw-delete-confirm__warn">
                    이 가사진은 아래 멤버와 <strong>공유</strong> 중입니다.
                    <br />
                    삭제하면 <strong>함께하는 멤버 전원</strong>의 목록에서도 사라지고, 되돌릴 수
                    없습니다.
                  </p>
                  <p className="sw-delete-confirm__members">
                    공유 멤버:{' '}
                    {members
                      .map((m) => m.trim())
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </>
              ) : (
                <p className="sw-delete-confirm__warn">
                  삭제하면 저장된 가사·색칠·메모가 모두 사라지며 되돌릴 수 없습니다.
                </p>
              )}
              <p>정말 삭제하시겠습니까?</p>
            </div>
            <div className="sw-delete-confirm__actions">
              <button
                type="button"
                className="song-workspace__btn"
                disabled={saving}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                아니오
              </button>
              <button
                type="button"
                className="song-workspace__btn song-workspace__btn--danger"
                disabled={saving}
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setSettingsOpen(false);
                  onDelete();
                }}
              >
                {saving ? '삭제 중…' : '예, 삭제합니다'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongWorkspacePaper;
