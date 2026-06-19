import React, { useState } from 'react';
import { Heart, MessageCircle, Clock, Eye, Headphones, Home, Music, User, Settings } from 'lucide-react';
import './AdminDesignLab.css';

type ThemeId =
  | 'current'
  | 'editorial'
  | 'studio'
  | 'refined'
  | 'paper'
  | 'brutalist'
  | 'nordic'
  | 'neon'
  | 'vinyl'
  | 'system'
  | 'ocean';

interface ThemeOption {
  id: ThemeId;
  name: string;
  tagline: string;
  traits: string[];
}

const THEMES: ThemeOption[] = [
  {
    id: 'current',
    name: '현재',
    tagline: '소프트 라벤더 · 둥근 카드 · 파스텔 톤',
    traits: ['글래스모피즘', '큰 border-radius', '보라 그라데이션 배경'],
  },
  {
    id: 'editorial',
    name: '에디토리얼',
    tagline: '흰 배경 · 선명한 타이포 · 여백 중심',
    traits: ['모노크롬', '날카로운 계층', '태그 대신 텍스트 위계'],
  },
  {
    id: 'studio',
    name: '스튜디오 다크',
    tagline: '다크 모드 · 음악 스튜디오 무드',
    traits: ['차콜 배경', '골드 포인트', '집중형 UI'],
  },
  {
    id: 'refined',
    name: '리파인드',
    tagline: '절제된 글래스 · 낮은 채도 · 프리미엄',
    traits: ['미세 블러', '8px radius', '뉴트럴 팔레트'],
  },
  {
    id: 'paper',
    name: '웜 페이퍼',
    tagline: '크림 톤 · 잉크 텍스트 · 아날로그 감성',
    traits: ['세리프 제목', '종이 질감', '따뜻한 베이지'],
  },
  {
    id: 'brutalist',
    name: '네오 브루탈',
    tagline: '굵은 테두리 · 원색 대비 · 거친 솔직함',
    traits: ['3px 검정 보더', '노란 포인트', '그림자 없음'],
  },
  {
    id: 'nordic',
    name: '노르딕',
    tagline: '스칸디나비아 · 세이지 그린 · 넉넉한 여백',
    traits: ['밝은 목재 톤', '저채도 그린', '미니멀 아이콘'],
  },
  {
    id: 'neon',
    name: '네온 사이버',
    tagline: '다크 베이스 · 시안·마젠타 글로우',
    traits: ['네온 보더', '글로우 효과', '클럽·공연 무드'],
  },
  {
    id: 'vinyl',
    name: '레트로 바이닐',
    tagline: '버건디 · 레코드샵 · 70–80년대 감성',
    traits: ['딥 레드', '빈티지 타이포', '따뜻한 그라데이션'],
  },
  {
    id: 'system',
    name: '시스템',
    tagline: 'iOS 스타일 · 부드러운 그림자 · 시스템 블루',
    traits: ['12px radius', '그룹드 리스트', '익숙한 모바일 UX'],
  },
  {
    id: 'ocean',
    name: '오션',
    tagline: '해안 블루 · 맑고 차분 · 여름 오후',
    traits: ['스카이·딥 블루', '화이트 카드', '시원한 톤'],
  },
];

const MOCK_POST = {
  category: '버스킹심사곡',
  role: '일반',
  title: '바람이 분다',
  description:
    '나도 버스킹을 하면서 느낀건데, 이 곡은 감정선이 자연스럽게 이어져서 현장에서 들으면 더 좋을 것 같아요.',
  likes: 1,
  comments: 0,
  time: '18시간 전',
  views: 29,
  status: '대기',
  author: '민주',
  grade: '🍒',
};

