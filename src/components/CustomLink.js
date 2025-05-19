import React from 'react';
import { Link } from 'react-router-dom';

const CustomLink = ({ to, children, className, style, onClick }) => {  // => 다음에 { 추가
  return (
    <Link 
      to={to} 
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </Link>
  );
};

export default CustomLink;
