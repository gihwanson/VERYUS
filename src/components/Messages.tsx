import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { User, MessageSquare, Send } from 'lucide-react';
import './Messages.css';

interface Message {
  id: string;
  fromUid: string;
  fromNickname: string;
  toUid: string;
  toNickname: string;
  content: string;
  createdAt: any;
  isRead: boolean;
  postId?: string;
  postTitle?: string;
}

interface ChatRoom {
  userUid: string;
  userNickname: string;
  lastMessage: Message;
  postId?: string;
  postTitle?: string;
}

const Messages: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  // Load current user
  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) setUser(JSON.parse(userString));
  }, []);

  // Load chat rooms (users you have exchanged messages with)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'messages'),
      where('fromUid', '==', user.uid)
    );
    const q2 = query(
      collection(db, 'messages'),
      where('toUid', '==', user.uid)
    );
    const unsub1 = onSnapshot(q, (snap1) => {
      const sent = snap1.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
      const sentRooms = sent.reduce((acc, msg) => {
        const key = msg.toUid + (msg.postId || '');
        if (!acc[key] || acc[key].lastMessage.createdAt < msg.createdAt) {
          acc[key] = { userUid: msg.toUid, userNickname: msg.toNickname, lastMessage: msg, postId: msg.postId, postTitle: msg.postTitle };
        }
        return acc;
      }, {} as Record<string, ChatRoom>);
      setChatRooms(prev => {
        const prevRooms = { ...prev.reduce((acc, r) => { acc[r.userUid + (r.postId || '')] = r; return acc; }, {} as Record<string, ChatRoom>) };
        Object.assign(prevRooms, sentRooms);
        return Object.values(prevRooms);
      });
    });
    const unsub2 = onSnapshot(q2, (snap2) => {
      const received = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
      const receivedRooms = received.reduce((acc, msg) => {
        const key = msg.fromUid + (msg.postId || '');
        if (!acc[key] || acc[key].lastMessage.createdAt < msg.createdAt) {
          acc[key] = { userUid: msg.fromUid, userNickname: msg.fromNickname, lastMessage: msg, postId: msg.postId, postTitle: msg.postTitle };
        }
        return acc;
      }, {} as Record<string, ChatRoom>);
      setChatRooms(prev => {
        const prevRooms = { ...prev.reduce((acc, r) => { acc[r.userUid + (r.postId || '')] = r; return acc; }, {} as Record<string, ChatRoom>) };
        Object.assign(prevRooms, receivedRooms);
        return Object.values(prevRooms);
      });
    });
    return () => { unsub1(); unsub2(); };
  }, [user]);

  // Load messages for selected room
  useEffect(() => {
    if (!user || !selectedRoom) return;
    const q = query(
      collection(db, 'messages'),
      where('postId', '==', selectedRoom.postId || null),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() })) as Message[];
      setMessages(msgs.filter(m =>
        (m.fromUid === user.uid && m.toUid === selectedRoom.userUid) ||
        (m.fromUid === selectedRoom.userUid && m.toUid === user.uid)
      ));
    });
    return () => unsub();
  }, [user, selectedRoom]);

  const handleSend = useCallback(async () => {
    if (!user || !selectedRoom || !newMessage.trim()) return;
    await addDoc(collection(db, 'messages'), {
      fromUid: user.uid,
      fromNickname: user.nickname,
      toUid: selectedRoom.userUid,
      toNickname: selectedRoom.userNickname,
      content: newMessage.trim(),
      createdAt: serverTimestamp(),
      isRead: false,
      postId: selectedRoom.postId || null,
      postTitle: selectedRoom.postTitle || null
    });
    setNewMessage('');
  }, [user, selectedRoom, newMessage]);

  return (
    <div className="messages-container">
      <div className="chat-room-list">
        <h2>쪽지함</h2>
        {chatRooms.length === 0 && <div className="empty">쪽지 내역이 없습니다.</div>}
        {chatRooms.map((room, idx) => (
          <div
            key={room.userUid + (room.postId || '')}
            className={`chat-room-item${selectedRoom && selectedRoom.userUid === room.userUid && selectedRoom.postId === room.postId ? ' selected' : ''}`}
            onClick={() => setSelectedRoom(room)}
          >
            <User size={28} style={{ marginRight: 8 }} />
            <div>
              <div style={{ fontWeight: 700 }}>{room.userNickname}</div>
              {room.postTitle && <div className="chat-post-title">게시글: {room.postTitle}</div>}
              <div className="chat-last-message">{room.lastMessage.content}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="chat-view">
        {selectedRoom ? (
          <>
            <div className="chat-header">
              <User size={24} />
              <span style={{ fontWeight: 700, marginLeft: 8 }}>{selectedRoom.userNickname}</span>
              {selectedRoom.postTitle && <span className="chat-post-title">게시글: {selectedRoom.postTitle}</span>}
            </div>
            <div className="chat-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`chat-message${msg.fromUid === user.uid ? ' sent' : ' received'}`}>
                  <div className="chat-message-content">{msg.content}</div>
                  <div className="chat-message-meta">{msg.fromUid === user.uid ? '나' : msg.fromNickname} · {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleString('ko-KR') : ''}</div>
                </div>
              ))}
            </div>
            <div className="chat-input-bar">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="메시지를 입력하세요..."
                onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              />
              <button onClick={handleSend} className="send-btn"><Send size={20} /></button>
            </div>
          </>
        ) : (
          <div className="chat-placeholder">채팅방을 선택하세요.</div>
        )}
      </div>
    </div>
  );
};

export default Messages; 