import React, { memo } from 'react';
import PropTypes from 'prop-types';
import { GRADES, ROLES } from '../../constants/adminConstants';

const UserTable = memo(({
  users,
  selectedUsers,
  onSelect,
  onSelectAll,
  onEdit,
  darkMode,
  loading
}) => {
  const styles = {
    table: {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: '0 8px',
      fontSize: '14px'
    },
    thead: {
      background: darkMode ? '#363639' : '#f9f4ff',
      color: darkMode ? '#bb86fc' : '#7e57c2'
    },
    th: {
      padding: '12px 16px',
      textAlign: 'left',
      fontWeight: 'bold',
      borderBottom: `2px solid ${darkMode ? '#555' : '#e0e0e0'}`
    },
    tr: {
      background: darkMode ? '#2d2d30' : '#fff',
      transition: 'all 0.2s ease'
    },
    trHover: {
      background: darkMode ? '#363639' : '#f3e7ff'
    },
    td: {
      padding: '12px 16px',
      borderTop: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`,
      borderBottom: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`
    },
    tdFirst: {
      borderLeft: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`,
      borderTopLeftRadius: '8px',
      borderBottomLeftRadius: '8px'
    },
    tdLast: {
      borderRight: `1px solid ${darkMode ? '#444' : '#e0e0e0'}`,
      borderTopRightRadius: '8px',
      borderBottomRightRadius: '8px'
    },
    checkbox: {
      width: '16px',
      height: '16px',
      cursor: 'pointer',
      accentColor: darkMode ? '#bb86fc' : '#7e57c2'
    },
    select: {
      padding: '6px 10px',
      borderRadius: '6px',
      border: `1px solid ${darkMode ? '#555' : '#e0e0e0'}`,
      background: darkMode ? '#363639' : '#fff',
      color: darkMode ? '#e4e4e4' : '#333',
      cursor: 'pointer',
      fontSize: '12px',
      width: '100%',
      maxWidth: '150px'
    },
    nickname: {
      color: darkMode ? '#e4e4e4' : '#333',
      fontWeight: 'bold'
    },
    date: {
      color: darkMode ? '#aaa' : '#666',
      fontSize: '12px'
    }
  };

  const handleEditGrade = (userId, newGrade) => {
    onEdit(userId, { grade: newGrade });
  };

  const handleEditRole = (userId, newRole) => {
    onEdit(userId, { role: newRole });
  };

  const handleEditNickname = (userId, newNickname) => {
    onEdit(userId, { nickname: newNickname });
  };

  return (
    <table style={styles.table}>
      <thead style={styles.thead}>
        <tr>
          <th style={styles.th}>
            <input
              type="checkbox"
              checked={selectedUsers.length === users.length}
              onChange={onSelectAll}
              style={styles.checkbox}
              disabled={loading}
            />
          </th>
          <th style={styles.th}>닉네임</th>
          <th style={styles.th}>등급</th>
          <th style={styles.th}>역할</th>
          <th style={styles.th}>가입일</th>
        </tr>
      </thead>
      <tbody>
        {users.map(user => (
          <tr 
            key={user.id}
            style={styles.tr}
            onMouseEnter={e => e.currentTarget.style.background = darkMode ? '#363639' : '#f3e7ff'}
            onMouseLeave={e => e.currentTarget.style.background = darkMode ? '#2d2d30' : '#fff'}
          >
            <td style={{...styles.td, ...styles.tdFirst}}>
              <input
                type="checkbox"
                checked={selectedUsers.includes(user.id)}
                onChange={() => onSelect(user.id)}
                style={styles.checkbox}
                disabled={loading}
              />
            </td>
            <td style={styles.td}>
              <input
                type="text"
                value={user.nickname || ''}
                onChange={(e) => handleEditNickname(user.id, e.target.value)}
                style={{
                  ...styles.select,
                  border: 'none',
                  background: 'transparent',
                  padding: '2px 4px'
                }}
                disabled={loading}
              />
            </td>
            <td style={styles.td}>
              <select
                value={user.grade || ''}
                onChange={(e) => handleEditGrade(user.id, e.target.value)}
                style={styles.select}
                disabled={loading}
              >
                <option value="">등급 선택</option>
                {GRADES.map(grade => (
                  <option key={grade.value} value={grade.value}>
                    {grade.label}
                  </option>
                ))}
              </select>
            </td>
            <td style={styles.td}>
              <select
                value={user.role || ''}
                onChange={(e) => handleEditRole(user.id, e.target.value)}
                style={styles.select}
                disabled={loading}
              >
                <option value="">역할 선택</option>
                {ROLES.map(role => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </td>
            <td style={{...styles.td, ...styles.tdLast, ...styles.date}}>
              {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() : '알 수 없음'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});

UserTable.propTypes = {
  users: PropTypes.array.isRequired,
  selectedUsers: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
  onSelectAll: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  darkMode: PropTypes.bool.isRequired,
  loading: PropTypes.bool
};

UserTable.displayName = 'UserTable';

export default UserTable; 