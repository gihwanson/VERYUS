import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Bell, MessageCircle } from 'lucide-react';
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

  if (!user) return <div className="notifications-container">로그인이 필요합니다.</div>;
  if (loading) return <div className="notifications-container">로딩 중...</div>;

  return (
    <div className="notifications-container">
      <h2><Bell size={24} style={{ color: '#8A55CC', marginRight: 8 }} />알림</h2>
      {notifications.length === 0 ? (
        <div className="empty">새 알림이 없습니다.</div>
      ) : (
        <ul className="notification-list">
          {notifications.map(noti => (
            <li
              key={noti.id}
              className={`notification-item${!noti.isRead ? ' unread' : ''}`}
              onClick={() => handleNotificationClick(noti)}
            >
              <MessageCircle size={18} style={{ marginRight: 8, color: noti.type === 'reply' ? '#7C4DBC' : '#8A55CC' }} />
              <span style={{ fontWeight: !noti.isRead ? 700 : 400 }}>
                {noti.type === 'comment' ? '내 게시글에 댓글이 달렸습니다.' : '내 댓글에 답글이 달렸습니다.'}
              </span>
              <span className="noti-title">[{noti.postTitle}]</span>
              <span className="noti-from">by {noti.fromNickname}</span>
              <span className="noti-date">{noti.createdAt && (noti.createdAt.seconds ? new Date(noti.createdAt.seconds * 1000).toLocaleString('ko-KR') : '')}</span>
              {!noti.isRead && <span className="noti-dot">●</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Notifications; 