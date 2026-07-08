import React from 'react';

export const formatMembers = (members: string[]) =>
  members.map((m) => String(m).trim()).filter(Boolean).join(', ');

export const SongRow: React.FC<{
  title: string;
  members: string[];
  submittedBy?: string;
  action?: React.ReactNode;
  badge?: string;
  badgeVariant?: 'selected' | 'submitted' | 'rejected' | 'default';
  order?: number;
}> = ({ title, members, submittedBy, action, badge, badgeVariant = 'default', order }) => (
  <div className="free-song-row">
    {order != null && <div className="free-song-row__order">{order}</div>}
    <div className="free-song-row__info">
      <div className="free-song-row__title">
        {title}
        {badge && <span className={`free-song-row__badge free-song-row__badge--${badgeVariant}`}>{badge}</span>}
      </div>
      <div className="free-song-row__members">
        {submittedBy ? `${submittedBy} · ${formatMembers(members)}` : formatMembers(members)}
      </div>
    </div>
    {action && <div className="free-song-row__action">{action}</div>}
  </div>
);

export const FreeSongEmptyState: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="setlist-manage-panel free-song-panel">
    <p className="free-song-empty">{title}</p>
    {subtitle && <p className="free-song-empty-sub">{subtitle}</p>}
  </div>
);
