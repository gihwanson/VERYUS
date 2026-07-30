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

interface SongWorkspacePaperProps {
  workspace: SongWorkspace;
  memberCandidates: UserMention[];
  saving: boolean;
  remoteNewer: boolean;
  reloadToken: number;
  onBack: () => void;
  onReloadRemote: () => void;
  onSave: (
    payload: {
      title: string;
      members: string[];
      lyrics: string;
      highlights: LyricHighlight[];
      notes: LyricNote[];
      partAssignments: LyricPartAssignments;
      memo: string;
    },
    options?: { silent?: boolean }
  ) => Promise<boolean> | boolean | Promise<void> | void;
  onDelete: () => void;
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
  onBack,
  onReloadRemote,
  onSave,
  onDelete,
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
  // 가사 내용이 없으면(한 번도 저장·작성 안 한 곡) 편집 모드로 시작
  const [isEditing, setIsEditing] = useState(() => !workspace.lyrics.trim());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [notePins, setNotePins] = useState<Array<{ id: string; top: number; left: number; preview: string }>>([]);
  const [autoSaveLabel, setAutoSaveLabel] = useState('');

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
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
    setHighlights(workspace.highlights ?? []);
    setNotes(workspace.notes ?? []);
    setPartAssignments(workspace.partAssignments ?? {});
    setIsEditing(!workspace.lyrics.trim());
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
  }, [workspace.id, reloadToken]);

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
    refreshNotePins();
  };

  const updateToolbarFromTextarea = () => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!isEditingRef.current) {
      setSelection(null);
      return;
    }
    // 드래그 직후 포커스가 아직 반영 전일 수 있어 activeElement 검사는 완화
    if (document.activeElement !== editor && document.activeElement !== document.body) {
      return;
    }

    const start = editor.selectionStart ?? 0;
    const end = editor.selectionEnd ?? 0;
    if (end <= start) {
      if (!noteComposerOpenRef.current) setSelection(null);
      return;
    }

    const style = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(style.lineHeight) || 28;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const textBefore = editor.value.slice(0, end);
    const lineIndex = textBefore.split('\n').length - 1;
    const top = paddingTop + (lineIndex + 1) * lineHeight - editor.scrollTop + 8;

    setSelection({
      start,
      end,
      top: Math.max(8, Math.min(top, editor.clientHeight - 8)),
      left: 12,
    });
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
      if (document.activeElement !== editor) return;
      scheduleToolbarUpdate();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  useLayoutEffect(() => {
    refreshNotePins();
  }, [notes, lyrics]);

  const clearDragSelection = (collapseAt: number) => {
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

  const commitLyricsChange = (value: string) => {
    setLyrics(value);
    // 가사 전체 삭제 시 색·메모 주석도 함께 제거
    if (value.length === 0) {
      setHighlights([]);
      setNotes([]);
    } else {
      setHighlights((prev) => remapAnnotationsForLyricsChange(prev, value));
      setNotes((prev) => remapAnnotationsForLyricsChange(prev, value));
    }
    // 타이핑 중에는 선택 툴바 숨김 (커서 강제 이동 금지)
    setSelection(null);
    setNoteComposerOpen(false);
  };

  const handleLyricsChange = (value: string) => {
    if (composingRef.current) {
      // IME 조합 중에는 가사만 반영 — 하이라이트 remap/커서 조작으로 앞쪽 입력 방지
      setLyrics(value);
      return;
    }
    commitLyricsChange(value);
  };

  const applyColor = (partId: LyricPartId | null) => {
    if (!selection) return;
    const { start, end } = selection;
    setHighlights((prev) => addOrReplaceHighlight(prev, start, end, partId));
    clearDragSelection(end);
  };

  const saveSelectionNote = () => {
    if (!selection) return;
    const text = noteDraft.trim();
    if (!text) return;
    const { start, end } = selection;
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
    setIsEditing(true);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  };

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
        </div>
        <div className="sw-paper-topbar__actions">
          {autoSaveLabel && isEditing && (
            <span className="sw-paper-autosave" aria-live="polite">
              {autoSaveLabel}
            </span>
          )}
          {isEditing ? (
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
          )}
          <button
            type="button"
            className="sw-paper-icon-btn"
            aria-label="설정"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {remoteNewer && (
        <div className="song-workspace__remote">
          <span>다른 멤버가 수정했습니다.</span>
          <button type="button" className="song-workspace__btn" onClick={onReloadRemote}>
            최신 내용 불러오기
          </button>
        </div>
      )}

      <p className="sw-paper-toolbar__hint sw-paper-toolbar__hint--alone">
        {isEditing
          ? '편집 · 드래그로 색칠·메모. 잠시 멈추면 자동 저장됩니다.'
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
                handleLyricsChange(e.target.value);
              }}
              onCompositionStart={() => {
                if (!isEditing) return;
                composingRef.current = true;
              }}
              onCompositionEnd={(e) => {
                if (!isEditing) return;
                composingRef.current = false;
                commitLyricsChange(e.currentTarget.value);
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
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveNoteId(pin.id)}
              >
                메모 · {pin.preview}
              </button>
            ))}

            {isEditing && selection && (
              <div
                className="sw-paper-float"
                style={{ top: selection.top, left: Math.min(selection.left, 180) }}
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
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyColor(part.id)}
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
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyColor(null)}
                  >
                    지우기
                  </button>
                </div>
                <div className="sw-paper-float__row">
                  <button
                    type="button"
                    className="song-workspace__btn"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setNoteComposerOpen(true)}
                  >
                    메모
                  </button>
                  <button
                    type="button"
                    className="song-workspace__btn song-workspace__btn--ghost"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setSelection(null);
                      setNoteComposerOpen(false);
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
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={saveSelectionNote}
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
                onClick={onDelete}
              >
                <Trash2 size={16} aria-hidden />
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongWorkspacePaper;
