import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: ReactNode;
}

/** 모달을 document.body에 렌더해 스크롤/transform 조상 영향 없이 화면 중앙에 고정 */
const ModalPortal = ({ children }: ModalPortalProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};

export default ModalPortal;