const DesignPreview: React.FC<{ themeId: ThemeId; compact?: boolean }> = ({ themeId, compact }) => (
  <div className={`dl-preview dl-preview--${themeId}${compact ? ' dl-preview--compact' : ''}`}>
    <div className="dl-preview__screen">
      <div className="dl-preview__banner">
        신입은 오프1회 참여 후 평가게시판 업로드가 가능합니다
      </div>

      <article className="dl-preview__card">
        <div className="dl-preview__card-top">
          <span className="dl-preview__cat">{MOCK_POST.category}</span>
          <span className="dl-preview__role">{MOCK_POST.role}</span>
        </div>
        <h3 className="dl-preview__title">{MOCK_POST.title}</h3>
        <div className="dl-preview__author">
          <span className="dl-preview__grade">{MOCK_POST.grade}</span>
          <span>{MOCK_POST.author}</span>
        </div>
        <p className="dl-preview__desc">{MOCK_POST.description}</p>
        <div className="dl-preview__stats">
          <span><Heart size={14} /> {MOCK_POST.likes}</span>
          <span><MessageCircle size={14} /> {MOCK_POST.comments}</span>
          <span><Clock size={14} /> {MOCK_POST.time}</span>
          <span><Eye size={14} /> 조회 {MOCK_POST.views}</span>
          <span className="dl-preview__status">{MOCK_POST.status}</span>
        </div>
      </article>

      <button type="button" className="dl-preview__fab" aria-hidden>
        <Headphones size={20} />
      </button>

      {!compact && (
        <nav className="dl-preview__nav" aria-hidden>
          <span><Home size={18} /><small>홈</small></span>
          <span><Music size={18} /><small>게시판</small></span>
          <span className="is-active"><User size={18} /><small>마이</small></span>
          <span><Settings size={18} /><small>설정</small></span>
        </nav>
      )}
    </div>
  </div>
);

const AdminDesignLab: React.FC = () => {
  const [selected, setSelected] = useState<ThemeId>('editorial');
  const active = THEMES.find((t) => t.id === selected)!;

  return (
    <div className="design-lab">
      <header className="design-lab__header">
        <h2>디자인 실험실</h2>
        <p>
          평가게시판·홈 등 앱 전반에 적용할 새 UI 방향을 미리 볼 수 있습니다.
          마음에 드는 테마를 골라 알려주시면 그 방향으로 본격 리디자인을 진행합니다.
        </p>
      </header>

      <div className="design-lab__picker" role="tablist" aria-label="디자인 테마 선택">
        {THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="tab"
            aria-selected={selected === theme.id}
            className={`design-lab__chip${selected === theme.id ? ' is-active' : ''}`}
            onClick={() => setSelected(theme.id)}
          >
            {theme.name}
          </button>
        ))}
      </div>

      <div className="design-lab__focus">
        <div className="design-lab__focus-info">
          <h3>{active.name}</h3>
          <p className="design-lab__tagline">{active.tagline}</p>
          <ul className="design-lab__traits">
            {active.traits.map((trait) => (
              <li key={trait}>{trait}</li>
            ))}
          </ul>
        </div>
        <div className="design-lab__focus-preview">
          <DesignPreview themeId={selected} />
        </div>
      </div>

      <section className="design-lab__grid-section">
        <h3>전체 비교</h3>
        <p className="design-lab__grid-hint">
          같은 콘텐츠로 {THEMES.length}가지 방향을 나란히 비교해 보세요.
        </p>
        <div className="design-lab__grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`design-lab__grid-item${selected === theme.id ? ' is-active' : ''}`}
              onClick={() => setSelected(theme.id)}
            >
              <span className="design-lab__grid-label">{theme.name}</span>
              <DesignPreview themeId={theme.id} compact />
            </button>
          ))}
        </div>
      </section>

      <aside className="design-lab__notes">
        <strong>다음 단계</strong>
        <p>
          선호하는 테마(또는 여러 테마의 조합)를 정해 주시면, CSS 변수·컴포넌트 스타일을
          해당 방향으로 단계적으로 교체합니다. 실험실은 너래 계정에서만 보입니다.
        </p>
      </aside>
    </div>
  );
};

export default AdminDesignLab;
