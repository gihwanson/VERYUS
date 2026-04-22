import React, { useState, useEffect } from 'react';
import { Crown, Shield, User, Users, Activity, CheckCircle, X, Edit3, AlertCircle, MessageSquare, Heart, FileText, Clock, TrendingUp, History, Eye, Search, Filter, Award, Plus, Target, Mail, Send } from 'lucide-react';
import type { AdminUser, UserActivity, ActivityStats, UserActivitySummary, AdminLog, AdminAction, LogStats, ExtendedUserStats, UserAnalytics, BulkAction, Notification, NotificationType, NotificationTemplate, NotificationStats, NotificationTarget } from './AdminTypes';
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_COLORS, ADMIN_ACTION_LABELS, ADMIN_ACTION_COLORS } from './AdminTypes';
import { formatDate, getGradeDisplay, calculateActivityDays, createRoleDisplay, createRoleIcon, getUserStatus, createStatusDisplay, getSuspensionTimeLeft, getActivityIcon, formatActivityTime, getActivityLevel, getLogActionIcon, formatLogTime, calculateStats, calculateActivityScore, calculateActivityStats, changeUserStatus, isUserSuspended, executeBulkAction, generateUserAnalytics, logAdminAction, fetchAdminLogs, calculateLogStats, getNotificationTypeIcon, getNotificationStatusDisplay, getDefaultTemplates, createNotificationTargets, fetchNotificationTemplates, toggleAllTargets } from './AdminUtils';
import { Timestamp } from 'firebase/firestore';
import GlobalLoadingScreen from './GlobalLoadingScreen';

// 로딩 컴포넌트
export const LoadingSpinner: React.FC = () => (
  <GlobalLoadingScreen message="관리자 데이터를 불러오는 중..." fullScreen={false} />
);

// 통계 카드 컴포넌트
interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  extra?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ icon, title, value, subtitle, extra }) => (
  <div className="stat-card">
    <div className="stat-header">
      <div className="stat-icon">{icon}</div>
    </div>
    <div className="stat-content">
      <h3>{title}</h3>
      <div className="stat-number">{value}</div>
      {subtitle && <div className="stat-subtitle">{subtitle}</div>}
      {extra && <div className="stat-extra">{extra}</div>}
    </div>
  </div>
);

