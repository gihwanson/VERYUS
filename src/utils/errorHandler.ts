import { toast } from 'react-toastify';

export interface ErrorInfo {
  code?: string;
  message: string;
  userFriendlyMessage: string;
  severity: 'error' | 'warning' | 'info';
}

// 에러 코드별 사용자 친화적 메시지
const ERROR_MESSAGES: Record<string, ErrorInfo> = {
  // 인증 관련 에러
  'auth/user-not-found': {
    code: 'auth/user-not-found',
    message: 'User not found',
    userFriendlyMessage: '존재하지 않는 사용자입니다.',
    severity: 'error'
  },
  'auth/wrong-password': {
    code: 'auth/wrong-password',
    message: 'Wrong password',
    userFriendlyMessage: '비밀번호가 올바르지 않습니다.',
    severity: 'error'
  },
  'auth/too-many-requests': {
    code: 'auth/too-many-requests',
    message: 'Too many requests',
    userFriendlyMessage: '너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.',
    severity: 'warning'
  },
  'auth/network-request-failed': {
    code: 'auth/network-request-failed',
    message: 'Network request failed',
    userFriendlyMessage: '네트워크 연결을 확인해주세요.',
    severity: 'error'
  },
  
  // 데이터베이스 관련 에러
  'firestore/permission-denied': {
    code: 'firestore/permission-denied',
    message: 'Permission denied',
    userFriendlyMessage: '접근 권한이 없습니다.',
    severity: 'error'
  },
  'firestore/unavailable': {
    code: 'firestore/unavailable',
    message: 'Service unavailable',
    userFriendlyMessage: '서비스가 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.',
    severity: 'error'
  },
  
  // 파일 업로드 관련 에러
  'storage/unauthorized': {
    code: 'storage/unauthorized',
    message: 'Unauthorized',
    userFriendlyMessage: '파일 업로드 권한이 없습니다.',
    severity: 'error'
  },
  'storage/canceled': {
    code: 'storage/canceled',
    message: 'Upload canceled',
    userFriendlyMessage: '파일 업로드가 취소되었습니다.',
    severity: 'info'
  },
  'storage/quota-exceeded': {
    code: 'storage/quota-exceeded',
    message: 'Quota exceeded',
    userFriendlyMessage: '저장 공간이 부족합니다.',
    severity: 'error'
  },
  
  // 일반적인 에러
  'validation/required-field': {
    code: 'validation/required-field',
    message: 'Required field missing',
    userFriendlyMessage: '필수 항목을 입력해주세요.',
    severity: 'warning'
  },
  'validation/invalid-format': {
    code: 'validation/invalid-format',
    message: 'Invalid format',
    userFriendlyMessage: '올바른 형식으로 입력해주세요.',
    severity: 'warning'
  },
  'network/timeout': {
    code: 'network/timeout',
    message: 'Request timeout',
    userFriendlyMessage: '요청 시간이 초과되었습니다. 다시 시도해주세요.',
    severity: 'error'
  },
  'unknown': {
    code: 'unknown',
    message: 'Unknown error',
    userFriendlyMessage: '예상치 못한 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    severity: 'error'
  }
};

// 에러 처리 함수
export const handleError = (error: any, context?: string): ErrorInfo => {
  console.error(`[${context || 'Unknown'}] Error:`, error);
  
  let errorInfo: ErrorInfo;
  
  // Firebase 에러 처리
  if (error?.code && ERROR_MESSAGES[error.code]) {
    errorInfo = ERROR_MESSAGES[error.code];
  }
  // 일반 에러 처리
  else if (error?.message) {
    errorInfo = {
      message: error.message,
      userFriendlyMessage: error.message.includes('network') || error.message.includes('Network') 
        ? '네트워크 연결을 확인해주세요.'
        : '오류가 발생했습니다. 다시 시도해주세요.',
      severity: 'error'
    };
  }
  // 알 수 없는 에러
  else {
    errorInfo = ERROR_MESSAGES['unknown'];
  }
  
  return errorInfo;
};

// 토스트 메시지로 에러 표시
export const showErrorToast = (error: any, context?: string) => {
  const errorInfo = handleError(error, context);
  
  switch (errorInfo.severity) {
    case 'error':
      toast.error(`❌ ${errorInfo.userFriendlyMessage}`);
      break;
    case 'warning':
      toast.warn(`⚠️ ${errorInfo.userFriendlyMessage}`);
      break;
    case 'info':
      toast.info(`ℹ️ ${errorInfo.userFriendlyMessage}`);
      break;
  }
  
  return errorInfo;
};

// 성공 메시지
export const showSuccessToast = (message: string) => {
  toast.success(`✅ ${message}`);
};

// 로딩 토스트
export const showLoadingToast = (message: string) => {
  return toast.loading(`⏳ ${message}`);
};

// 로딩 토스트 업데이트
export const updateToast = (toastId: any, message: string, type: 'success' | 'error' | 'info' = 'success') => {
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.update(toastId, {
    render: `${icon} ${message}`,
    type,
    isLoading: false,
    autoClose: 3000,
  });
};

// 네트워크 상태 확인
export const checkNetworkStatus = (): boolean => {
  if (!navigator.onLine) {
    showErrorToast({ message: 'No network connection' }, 'Network');
    return false;
  }
  return true;
};

// 재시도 가능한 작업 실행
export const retryableAction = async <T>(
  action: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  context?: string
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!checkNetworkStatus()) {
        throw new Error('No network connection');
      }
      
      return await action();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        showErrorToast(error, context);
        throw error;
      }
      
      console.warn(`[${context}] Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // 지수 백오프
    }
  }
  
  throw lastError;
}; 