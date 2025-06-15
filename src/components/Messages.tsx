import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, MessageSquare, Send, Menu, Star, StarOff, Paperclip, Image as ImageIcon, MoreVertical, Copy, Trash2, Flag, CornerUpLeft, Home } from 'lucide-react';
import './Messages.css';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

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
  reactions?: { emoji: string, users: string[] }[];
  fileUrl?: string;
  fileType?: string;
  fileName?: string;
}

interface ChatRoom {
  userUid: string;
  userNickname: string;
  lastMessage: Message;
  postId?: string;
  postTitle?: string;
  isPinned?: boolean;
  profileEmoji?: string;
}

const emojiList = ['😀','😎','🦄','🐱','🐶','🐻','🐼','🐸','🐵','🦊','🐯','🐰','🐥','🦉','🐳','🍀','🍎','🍉','🍔','🍕','🍩','🍦','⚽','🎸','🎹','🚗','✈️','🌈','⭐','🔥','💎','🎁'];
const reactionEmojis = ['❤️','😂','👍','😮','😢','👏','🔥','😡'];

const Messages: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showRoomList, setShowRoomList] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all'|'pinned'|'unread'>('all');
  const [reactionTarget, setReactionTarget] = useState<string|null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [filePreview, setFilePreview] = useState<string|null>(null);
  const [fileType, setFileType] = useState<string|null>(null);
  const [fileName, setFileName] = useState<string|null>(null);
  const [contextMenu, setContextMenu] = useState<{msgId: string, x: number, y: number} | null>(null);
  const [reportTarget, setReportTarget] = useState<Message|null>(null);
  const [reportReason, setReportReason] = useState('');
  const [replyTo, setReplyTo] = useState<Message|null>(null);

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

  // 모바일 화면 여부
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;

  // 각 채팅방의 안읽은 메시지 수 계산
  const getUnreadCount = (room: ChatRoom) => {
    if (!user) return 0;
    return messages.filter(m => m.fromUid === room.userUid && !m.isRead && m.toUid === user.uid).length;
  };
  // 마지막 메시지 시간 포맷
  const formatTime = (date: any) => {
    if (!date) return '';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
  };

  // 프로필 이모지 랜덤 부여(없으면)
  const getProfileEmoji = (room: ChatRoom) => {
    if (room.profileEmoji) return room.profileEmoji;
    // userUid 해시로 랜덤 이모지
    let hash = 0;
    for (let i = 0; i < room.userUid.length; i++) hash += room.userUid.charCodeAt(i);
    return emojiList[hash % emojiList.length];
  };
  // 고정/해제 토글
  const togglePin = (room: ChatRoom) => {
    setChatRooms(prev => prev.map(r =>
      r.userUid === room.userUid && r.postId === room.postId
        ? { ...r, isPinned: !r.isPinned }
        : r
    ));
  };
  // 탭 필터링
  let filteredRooms = chatRooms;
  if (tab === 'pinned') filteredRooms = chatRooms.filter(r => r.isPinned);
  if (tab === 'unread') filteredRooms = chatRooms.filter(r => getUnreadCount(r) > 0);
  // 검색 필터링된 채팅방
  filteredRooms = filteredRooms.filter(room => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      room.userNickname.toLowerCase().includes(s) ||
      (room.lastMessage.content && room.lastMessage.content.toLowerCase().includes(s)) ||
      (room.postTitle && room.postTitle.toLowerCase().includes(s))
    );
  });
  // 고정방 우선 정렬
  filteredRooms = [...filteredRooms.filter(r=>r.isPinned), ...filteredRooms.filter(r=>!r.isPinned)];
  // 날짜 구분선 생성 함수
  const getDateLabel = (date: Date) => {
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return '오늘';
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return '어제';
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // 리액션 추가/제거
  const toggleReaction = (msg: Message, emoji: string) => {
    if (!user) return;
    setMessages(prevMsgs => prevMsgs.map(m => {
      if (m.id !== msg.id) return m;
      let reactions = m.reactions || [];
      const idx = reactions.findIndex(r => r.emoji === emoji);
      if (idx >= 0) {
        // 이미 해당 이모지 있음
        const userIdx = reactions[idx].users.indexOf(user.uid);
        if (userIdx >= 0) {
          // 이미 리액션한 경우 제거
          reactions[idx].users.splice(userIdx, 1);
          if (reactions[idx].users.length === 0) reactions.splice(idx, 1);
        } else {
          reactions[idx].users.push(user.uid);
        }
      } else {
        reactions.push({ emoji, users: [user.uid] });
      }
      return { ...m, reactions: [...reactions] };
    }));
    setShowReactionPicker(false);
    setReactionTarget(null);
  };
  // 모바일 롱탭/PC 우클릭/호버 리액션 선택
  const handleReactionOpen = (msgId: string, e?: React.MouseEvent|React.TouchEvent) => {
    if (e) e.preventDefault();
    setReactionTarget(msgId);
    setShowReactionPicker(true);
  };
  const handleReactionClose = () => {
    setShowReactionPicker(false);
    setReactionTarget(null);
  };

  // 파일 첨부 핸들러
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileType(file.type);
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }
  };
  // 파일 업로드 및 메시지 전송
  const handleSendWithFile = async () => {
    if (!user || (!newMessage.trim() && !filePreview && !fileName)) return;
    let fileUrl = '';
    if (filePreview && fileName) {
      const file = (document.getElementById('chat-file-input') as HTMLInputElement)?.files?.[0];
      if (file) {
        const fileRef = storageRef(storage, `chat/${user.uid}/${Date.now()}_${file.name}`);
        await uploadBytes(fileRef, file);
        fileUrl = await getDownloadURL(fileRef);
      }
    }
    await addDoc(collection(db, 'messages'), {
      fromUid: user.uid,
      fromNickname: user.nickname,
      toUid: selectedRoom?.userUid,
      toNickname: selectedRoom?.userNickname,
      content: newMessage.trim(),
      createdAt: serverTimestamp(),
      isRead: false,
      postId: selectedRoom?.postId || null,
      postTitle: selectedRoom?.postTitle || null,
      fileUrl: fileUrl || null,
      fileType: fileType || null,
      fileName: fileName || null
    });
    setNewMessage('');
    setFilePreview(null);
    setFileType(null);
    setFileName(null);
    (document.getElementById('chat-file-input') as HTMLInputElement).value = '';
  };

  // 메시지 복사
  const handleCopy = (msg: Message) => {
    navigator.clipboard.writeText(msg.content);
    setContextMenu(null);
  };
  // 메시지 삭제
  const handleDelete = async (msg: Message) => {
    if (!user || msg.fromUid !== user.uid) return;
    await deleteDoc(doc(db, 'messages', msg.id));
    setContextMenu(null);
  };
  // 메시지 신고
  const handleReport = (msg: Message) => {
    setReportTarget(msg);
    setContextMenu(null);
  };
  const handleReportSubmit = async () => {
    if (!user || !reportTarget || !reportReason.trim()) return;
    await addDoc(collection(db, 'reports'), {
      messageId: reportTarget.id,
      reporterUid: user.uid,
      reporterNickname: user.nickname,
      reason: reportReason,
      createdAt: serverTimestamp()
    });
    setReportTarget(null);
    setReportReason('');
    alert('신고가 접수되었습니다.');
  };
  // 답장
  const handleReply = (msg: Message) => {
    setReplyTo(msg);
    setContextMenu(null);
  };

  return (
    <div className="messages-container">
      <div className="chat-room-list always-show">
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'0 0 24px 24px'}}>
          <button className="exit-home-btn" onClick={()=>window.location.href='/main'} style={{background:'none',border:'none',padding:0,cursor:'pointer'}} title="메인보드로">
            <Home size={22} color="#8A55CC" />
          </button>
          <h2 style={{margin:0}}>채팅</h2>
        </div>
        <div className="chat-room-tabs">
          <button className={tab==='all'? 'active' : ''} onClick={()=>setTab('all')}>전체</button>
          <button className={tab==='pinned'? 'active' : ''} onClick={()=>setTab('pinned')}>고정</button>
          <button className={tab==='unread'? 'active' : ''} onClick={()=>setTab('unread')}>읽지않음</button>
        </div>
        <div className="chat-room-search-bar">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="닉네임, 메시지, 게시글 검색"
            className="chat-room-search-input"
          />
        </div>
        {filteredRooms.length === 0 && <div className="empty">쪽지 내역이 없습니다.</div>}
        {filteredRooms.map((room: ChatRoom) => (
          <div
            key={room.userUid + (room.postId || '')}
            className={`chat-room-item${selectedRoom && selectedRoom.userUid === room.userUid && selectedRoom.postId === room.postId ? ' selected' : ''}`}
            onClick={() => setSelectedRoom(room)}
          >
            <div className="chat-room-profile">
              <span style={{fontSize:28}}>{getProfileEmoji(room)}</span>
            </div>
            <div className="chat-room-info">
              <div className="chat-room-title-row">
                <span className="chat-room-nickname">{room.userNickname}</span>
                <span className="chat-room-time">{formatTime(room.lastMessage.createdAt)}</span>
                <span className="chat-room-pin-btn" onClick={e => {e.stopPropagation();togglePin(room);}} style={{marginLeft:6,cursor:'pointer'}}>
                  {room.isPinned ? <Star size={18} color="#F6C700" fill="#F6C700" /> : <StarOff size={18} color="#B497D6" />}
                </span>
              </div>
              <div className="chat-room-last-message-row">
                <span className="chat-room-last-message">{room.lastMessage.content}</span>
                {getUnreadCount(room) > 0 && <span className="chat-room-unread-badge">{getUnreadCount(room)}</span>}
              </div>
              {room.postTitle && <div className="chat-post-title">게시글: {room.postTitle}</div>}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-view">
        {selectedRoom ? (
          <>
            <div className="chat-header">
              {isMobile && (
                <button className="chat-room-list-toggle" onClick={() => setShowRoomList(true)} style={{marginRight:8}}>
                  <Menu size={22} />
                </button>
              )}
              <User size={24} />
              <span style={{ fontWeight: 700, marginLeft: 8 }}>{selectedRoom.userNickname}</span>
              {selectedRoom.postTitle && <span className="chat-post-title">게시글: {selectedRoom.postTitle}</span>}
            </div>
            <div className="chat-messages">
              {messages.length === 0 && <div className="chat-placeholder">메시지가 없습니다.</div>}
              {messages.map((msg, idx) => {
                const prev = messages[idx - 1];
                const currDate = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000) : new Date(msg.createdAt);
                const prevDate = prev?.createdAt?.seconds ? new Date(prev.createdAt.seconds * 1000) : prev ? new Date(prev.createdAt) : null;
                const showDateLabel = !prevDate || currDate.toDateString() !== prevDate.toDateString();
                return (
                  <React.Fragment key={msg.id}>
                    {showDateLabel && (
                      <div className="chat-date-label">{getDateLabel(currDate)}</div>
                    )}
                    <div
                      className={`chat-message${msg.fromUid === user.uid ? ' sent' : ' received'}`}
                      onContextMenu={e => {
                        e.preventDefault();
                        setContextMenu({msgId: msg.id, x: e.clientX, y: e.clientY});
                      }}
                      onTouchStart={e => {
                        let timeout = setTimeout(() => setContextMenu({msgId: msg.id, x: window.innerWidth/2, y: window.innerHeight/2}), 500);
                        const clear = () => { clearTimeout(timeout); };
                        e.currentTarget.addEventListener('touchend', clear, { once: true });
                        e.currentTarget.addEventListener('touchmove', clear, { once: true });
                      }}
                      onMouseEnter={e => { if (window.innerWidth > 900) handleReactionOpen(msg.id); }}
                      onMouseLeave={handleReactionClose}
                    >
                      {/* 답장 인용 표시 */}
                      {replyTo && replyTo.id === msg.id && (
                        <div className="chat-reply-quote">{replyTo.content}</div>
                      )}
                      <div className="chat-message-content">{msg.content}</div>
                      {/* 리액션 표시 */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="chat-message-reactions">
                          {msg.reactions.map(r => (
                            <span key={r.emoji} className={`reaction-emoji${r.users.includes(user?.uid) ? ' my' : ''}`} onClick={e => {e.stopPropagation();toggleReaction(msg, r.emoji);}}>
                              {r.emoji} {r.users.length > 1 ? r.users.length : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="chat-message-meta">{msg.fromUid === user.uid ? '나' : msg.fromNickname} · {currDate.toLocaleString('ko-KR')}</div>
                      {/* 리액션 선택창 */}
                      {showReactionPicker && reactionTarget === msg.id && (
                        <div className="reaction-picker" onMouseLeave={handleReactionClose}>
                          {reactionEmojis.map(emoji => (
                            <span key={emoji} className="reaction-emoji-picker" onClick={e => {e.stopPropagation();toggleReaction(msg, emoji);}}>{emoji}</span>
                          ))}
                        </div>
                      )}
                      {/* 메시지 롱탭/우클릭 메뉴 */}
                      {contextMenu && contextMenu.msgId === msg.id && (
                        <div className="chat-context-menu" style={{top: contextMenu.y, left: contextMenu.x}}>
                          <button onClick={() => handleCopy(msg)}><Copy size={16}/> 복사</button>
                          {user && msg.fromUid === user.uid && <button onClick={() => handleDelete(msg)}><Trash2 size={16}/> 삭제</button>}
                          <button onClick={() => handleReport(msg)}><Flag size={16}/> 신고</button>
                          <button onClick={() => handleReply(msg)}><CornerUpLeft size={16}/> 답장</button>
                        </div>
                      )}
                    </div>
                    {/* 메시지 내 파일/이미지/동영상 표시 */}
                    {msg.fileUrl && (
                      <div className="chat-message-file">
                        {msg.fileType?.startsWith('image/') ? (
                          <img src={msg.fileUrl} alt="img" style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8 }} />
                        ) : msg.fileType?.startsWith('video/') ? (
                          <video src={msg.fileUrl} controls style={{ maxWidth: 220, maxHeight: 180, borderRadius: 8 }} />
                        ) : (
                          <a href={msg.fileUrl} download={msg.fileName} className="chat-file-download">{msg.fileName || '파일 다운로드'}</a>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="chat-input-bar">
              <label className="chat-attach-btn">
                <input
                  id="chat-file-input"
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.mp3,.wav,.mov,.mp4"
                  onChange={handleFileChange}
                />
                <Paperclip size={20} />
              </label>
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="메시지를 입력하세요..."
                onKeyDown={e => { if (e.key === 'Enter') filePreview || fileName ? handleSendWithFile() : handleSend(); }}
                style={{ flex: 1 }}
              />
              <button onClick={filePreview || fileName ? handleSendWithFile : handleSend} className="send-btn"><Send size={20} /></button>
            </div>
            {/* 파일 미리보기 */}
            {filePreview && (
              <div className="chat-file-preview">
                {fileType?.startsWith('image/') ? (
                  <img src={filePreview} alt="preview" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8 }} />
                ) : fileType?.startsWith('video/') ? (
                  <video src={filePreview} controls style={{ maxWidth: 160, maxHeight: 120, borderRadius: 8 }} />
                ) : null}
                <span className="chat-file-name">{fileName}</span>
                <button className="chat-file-cancel" onClick={() => { setFilePreview(null); setFileType(null); setFileName(null); (document.getElementById('chat-file-input') as HTMLInputElement).value = ''; }}>×</button>
              </div>
            )}
            {/* 답장 인용 입력창 */}
            {replyTo && (
              <div className="chat-reply-bar">
                <span className="chat-reply-label">답장:</span> {replyTo.content}
                <button className="chat-reply-cancel" onClick={()=>setReplyTo(null)}>×</button>
              </div>
            )}
            {/* 신고 다이얼로그 */}
            {reportTarget && (
              <div className="chat-report-modal">
                <div className="chat-report-content">
                  <h3>메시지 신고</h3>
                  <div className="chat-report-quote">{reportTarget.content}</div>
                  <textarea value={reportReason} onChange={e=>setReportReason(e.target.value)} placeholder="신고 사유를 입력하세요..."/>
                  <div className="chat-report-actions">
                    <button onClick={()=>setReportTarget(null)}>취소</button>
                    <button onClick={handleReportSubmit} disabled={!reportReason.trim()}>신고</button>
                  </div>
                </div>
              </div>
            )}
            <button className="exit-button" onClick={() => window.location.href = '/main'}>메인보드로 나가기</button>
          </>
        ) : (
          <div className="chat-placeholder">채팅방을 선택하세요.</div>
        )}
      </div>
    </div>
  );
};

export default Messages; 