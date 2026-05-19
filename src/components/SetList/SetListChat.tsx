import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import { ChevronDown, ChevronUp, Send } from 'lucide-react';
import { db } from '../../firebase';
import './styles.css';

export interface SetListChatMessage {
  id: string;
  senderUid: string;
  senderNickname: string;
  content: string;
  createdAt?: { toDate?: () => Date };
  createdAtClient?: number;
}

interface SetListChatProps {
  setListId: string;
  currentUserNickname: string;
  currentUserUid?: string;
  isLeader?: boolean;
  /** 모바일 풀스크린에서 접기 UI 사용 */
  compact?: boolean;
}

const MAX_LENGTH = 500;
const MESSAGE_LIMIT = 200;

function messageTimestamp(msg: SetListChatMessage): number {
  if (msg.createdAt && typeof msg.createdAt.toDate === 'function') {
    return msg.createdAt.toDate().getTime();
  }
  if (msg.createdAtClient) return msg.createdAtClient;
  return 0;
}

function formatTime(ts?: SetListChatMessage['createdAt'], clientMs?: number): string {
  const date =
    ts && typeof ts.toDate === 'function'
      ? ts.toDate()
      : clientMs
        ? new Date(clientMs)
        : null;
  if (!date) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function dateKeyFromMsg(msg: SetListChatMessage): string {
  const ms = messageTimestamp(msg);
  const d = ms ? new Date(ms) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateSeparator(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (key === todayKey) return '오늘';
  if (key === yesterdayKey) return '어제';
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

type ChatRow =
  | { type: 'date'; key: string; label: string }
  | { type: 'msg'; key: string; msg: SetListChatMessage };

function buildChatRows(messages: SetListChatMessage[]): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDateKey = '';
  for (const msg of messages) {
    const dk = dateKeyFromMsg(msg);
    if (dk !== lastDateKey) {
      rows.push({ type: 'date', key: `date-${dk}`, label: formatDateSeparator(dk) });
      lastDateKey = dk;
    }
    rows.push({ type: 'msg', key: msg.id, msg });
  }
  return rows;
}

const SetListChat: React.FC<SetListChatProps> = ({
  setListId,
  currentUserNickname,
  currentUserUid = '',
  isLeader = false,
  compact = false
}) => {
  const [messages, setMessages] = useState<SetListChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [unreadWhileCollapsed, setUnreadWhileCollapsed] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);
  const collapsedRef = useRef(collapsed);

  const trimmedNickname = currentUserNickname.trim();

  const canSend = Boolean(trimmedNickname) && Boolean(setListId);

  const chatRows = useMemo(() => buildChatRows(messages), [messages]);

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  useEffect(() => {
    if (!setListId) {
      setMessages([]);
      setLoadError(null);
      return;
    }

    const q = query(
      collection(db, 'setlists', setListId, 'chatMessages'),
      orderBy('createdAt', 'desc'),
      limit(MESSAGE_LIMIT)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        const msgs = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data()
          }))
          .reverse() as SetListChatMessage[];
        setMessages(msgs);
      },
      (err) => {
        console.error('셋리스트 채팅 로드 실패:', err);
        setLoadError('채팅을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    );

    return () => unsub();
  }, [setListId]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    chatEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const nearBottom = distanceFromBottom < 72;
    stickToBottomRef.current = nearBottom;
    setShowScrollFab(!nearBottom && messages.length > 0);
  }, [messages.length]);

  useEffect(() => {
    const prevCount = lastMessageCountRef.current;
    const grew = messages.length > prevCount;
    lastMessageCountRef.current = messages.length;

    if (collapsedRef.current) {
      if (grew && messages.length > 0) {
        const last = messages[messages.length - 1];
        const fromOthers =
          last.senderUid !== currentUserUid ||
          last.senderNickname !== trimmedNickname;
        if (fromOthers) {
          setUnreadWhileCollapsed((n) => n + (messages.length - prevCount));
        }
      }
      return;
    }

    if (stickToBottomRef.current || grew) {
      scrollToBottom(grew ? 'smooth' : 'auto');
    }
  }, [messages, currentUserUid, trimmedNickname, scrollToBottom]);

  useEffect(() => {
    if (!collapsed) {
      setUnreadWhileCollapsed(0);
      requestAnimationFrame(() => scrollToBottom('auto'));
    }
  }, [collapsed, scrollToBottom]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !setListId || sending || !canSend) return;

    setSending(true);
    setSendError(null);
    setInput('');
    stickToBottomRef.current = true;

    try {
      await addDoc(collection(db, 'setlists', setListId, 'chatMessages'), {
        senderUid: currentUserUid || 'guest',
        senderNickname: trimmedNickname,
        content: text,
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error('셋리스트 채팅 전송 실패:', e);
      setInput(text);
      setSendError('전송에 실패했습니다. 네트워크를 확인해 주세요.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, setListId, sending, canSend, currentUserUid, trimmedNickname]);

  const handleDeleteMessage = useCallback(
    async (msg: SetListChatMessage) => {
      if (!setListId || !isLeader) return;
      if (!confirm('이 메시지를 삭제할까요?')) return;
      try {
        await deleteDoc(doc(db, 'setlists', setListId, 'chatMessages', msg.id));
      } catch (e) {
        console.error('메시지 삭제 실패:', e);
        setSendError('메시지 삭제에 실패했습니다.');
      }
    },
    [setListId, isLeader]
  );

  const isMine = useCallback(
    (msg: SetListChatMessage) => {
      if (currentUserUid && msg.senderUid && msg.senderUid !== 'guest') {
        return msg.senderUid === currentUserUid;
      }
      return msg.senderNickname === trimmedNickname;
    },
    [currentUserUid, trimmedNickname]
  );

  return (
    <section
      className={[
        'setlist-chat-panel',
        compact ? 'setlist-chat-panel--compact' : 'setlist-chat-panel--desktop',
        collapsed ? 'setlist-chat-panel--collapsed' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="셋리스트 멤버 채팅"
    >
      <div className="setlist-chat-header">
        <div className="setlist-chat-header-main">
          <span className="setlist-chat-title">💬 멤버 채팅</span>
          {!collapsed && (
            <span className="setlist-chat-sub">{messages.length}개</span>
          )}
          {collapsed && unreadWhileCollapsed > 0 && (
            <span className="setlist-chat-unread-badge" aria-label={`새 메시지 ${unreadWhileCollapsed}개`}>
              {unreadWhileCollapsed > 99 ? '99+' : unreadWhileCollapsed}
            </span>
          )}
        </div>
        {compact && (
          <button
            type="button"
            className="setlist-chat-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '채팅 펼치기' : '채팅 접기'}
          >
            {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="setlist-chat-body">
          {loadError && <p className="setlist-chat-banner setlist-chat-banner--error">{loadError}</p>}
          {sendError && <p className="setlist-chat-banner setlist-chat-banner--error">{sendError}</p>}
          {!trimmedNickname && (
            <p className="setlist-chat-banner setlist-chat-banner--warn">
              로그인 닉네임이 없어 채팅을 보낼 수 없습니다.
            </p>
          )}

          <div
            className="setlist-chat-messages"
            ref={messagesRef}
            onScroll={handleMessagesScroll}
          >
            {messages.length === 0 && !loadError ? (
              <p className="setlist-chat-empty">
                진행 중 이야기를 나눠 보세요
                <br />
                <span className="setlist-chat-empty-hint">Enter 전송 · Shift+Enter 줄바꿈</span>
              </p>
            ) : (
              chatRows.map((row) => {
                if (row.type === 'date') {
                  return (
                    <div key={row.key} className="setlist-chat-date-divider" role="separator">
                      <span>{row.label}</span>
                    </div>
                  );
                }
                const msg = row.msg;
                const mine = isMine(msg);
                return (
                  <div
                    key={row.key}
                    className={`setlist-chat-msg ${mine ? 'setlist-chat-msg--mine' : 'setlist-chat-msg--other'}`}
                  >
                    {!mine && (
                      <span className="setlist-chat-sender">{msg.senderNickname}</span>
                    )}
                    <div className="setlist-chat-bubble-row">
                      <div className="setlist-chat-bubble">{msg.content}</div>
                      {isLeader && !mine && (
                        <button
                          type="button"
                          className="setlist-chat-delete-btn"
                          onClick={() => void handleDeleteMessage(msg)}
                          aria-label={`${msg.senderNickname} 메시지 삭제`}
                          title="삭제 (리더)"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <span className="setlist-chat-time">
                      {formatTime(msg.createdAt, msg.createdAtClient)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {showScrollFab && (
            <button
              type="button"
              className="setlist-chat-scroll-fab"
              onClick={() => {
                stickToBottomRef.current = true;
                scrollToBottom();
              }}
              aria-label="맨 아래로"
            >
              ↓
            </button>
          )}

          <div className="setlist-chat-input-row">
            <textarea
              ref={inputRef}
              className="setlist-chat-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (sendError) setSendError(null);
              }}
              placeholder={canSend ? '메시지 입력…' : '닉네임 설정 후 입력 가능'}
              rows={1}
              maxLength={MAX_LENGTH}
              disabled={!canSend || sending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <button
              type="button"
              className="setlist-chat-send"
              onClick={() => void handleSend()}
              disabled={sending || !input.trim() || !canSend}
              aria-label="전송"
            >
              <Send size={18} />
            </button>
          </div>
          {input.length > MAX_LENGTH - 80 && (
            <p className="setlist-chat-char-count">
              {input.length}/{MAX_LENGTH}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default SetListChat;
