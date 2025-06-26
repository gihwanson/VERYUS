import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Bell, MessageCircle, X, Heart, CheckCircle, XCircle, Users, AtSign, UserPlus, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '../utils/notificationService';

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

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    
    const unreadNotifications = notifications.filter(noti => !noti.isRead);
    
    if (unreadNotifications.length === 0) {
      alert('읽지 않은 알림이 없습니다.');
      return;
    }

    if (!window.confirm(`${unreadNotifications.length}개의 읽지 않은 알림을 모두 읽음 처리하시겠습니까?`)) {
      return;
    }

    try {
      const batch = writeBatch(db);
      
      unreadNotifications.forEach(noti => {
        const notificationRef = doc(db, 'notifications', noti.id);
        batch.update(notificationRef, { isRead: true });
      });

      await batch.commit();
      alert('모든 알림이 읽음 처리되었습니다.');
    } catch (error) {
      console.error('모두 읽음 처리 중 오류:', error);
      alert('알림 처리 중 오류가 발생했습니다.');
    }
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

  const unreadCount = notifications.filter(noti => !noti.isRead).length;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      backgroundAttachment: 'fixed',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* 배경 패턴 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
        `,
        pointerEvents: 'none'
      }} />
      
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '20px',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          maxWidth: '800px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(15px)',
          borderRadius: '24px',
          padding: '32px',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24, gap: '16px' }}>
            <h2 style={{ 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: 700,
              fontSize: '28px',
              margin: 0,
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              🔔 알림
              {unreadCount > 0 && (
                <span style={{ 
                  backgroundColor: '#ef4444', 
                  color: 'white', 
                  borderRadius: '12px', 
                  fontSize: '14px', 
                  fontWeight: '700', 
                  padding: '4px 10px', 
                  marginLeft: '12px',
                  minWidth: '24px',
                  textAlign: 'center',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
                }}>
                  {unreadCount}
                </span>
              )}
            </h2>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllAsRead}
                style={{ 
                  background: 'rgba(16, 185, 129, 0.8)', 
                  backdropFilter: 'blur(10px)',
                  color: 'white', 
                  border: '1px solid rgba(255, 255, 255, 0.3)', 
                  borderRadius: '12px', 
                  padding: '10px 18px', 
                  fontWeight: 600, 
                  cursor: 'pointer', 
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.3s ease'
                }}
                title="모든 알림 읽음 처리"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.9)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(16, 185, 129, 0.8)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <CheckCheck size={16} />
                모두 읽음
              </button>
            )}
          </div>
          {notifications.filter(noti => !noti.isRead).length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.7)',
              padding: '60px 20px',
              fontSize: '18px',
              fontWeight: 500
            }}>
              🔕 새 알림이 없습니다
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {notifications.filter(noti => !noti.isRead).map(noti => {
                const postBadge = getPostTypeBadge(noti.postType);
                return (
                  <div
                    key={noti.id}
                    onClick={() => handleNotificationClick(noti)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(10px)',
                      borderRadius: '16px',
                      padding: '20px',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(5px)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        flexShrink: 0
                      }}>
                        {getNotificationIcon(noti.type)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: 600,
                          color: 'white',
                          marginBottom: '8px',
                          lineHeight: 1.4,
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                        }}>
                          {getNotificationMessage(noti)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {noti.postType && (
                            <span style={{ 
                              background: 'rgba(255, 255, 255, 0.2)',
                              color: 'white',
                              border: '1px solid rgba(255, 255, 255, 0.3)',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}>
                              {postBadge.label}
                            </span>
                          )}
                          {!noti.isRead && (
                            <span style={{
                              color: '#FF4757',
                              fontSize: '16px',
                              fontWeight: 'bold'
                            }}>●</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteNotification(noti.id); }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: '8px',
                          padding: '6px',
                          cursor: 'pointer',
                          color: 'rgba(255, 255, 255, 0.7)',
                          transition: 'all 0.2s ease',
                          flexShrink: 0
                        }}
                        title="알림 삭제"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                          e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    {/* 게시글 제목 */}
                    {noti.postTitle && (
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        margin: '12px 0',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'rgba(255, 255, 255, 0.9)',
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        📝 {noti.postTitle}
                      </div>
                    )}
                    
                    {/* 메타 정보 */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <span style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontWeight: 500
                      }}>
                        👤 {noti.fromNickname}
                      </span>
                      <span style={{
                        fontSize: '13px',
                        color: 'rgba(255, 255, 255, 0.6)'
                      }}>
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