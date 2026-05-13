import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useUserProfile } from '../contexts/UserProfileContext';
import { ChevronLeft, Send, Inbox, PenSquare, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import './CustomerCenter.css';

const NERAE_NICKNAME = '너래';

type ChatMessage = {
  id: string;
  senderUid: string;
  senderRole: 'member' | 'admin';
  content: string;
  createdAt: any;
};

type Inquiry = {
  id: string;
  senderUid: string;
  senderNickname: string;
  isAnonymous: boolean;
  category: string;
  lastMessage: string;
  lastMessageAt: any;
  lastReplierRole: 'member' | 'admin';
  memberLastReadAt: any;
  adminLastReadAt: any;
  unreadByMember: boolean;
  unreadByAdmin: boolean;
  createdAt: any;
};

const CATEGORIES = [
  { value: 'idea', label: '정모 아이디어 관련' },
  { value: 'busking', label: '버스킹 관련' },
  { value: 'bug', label: '앱 버그 관련' },
  { value: 'social', label: '친목 관련' },
  { value: 'suggestion', label: '건의사항' },
  { value: 'other', label: '기타 문의' },
];

const CustomerCenter: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const isNerae = user?.nickname === NERAE_NICKNAME;

  const [isAnonymous, setIsAnonymous] = useState(false);
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const [activeTab, setActiveTab] = useState<'write' | 'inbox'>('write');
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        const usersSnap = await getDocs(
          query(collection(db, 'users'), where('uid', '==', fbUser.uid))
        );
        if (!usersSnap.empty) {
          const data = usersSnap.docs[0].data();
          setUser({ uid: fbUser.uid, ...data });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (isNerae) setActiveTab('inbox');
  }, [isNerae]);

  useEffect(() => {
    if (!user) return;

    let q;
    if (isNerae) {
      q = query(collection(db, 'customerInquiries'), orderBy('lastMessageAt', 'desc'));
    } else {
      q = query(
        collection(db, 'customerInquiries'),
        where('senderUid', '==', user.uid),
        orderBy('lastMessageAt', 'desc')
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const list: Inquiry[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Inquiry[];
      setInquiries(list);
    });

    return () => unsub();
  }, [user, isNerae]);

  // Subscribe to messages when a conversation is selected
  useEffect(() => {
    if (!selectedInquiry) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'customerInquiries', selectedInquiry.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const msgs: ChatMessage[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ChatMessage[];
      setMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    // Mark as read
    const readField = isNerae ? 'adminLastReadAt' : 'memberLastReadAt';
    const unreadField = isNerae ? 'unreadByAdmin' : 'unreadByMember';
    updateDoc(doc(db, 'customerInquiries', selectedInquiry.id), {
      [readField]: serverTimestamp(),
      [unreadField]: false,
    }).catch(() => {});

    return () => unsub();
  }, [selectedInquiry, isNerae]);

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    if (!category) {
      toast.warn('카테고리를 선택해주세요.');
      return;
    }
    if (!content.trim()) {
      toast.warn('문의 내용을 입력해주세요.');
      return;
    }
    setSending(true);
    try {
      const inquiryRef = await addDoc(collection(db, 'customerInquiries'), {
        senderUid: user.uid,
        senderNickname: isAnonymous ? '익명' : (user.nickname || '알 수 없음'),
        isAnonymous,
        category,
        lastMessage: content.trim(),
        lastMessageAt: serverTimestamp(),
        lastReplierRole: 'member',
        memberLastReadAt: serverTimestamp(),
        adminLastReadAt: null,
        unreadByMember: false,
        unreadByAdmin: true,
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'customerInquiries', inquiryRef.id, 'messages'), {
        senderUid: user.uid,
        senderRole: 'member',
        content: content.trim(),
        createdAt: serverTimestamp(),
      });

      toast.success('문의가 접수되었습니다!');
      setContent('');
      setCategory('');
      setIsAnonymous(false);
      setActiveTab('inbox');
    } catch (err) {
      console.error(err);
      toast.error('문의 접수 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  }, [user, category, content, isAnonymous]);

  const handleSendChat = useCallback(async () => {
    if (!selectedInquiry || !chatInput.trim() || !user) return;
    setChatSending(true);
    const myRole: 'member' | 'admin' = isNerae ? 'admin' : 'member';
    const text = chatInput.trim();
    setChatInput('');

    try {
      await addDoc(collection(db, 'customerInquiries', selectedInquiry.id, 'messages'), {
        senderUid: user.uid,
        senderRole: myRole,
        content: text,
        createdAt: serverTimestamp(),
      });

      const unreadField = isNerae ? 'unreadByMember' : 'unreadByAdmin';
      const readField = isNerae ? 'adminLastReadAt' : 'memberLastReadAt';
      await updateDoc(doc(db, 'customerInquiries', selectedInquiry.id), {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastReplierRole: myRole,
        [unreadField]: true,
        [readField]: serverTimestamp(),
      });

      // 너래가 답변하면 멤버에게 알림 발송
      if (isNerae) {
        const inquiryDoc = await getDoc(doc(db, 'customerInquiries', selectedInquiry.id));
        const inquiryData = inquiryDoc.data();
        if (inquiryData?.senderUid) {
          await addDoc(collection(db, 'notifications'), {
            toUid: inquiryData.senderUid,
            type: 'customer_center_reply',
            message: '고객센터에서 답변이 도착했습니다.',
            link: '/customer-center',
            createdAt: serverTimestamp(),
            isRead: false,
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('메시지 전송에 실패했습니다.');
    } finally {
      setChatSending(false);
    }
  }, [selectedInquiry, chatInput, user, isNerae]);

  const formatDate = (ts: any) => {
    if (!ts) return '';
    const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts.seconds * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${day} ${h}:${min}`;
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts.seconds * 1000);
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  };

  const getCategoryLabel = (val: string) => {
    return CATEGORIES.find((c) => c.value === val)?.label || val;
  };

  const getUnreadCount = () => {
    if (isNerae) return inquiries.filter((i) => i.unreadByAdmin).length;
    return inquiries.filter((i) => i.unreadByMember).length;
  };

  if (loading) {
    return (
      <div className="cc-loading">
        <div className="cc-loading-spinner" />
        <p>불러오는 중...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="cc-page">
        <p>로그인이 필요합니다.</p>
      </div>
    );
  }

  return (
    <div className="cc-page">
      <div className="cc-header">
        <button
          type="button"
          className="cc-back-btn"
          onClick={() => navigate('/')}
          title="메인보드로"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="cc-title">고객센터</h1>
      </div>

      {!selectedInquiry && (
        <>
          <div className="cc-tab-strip">
            {!isNerae && (
              <button
                type="button"
                className={`cc-tab ${activeTab === 'write' ? 'cc-tab--active' : ''}`}
                onClick={() => setActiveTab('write')}
              >
                <PenSquare size={16} />
                <span>문의하기</span>
              </button>
            )}
            <button
              type="button"
              className={`cc-tab ${activeTab === 'inbox' ? 'cc-tab--active' : ''}`}
              onClick={() => setActiveTab('inbox')}
            >
              <Inbox size={16} />
              <span>{isNerae ? '받은 쪽지함' : '내 문의내역'}</span>
              {getUnreadCount() > 0 && (
                <span className="cc-tab-badge">{getUnreadCount()}</span>
              )}
            </button>
          </div>

          <div className="cc-body">
            {activeTab === 'write' && !isNerae && (
              <div className="cc-write-section">
                <div className="cc-hint-box">
                  <MessageCircle size={18} />
                  <p>정모 아이디어 관련, 앱 버그 관련, 친목 관련 등등 편히 문의주세요!</p>
                </div>

                <div className="cc-form-group">
                  <label className="cc-label">카테고리</label>
                  <div className="cc-category-chips">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.value}
                        type="button"
                        className={`cc-chip ${category === cat.value ? 'cc-chip--active' : ''}`}
                        onClick={() => setCategory(cat.value)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cc-form-group">
                  <label className="cc-label">문의 내용</label>
                  <textarea
                    className="cc-textarea"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="문의 내용을 자유롭게 작성해주세요."
                    rows={5}
                    maxLength={1000}
                  />
                  <span className="cc-char-count">{content.length}/1000</span>
                </div>

                <div className="cc-form-group">
                  <button
                    type="button"
                    className={`cc-anon-toggle ${isAnonymous ? 'cc-anon-toggle--active' : ''}`}
                    onClick={() => setIsAnonymous(!isAnonymous)}
                  >
                    {isAnonymous ? <EyeOff size={16} /> : <Eye size={16} />}
                    <span>{isAnonymous ? '익명으로 보내기' : '실명으로 보내기'}</span>
                  </button>
                  {!isAnonymous && (
                    <span className="cc-sender-name">보내는 사람: {user.nickname || '알 수 없음'}</span>
                  )}
                </div>

                <button
                  type="button"
                  className="cc-submit-btn"
                  onClick={handleSubmit}
                  disabled={sending || !category || !content.trim()}
                >
                  <Send size={16} />
                  <span>{sending ? '보내는 중...' : '문의 보내기'}</span>
                </button>
              </div>
            )}

            {activeTab === 'inbox' && (
              <div className="cc-inbox-section">
                {inquiries.length === 0 ? (
                  <div className="cc-empty">
                    <Inbox size={48} />
                    <p>{isNerae ? '받은 문의가 없습니다.' : '보낸 문의가 없습니다.'}</p>
                  </div>
                ) : (
                  <div className="cc-inquiry-list">
                    {inquiries.map((inq) => {
                      const hasUnread = isNerae ? inq.unreadByAdmin : inq.unreadByMember;
                      return (
                        <button
                          key={inq.id}
                          type="button"
                          className={`cc-inquiry-card ${hasUnread ? 'cc-inquiry-card--unread' : ''}`}
                          onClick={() => setSelectedInquiry(inq)}
                        >
                          <div className="cc-inquiry-card-top">
                            <span className="cc-inquiry-category-tag">
                              {getCategoryLabel(inq.category)}
                            </span>
                            <span className="cc-inquiry-date">{formatDate(inq.lastMessageAt)}</span>
                          </div>
                          <div className="cc-inquiry-card-body">
                            <p className="cc-inquiry-preview">
                              {inq.lastMessage && inq.lastMessage.length > 50
                                ? inq.lastMessage.slice(0, 50) + '...'
                                : inq.lastMessage}
                            </p>
                          </div>
                          <div className="cc-inquiry-card-footer">
                            {isNerae && (
                              <span className="cc-inquiry-sender">
                                {inq.isAnonymous ? '익명' : inq.senderNickname}
                              </span>
                            )}
                            {hasUnread && <span className="cc-unread-dot" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {selectedInquiry && (
        <div className="cc-chat-section">
          <div className="cc-chat-header">
            <button
              type="button"
              className="cc-detail-back"
              onClick={() => setSelectedInquiry(null)}
            >
              <ChevronLeft size={18} />
              <span>목록</span>
            </button>
            <div className="cc-chat-header-info">
              <span className="cc-chat-header-category">{getCategoryLabel(selectedInquiry.category)}</span>
              {isNerae && (
                <span className="cc-chat-header-sender">
                  {selectedInquiry.isAnonymous ? '익명' : selectedInquiry.senderNickname}
                </span>
              )}
            </div>
          </div>

          <div className="cc-chat-messages">
            {messages.map((msg) => {
              const isMine = isNerae
                ? msg.senderRole === 'admin'
                : msg.senderRole === 'member';
              return (
                <div
                  key={msg.id}
                  className={`cc-msg ${isMine ? 'cc-msg--mine' : 'cc-msg--other'}`}
                >
                  <div className="cc-msg-bubble">
                    {msg.content}
                  </div>
                  <span className="cc-msg-time">{formatTime(msg.createdAt)}</span>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="cc-chat-input-area">
            <textarea
              ref={chatInputRef}
              className="cc-chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="메시지를 입력하세요..."
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
            />
            <button
              type="button"
              className="cc-chat-send-btn"
              onClick={handleSendChat}
              disabled={chatSending || !chatInput.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerCenter;
