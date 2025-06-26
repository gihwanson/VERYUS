import React from 'react';

interface AdminUser {
  uid: string;
  profileImageUrl?: string;
  // ...필요시 다른 필드 추가
}

const AdminUserList: React.FC<{ user: AdminUser }> = ({ user }) => (
  <img
    src={user.profileImageUrl || '/default-profile.png'}
    alt="프로필"
    className="admin-user-profile-img"
  />
);

export default AdminUserList; 