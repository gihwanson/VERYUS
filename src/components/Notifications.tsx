import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Bell, MessageCircle, X, Heart, CheckCircle, XCircle, Users, AtSign, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '../utils/notificationService';
import './Notifications.css';

interface Notification {
  id: string;
  type: 'comment' | 'reply' | 'like' | 'approval' | 'rejection' | 'guestbook' | 'mention' | 'new_post' | 'partnership' | 'partnership_closed' | 'partnership_confirmed';
  postId?: string;
  postTitle?: string;
  postType?: string;
  commentId?: string;
  fromNickname: string;
  message?: string;
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
    
    // 게시글 관련 알림의 경우 해당 게시판으로 이동
    if (notification.postId && notification.postType) {
      const route = NotificationService.getRouteByPostType(notification.postType, notification.postId);
      navigate(route);
    } else if (notification.type === 'guestbook') {
      // 방명록 알림의 경우 마이페이지로 이동
      navigate('/mypage');
    } else if (notification.postId) {
      // postType이 없는 기존 알림의 경우 자유게시판으로 기본 이동
      navigate(`/free/${notification.postId}`);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('이 알림을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'notifications', id));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'comment':
        return <MessageCircle size={18} className="text-blue-500" style={{ color: '#8A55CC' }} />;
      case 'reply':
        return <MessageCircle size={18} className="text-green-500" style={{ color: '#7C4DBC' }} />;
      case 'like':
        return <Heart size={18} className="text-red-500" style={{ color: '#FF4757' }} />;
      case 'approval':
        return <CheckCircle size={18} className="text-green-600" style={{ color: '#2ED573' }} />;
      case 'rejection':
        return <XCircle size={18} className="text-red-600" style={{ color: '#FF3838' }} />;
      case 'guestbook':
        return <Users size={18} className="text-purple-500" style={{ color: '#A55EEA' }} />;
      case 'mention':
        return <AtSign size={18} className="text-orange-500" style={{ color: '#FFA726' }} />;
      case 'partnership':
        return <UserPlus size={18} className="text-yellow-500" style={{ color: '#FFE66D' }} />;
      case 'partnership_closed':
        return <CheckCircle size={18} className="text-green-500" style={{ color: '#10B981' }} />;
      case 'partnership_confirmed':
        return <CheckCircle size={18} className="text-blue-500" style={{ color: '#3B82F6' }} />;
      default:
        return <Bell size={18} className="text-gray-500" style={{ color: '#8A55CC' }} />;
    }
  };

  const getNotificationMessage = (notification: Notification) => {
    if (notification.message) {
      return notification.message;
    }
    
    // 기존 알림 타입 호환성
    if (notification.type === 'comment') {
      return '내 게시글에 댓글이 달렸습니다.';
    } else if (notification.type === 'reply') {
      return '내 댓글에 답글이 달렸습니다.';
    }
    
    return NotificationService.getNotificationMessage(notification.type);
  };

  const getPostTypeBadge = (postType?: string) => {
    const badges = {
      'free': { label: '자유', color: '#8A55CC', bg: '#F6F2FF' },
      'recording': { label: '녹음', color: '#FF6B6B', bg: '#FFF0F0' },
      'evaluation': { label: '평가', color: '#4ECDC4', bg: '#F0FFFF' },
      'partner': { label: '파트너', color: '#FFE66D', bg: '#FFFEF0' },
      'notice': { label: '공지', color: '#95A5A6', bg: '#F8F9FA' }
    };
    
    if (!postType || !badges[postType as keyof typeof badges]) {
      return { label: '게시판', color: '#8A55CC', bg: '#F6F2FF' };
    }
    
    return badges[postType as keyof typeof badges];
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
          {notifications.map(noti => {
            const postBadge = getPostTypeBadge(noti.postType);
            return (
              <li
                key={noti.id}
                className={`notification-item${!noti.isRead ? ' unread' : ''}`}
                onClick={() => handleNotificationClick(noti)}
              >
                <div className="notification-content">
                  {/* 상단: 아이콘, 메시지, 배지 */}
                  <div className="notification-header">
                    <div className="notification-icon">
                      {getNotificationIcon(noti.type)}
                    </div>
                    <div className="notification-main">
                      <div className="notification-message">
                        {getNotificationMessage(noti)}
                      </div>
                      {noti.postType && (
                        <span 
                          className="post-type-badge"
                          style={{ 
                            background: postBadge.bg, 
                            color: postBadge.color,
                            border: `1px solid ${postBadge.color}20`
                          }}
                        >
                          {postBadge.label}
                        </span>
                      )}
                      {!noti.isRead && <span className="unread-indicator">●</span>}
                    </div>
                    <button
                      className="notification-delete"
                      onClick={e => { e.stopPropagation(); handleDeleteNotification(noti.id); }}
                      title="알림 삭제"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  
                  {/* 하단: 게시글 제목 */}
                  {noti.postTitle && (
                    <div className="notification-post-title">
                      📝 {noti.postTitle}
                    </div>
                  )}
                  
                  {/* 하단: 메타 정보 */}
                  <div className="notification-meta">
                    <span className="notification-author">👤 {noti.fromNickname}</span>
                    <span className="notification-date">
                      🕐 {noti.createdAt && (noti.createdAt.seconds ? 
                        new Date(noti.createdAt.seconds * 1000).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : '')}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Notifications; 