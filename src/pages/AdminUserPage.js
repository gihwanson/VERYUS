import React, { useState, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAdminUsers } from '../hooks/useAdminUsers';
import UserTable from '../components/admin/UserTable';
import {
  Container,
  Header,
  Title,
  Controls,
  SearchInput,
  Button,
  Select,
  Alert
} from '../styles/AdminUserStyles';
import {
  FILTER_OPTIONS,
  SORT_OPTIONS,
  BULK_ACTIONS,
  GRADES,
  ROLES
} from '../constants/adminConstants';

function AdminUserPage({ darkMode, setGrades }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('nickname');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [bulkAction, setBulkAction] = useState('');
  const [bulkGrade, setBulkGrade] = useState('🍒');
  const [bulkRole, setBulkRole] = useState('일반');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('');

  const {
    users,
    loading,
    loadingMore,
    hasMore,
    error,
    userCount,
    loadMoreUsers,
    updateUser,
    deleteUser,
    bulkUpdateUsers
  } = useAdminUsers(activeFilter, sortBy, sortDirection);

  // 검색된 사용자 목록
  const filteredUsers = users.filter(user => 
    searchTerm ? (
      (user.nickname && user.nickname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : true
  );

  // 등급 정보 업데이트
  useEffect(() => {
    if (setGrades && users.length > 0) {
      const gradeMap = {};
      users.forEach(user => {
        if (user.nickname && user.grade) {
          gradeMap[user.nickname] = user.grade;
        }
      });
      setGrades(gradeMap);
    }
  }, [users, setGrades]);

  // 정렬 방향 토글
  const toggleSortDirection = useCallback(() => {
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  // 필터 변경
  const handleFilterChange = useCallback((filter) => {
    setActiveFilter(filter);
    setSelectedUsers([]);
  }, []);

  // 사용자 선택
  const toggleUserSelection = useCallback((userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }, []);

  // 전체 선택
  const toggleSelectAll = useCallback(() => {
    setSelectedUsers(prev => 
      prev.length === filteredUsers.length
        ? []
        : filteredUsers.map(user => user.id)
    );
  }, [filteredUsers]);

  // 일괄 작업 실행
  const executeBulkAction = useCallback(async () => {
    if (!selectedUsers.length) {
      setAlertMessage('선택된 사용자가 없습니다');
      setAlertType('warning');
      return;
    }

    try {
      switch (bulkAction) {
        case 'grade':
          await bulkUpdateUsers(selectedUsers, { grade: bulkGrade });
          setAlertMessage('등급이 일괄 변경되었습니다');
          break;
        case 'role':
          await bulkUpdateUsers(selectedUsers, { role: bulkRole });
          setAlertMessage('직책이 일괄 변경되었습니다');
          break;
        case 'delete':
          // 삭제는 개별적으로 처리
          await Promise.all(selectedUsers.map(id => deleteUser(id)));
          setAlertMessage('선택된 사용자들이 삭제되었습니다');
          break;
        default:
          setAlertMessage('선택된 작업이 없습니다');
          setAlertType('warning');
          return;
      }
      setAlertType('success');
      setSelectedUsers([]);
    } catch (err) {
      setAlertMessage('작업 중 오류가 발생했습니다');
      setAlertType('error');
    }
  }, [selectedUsers, bulkAction, bulkGrade, bulkRole, bulkUpdateUsers, deleteUser]);

  // 스크롤 이벤트 처리 개선
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY;
      const clientHeight = window.innerHeight;

      // 하단에서 100px 전에 로드 시작
      if (scrollHeight - scrollTop - clientHeight < 100) {
        if (hasMore && !loadingMore) {
          loadMoreUsers();
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, loadMoreUsers]);

  // 수동으로 더 보기
  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      loadMoreUsers();
    }
  };

  // 스타일 정의
  const styles = {
    container: {
      maxWidth: 1200,
      margin: '40px auto',
      padding: '30px',
      background: darkMode ? '#2d2d30' : '#f3e7ff',
      borderRadius: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      color: darkMode ? '#e4e4e4' : '#333'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '24px',
      padding: '20px',
      background: darkMode ? '#363639' : '#fff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
    },
    title: {
      color: darkMode ? '#bb86fc' : '#7e57c2',
      margin: 0,
      fontSize: '24px',
      fontWeight: 'bold'
    },
    controls: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      flexWrap: 'wrap'
    },
    searchInput: {
      padding: '10px 16px',
      borderRadius: '8px',
      border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`,
      background: darkMode ? '#3a3a3d' : '#fff',
      color: darkMode ? '#e4e4e4' : '#333',
      minWidth: '240px',
      fontSize: '14px'
    },
    select: {
      padding: '10px 12px',
      borderRadius: '8px',
      border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`,
      background: darkMode ? '#3a3a3d' : '#fff',
      color: darkMode ? '#e4e4e4' : '#333',
      cursor: 'pointer',
      fontSize: '14px'
    },
    button: {
      padding: '10px 16px',
      borderRadius: '8px',
      border: 'none',
      background: darkMode ? '#bb86fc' : '#7e57c2',
      color: darkMode ? '#000' : '#fff',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      transition: 'all 0.2s ease'
    },
    bulkControls: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      padding: '16px',
      background: darkMode ? '#363639' : '#f9f4ff',
      borderRadius: '12px',
      marginBottom: '20px',
      flexWrap: 'wrap'
    },
    alert: {
      padding: '12px 16px',
      borderRadius: '8px',
      marginBottom: '16px',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    alertSuccess: {
      background: darkMode ? 'rgba(76, 175, 80, 0.1)' : 'rgba(76, 175, 80, 0.1)',
      color: darkMode ? '#81c784' : '#2e7d32',
      border: `1px solid ${darkMode ? '#2e7d32' : '#81c784'}`
    },
    alertError: {
      background: darkMode ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.1)',
      color: darkMode ? '#e57373' : '#d32f2f',
      border: `1px solid ${darkMode ? '#d32f2f' : '#e57373'}`
    },
    alertWarning: {
      background: darkMode ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255, 152, 0, 0.1)',
      color: darkMode ? '#ffb74d' : '#f57c00',
      border: `1px solid ${darkMode ? '#f57c00' : '#ffb74d'}`
    },
    loadingIndicator: {
      textAlign: 'center',
      padding: '20px',
      color: darkMode ? '#bb86fc' : '#7e57c2',
      fontSize: '14px'
    }
  };

  // 로딩 인디케이터 스타일 추가
  const loadingStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    color: darkMode ? '#bb86fc' : '#7e57c2',
    gap: '10px'
  };

  const loadMoreButtonStyle = {
    ...styles.button,
    margin: '20px auto',
    display: 'block',
    width: 'auto',
    padding: '12px 24px'
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>👥 사용자 관리 ({userCount}명)</h1>
        <div style={styles.controls}>
          <input
            type="text"
            placeholder="닉네임 또는 이메일 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <select
            value={activeFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={styles.select}
          >
            {FILTER_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.select}
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={toggleSortDirection}
            style={{...styles.button, padding: '10px 12px'}}
          >
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {alertMessage && (
        <div style={{
          ...styles.alert,
          ...(alertType === 'success' ? styles.alertSuccess :
             alertType === 'error' ? styles.alertError :
             styles.alertWarning)
        }}>
          {alertType === 'success' && '✅'}
          {alertType === 'error' && '⚠️'}
          {alertType === 'warning' && '⚡'}
          {alertMessage}
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div style={styles.bulkControls}>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            style={styles.select}
          >
            <option value="">일괄 작업 선택...</option>
            {BULK_ACTIONS.map(action => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </select>
          
          {bulkAction === 'grade' && (
            <select
              value={bulkGrade}
              onChange={(e) => setBulkGrade(e.target.value)}
              style={styles.select}
            >
              {GRADES.map(grade => (
                <option key={grade.value} value={grade.value}>
                  {grade.label}
                </option>
              ))}
            </select>
          )}
          
          {bulkAction === 'role' && (
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              style={styles.select}
            >
              {ROLES.map(role => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          )}
          
          <button
            onClick={executeBulkAction}
            disabled={!bulkAction}
            style={{
              ...styles.button,
              opacity: !bulkAction ? 0.6 : 1,
              cursor: !bulkAction ? 'not-allowed' : 'pointer'
            }}
          >
            적용
          </button>
        </div>
      )}

      <UserTable
        users={filteredUsers}
        selectedUsers={selectedUsers}
        onSelect={toggleUserSelection}
        onSelectAll={toggleSelectAll}
        onEdit={updateUser}
        darkMode={darkMode}
        loading={loading}
      />

      {loadingMore && (
        <div style={loadingStyle}>
          <span className="loading-spinner"></span>
          데이터를 불러오는 중...
        </div>
      )}

      {hasMore && !loadingMore && (
        <button 
          onClick={handleLoadMore}
          style={loadMoreButtonStyle}
        >
          더 보기 ({userCount - filteredUsers.length}명 남음)
        </button>
      )}

      {error && (
        <div style={{
          ...styles.alert,
          ...styles.alertError
        }}>
          ⚠️ {error}
        </div>
      )}

      <style jsx>{`
        .loading-spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 2px solid ${darkMode ? '#bb86fc' : '#7e57c2'};
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

AdminUserPage.propTypes = {
  darkMode: PropTypes.bool.isRequired,
  setGrades: PropTypes.func
};

export default AdminUserPage;
