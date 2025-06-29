import React from 'react';
import { Crown, Shield, User, Users, Activity, CheckCircle, X, Edit3 } from 'lucide-react';
import type { AdminUser } from './AdminTypes';
import { formatDate, getGradeDisplay, calculateActivityDays, createRoleDisplay, createRoleIcon } from './AdminUtils';

// 로딩 컴포넌트
export const LoadingSpinner: React.FC = () => (
  <div className="loading-container">
    <div className="loading-spinner">
      <div className="orbital-loading">
        <div className="loading-sun">☀️</div>
        <div className="loading-planet loading-planet-1">🍎</div>
        <div className="loading-planet loading-planet-2">🍈</div>
        <div className="loading-planet loading-planet-3">🍉</div>
        <div className="loading-planet loading-planet-4">🥝</div>
        <div className="loading-planet loading-planet-5">🫐</div>
        <div className="loading-planet loading-planet-6">🍒</div>
      </div>
    </div>
    <h2>관리자 패널 로딩 중...</h2>
    <p>사용자 데이터를 불러오고 있습니다.</p>
  </div>
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
    <div className="stat-icon">{icon}</div>
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
  editingUser,
  onEditChange
}) => (
  <div className={`user-card ${isEditing ? 'edit-mode' : ''}`}>
    <div className="profile-avatar large">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="프로필" />
      ) : (
        <User size={28} />
      )}
    </div>
    <div className="user-name-row">
      <span className="nickname-text">{user.nickname}</span>
      <span className="grade-badge">{user.grade}</span>
      <span className="role-badge">{user.role}</span>
    </div>
    <div className="user-meta">
      가입: {formatDate(user.createdAt)} / 활동: {calculateActivityDays(user.createdAt)}일
    </div>
    <div className="user-actions">
      {!isEditing ? (
        <>
          <button className="action-btn view-btn" onClick={onView}><CheckCircle size={14}/>상세</button>
          <button className="action-btn edit-btn" onClick={onEdit}><Edit3 size={14}/>수정</button>
          <button className="action-btn delete-btn" onClick={onDelete}><X size={14}/>삭제</button>
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
            className="edit-input nickname-input"
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