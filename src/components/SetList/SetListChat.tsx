import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'firebase/firestore';
import { Send } from 'lucide-react';
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

const SetListChat: React.FC<SetListChatProps> = ({
  setListId,
  currentUserNickname,
  currentUserUid = ''
}) => {
  const [messages, setMessages] = useState<SetListChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!setListId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'setlists', setListId, 'chatMessages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data()
        })) as SetListChatMessage[];
        setMessages(msgs);
      },
      (err) => console.error('셋리스트 채팅 로드 실패:', err)
    );

    return () => unsub();
  }, [setListId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !setListId || sending) return;
    if (!currentUserNickname) return;

    setSending(true);
    setInput('');
    try {
      await addDoc(collection(db, 'setlists', setListId, 'chatMessages'), {
        senderUid: currentUserUid || 'guest',
        senderNickname: currentUserNickname,
        content: text,
        createdAtClient: Date.now(),
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error('셋리스트 채팅 전송 실패:', e);
      setInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, setListId, sending, currentUserNickname, currentUserUid]);

  return (
    <section className="setlist-chat-panel" aria-label="셋리스트 채팅">
      <div className="setlist-chat-header">
        <span className="setlist-chat-title">💬 멤버 채팅</span>
        <span className="setlist-chat-sub">{messages.length}개</span>
      </div>

      <div className="setlist-chat-messages">
        {messages.length === 0 ? (
          <p className="setlist-chat-empty">진행 중 이야기를 나눠 보세요</p>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderNickname === currentUserNickname;
            return (
              <div
                key={msg.id}
                className={`setlist-chat-msg ${isMine ? 'setlist-chat-msg--mine' : 'setlist-chat-msg--other'}`}
              >
                {!isMine && (
                  <span className="setlist-chat-sender">{msg.senderNickname}</span>
                )}
                <div className="setlist-chat-bubble">{msg.content}</div>
                <span className="setlist-chat-time">
                  {formatTime(msg.createdAt, msg.createdAtClient)}
                </span>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="setlist-chat-input-row">
        <textarea
          ref={inputRef}
          className="setlist-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지 입력…"
          rows={1}
          maxLength={500}
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
          disabled={sending || !input.trim()}
          aria-label="전송"
        >
          <Send size={18} />
        </button>
      </div>
    </section>
  );
};

export default SetListChat;
