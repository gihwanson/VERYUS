import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Bell, MessageCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Notifications.css';

interface Notification {
  id: string;
  type: 'comment' | 'reply';
  postId: string;
  postTitle: string;
  commentId?: string;
  fromNickname: string;
  createdAt: any;
  isRead: boolean;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const userString = localStorage.getItem('veryus_user');
  const user = userString ? JSON.parse(userString) : null;

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notification[]);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await updateDoc(doc(db, 'notifications', notification.id), { isRead: true });
    }
    navigate(`/free/${notification.postId}`); // 게시글 타입별로 라우팅 분기 필요시 추가
  };

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('이 알림을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'notifications', id));
  };

  const handleGoHome = () => {
    navigate('/');
  };

  if (!user) return <div className="notifications-container">로그인이 필요합니다.</div>;
  if (loading) return <div className="notifications-container">로딩 중...</div>;

  return (
    <div className="notifications-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ display: 'flex', alignItems: 'center' }}><Bell size={24} style={{ color: '#8A55CC', marginRight: 8 }} />알림</h2>
        <button onClick={handleGoHome} style={{ background: '#F6F2FF', color: '#8A55CC', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>메인보드로</button>
      </div>
      {notifications.length === 0 ? (
        <div className="empty">새 알림이 없습니다.</div>
      ) : (
        <ul className="notification-list">
          {notifications.map(noti => (
            <li
              key={noti.id}
              className={`notification-item${!noti.isRead ? ' unread' : ''}`}
              onClick={() => handleNotificationClick(noti)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <MessageCircle size={18} style={{ marginRight: 8, color: noti.type === 'reply' ? '#7C4DBC' : '#8A55CC' }} />
                <span style={{ fontWeight: !noti.isRead ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {noti.type === 'comment' ? '내 게시글에 댓글이 달렸습니다.' : '내 댓글에 답글이 달렸습니다.'}
                </span>
                <span className="noti-title" style={{ marginLeft: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>[{noti.postTitle}]</span>
                <span className="noti-from" style={{ marginLeft: 8 }}>by {noti.fromNickname}</span>
                <span className="noti-date" style={{ marginLeft: 8 }}>{noti.createdAt && (noti.createdAt.seconds ? new Date(noti.createdAt.seconds * 1000).toLocaleString('ko-KR') : '')}</span>
                {!noti.isRead && <span className="noti-dot" style={{ marginLeft: 8 }}>●</span>}
              </div>
              <button
                className="noti-delete-btn"
                onClick={e => { e.stopPropagation(); handleDeleteNotification(noti.id); }}
                style={{ background: 'none', border: 'none', color: '#8A55CC', marginLeft: 12, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                title="알림 삭제"
              >
                <X size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Notifications; 