// 사용자 카드 컴포넌트
interface UserCardProps {
  user: AdminUser;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onView: () => void;
  onStatusChange?: () => void;
  editingUser?: AdminUser;
  onEditChange: (field: string, value: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({
  user,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onView,
  onStatusChange,
  editingUser,
  onEditChange
}) => {
  const userStatus = getUserStatus(user);
  const suspensionTimeLeft = getSuspensionTimeLeft(user);
  
  return (
    <div className={`user-card ${isEditing ? 'edit-mode' : ''}`}>
      <div className="user-header">
        <div className="profile-avatar">
          {user.profileImageUrl ? (
            <img src={user.profileImageUrl} alt="프로필" />
          ) : (
            <User size={24} />
          )}
        </div>
        <div className="user-info">
          <div className="user-name">
            <span>{user.nickname}</span>
            <div className="user-badges">
              <span className="grade-badge">{user.grade}</span>
              <span className={`role-badge ${user.role}`}>{user.role}</span>
            </div>
          </div>
          <div className="user-meta">
            가입: {formatDate(user.createdAt)} / 활동: {calculateActivityDays(user.createdAt)}일
            {suspensionTimeLeft && (
              <span className="suspension-info">
                <AlertCircle size={12} />
                정지: {suspensionTimeLeft}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div className="user-actions">
        {!isEditing ? (
          <>
            <button className="action-btn view-btn" onClick={onView}>
              <CheckCircle size={14}/>
              상세
            </button>
            <button className="action-btn edit-btn" onClick={onEdit}>
              <Edit3 size={14}/>
              수정
            </button>
            {onStatusChange && (
              <button className="action-btn status-btn" onClick={onStatusChange}>
                <AlertCircle size={14}/>
                상태
              </button>
            )}
            <button className="action-btn delete-btn" onClick={onDelete}>
              <X size={14}/>
              삭제
            </button>
          </>
        ) : (
          <>
            <button className="action-btn save-btn" onClick={onSave}>저장</button>
            <button className="action-btn cancel-btn" onClick={onCancel}>취소</button>
          </>
        )}
      </div>
      
      {isEditing && editingUser && (
        <div className="edit-controls">
          <div className="edit-controls-row">
            <input
              type="text"
              className="edit-input"
              value={editingUser.nickname}
              onChange={(e) => onEditChange('nickname', e.target.value)}
              placeholder="닉네임"
            />
            <select
              className="edit-select"
              value={editingUser.role}
              onChange={(e) => onEditChange('role', e.target.value)}
            >
              <option value="일반">일반</option>
              <option value="평가자">평가자</option>
              <option value="부운영진">부운영진</option>
              <option value="운영진">운영진</option>
              <option value="리더">리더</option>
            </select>
            <select
              className="edit-select"
              value={editingUser.grade}
              onChange={(e) => onEditChange('grade', e.target.value)}
            >
              <option value="🍒">🍒 체리</option>
              <option value="🫐">🫐 블루베리</option>
              <option value="🥝">🥝 키위</option>
              <option value="🍎">🍎 사과</option>
              <option value="🍈">🍈 멜론</option>
              <option value="🍉">🍉 수박</option>
              <option value="🌍">🌍 지구</option>
              <option value="🪐">🪐 토성</option>
              <option value="☀️">☀️ 태양</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

// 빈 상태 컴포넌트
export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="empty-state">
    <Users size={48} />
    <h3>사용자가 없습니다</h3>
    <p>{message}</p>
  </div>
);

// 역할 표시 컴포넌트 (AdminUtils의 함수를 래핑)
export const RoleDisplay: React.FC<{ role: string }> = ({ role }) => createRoleDisplay(role);

// 역할 아이콘 컴포넌트 (AdminUtils의 함수를 래핑)
export const RoleIcon: React.FC<{ role: string }> = ({ role }) => createRoleIcon(role);

// 활동 내역 아이템 컴포넌트
interface ActivityItemProps {
  activity: UserActivity;
}

export const ActivityItem: React.FC<ActivityItemProps> = ({ activity }) => {
  const IconComponent = getActivityIcon(activity.action);
  const activityLabel = activity.action === 'login' ? '로그인' :
                       activity.action === 'post' ? '게시글 작성' :
                       activity.action === 'comment' ? '댓글 작성' :
                       activity.action === 'like' ? '좋아요' :
                       activity.action === 'grade_up' ? '등급 상승' :
                       activity.action === 'profile_update' ? '프로필 수정' :
                       activity.action === 'contest_participate' ? '대회 참여' :
                       activity.action;
  
  return (
    <div className="activity-item">
      <div className="activity-icon">
        <IconComponent size={16} />
      </div>
      <div className="activity-content">
        <div className="activity-title">{activityLabel}</div>
        <div className="activity-time">{formatActivityTime(activity.timestamp)}</div>
        {activity.details && (
          <div className="activity-details">{activity.details}</div>
        )}
      </div>
      {activity.score && (
        <div className="activity-score">+{activity.score}</div>
      )}
    </div>
  );
};

// 활동 통계 카드 컴포넌트
interface ActivityStatsCardProps {
  stats: ActivityStats;
  title: string;
  icon: React.ReactNode;
}

export const ActivityStatsCard: React.FC<ActivityStatsCardProps> = ({ stats, title, icon }) => (
  <div className="activity-stats-card">
    <div className="stats-header">
      <div className="stats-icon">{icon}</div>
      <h3>{title}</h3>
    </div>
    <div className="stats-content">
      <div className="stats-row">
        <span>게시글</span>
        <span>{stats.totalPosts}개</span>
      </div>
      <div className="stats-row">
        <span>댓글</span>
        <span>{stats.totalComments}개</span>
      </div>
      <div className="stats-row">
        <span>좋아요</span>
        <span>{stats.totalLikes}개</span>
      </div>
      <div className="stats-row">
        <span>주간 활동</span>
        <span>{stats.weeklyActivity}점</span>
      </div>
      <div className="stats-row">
        <span>월간 활동</span>
        <span>{stats.monthlyActivity}점</span>
      </div>
      <div className="stats-row">
        <span>평균 일일</span>
        <span>{stats.averageDailyActivity.toFixed(1)}회</span>
      </div>
    </div>
  </div>
);

// 사용자 활동 요약 컴포넌트
interface UserActivitySummaryProps {
  summary: UserActivitySummary;
}

const UserActivitySummary: React.FC<UserActivitySummaryProps> = ({ summary }) => {
  const activityLevel = getActivityLevel(summary.totalActivityScore);
  
  return (
    <div className="user-activity-summary">
      <div className="summary-header">
        <h3>{summary.nickname}님의 활동 요약</h3>
        <div 
          className="activity-level"
          style={{ backgroundColor: activityLevel.color }}
        >
          {activityLevel.level}
        </div>
      </div>
      
      <div className="summary-stats">
        <div className="stat-item">
          <span className="stat-label">총 활동 점수</span>
          <span className="stat-value">{summary.totalActivityScore}점</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">주간 활동</span>
          <span className="stat-value">{summary.weeklyActivityScore}점</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">월간 활동</span>
          <span className="stat-value">{summary.monthlyActivityScore}점</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">마지막 로그인</span>
          <span className="stat-value">{formatActivityTime(summary.lastLoginAt)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">마지막 활동</span>
          <span className="stat-value">{formatActivityTime(summary.lastActivityAt)}</span>
        </div>
      </div>
      
      <div className="recent-activities">
        <h4>최근 활동 내역</h4>
        <div className="activities-list">
          {summary.recentActivities.length > 0 ? (
            summary.recentActivities.map((activity, index) => (
              <ActivityItem key={index} activity={activity} />
            ))
          ) : (
            <div className="no-activities">활동 내역이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// 활동 분석 차트 컴포넌트 (간단한 버전)
interface ActivityChartProps {
  activities: UserActivity[];
}

export const ActivityChart: React.FC<ActivityChartProps> = ({ activities }) => {
  // 일별 활동 데이터 생성
  const dailyData = new Array(7).fill(0);
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  
  activities.forEach(activity => {
    const activityDate = activity.timestamp instanceof Date ? 
      activity.timestamp : 
      activity.timestamp instanceof Timestamp ? 
        activity.timestamp.toDate() : 
        new Date(activity.timestamp);
    const dayOfWeek = activityDate.getDay();
    dailyData[dayOfWeek]++;
  });
  
  const maxActivity = Math.max(...dailyData);
  
  return (
    <div className="activity-chart">
      <h4>요일별 활동 분포</h4>
      <div className="chart-container">
        {dailyData.map((count, index) => (
          <div key={index} className="chart-bar">
            <div 
              className="bar-fill"
              style={{ 
                height: `${maxActivity > 0 ? (count / maxActivity) * 100 : 0}%`,
                backgroundColor: count > 0 ? '#667eea' : '#e2e8f0'
              }}
            />
            <span className="bar-label">{dayLabels[index]}</span>
            <span className="bar-value">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// 로그 아이템 컴포넌트
interface LogItemProps {
  log: AdminLog;
  onViewDetails?: (log: AdminLog) => void;
}

export const LogItem: React.FC<LogItemProps> = ({ log, onViewDetails }) => {
  const IconComponent = getLogActionIcon(log.action);
  const actionColor = ADMIN_ACTION_COLORS[log.action];
  
  return (
    <div className="log-item">
      <div className="log-icon" style={{ backgroundColor: actionColor }}>
        <IconComponent size={16} />
      </div>
      <div className="log-content">
        <div className="log-header">
          <span className="log-action">{ADMIN_ACTION_LABELS[log.action]}</span>
          <span className="log-time">{formatLogTime(log.timestamp)}</span>
        </div>
        <div className="log-details">
          <span className="log-admin">{log.adminNickname}</span>
          {log.targetNickname && (
            <>
              <span className="log-separator">→</span>
              <span className="log-target">{log.targetNickname}</span>
            </>
          )}
        </div>
        <div className="log-description">{log.details}</div>
      </div>
      {onViewDetails && (
        <button 
          className="log-view-btn"
          onClick={() => onViewDetails(log)}
          title="상세 보기"
        >
          <Eye size={16} />
        </button>
      )}
    </div>
  );
};

// 로그 통계 카드 컴포넌트
interface LogStatsCardProps {
  stats: LogStats;
  title: string;
  icon: React.ReactNode;
}

export const LogStatsCard: React.FC<LogStatsCardProps> = ({ stats, title, icon }) => (
  <div className="log-stats-card">
    <div className="stats-header">
      <div className="stats-icon">{icon}</div>
      <h3>{title}</h3>
    </div>
    <div className="stats-content">
      <div className="stats-row">
        <span>총 로그</span>
        <span>{stats.totalLogs}개</span>
      </div>
      <div className="stats-row">
        <span>오늘</span>
        <span>{stats.todayLogs}개</span>
      </div>
      <div className="stats-row">
        <span>이번 주</span>
        <span>{stats.weeklyLogs}개</span>
      </div>
      <div className="stats-row">
        <span>이번 달</span>
        <span>{stats.monthlyLogs}개</span>
      </div>
    </div>
  </div>
);

// 로그 상세 모달 컴포넌트
interface LogDetailModalProps {
  log: AdminLog | null;
  onClose: () => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, onClose }) => {
  if (!log) return null;
  
  const IconComponent = getLogActionIcon(log.action);
  const actionColor = ADMIN_ACTION_COLORS[log.action];
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content log-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <div className="action-icon" style={{ backgroundColor: actionColor }}>
              <IconComponent size={20} />
            </div>
            <h2>{ADMIN_ACTION_LABELS[log.action]}</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="log-detail-info">
            <div className="detail-row">
              <strong>관리자:</strong>
              <span>{log.adminNickname}</span>
            </div>
            <div className="detail-row">
              <strong>시간:</strong>
              <span>{formatLogTime(log.timestamp)}</span>
            </div>
            {log.targetNickname && (
              <div className="detail-row">
                <strong>대상:</strong>
                <span>{log.targetNickname}</span>
              </div>
            )}
            <div className="detail-row">
              <strong>상세:</strong>
              <span>{log.details}</span>
            </div>
            {log.beforeValue && (
              <div className="detail-row">
                <strong>변경 전:</strong>
                <span className="value-display">{JSON.stringify(log.beforeValue, null, 2)}</span>
              </div>
            )}
            {log.afterValue && (
              <div className="detail-row">
                <strong>변경 후:</strong>
                <span className="value-display">{JSON.stringify(log.afterValue, null, 2)}</span>
              </div>
            )}
            {log.ipAddress && (
              <div className="detail-row">
                <strong>IP 주소:</strong>
                <span>{log.ipAddress}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 로그 필터 컴포넌트
interface LogFilterProps {
  filters: {
    search: string;
    action: string;
    dateRange: { start: Date; end: Date } | null;
  };
  onFilterChange: (filters: any) => void;
  actions: AdminAction[];
}

export const LogFilter: React.FC<LogFilterProps> = ({ filters, onFilterChange, actions }) => (
  <div className="log-filter">
    <div className="filter-row">
      <div className="search-box">
        <Search size={20} />
        <input
          type="text"
          placeholder="관리자, 대상, 내용으로 검색..."
          value={filters.search}
          onChange={(e) => onFilterChange({ ...filters, search: e.target.value })}
        />
      </div>
      
      <div className="filter-controls">
        <select
          value={filters.action}
          onChange={(e) => onFilterChange({ ...filters, action: e.target.value })}
          className="filter-select"
        >
          <option value="all">모든 작업</option>
          {actions.map(action => (
            <option key={action} value={action}>
              {ADMIN_ACTION_LABELS[action]}
            </option>
          ))}
        </select>
        
        <div className="date-range">
          <input
            type="date"
            value={filters.dateRange?.start?.toISOString().split('T')[0] || ''}
            onChange={(e) => {
              const start = e.target.value ? new Date(e.target.value) : null;
              onFilterChange({
                ...filters,
                dateRange: { start, end: filters.dateRange?.end || null }
              });
            }}
            className="date-input"
          />
          <span>~</span>
          <input
            type="date"
            value={filters.dateRange?.end?.toISOString().split('T')[0] || ''}
            onChange={(e) => {
              const end = e.target.value ? new Date(e.target.value) : null;
              onFilterChange({
                ...filters,
                dateRange: { start: filters.dateRange?.start || null, end }
              });
            }}
            className="date-input"
          />
        </div>
      </div>
    </div>
  </div>
);

// 공지/알림 발송 모달
export const NotificationSendModal = ({ 
  isOpen, 
  onClose, 
  users, 
  onSend 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  users: AdminUser[];
  onSend: (notification: { title: string; content: string; type: NotificationType; targetUsers: string[] }) => void;
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<NotificationType>('announcement');
  const [targets, setTargets] = useState<NotificationTarget[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTargets(createNotificationTargets(users));
      loadTemplates();
    }
  }, [isOpen, users]);

  const loadTemplates = async () => {
    try {
      const fetchedTemplates = await fetchNotificationTemplates();
      setTemplates(fetchedTemplates);
    } catch (error) {
      console.error('템플릿 로드 실패:', error);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setTitle(template.title);
      setContent(template.content);
      setType(template.type);
      setSelectedTemplate(templateId);
    }
  };

  const handleSelectAll = () => {
    const newSelectAll = !selectAll;
    setSelectAll(newSelectAll);
    setTargets(toggleAllTargets(targets, newSelectAll));
  };

  const handleTargetToggle = (uid: string) => {
    setTargets(prev => prev.map(target => 
      target.uid === uid ? { ...target, isSelected: !target.isSelected } : target
    ));
  };

  const handleSend = async () => {
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    const selectedTargets = targets.filter(t => t.isSelected).map((t: any) => t.uid);
    if (selectedTargets.length === 0) {
      alert('발송할 사용자를 선택해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      await onSend({
        title: title.trim(),
        content: content.trim(),
        type,
        targetUsers: selectedTargets
      });
      onClose();
    } catch (error) {
      console.error('알림 발송 실패:', error);
      alert('알림 발송에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCount = targets.filter(t => t.isSelected).length;

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content notification-send-modal">
        <div className="modal-header">
          <h3>공지/알림 발송</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="modal-body">
          <div className="notification-form">
            <div className="form-group">
              <label>템플릿 선택</label>
              <select 
                value={selectedTemplate} 
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="form-select"
              >
                <option value="">템플릿 선택</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>알림 유형</label>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as NotificationType)}
                className="form-select"
              >
                {Object.entries(NOTIFICATION_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                placeholder="알림 제목을 입력하세요"
              />
            </div>

            <div className="form-group">
              <label>내용</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="form-textarea"
                placeholder="알림 내용을 입력하세요"
                rows={6}
              />
            </div>

            <div className="form-group">
              <label>발송 대상 ({selectedCount}명 선택됨)</label>
              <div className="target-selection">
                <div className="select-all-control">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleSelectAll}
                    />
                    전체 선택
                  </label>
                </div>
                
                <div className="targets-list">
                  {targets.map(target => (
                    <div key={target.uid} className="target-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={target.isSelected}
                          onChange={() => handleTargetToggle(target.uid)}
                        />
                        <span className="target-info">
                          <strong>{target.nickname}</strong>
                          <span className="target-details">
                            {target.email} • {target.grade} • {target.role}
                          </span>
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">
            취소
          </button>
          <button 
            onClick={handleSend} 
            className="btn btn-primary"
            disabled={isLoading || !title.trim() || !content.trim() || selectedCount === 0}
          >
            {isLoading ? '발송 중...' : '발송'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 알림 목록 컴포넌트
export const NotificationList = ({ 
  notifications, 
  onRefresh 
}: { 
  notifications: Notification[];
  onRefresh: () => void;
}) => {
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  const handleViewDetails = (notification: Notification) => {
    setSelectedNotification(notification);
  };

  const getStatusDisplay = (notification: Notification) => {
    const statusConfig = getNotificationStatusDisplay(notification.status);
    const Icon = statusConfig.icon;
    
    return (
      <span 
        className="status-badge"
        style={{ backgroundColor: statusConfig.color }}
      >
        <Icon size={12} />
        {statusConfig.label}
      </span>
    );
  };

  const getTypeDisplay = (notification: Notification) => {
    const Icon = getNotificationTypeIcon(notification.type);
    const color = NOTIFICATION_TYPE_COLORS[notification.type];
    
    return (
      <span 
        className="type-badge"
        style={{ backgroundColor: color }}
      >
        <Icon size={12} />
        {NOTIFICATION_TYPE_LABELS[notification.type]}
      </span>
    );
  };

  return (
    <div className="notification-list">
      <div className="list-header">
        <h4>발송된 알림 목록</h4>
        <button onClick={onRefresh} className="btn btn-secondary btn-sm">
          새로고침
        </button>
      </div>

      <div className="notifications-grid">
        {notifications.map(notification => (
          <div key={notification.id} className="notification-card">
            <div className="notification-header">
              <div className="notification-type">
                {getTypeDisplay(notification)}
              </div>
              <div className="notification-status">
                {getStatusDisplay(notification)}
              </div>
            </div>

            <div className="notification-content">
              <h5>{notification.title}</h5>
              <p>{notification.content.substring(0, 100)}...</p>
            </div>

            <div className="notification-meta">
              <div className="meta-item">
                <Users size={14} />
                <span>{notification.targetUserCount}명</span>
              </div>
              <div className="meta-item">
                <Eye size={14} />
                <span>{notification.readCount}명 읽음</span>
              </div>
              <div className="meta-item">
                <Clock size={14} />
                <span>{formatDate(notification.sentAt)}</span>
              </div>
            </div>

            <div className="notification-actions">
              <button 
                onClick={() => handleViewDetails(notification)}
                className="btn btn-secondary btn-sm"
              >
                상세보기
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedNotification && (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      )}
    </div>
  );
};

// 알림 상세 모달
export const NotificationDetailModal = ({ 
  notification, 
  onClose 
}: { 
  notification: Notification;
  onClose: () => void;
}) => {
  const getTypeDisplay = (notification: Notification) => {
    const Icon = getNotificationTypeIcon(notification.type);
    const color = NOTIFICATION_TYPE_COLORS[notification.type];
    
    return (
      <span 
        className="type-badge"
        style={{ backgroundColor: color }}
      >
        <Icon size={14} />
        {NOTIFICATION_TYPE_LABELS[notification.type]}
      </span>
    );
  };

  const getStatusDisplay = (notification: Notification) => {
    const statusConfig = getNotificationStatusDisplay(notification.status);
    const Icon = statusConfig.icon;
    
    return (
      <span 
        className="status-badge"
        style={{ backgroundColor: statusConfig.color }}
      >
        <Icon size={12} />
        {statusConfig.label}
      </span>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content notification-detail-modal">
        <div className="modal-header">
          <h3>알림 상세 정보</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="modal-body">
          <div className="notification-detail">
            <div className="detail-header">
              <div className="detail-type">
                {getTypeDisplay(notification)}
              </div>
              <div className="detail-status">
                {getStatusDisplay(notification)}
              </div>
            </div>

            <div className="detail-content">
              <h4>{notification.title}</h4>
              <div className="content-text">
                {notification.content.split('\n').map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
            </div>

            <div className="detail-stats">
              <div className="stat-item">
                <Target size={16} />
                <div>
                  <strong>발송 대상</strong>
                  <span>{notification.targetUserCount}명</span>
                </div>
              </div>
              <div className="stat-item">
                <Eye size={16} />
                <div>
                  <strong>읽음</strong>
                  <span>{notification.readCount}명</span>
                </div>
              </div>
              <div className="stat-item">
                <Clock size={16} />
                <div>
                  <strong>발송 시간</strong>
                  <span>{formatDate(notification.sentAt)}</span>
                </div>
              </div>
              <div className="stat-item">
                <User size={16} />
                <div>
                  <strong>발송자</strong>
                  <span>{notification.senderNickname}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-primary">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

// 알림 통계 컴포넌트
const NotificationStats = ({ 
  stats 
}: { 
  stats: NotificationStats;
}) => {
  return (
    <div className="notification-stats">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Send size={20} />
          </div>
          <div className="stat-content">
            <h4>{stats.totalSent}</h4>
            <p>총 발송</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Eye size={20} />
          </div>
          <div className="stat-content">
            <h4>{stats.totalRead}</h4>
            <p>총 읽음</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp size={20} />
          </div>
          <div className="stat-content">
            <h4>{stats.averageReadRate.toFixed(1)}%</h4>
            <p>평균 읽음률</p>
          </div>
        </div>
      </div>

      <div className="type-distribution">
        <h4>알림 유형별 분포</h4>
        <div className="distribution-chart">
          {Object.entries(stats.typeDistribution).map(([type, count]) => {
            const percentage = stats.totalSent > 0 ? (count / stats.totalSent) * 100 : 0;
            const color = NOTIFICATION_TYPE_COLORS[type as NotificationType];
            
            return (
              <div key={type} className="distribution-item">
                <div className="distribution-label">
                  <span 
                    className="color-dot"
                    style={{ backgroundColor: color }}
                  />
                  {NOTIFICATION_TYPE_LABELS[type as NotificationType]}
                </div>
                <div className="distribution-bar">
                  <div 
                    className="bar-fill"
                    style={{ 
                      width: `${percentage}%`,
                      backgroundColor: color
                    }}
                  />
                </div>
                <div className="distribution-count">
                  {count}개 ({percentage.toFixed(1)}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 알림 템플릿 관리 컴포넌트
export const NotificationTemplates = ({ 
  templates, 
  onSaveTemplate, 
  onUseTemplate 
}: { 
  templates: NotificationTemplate[];
  onSaveTemplate: (template: { name: string; title: string; content: string; type: NotificationType }) => void;
  onUseTemplate: (template: NotificationTemplate) => void;
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    title: '',
    content: '',
    type: 'announcement' as NotificationType
  });

  const handleSave = () => {
    if (!newTemplate.name.trim() || !newTemplate.title.trim() || !newTemplate.content.trim()) {
      alert('모든 필드를 입력해주세요.');
      return;
    }

    onSaveTemplate(newTemplate);
    setNewTemplate({ name: '', title: '', content: '', type: 'announcement' });
    setIsCreating(false);
  };

  const getTypeDisplay = (template: NotificationTemplate) => {
    const Icon = getNotificationTypeIcon(template.type);
    const color = NOTIFICATION_TYPE_COLORS[template.type];
    
    return (
      <span 
        className="type-badge"
        style={{ backgroundColor: color }}
      >
        <Icon size={12} />
        {NOTIFICATION_TYPE_LABELS[template.type]}
      </span>
    );
  };

  return (
    <div className="notification-templates">
      <div className="templates-header">
        <h4>알림 템플릿</h4>
        <button 
          onClick={() => setIsCreating(true)}
          className="btn btn-primary btn-sm"
        >
          <Plus size={16} />
          새 템플릿
        </button>
      </div>

      <div className="templates-grid">
        {templates.map(template => (
          <div key={template.id} className="template-card">
            <div className="template-header">
              <div className="template-type">
                {getTypeDisplay(template)}
              </div>
              <div className="template-usage">
                사용 {template.usageCount}회
              </div>
            </div>

            <div className="template-content">
              <h5>{template.name}</h5>
              <p className="template-title">{template.title}</p>
              <p className="template-preview">
                {template.content.substring(0, 100)}...
              </p>
            </div>

            <div className="template-actions">
              <button 
                onClick={() => onUseTemplate(template)}
                className="btn btn-primary btn-sm"
              >
                사용하기
              </button>
            </div>
          </div>
        ))}
      </div>

      {isCreating && (
        <div className="modal-overlay">
          <div className="modal-content template-create-modal">
            <div className="modal-header">
              <h3>새 템플릿 만들기</h3>
              <button onClick={() => setIsCreating(false)} className="close-btn">×</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>템플릿 이름</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  className="form-input"
                  placeholder="템플릿 이름을 입력하세요"
                />
              </div>

              <div className="form-group">
                <label>알림 유형</label>
                <select 
                  value={newTemplate.type} 
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, type: e.target.value as NotificationType }))}
                  className="form-select"
                >
                  {Object.entries(NOTIFICATION_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>제목</label>
                <input
                  type="text"
                  value={newTemplate.title}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, title: e.target.value }))}
                  className="form-input"
                  placeholder="알림 제목을 입력하세요"
                />
              </div>

              <div className="form-group">
                <label>내용</label>
                <textarea
                  value={newTemplate.content}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                  className="form-textarea"
                  placeholder="알림 내용을 입력하세요"
                  rows={6}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setIsCreating(false)} className="btn btn-secondary">
                취소
              </button>
              <button onClick={handleSave} className="btn btn-primary">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 