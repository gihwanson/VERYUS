import React from 'react';
import { Navigate } from 'react-router-dom';

/** 예전 링크 호환 — 홈 인라인 위젯으로 통합 */
const MemberWorldCupPage: React.FC = () => <Navigate to="/" replace />;

export default MemberWorldCupPage;
