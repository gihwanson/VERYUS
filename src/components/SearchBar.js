// SearchBar.js

import React, { useState } from "react";
import PropTypes from "prop-types";
import { darkInputStyle, inputStyle, purpleBtn } from "../components/style";

function SearchBar({ darkMode, onSearch }) {
  const [k, setK] = useState("");
  
  const go = () => onSearch(k);
  
  const onKey = e => e.key === "Enter" && go();
  
  return (
    <div style={{ margin: "20px 0" }}>
      <input
        value={k}
        onChange={e => setK(e.target.value)}
        onKeyDown={onKey}
        placeholder="검색"
        style={darkMode ? darkInputStyle : inputStyle}
      />
      <button onClick={go} style={purpleBtn}>검색</button>
    </div>
  );
}

// Props 검증 추가
SearchBar.propTypes = {
  darkMode: PropTypes.bool,
  onSearch: PropTypes.func.isRequired
};

// 기본값 설정
SearchBar.defaultProps = {
  darkMode: false
};

export default SearchBar;
