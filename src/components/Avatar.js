import React, { useState } from "react";
import PropTypes from "prop-types";
import DEFAULT_AVATAR from "../assets/default-avatar.png";

function Avatar({ 
  src, 
  size = 24, 
  alt = "", 
  border = false, 
  borderColor = "#7e57c2", 
  borderWidth = 2,
  clickable = false,
  onClick,
  status = null // 'online', 'offline', 'away', 'busy' 등
}) {
  const [imgError, setImgError] = useState(false);

  // 이미지 로드 실패 시 기본 이미지로 대체
  const handleError = () => {
    setImgError(true);
  };

  // 상태 표시 색상
  const getStatusColor = () => {
    switch(status) {
      case 'online': return '#4caf50';
      case 'offline': return '#9e9e9e';
      case 'away': return '#ff9800';
      case 'busy': return '#f44336';
      default: return null;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        cursor: clickable ? 'pointer' : 'default',
        width: size,
        height: size
      }}
      onClick={clickable && onClick ? onClick : undefined}
      title={alt}
    >
      <img
        src={imgError || !src ? DEFAULT_AVATAR : src}
        alt={alt}
        onError={handleError}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: border ? `${borderWidth}px solid ${borderColor}` : 'none',
          transition: 'transform 0.2s ease-in-out',
          ...(clickable ? {
            ':hover': {
              transform: 'scale(1.05)'
            }
          } : {})
        }}
      />

      {/* 상태 표시 아이콘 */}
      {status && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: size / 4,
            height: size / 4,
            minWidth: 8,
            minHeight: 8,
            borderRadius: '50%',
            background: getStatusColor(),
            border: '2px solid white',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.1)'
          }}
        />
      )}
    </div>
  );
}

Avatar.propTypes = {
  src: PropTypes.string,
  size: PropTypes.number,
  alt: PropTypes.string,
  border: PropTypes.bool,
  borderColor: PropTypes.string,
  borderWidth: PropTypes.number,
  clickable: PropTypes.bool,
  onClick: PropTypes.func,
  status: PropTypes.oneOf(['online', 'offline', 'away', 'busy', null])
};

export default Avatar;
