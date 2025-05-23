// SearchBar.js

import React, { useState } from 'react';
import PropTypes from "prop-types";
import './SearchBar.css';  // CSS 파일 import

function SearchBar({ darkMode, onSearch, placeholder }) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    onSearch(value);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onSearch(searchTerm);
    }
  };
  
  return (
    <div className={`search-bar-container ${darkMode ? 'dark' : ''}`}>
      <div className="search-input-wrapper">
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearch}
          onKeyPress={handleKeyPress}
          placeholder={placeholder || "검색어를 입력하세요..."}
          className="search-input"
        />
        <button 
          onClick={() => onSearch(searchTerm)} 
          className={`search-button ${darkMode ? 'dark' : ''}`}
        >
          🔍
        </button>
      </div>
    </div>
  );
}

// Props 검증 추가
SearchBar.propTypes = {
  darkMode: PropTypes.bool,
  onSearch: PropTypes.func.isRequired,
  placeholder: PropTypes.string
};

// 기본값 설정
SearchBar.defaultProps = {
  darkMode: false
};

export default SearchBar;
