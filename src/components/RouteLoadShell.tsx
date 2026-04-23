import React from 'react';

/**
 * lazy 라우트 청크를 불러오는 동안 보여줄 자리표시(스켈레톤).
 * 텍스트 없이 앱과 맞는 유리/카드 느낌만 둡니다.
 */
const RouteLoadShell: React.FC = () => (
  <div className="route-load-shell" aria-hidden>
    <div className="route-load-shell__top">
      <div className="route-load-shell__shimmer route-load-shell__shimmer--title" />
      <div className="route-load-shell__shimmer route-load-shell__shimmer--chip" />
    </div>
    <div className="route-load-shell__card">
      <div className="route-load-shell__shimmer route-load-shell__shimmer--line" />
      <div className="route-load-shell__shimmer route-load-shell__shimmer--line" />
      <div className="route-load-shell__shimmer route-load-shell__shimmer--line route-load-shell__shimmer--line-short" />
    </div>
    <div className="route-load-shell__card">
      <div className="route-load-shell__shimmer route-load-shell__shimmer--line" />
      <div className="route-load-shell__shimmer route-load-shell__shimmer--line" />
    </div>
  </div>
);

export default RouteLoadShell;
