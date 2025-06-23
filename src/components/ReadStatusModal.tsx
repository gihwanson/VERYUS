import React from 'react';
import type { ReadStatus } from '../utils/readStatusService';
import './ReadStatusModal.css';

interface ReadStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  readStatus: ReadStatus | null;
  messageContent: string;
}

const ReadStatusModal: React.FC<ReadStatusModalProps> = ({ 
  isOpen, 
  onClose, 
  readStatus,
  messageContent 
}) => {
  if (!isOpen || !readStatus) return null;

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case '리더': return '#ffd700';
      case '운영진': return '#ff8c00';
      case '부운영진': return '#9966cc';
      default: return '#6c757d';
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="read-status-modal-overlay" onClick={onClose}>
      <div className="read-status-modal" onClick={(e) => e.stopPropagation()}>
        <div className="read-status-header">
          <h3>메시지 읽음 상태</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="message-preview">
          <p>{messageContent.length > 100 ? `${messageContent.substring(0, 100)}...` : messageContent}</p>
        </div>

        <div className="read-status-summary">
          <div className="status-card read-summary">
            <span className="status-icon">✅</span>
            <span className="status-text">읽음: {readStatus.readCount}명</span>
            <span className="status-percentage">({readStatus.readPercentage}%)</span>
          </div>
          <div className="status-card unread-summary">
            <span className="status-icon">⏳</span>
            <span className="status-text">안읽음: {readStatus.unreadUsers.length}명</span>
            <span className="status-percentage">({100 - readStatus.readPercentage}%)</span>
          </div>
        </div>

        <div className="status-section">
          <h4 className="section-title">
            <span className="section-icon">✅</span>
            읽은 사용자 ({readStatus.readCount}명)
          </h4>
          <div className="users-list">
            {readStatus.readByUsers.length === 0 ? (
              <p className="empty-message">아직 읽은 사용자가 없습니다.</p>
            ) : (
              readStatus.readByUsers.map((user) => (
                <div key={user.uid} className="user-item">
                  <div className="user-info">
                    {user.profileImageUrl ? (
                      <img 
                        src={user.profileImageUrl} 
                        alt={user.nickname}
                        className="user-avatar"
                      />
                    ) : (
                      <div className="user-avatar default-avatar">
                        {user.nickname?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div className="user-details">
                      <span className="user-nickname">{user.nickname}</span>
                      {user.role !== '일반' && (
                        <span 
                          className="role-badge"
                          style={{ backgroundColor: getRoleBadgeColor(user.role) }}
                        >
                          {user.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="read-time">{formatTime(user.readAt)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="status-section">
          <h4 className="section-title">
            <span className="section-icon">⏳</span>
            안읽은 사용자 ({readStatus.unreadUsers.length}명)
          </h4>
          <div className="users-list">
            {readStatus.unreadUsers.length === 0 ? (
              <p className="empty-message">모든 사용자가 읽었습니다! 🎉</p>
            ) : (
              readStatus.unreadUsers.map((user) => (
                <div key={user.uid} className="user-item unread">
                  <div className="user-info">
                    {user.profileImageUrl ? (
                      <img 
                        src={user.profileImageUrl} 
                        alt={user.nickname}
                        className="user-avatar"
                      />
                    ) : (
                      <div className="user-avatar default-avatar">
                        {user.nickname?.charAt(0) || 'U'}
                      </div>
                    )}
                    <div className="user-details">
                      <span className="user-nickname">{user.nickname}</span>
                      {user.role !== '일반' && (
                        <span 
                          className="role-badge"
                          style={{ backgroundColor: getRoleBadgeColor(user.role) }}
                        >
                          {user.role}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="unread-indicator">미확인</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="close-modal-button" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReadStatusModal; 