import React from 'react';
import { useEquippedCosmeticClass } from './CosmeticSkinPicker';

interface SkinnedNicknameProps {
  nickname: string;
  writerUid?: string | null;
  writerNickname?: string | null;
  className?: string;
  suppress?: boolean;
  force?: boolean;
  onClick?: () => void;
}

/** 작성자 장착 닉네임 스킨 적용 (모든 열람자에게 표시) */
export const SkinnedNickname: React.FC<SkinnedNicknameProps> = ({
  nickname,
  writerUid,
  writerNickname,
  className = '',
  suppress,
  force,
  onClick,
}) => {
  const skinClass = useEquippedCosmeticClass('nickname', {
    writerUid,
    writerNickname: writerNickname ?? nickname,
    suppress,
    force,
  });
  const classes = [className, skinClass].filter(Boolean).join(' ');

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        style={{
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'inherit',
        }}
      >
        {nickname}
      </button>
    );
  }

  return <span className={classes}>{nickname}</span>;
};

interface SkinnedRoleBadgeProps {
  label: string;
  roleClassName?: string;
  writerUid?: string | null;
  writerNickname?: string | null;
  force?: boolean;
  suppress?: boolean;
}

/** 작성자 장착 배지 스킨 적용 */
export const SkinnedRoleBadge: React.FC<SkinnedRoleBadgeProps> = ({
  label,
  roleClassName = '',
  writerUid,
  writerNickname,
  force,
  suppress,
}) => {
  const skinClass = useEquippedCosmeticClass('badge', {
    writerUid,
    writerNickname,
    force,
    suppress,
  });
  if (!label) return null;
  return <span className={`role-badge ${roleClassName} ${skinClass}`.trim()}>{label}</span>;
};

interface SkinnedPositionProps {
  position: string;
  writerUid?: string | null;
  writerNickname?: string | null;
  force?: boolean;
  suppress?: boolean;
}

/** 직책에도 같은 배지 스킨 적용 */
export const SkinnedPosition: React.FC<SkinnedPositionProps> = ({
  position,
  writerUid,
  writerNickname,
  force,
  suppress,
}) => {
  const skinClass = useEquippedCosmeticClass('badge', {
    writerUid,
    writerNickname,
    force,
    suppress,
  });
  if (!position) return null;
  return <span className={`author-position ${skinClass}`.trim()}>{position}</span>;
};

interface SkinnedPostTitleProps {
  title: string;
  writerUid?: string | null;
  writerNickname?: string | null;
  className?: string;
  as?: 'h1' | 'h2' | 'span';
  force?: boolean;
  style?: React.CSSProperties;
}

export const SkinnedPostTitle: React.FC<SkinnedPostTitleProps> = ({
  title,
  writerUid,
  writerNickname,
  className = 'post-title',
  as: Tag = 'h2',
  force,
  style,
}) => {
  const skinClass = useEquippedCosmeticClass('postTitle', {
    writerUid,
    writerNickname,
    force,
  });
  return (
    <Tag className={[className, skinClass].filter(Boolean).join(' ')} style={style}>
      {title}
    </Tag>
  );
};

export function usePostBodySkinClass(options?: {
  writerUid?: string | null;
  writerNickname?: string | null;
  force?: boolean;
}): string {
  return useEquippedCosmeticClass('postBody', options);
}

type SkinnedPostCardProps = React.HTMLAttributes<HTMLElement> & {
  writerUid?: string | null;
  writerNickname?: string | null;
  as?: 'div' | 'article';
};

/** 작성자 글 카드에 본문·카드 스킨 class 적용 */
export const SkinnedPostCard = React.forwardRef<HTMLElement, SkinnedPostCardProps>(
  ({ writerUid, writerNickname, className, children, as = 'div', ...rest }, ref) => {
    const bodySkin = useEquippedCosmeticClass('postBody', { writerUid, writerNickname });
    const classes = [className, bodySkin].filter(Boolean).join(' ');
    if (as === 'article') {
      return (
        <article ref={ref as React.Ref<HTMLElement>} className={classes} {...rest}>
          {children}
        </article>
      );
    }
    return (
      <div ref={ref as React.Ref<HTMLDivElement>} className={classes} {...rest}>
        {children}
      </div>
    );
  }
);
SkinnedPostCard.displayName = 'SkinnedPostCard';

export default SkinnedNickname;
