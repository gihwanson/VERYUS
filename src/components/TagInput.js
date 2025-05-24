import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { collection, query as firestoreQuery, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import Avatar from './Avatar';

const TagInput = ({ 
  value, 
  onChange, 
  onTag, 
  placeholder, 
  darkMode,
  maxLength,
  style 
}) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tagStartIndex, setTagStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // 랜덤 사용자 3명 가져오기
  const getRandomUsers = async () => {
    try {
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      const allUsers = snapshot.docs.map(doc => ({
        nickname: doc.data().nickname,
        profilePic: doc.data().profilePic,
        grade: doc.data().grade
      }));
      
      // 랜덤으로 3명 선택
      const shuffled = allUsers.sort(() => 0.5 - Math.random());
      const randomUsers = shuffled.slice(0, 3);
      
      setSuggestions(randomUsers);
      setSelectedIndex(0);
    } catch (error) {
      console.error("랜덤 사용자 가져오기 오류:", error);
      setSuggestions([]);
    }
  };

  // 사용자 검색 함수
  const searchUsers = async (searchText) => {
    if (!searchText.trim()) {
      // 빈 검색어일 경우 랜덤 추천
      await getRandomUsers();
      return;
    }

    try {
      const usersRef = collection(db, "users");
      const q = firestoreQuery(usersRef,
        where("nickname", ">=", searchText),
        where("nickname", "<=", searchText + '\uf8ff'),
        orderBy("nickname"),
        limit(5)
      );

      const snapshot = await getDocs(q);
      const users = snapshot.docs.map(doc => ({
        nickname: doc.data().nickname,
        profilePic: doc.data().profilePic,
        grade: doc.data().grade
      }));

      setSuggestions(users);
      setSelectedIndex(0);
    } catch (error) {
      console.error("사용자 검색 중 오류:", error);
      setSuggestions([]);
    }
  };

  // 입력 변경 핸들러
  const handleInputChange = (e) => {
    const text = e.target.value;
    const lastAtIndex = text.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const query = text.slice(lastAtIndex + 1).split(' ')[0];
      setTagStartIndex(lastAtIndex);
      setSearchQuery(query);
      setShowSuggestions(true);
      searchUsers(query);
    } else {
      setShowSuggestions(false);
    }
    
    onChange(text);
  };

  // @ 입력 감지
  const handleKeyPress = (e) => {
    if (e.key === '@') {
      setTagStartIndex(e.target.selectionStart);
      setShowSuggestions(true);
      getRandomUsers();
    }
  };

  // 태그 선택 핸들러
  const handleTagSelect = (username) => {
    const textBeforeTag = value.slice(0, tagStartIndex);
    const textAfterTag = value.slice(tagStartIndex + searchQuery.length + 1);
    const newText = textBeforeTag + `@${username} ` + textAfterTag;
    
    onChange(newText);
    onTag(username);
    setShowSuggestions(false);
    setSearchQuery('');
    
    // 커서 위치 조정
    const newCursorPosition = textBeforeTag.length + username.length + 2;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  };

  // 키보드 네비게이션
  const handleKeyDown = (e) => {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
      case 'Enter':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          handleTagSelect(suggestions[selectedIndex].nickname);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  };

  // 클릭 이벤트 감지
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={{ position: 'relative', boxSizing: 'border-box', ...style }}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: '12px',
          borderRadius: '8px',
          border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
          backgroundColor: darkMode ? '#2a2a2a' : '#fff',
          color: darkMode ? '#e0e0e0' : '#333',
          fontSize: '16px',
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          lineHeight: '1.5',
          '@media (max-width: 768px)': {
            fontSize: '16px',
            padding: '10px',
            minHeight: '80px'
          }
        }}
        data-dark-mode={darkMode}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '100%',
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: darkMode ? '#333' : '#fff',
            border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
            borderRadius: '8px',
            boxShadow: `0 2px 8px ${darkMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.1)'}`,
            zIndex: 1000,
            marginTop: '4px',
            boxSizing: 'border-box'
          }}
          data-dark-mode={darkMode}
        >
          {suggestions.map((user, index) => (
            <div
              key={user.nickname}
              onClick={() => handleTagSelect(user.nickname)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex 
                  ? (darkMode ? '#444' : '#f0f0f0') 
                  : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.2s',
                color: darkMode ? '#e0e0e0' : '#333'
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              data-dark-mode={darkMode}
            >
              <Avatar 
                src={user.profilePic} 
                size={24} 
                alt={user.nickname}
                darkMode={darkMode}
              />
              <span style={{ flex: 1 }}>{user.nickname}</span>
              {user.grade && (
                <span style={{ 
                  fontSize: '12px',
                  color: darkMode ? '#aaa' : '#666',
                  backgroundColor: darkMode ? '#444' : '#f0f0f0',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  {user.grade}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

TagInput.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onTag: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  darkMode: PropTypes.bool,
  maxLength: PropTypes.number,
  style: PropTypes.object
};

TagInput.defaultProps = {
  placeholder: '',
  darkMode: false,
  style: {}
};

export default TagInput; 