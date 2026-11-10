import React from 'react';
import { MessageCircle, BarChart3, User } from 'lucide-react';
import './MyPageMiniHomeStage.css';

export type MyPageMiniHomeStageProps = {
  variant?: 'notebook' | 'classic';
  nickname: string;
  profileImageUrl?: string;
  intro?: string;
  role?: string;
  isOwner: boolean;
  onProfileImageClick?: () => void;
  onOpenGuestbook?: () => void;
  onOpenStats?: () => void;
  guestbookCount?: number;
  gradeDisplay?: React.ReactNode;
  footerExtra?: React.ReactNode;
};

const MyPageMiniHomeStage: React.FC<MyPageMiniHomeStageProps> = ({
  variant = 'notebook',
  nickname,
  profileImageUrl,
  intro,
  role,
  isOwner,
  onProfileImageClick,
  onOpenGuestbook,
  onOpenStats,
  guestbookCount = 0,
  gradeDisplay,
  footerExtra,
}) => {
  const showRole = role && role !== '일반' && role !== '평가자';
  const tagline = intro?.trim() || '등록된 소개가 없습니다.';

  return (
    <section
      className={`mypage-minihome mypage-minihome--${variant}`}
      aria-label={`${nickname}님의 미니홈`}
    >
      <div className="mypage-minihome__frame">
        <aside className="mypage-minihome__profile">
          <p className="mypage-minihome__visitors">
            <span className="mypage-minihome__visitors-label">방명록</span>{' '}
            <strong>{guestbookCount}</strong>
          </p>
          <div
            className={`mypage-minihome__minime${isOwner && onProfileImageClick ? ' mypage-minihome__minime--editable' : ''}`}
            role={isOwner && onProfileImageClick ? 'button' : undefined}
            tabIndex={isOwner && onProfileImageClick ? 0 : undefined}
            onClick={isOwner ? onProfileImageClick : undefined}
            onKeyDown={
              isOwner && onProfileImageClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') onProfileImageClick();
                  }
                : undefined
            }
          >
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="" decoding="async" />
            ) : (
              <User size={36} strokeWidth={1.5} aria-hidden />
            )}
          </div>
          <p className="mypage-minihome__name">{nickname}</p>
          {showRole ? <p className="mypage-minihome__role">{role}</p> : null}
          {gradeDisplay ? <div className="mypage-minihome__grade">{gradeDisplay}</div> : null}
          <p className="mypage-minihome__tagline">{tagline}</p>
        </aside>

        <div className="mypage-minihome__stage">
          <div className="mypage-minihome__room">
            <div className="mypage-minihome__room-floor" aria-hidden />
            <div
              className={`mypage-minihome__character${isOwner && onProfileImageClick ? ' mypage-minihome__character--editable' : ''}`}
              role={isOwner && onProfileImageClick ? 'button' : undefined}
              tabIndex={isOwner && onProfileImageClick ? 0 : undefined}
              onClick={isOwner ? onProfileImageClick : undefined}
              onKeyDown={
                isOwner && onProfileImageClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') onProfileImageClick();
                    }
                  : undefined
              }
            >
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="" decoding="async" />
              ) : (
                <User size={56} strokeWidth={1.5} aria-hidden />
              )}
            </div>
          </div>
          <div className="mypage-minihome__actions">
            {onOpenGuestbook ? (
              <button type="button" className="mypage-minihome__action" onClick={onOpenGuestbook}>
                <MessageCircle size={15} aria-hidden />
                방명록
                {guestbookCount > 0 ? ` (${guestbookCount})` : ''}
              </button>
            ) : null}
            {onOpenStats ? (
              <button type="button" className="mypage-minihome__action" onClick={onOpenStats}>
                <BarChart3 size={15} aria-hidden />
                활동·기타 메뉴
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {footerExtra ? <div className="mypage-minihome__footer-extra">{footerExtra}</div> : null}
    </section>
  );
};

export default MyPageMiniHomeStage;
