import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

const TaggedText = ({ text, darkMode }) => {
  const renderTaggedText = () => {
    // text가 없거나 undefined인 경우 빈 문자열 반환
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    // @username 패턴을 찾아서 분리
    return text.split(/(@[a-zA-Z0-9_]+)/).map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.slice(1);
        return (
          <Link 
            key={index}
            to={`/userpage/${username}`}
            style={{
              color: darkMode ? '#bb86fc' : '#7e57c2',
              textDecoration: 'none',
              fontWeight: 'bold',
              padding: '0 2px',
              borderRadius: '3px',
              backgroundColor: darkMode ? 'rgba(187, 134, 252, 0.1)' : 'rgba(126, 87, 194, 0.1)',
              transition: 'background-color 0.2s',
              ':hover': {
                backgroundColor: darkMode ? 'rgba(187, 134, 252, 0.2)' : 'rgba(126, 87, 194, 0.2)'
              }
            }}
          >
            {part}
          </Link>
        );
      }
      return part;
    });
  };

  return (
    <span style={{
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      {renderTaggedText()}
    </span>
  );
};

TaggedText.propTypes = {
  text: PropTypes.string,
  darkMode: PropTypes.bool
};

TaggedText.defaultProps = {
  text: '',
  darkMode: false
};

export default TaggedText; 