import React, { useState, useRef, useCallback } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  fallbackSrc?: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
  placeholder?: string;
}

const LazyImage: React.FC<LazyImageProps> = React.memo(({
  src,
  alt,
  fallbackSrc = '/default_cover.png',
  className,
  style,
  onLoad,
  onError,
  placeholder
}) => {
  const [imageSrc, setImageSrc] = useState<string>(placeholder || '');
  const [imageError, setImageError] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // 이미지 로드 성공 처리
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  // 이미지 로드 실패 처리
  const handleError = useCallback(() => {
    if (!imageError && fallbackSrc) {
      setImageSrc(fallbackSrc);
      setImageError(true);
    }
    onError?.();
  }, [imageError, fallbackSrc, onError]);

  // Intersection Observer를 사용한 lazy loading
  React.useEffect(() => {
    if (!imgRef.current || imageSrc === src) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: '50px'
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, imageSrc]);

  return (
    <div 
      className={className}
      style={{
        ...style,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#F6F2FF'
      }}
    >
      {/* 로딩 플레이스홀더 */}
      {!isLoaded && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#F6F2FF',
            color: '#8A55CC',
            fontSize: '12px',
            fontWeight: '500',
            zIndex: 1
          }}
        >
          {placeholder ? '' : '📷'}
        </div>
      )}
      
      {/* 실제 이미지 */}
      <img
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transition: 'opacity 0.3s ease',
          opacity: isLoaded ? 1 : 0,
          ...style
        }}
        loading="lazy"
      />
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

export default LazyImage; 