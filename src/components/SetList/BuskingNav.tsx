import React from 'react';
import { ListMusic, Mic2, ClipboardList } from 'lucide-react';

export type BuskingCategory = 'freeSong' | 'setlist';
export type FreeSongView = 'roster' | 'submit' | 'admin' | 'order' | 'stats';
export type SetlistView = 'manage' | 'cards';

interface BuskingNavProps {
  category: BuskingCategory;
  onCategoryChange: (category: BuskingCategory) => void;
  freeSongView: FreeSongView;
  onFreeSongViewChange: (view: FreeSongView) => void;
  setlistView: SetlistView;
  onSetlistViewChange: (view: SetlistView) => void;
  canManage: boolean;
  onHome: () => void;
  compact?: boolean;
}

const MODE_INFO = {
  freeSong: {
    icon: Mic2,
    label: '자유곡',
    desc: '합격곡을 보내고 순서를 확인',
    accentClass: 'busking-mode-card--free',
  },
  setlist: {
    icon: ClipboardList,
    label: '셋리스트',
    desc: '정해진 곡 순서로 무대 진행',
    accentClass: 'busking-mode-card--setlist',
  },
} as const;

const FREE_SONG_VIEWS: { id: FreeSongView; label: string; adminOnly?: boolean }[] = [
  { id: 'roster', label: '멤버 편성', adminOnly: true },
  { id: 'submit', label: '곡 전송' },
  { id: 'admin', label: '곡 선정', adminOnly: true },
  { id: 'order', label: '진행 순서' },
  { id: 'stats', label: '통계', adminOnly: true },
];

const SETLIST_VIEWS: { id: SetlistView; label: string; adminOnly?: boolean }[] = [
  { id: 'manage', label: '셋리스트 편성', adminOnly: true },
  { id: 'cards', label: '무대 진행' },
];

export function getBuskingPageSubtitle(
  category: BuskingCategory,
  freeSongView: FreeSongView,
  setlistView: SetlistView,
  canManage: boolean
): string {
  if (category === 'freeSong') {
    if (freeSongView === 'roster') return '버스킹 참가 멤버를 편성합니다';
    if (freeSongView === 'submit') return '내 합격곡을 관리자에게 전송합니다';
    if (freeSongView === 'admin') return '전송된 곡을 골라 진행 순서를 만듭니다';
    if (freeSongView === 'order') return '오늘 자유곡 진행 순서를 확인합니다';
    if (freeSongView === 'stats') return '자유곡 버스킹 참여 통계를 확인합니다';
    return '합격곡을 보내고 순서를 확인합니다';
  }
  if (setlistView === 'manage' && canManage) return '참가자와 곡을 정해 셋리스트를 만듭니다';
  return '확정된 셋리스트 순서대로 무대를 진행합니다';
}

const BuskingNav: React.FC<BuskingNavProps> = ({
  category,
  onCategoryChange,
  freeSongView,
  onFreeSongViewChange,
  setlistView,
  onSetlistViewChange,
  canManage,
  onHome,
  compact = false,
}) => {
  const subViews =
    category === 'freeSong'
      ? FREE_SONG_VIEWS.filter((v) => !v.adminOnly || canManage)
      : SETLIST_VIEWS.filter((v) => !v.adminOnly || canManage);

  const activeSubView = category === 'freeSong' ? freeSongView : setlistView;
  const onSubViewChange = (id: string) => {
    if (category === 'freeSong') onFreeSongViewChange(id as FreeSongView);
    else onSetlistViewChange(id as SetlistView);
  };

  if (compact) return null;

  return (
    <header className={`busking-nav busking-nav--${category}`}>
      <div className="busking-nav__top">
        <div className="busking-nav__brand">
          <h1 className="busking-nav__title">
            <ListMusic size={22} className="busking-nav__title-icon" aria-hidden />
            버스킹
          </h1>
          <p className="busking-nav__subtitle">
            {getBuskingPageSubtitle(category, freeSongView, setlistView, canManage)}
          </p>
        </div>
        <button type="button" onClick={onHome} className="busking-nav__home">
          ← 메인
        </button>
      </div>

      <div className="busking-mode-switch" role="tablist" aria-label="버스킹 모드">
        {(Object.keys(MODE_INFO) as BuskingCategory[]).map((mode) => {
          const info = MODE_INFO[mode];
          const Icon = info.icon;
          const active = category === mode;
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onCategoryChange(mode)}
              className={`busking-mode-card ${info.accentClass}${active ? ' busking-mode-card--active' : ''}`}
            >
              <span className="busking-mode-card__icon" aria-hidden>
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span className="busking-mode-card__text">
                <span className="busking-mode-card__label">{info.label}</span>
                <span className="busking-mode-card__desc">{info.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className={`busking-subnav busking-subnav--${category}`} role="tablist" aria-label={`${MODE_INFO[category].label} 메뉴`}>
        {subViews.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={activeSubView === view.id}
            onClick={() => onSubViewChange(view.id)}
            className={`busking-subnav__btn${activeSubView === view.id ? ' busking-subnav__btn--active' : ''}`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {category === 'setlist' && (
        <div className="busking-back-bar">
          <button
            type="button"
            onClick={() => onCategoryChange('freeSong')}
            className="busking-back-btn"
          >
            ← 자유곡으로
          </button>
        </div>
      )}
    </header>
  );
};

export default BuskingNav;
