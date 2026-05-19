import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Bell, MessageCircle, X, Heart, CheckCircle, XCircle, Users, AtSign, UserPlus, CheckCheck, Shield, Award, Trash2, Filter } from 'lucide-react';
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
    | 'approved_song_milestone'
    | 'anonymous_chat'
    | 'anonymous_chat_ban';
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

type FilterType = 'all' | 'unread' | 'comment' | 'like' | 'system';

const FILTER_OPTIONS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'unread', label: '안읽음' },
  { key: 'comment', label: '댓글/답글' },
  { key: 'like', label: '좋아요' },
  { key: 'system', label: '시스템' },
];

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showConfirmModal, setShowConfirmModal] = useState<'read' | 'delete' | null>(null);
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
    const type = (noti.type || '').toLowerCase();
    if (type === 'anonymous_chat_ban') return false;
    if (type === 'anonymous_chat') return true;
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
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Notification[];
      setNotifications(all.filter((noti) => !isHiddenInInbox(noti)));
      setLoading(false);
    });
    return () => unsub();
  }, [isHiddenInInbox, user]);

  const filteredNotifications = useMemo(() => {
    switch (filter) {
      case 'unread':
        return notifications.filter(n => !n.isRead);
      case 'comment':
        return notifications.filter(n => ['comment', 'reply', 'mention', 'guestbook', 'guestbook_reply'].includes(n.type));
      case 'like':
        return notifications.filter(n => n.type === 'like');
      case 'system':
        return notifications.filter(n => ['approval', 'rejection', 'grade_request_pending', 'grade_change_approved', 'grade_change_rejected', 'approved_song_milestone', 'partnership', 'partnership_closed', 'partnership_confirmed', 'anonymous_chat_ban'].includes(n.type));
      default:
        return notifications;
    }
  }, [notifications, filter]);

  const handleNotificationClick = async (notification: Notification) => {
    const route = getNotificationRoute(notification);
    if (!route) return;

    if (!notification.isRead) {
      try {
        await updateDoc(doc(db, 'notifications', notification.id), { isRead: true });
      } catch (err) {
        console.error('읽음 처리 실패:', err);
      }
    }

    if (notification.type === 'grade_request_pending') {
      navigate('/admin', { state: { openAdminTab: 'approvals' } });
      return;
    }

    navigate(route);
  };

  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error('알림 삭제 실패:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;

    setShowConfirmModal(null);
    try {
      const chunkSize = 450;
      for (let i = 0; i < unread.length; i += chunkSize) {
        const chunk = unread.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((noti) => {
          batch.update(doc(db, 'notifications', noti.id), { isRead: true });
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('모두 읽음 처리 중 오류:', error);
    }
  };

  const handleDeleteAll = async () => {
    if (!user) return;
    if (notifications.length === 0) return;

    setShowConfirmModal(null);
    try {
      const chunkSize = 450;
      for (let i = 0; i < notifications.length; i += chunkSize) {
        const chunk = notifications.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((noti) => {
          batch.delete(doc(db, 'notifications', noti.id));
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('모두 삭제 중 오류:', error);
    }
  };

  const getNotificationIconClass = (type: string) => {
    switch (type) {
      case 'reply': return 'notifications-icon-reply';
      case 'like': return 'notifications-icon-like';
      case 'approval': return 'notifications-icon-approval';
      case 'rejection': return 'notifications-icon-rejection';
      case 'guestbook': return 'notifications-icon-guestbook';
      case 'guestbook_reply': return 'notifications-icon-guestbook-reply';
      case 'mention': return 'notifications-icon-mention';
      case 'partnership': return 'notifications-icon-partnership';
      case 'partnership_closed': return 'notifications-icon-partnership-closed';
      case 'partnership_confirmed': return 'notifications-icon-partnership-confirmed';
      case 'grade_request_pending': return 'notifications-icon-grade-request-pending';
      case 'grade_change_approved': return 'notifications-icon-grade-change-approved';
      case 'grade_change_rejected': return 'notifications-icon-grade-change-rejected';
      case 'approved_song_milestone': return 'notifications-icon-grade-request-pending';
      case 'anonymous_chat_ban': return 'notifications-icon-rejection';
      case 'comment':
      default: return 'notifications-icon-comment';
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = getNotificationIconClass(type);
    switch (type) {
      case 'comment': return <MessageCircle size={18} className={iconClass} />;
      case 'reply': return <MessageCircle size={18} className={iconClass} />;
      case 'like': return <Heart size={18} className={iconClass} />;
      case 'approval': return <CheckCircle size={18} className={iconClass} />;
      case 'rejection': return <XCircle size={18} className={iconClass} />;
      case 'guestbook': return <Users size={18} className={iconClass} />;
      case 'guestbook_reply': return <MessageCircle size={18} className={iconClass} />;
      case 'mention': return <AtSign size={18} className={iconClass} />;
      case 'partnership': return <UserPlus size={18} className={iconClass} />;
      case 'partnership_closed': return <CheckCircle size={18} className={iconClass} />;
      case 'partnership_confirmed': return <CheckCircle size={18} className={iconClass} />;
      case 'grade_request_pending': return <Shield size={18} className={iconClass} />;
      case 'grade_change_approved': return <CheckCircle size={18} className={iconClass} />;
      case 'grade_change_rejected': return <XCircle size={18} className={iconClass} />;
      case 'approved_song_milestone': return <Award size={18} className={iconClass} />;
      case 'anonymous_chat_ban': return <XCircle size={18} className={iconClass} />;
      default: return <Bell size={18} className={iconClass} />;
    }
  };

  const getNotificationMessage = (notification: Notification) => {
    if (notification.message) return notification.message;
    if (notification.type === 'comment') return '내 게시글에 댓글이 달렸습니다.';
    if (notification.type === 'reply') return '내 댓글에 답글이 달렸습니다.';
    return NotificationService.getNotificationMessage(notification.type);
  };

  const getPostTypeBadge = (postType?: string) => {
    const badges: Record<string, { label: string }> = {
      'free': { label: '자유' },
      'recording': { label: '녹음' },
      'evaluation': { label: '평가' },
      'balance': { label: '밸런스' },
      'partner': { label: '파트너' },
      'notice': { label: '공지' },
      'anonymous_chat': { label: '익명채팅' }
    };
    return badges[postType || ''] || { label: '게시판' };
  };

  const unreadCount = useMemo(() => notifications.filter(noti => !noti.isRead).length, [notifications]);

  if (!user) return <div className="notifications-container">로그인이 필요합니다.</div>;
  if (loading) return (
    <div className="notifications-page">
      <div className="notifications-page-pattern" />
      <div className="notifications-page-inner">
        <div className="notifications-loading">
          <div className="notifications-loading-spinner" />
          <span>알림을 불러오는 중...</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="notifications-page">
      <div className="notifications-page-pattern" />
      
      <div className="notifications-page-inner">
        <div className="notifications-glass-panel">
          {/* 헤더 */}
          <div className="notifications-header">
            <h2 className="notifications-title">
              🔔 알림
              {unreadCount > 0 && (
                <span className="notifications-unread-badge">{unreadCount}</span>
              )}
            </h2>
            {notifications.length > 0 && (
              <div className="notifications-action-btns">
                <button
                  onClick={() => setShowConfirmModal('read')}
                  className="notifications-mark-all-btn"
                  disabled={unreadCount === 0}
                >
                  <CheckCheck size={15} />
                  모두 읽음
                </button>
                <button
                  onClick={() => setShowConfirmModal('delete')}
                  className="notifications-delete-all-btn"
                >
                  <Trash2 size={15} />
                  전체 삭제
                </button>
              </div>
            )}
          </div>

          {/* 필터 */}
          <div className="notifications-filter-bar">
            <Filter size={14} className="notifications-filter-icon" />
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={`notifications-filter-chip ${filter === opt.key ? 'active' : ''}`}
                onClick={() => setFilter(opt.key)}
              >
                {opt.label}
                {opt.key === 'unread' && unreadCount > 0 && (
                  <span className="notifications-filter-count">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* 알림 목록 */}
          {filteredNotifications.length === 0 ? (
            <div className="notifications-empty-state">
              <div className="notifications-empty-icon">🔕</div>
              <p className="notifications-empty-text">
                {filter === 'all' ? '새 알림이 없습니다' :
                 filter === 'unread' ? '읽지 않은 알림이 없습니다' :
                 '해당 유형의 알림이 없습니다'}
              </p>
            </div>
          ) : (
            <div className="notifications-list">
              {filteredNotifications.map(noti => {
                const postBadge = getPostTypeBadge(noti.postType);
                return (
                  <div
                    key={noti.id}
                    onClick={() => handleNotificationClick(noti)}
                    className={`notifications-card ${noti.isRead ? 'is-read' : 'is-unread'}`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleNotificationClick(noti); }}
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
                        onClick={(e) => handleDeleteNotification(noti.id, e)}
                        className="notifications-delete-btn"
                        title="알림 삭제"
                        aria-label="알림 삭제"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    {noti.postTitle && (
                      <div className="notifications-post-title">
                        📝 {noti.postTitle}
                      </div>
                    )}
                    
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

      {/* 확인 모달 */}
      {showConfirmModal && (
        <div className="notifications-modal-overlay" onClick={() => setShowConfirmModal(null)}>
          <div className="notifications-modal" onClick={e => e.stopPropagation()}>
            <p className="notifications-modal-text">
              {showConfirmModal === 'read'
                ? `${unreadCount}개의 알림을 모두 읽음 처리하시겠습니까?`
                : `${notifications.length}개의 알림을 모두 삭제하시겠습니까?`}
            </p>
            <div className="notifications-modal-btns">
              <button className="notifications-modal-cancel" onClick={() => setShowConfirmModal(null)}>
                취소
              </button>
              <button
                className={`notifications-modal-confirm ${showConfirmModal === 'delete' ? 'danger' : ''}`}
                onClick={showConfirmModal === 'read' ? handleMarkAllAsRead : handleDeleteAll}
              >
                {showConfirmModal === 'read' ? '모두 읽음' : '모두 삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
