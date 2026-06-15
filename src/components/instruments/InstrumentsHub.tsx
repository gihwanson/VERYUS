import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { lockPianoLandscape } from '../../utils/pianoOrientation';
import '../../styles/variables.css';
import '../../styles/instruments.css';

type InstrumentCategory = 'keyboard' | 'strings' | 'winds' | 'percussion';

interface InstrumentItem {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: InstrumentCategory;
  path?: string;
  available: boolean;
  tag?: string;
}

const CATEGORY_META: Record<
  InstrumentCategory,
  { title: string; subtitle: string }
> = {
  keyboard: { title: '건반', subtitle: '건반을 눌러 연주하는 악기' },
  percussion: { title: '타악', subtitle: '리듬과 박자를 연습하는 악기' },
  strings: { title: '현악', subtitle: '현을 울려 연주하는 악기' },
  winds: { title: '관악', subtitle: '호흡과 터치로 연주하는 악기' },
};

const INSTRUMENT_ITEMS: InstrumentItem[] = [
  {
    id: 'piano',
    title: '피아노',
    description: '88건반 그랜드 피아노. 터치·키보드로 자유롭게 연주하세요.',
    emoji: '🎹',
    category: 'keyboard',
    path: '/instruments/piano',
    available: true,
    tag: '이용 가능',
  },
  {
    id: 'drums',
    title: '드럼',
    description: '드럼 킷으로 리듬과 고스트 노트를 연습합니다.',
    emoji: '🥁',
    category: 'percussion',
    available: false,
  },
  {
    id: 'violin',
    title: '바이올린',
    description: '현을 켜며 멜로디와 비브라토를 연습합니다.',
    emoji: '🎻',
    category: 'strings',
    available: false,
  },
  {
    id: 'guitar',
    title: '기타',
    description: '코드와 주법을 터치로 연습합니다.',
    emoji: '🎸',
    category: 'strings',
    available: false,
  },
  {
    id: 'saxophone',
    title: '색소폰',
    description: '관악기 터치 연주와 브레스 컨트롤을 연습합니다.',
    emoji: '🎷',
    category: 'winds',
    available: false,
  },
  {
    id: 'flute',
    title: '플루트',
    description: '가벼운 관악기 멜로디 연습 공간입니다.',
    emoji: '🪈',
    category: 'winds',
    available: false,
  },
];

const CATEGORY_ORDER: InstrumentCategory[] = ['keyboard', 'percussion', 'strings', 'winds'];

const InstrumentsHub: React.FC = () => {
  const navigate = useNavigate();

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem('veryus_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<InstrumentCategory, InstrumentItem[]>();
    CATEGORY_ORDER.forEach((cat) => map.set(cat, []));
    INSTRUMENT_ITEMS.forEach((item) => {
      map.get(item.category)?.push(item);
    });
    return CATEGORY_ORDER.map((category) => ({
      category,
      meta: CATEGORY_META[category],
      items: map.get(category) ?? [],
    })).filter((section) => section.items.length > 0);
  }, []);

  const availableCount = INSTRUMENT_ITEMS.filter((item) => item.available).length;

  const handleInstrumentClick = (item: InstrumentItem) => {
    if (!item.available || !item.path) return;
    if (item.id === 'piano') {
      void lockPianoLandscape();
    }
    navigate(item.path);
  };

  return (
    <div className="instruments-page">
      <div className="instruments-content">
        <header className="instruments-header">
          <div className="instruments-header-copy">
            <p className="instruments-eyebrow">VERYUS Instruments</p>
            <h1 className="instruments-title">악기 연습실</h1>
            <p className="instruments-subtitle">
              {user?.nickname ? `${user.nickname}님, ` : ''}
              연주하고 싶은 악기를 선택해 보세요.
            </p>
          </div>
          <div className="instruments-header-badge" aria-hidden>
            <span>🎼</span>
          </div>
        </header>

        <div className="instruments-notice" role="note">
          <p>
            현재 <strong>{availableCount}종</strong>의 악기를 이용할 수 있습니다. 드럼, 바이올린,
            색소폰 등 더 많은 악기가 순차적으로 추가될 예정입니다.
          </p>
        </div>

        {grouped.map((section) => (
          <section key={section.category} className="instruments-category">
            <div className="instruments-category-head">
              <h2 className="instruments-category-title">{section.meta.title}</h2>
              <p className="instruments-category-subtitle">{section.meta.subtitle}</p>
            </div>
            <div className="instruments-grid">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`instruments-card instruments-card--${item.id}${
                    item.available ? ' instruments-card--available' : ' instruments-card--soon'
                  }`}
                  disabled={!item.available}
                  onClick={() => handleInstrumentClick(item)}
                >
                  <span className={`instruments-card-art instruments-card-art--${item.id}`} aria-hidden>
                    {item.emoji}
                  </span>
                  <div className="instruments-card-body">
                    <div className="instruments-card-title-row">
                      <h3>{item.title}</h3>
                      {item.tag && <span className="instruments-card-tag">{item.tag}</span>}
                    </div>
                    <p>{item.description}</p>
                  </div>
                  {item.available ? (
                    <span className="instruments-card-arrow" aria-hidden>
                      →
                    </span>
                  ) : (
                    <span className="instruments-card-arrow instruments-card-arrow--muted">준비중</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default InstrumentsHub;
