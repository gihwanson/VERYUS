import React from 'react';
import { User } from 'lucide-react';
import type { AdminUser } from './AdminTypes';

interface AdminUserListProps {
  user: AdminUser;
  size?: 'small' | 'medium' | 'large';
  showName?: boolean;
  onClick?: () => void;
}

const AdminUserList: React.FC<AdminUserListProps> = ({ 
  user, 
  size = 'medium', 
  showName = false,
  onClick 
}) => {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16'
  };

  return (
    <div 
      className={`flex items-center gap-2 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-200 flex items-center justify-center`}>
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt={`${user.nickname}의 프로필`}
            className="w-full h-full object-cover"
          />
        ) : (
          <User size={size === 'small' ? 16 : size === 'medium' ? 24 : 32} className="text-gray-500" />
        )}
      </div>
      {showName && (
        <span className="text-sm font-medium">{user.nickname}</span>
      )}
    </div>
  );
};

export default AdminUserList; 