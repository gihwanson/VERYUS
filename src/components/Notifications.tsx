import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Bell, MessageCircle, X, Heart, CheckCircle, XCircle, Users, AtSign, UserPlus, CheckCheck, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '../utils/notificationService';
import './Notifications.css';

interface Notification {
  id: string;
  type:
    | 'comment'
    | 'reply'
    | 'like'
    | 'approval'
    | 'rejection'
    | 'guestbook'
    | 'guestbook_reply'
    | 'mention'
    | 'new_post'
    | 'partnership'
    | 'partnership_closed'
    | 'partnership_confirmed'
    | 'grade_request_pending'
    | 'grade_change_approved'
    | 'grade_change_rejected'
    | 'anonymous_chat';
  postId?: string;
  postTitle?: string;
  postType?: string;
  commentId?: string;
  fromNickname: string;
  message?: string;
  guestbookOwnerUid?: string;
  createdAt: any;
  isRead: boolean;
  route?: string;
  roomId?: string;
  hiddenFromInbox?: boolean;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useMemo(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) return null;
    try {
      return JSON.parse(userString);
    } catch (error) {
      console.error('사용자 정보 파싱 실패:', error);
      return null;
    }
  }, []);

  const isChatNotification = useCallback((noti: Notification) => {
    const type = (noti.type || '').toLowerCase();
    const postType = (noti.postType || '').toLowerCase();
    const route = (noti.route || '').toLowerCase();
    return (
      type.includes('chat') ||
      postType.includes('chat') ||
      route.startsWith('/anonymous-chat') ||
      route.startsWith('/chat')
    );
  }, []);

  const isHiddenInInbox = useCallback((noti: Notification) => {
    if (noti.hiddenFromInbox === true) return true;
    return isChatNotification(noti);
  }, [isChatNotification]);

  const getNotificationRoute = (notification: Notification): string | null => {
    if (notification.type === 'grade_change_approved' || notification.type === 'grade_change_rejected') {
      return '/settings';
    }
    return NotificationService.resolveNotificationRoute(notification);
  };

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('toUid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Notification[];
      setNotifications(all.filter((noti) => !isHiddenInInbox(noti)));
      setLoading(false);
    });
    return () => unsub();
  }, [isHiddenInInbox, user]);

  const handleNotificationClick = async (notification: Notification) => {
    const route = getNotificationRoute(notification);
    if (!route) return;

    if (!notification.isRead) {
      await updateDoc(doc(db, 'notifications', notification.id), { isRead: true });
    }

    if (notification.type === 'grade_request_pending') {
      navigate('/admin', { state: { openAdminTab: 'approvals' } });
      return;
    }

    navigate(route);
  };

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('이 알림을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'notifications', id));
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;

    if (notifications.length === 0) {
      alert('삭제할 알림이 없습니다.');
      return;
    }

    if (!window.confirm(`${notifications.length}개의 알림을 모두 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const chunkSize = 450;
      for (let i = 0; i < notifications.length; i += chunkSize) {
        const chunk = notifications.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((noti) => {
          const notificationRef = doc(db, 'notifications', noti.id);
          batch.delete(notificationRef);
        });
        await batch.commit();
      }
      alert('모든 알림이 삭제되었습니다.');
    } catch (error) {
      console.error('모두 삭제 중 오류:', error);
      alert('알림 삭제 중 오류가 발생했습니다.');
    }
  };

  const getNotificationIconClass = (type: string) => {
    switch (type) {
      case 'reply':
        return 'notifications-icon-reply';
      case 'like':
        return 'notifications-icon-like';
      case 'approval':
        return 'notifications-icon-approval';
      case 'rejection':
        return 'notifications-icon-rejection';
      case 'guestbook':
        return 'notifications-icon-guestbook';
      case 'guestbook_reply':
        return 'notifications-icon-guestbook-reply';
      case 'mention':
        return 'notifications-icon-mention';
      case 'partnership':
        return 'notifications-icon-partnership';
      case 'partnership_closed':
        return 'notifications-icon-partnership-closed';
      case 'partnership_confirmed':
        return 'notifications-icon-partnership-confirmed';
      case 'grade_request_pending':
        return 'notifications-icon-grade-request-pending';
      case 'grade_change_approved':
        return 'notifications-icon-grade-change-approved';
      case 'grade_change_rejected':
        return 'notifications-icon-grade-change-rejected';
      case 'comment':
      default:
        return 'notifications-icon-comment';
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = getNotificationIconClass(type);
    switch (type) {
      case 'comment':
        return <MessageCircle size={18} className={iconClass} />;
      case 'reply':
        return <MessageCircle size={18} className={iconClass} />;
      case 'like':
        return <Heart size={18} className={iconClass} />;
      case 'approval':
        return <CheckCircle size={18} className={iconClass} />;
      case 'rejection':
        return <XCircle size={18} className={iconClass} />;
      case 'guestbook':
        return <Users size={18} className={iconClass} />;
      case 'guestbook_reply':
        return <MessageCircle size={18} className={iconClass} />;
      case 'mention':
        return <AtSign size={18} className={iconClass} />;
      case 'partnership':
        return <UserPlus size={18} className={iconClass} />;
      case 'partnership_closed':
        return <CheckCircle size={18} className={iconClass} />;
      case 'partnership_confirmed':
        return <CheckCircle size={18} className={iconClass} />;
      case 'grade_request_pending':
        return <Shield size={18} className={iconClass} />;
      case 'grade_change_approved':
        return <CheckCircle size={18} className={iconClass} />;
      case 'grade_change_rejected':
        return <XCircle size={18} className={iconClass} />;
      default:
        return <Bell size={18} className={iconClass} />;
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
      'free': { label: '자유' },
      'recording': { label: '녹음' },
      'evaluation': { label: '평가' },
      'balance': { label: '밸런스' },
      'partner': { label: '파트너' },
      'notice': { label: '공지' }
    };
    
    if (!postType || !badges[postType as keyof typeof badges]) {
      return { label: '게시판' };
    }
    
    return badges[postType as keyof typeof badges];
  };

  const unreadCount = useMemo(() => notifications.filter(noti => !noti.isRead).length, [notifications]);

  if (!user) return <div className="notifications-container">로그인이 필요합니다.</div>;
  if (loading) return <div className="notifications-container">로딩 중...</div>;

  return (
    <div className="notifications-page">
      {/* 배경 패턴 */}
      <div className="notifications-page-pattern" />
      
      <div className="notifications-page-inner">
        <div className="notifications-glass-panel">
          <div className="notifications-header">
            <h2 className="notifications-title">
              🔔 알림
              {unreadCount > 0 && (
                <span className="notifications-unread-badge">
                  {unreadCount}
                </span>
              )}
            </h2>
            {notifications.length > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                className="notifications-mark-all-btn"
                title="모든 알림 삭제"
              >
                <CheckCheck size={16} />
                모두 읽음
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="notifications-empty-state">
              🔕 새 알림이 없습니다
            </div>
          ) : (
            <div className="notifications-list">
              {notifications.map(noti => {
                const postBadge = getPostTypeBadge(noti.postType);
                return (
                  <div
                    key={noti.id}
                    onClick={() => handleNotificationClick(noti)}
                    className={`notifications-card ${noti.isRead ? 'is-read' : 'is-unread'}`}
                  >
                    <div className="notifications-card-header">
                      <div className="notifications-card-icon">
                        {getNotificationIcon(noti.type)}
                      </div>
                      <div className="notifications-card-main">
                        <div className="notifications-card-message">
                          {getNotificationMessage(noti)}
                        </div>
                        <div className="notifications-card-tags">
                          {noti.postType && (
                            <span className="notifications-post-badge">
                              {postBadge.label}
                            </span>
                          )}
                          {!noti.isRead && (
                            <span className="notifications-unread-dot">●</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteNotification(noti.id); }}
                        className="notifications-delete-btn"
                        title="알림 삭제"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    {/* 게시글 제목 */}
                    {noti.postTitle && (
                      <div className="notifications-post-title">
                        📝 {noti.postTitle}
                      </div>
                    )}
                    
                    {/* 메타 정보 */}
                    <div className="notifications-card-meta">
                      <span className="notifications-author">
                        👤 {noti.fromNickname}
                      </span>
                      <span className="notifications-date">
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications; 