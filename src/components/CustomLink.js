import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';

const CustomLink = ({
  to,
  children,
  className = '',
  style = {},
  onClick,
  isExternal = false,
  activeClassName = '',
  activeStyle = {},
  openInNewTab = false,
  ariaLabel,
  replace = false,
  state = null,
  preventScrollReset = false,
  ...rest
}) => {
  const location = useLocation();
  
  // 현재 경로와 링크 경로 비교하여 활성 상태 확인
  const isActive = location.pathname === to;
  
  // 활성 상태에 따른 클래스와 스타일 적용
  const combinedClassName = isActive ? `${className} ${activeClassName}`.trim() : className;
  const combinedStyle = isActive ? { ...style, ...activeStyle } : style;
  
  // 외부 링크 처리 (http://, https://, mailto: 등으로 시작하는 링크)
  const isExternalLink = isExternal || 
    (typeof to === 'string' && (to.startsWith('http') || to.startsWith('mailto:')));

  // 외부 링크인 경우 일반 a 태그 사용
  if (isExternalLink) {
    return (
      <a
        href={to}
        className={combinedClassName}
        style={combinedStyle}
        onClick={onClick}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </a>
    );
  }

  // 내부 링크인 경우 React Router의 Link 컴포넌트 사용
  return (
    <Link
      to={to}
      className={combinedClassName}
      style={combinedStyle}
      onClick={onClick}
      aria-label={ariaLabel}
      replace={replace}
      state={state}
      preventScrollReset={preventScrollReset}
      {...rest}
    >
      {children}
    </Link>
  );
};

// PropTypes 정의
CustomLink.propTypes = {
  to: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object
  ]).isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  onClick: PropTypes.func,
  isExternal: PropTypes.bool,
  activeClassName: PropTypes.string,
  activeStyle: PropTypes.object,
  openInNewTab: PropTypes.bool,
  ariaLabel: PropTypes.string,
  replace: PropTypes.bool,
  state: PropTypes.object,
  preventScrollReset: PropTypes.bool
};

// 기본 Props 정의
CustomLink.defaultProps = {
  className: '',
  style: {},
  onClick: () => {},
  isExternal: false,
  activeClassName: '',
  activeStyle: {},
  openInNewTab: false,
  replace: false,
  state: null,
  preventScrollReset: false
};

export default CustomLink;
