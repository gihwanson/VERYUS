import React, { useState, useEffect, useRef } from 'react';
import { X, Music, Star, Heart, Sparkles } from 'lucide-react';
import './DailyFortune.css';

interface User {
  uid: string;
  nickname?: string;
  grade?: string;
}

interface DailyFortuneProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

interface Fortune {
  message: string;
  luckyColor: string;
  luckyNumber: number;
  mood: string;
}

interface SongRecommendation {
  title: string;
  artist: string;
  genre: string;
  reason: string;
}

const DailyFortune: React.FC<DailyFortuneProps> = ({ user, isOpen, onClose }) => {
  const [fortune, setFortune] = useState<Fortune | null>(null);
  const [song, setSong] = useState<SongRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [songRefresh, setSongRefresh] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // 운세 데이터
  const fortunes = [
    {
      message: "오늘은 새로운 시작의 날입니다. 음악과 함께 멋진 하루를 보내세요!",
      luckyColor: "파란색",
      luckyNumber: 7,
      mood: "상쾌한"
    },
    {
      message: "창의력이 넘치는 하루가 될 것 같아요. 새로운 곡에 도전해보세요!",
      luckyColor: "보라색",
      luckyNumber: 3,
      mood: "창의적인"
    },
    {
      message: "따뜻한 마음으로 사람들과 소통하는 날입니다. 함께 음악을 나눠보세요!",
      luckyColor: "주황색",
      luckyNumber: 9,
      mood: "따뜻한"
    },
    {
      message: "집중력이 높아지는 날이에요. 어려운 곡 연습에 도전해보세요!",
      luckyColor: "초록색",
      luckyNumber: 5,
      mood: "집중된"
    },
    {
      message: "행운이 가득한 하루입니다. 좋은 일들이 연달아 일어날 거예요!",
      luckyColor: "노란색",
      luckyNumber: 8,
      mood: "행복한"
    },
    {
      message: "평온한 마음으로 휴식을 취하는 것이 좋겠어요. 잔잔한 음악과 함께요!",
      luckyColor: "하늘색",
      luckyNumber: 2,
      mood: "평온한"
    },
    {
      message: "열정적인 에너지가 넘치는 날! 신나는 음악으로 기분을 UP 시켜보세요!",
      luckyColor: "빨간색",
      luckyNumber: 6,
      mood: "열정적인"
    }
  ];

  // 다양한 검색 키워드와 장르 (옛날곡부터 최신곡까지)
  const musicSearchTerms = [
    // K-Pop 다양한 세대
    { term: "아이유", era: "2010s-2020s" },
    { term: "BTS", era: "2010s-2020s" },
    { term: "BLACKPINK", era: "2010s-2020s" },
    { term: "NewJeans", era: "2020s" },
    { term: "aespa", era: "2020s" },
    { term: "IVE", era: "2020s" },
    { term: "빅뱅", era: "2000s-2010s" },
    { term: "소녀시대", era: "2000s-2010s" },
    { term: "슈퍼주니어", era: "2000s-2010s" },
    { term: "서태지와아이들", era: "1990s" },
    { term: "H.O.T.", era: "1990s" },
    { term: "S.E.S.", era: "1990s" },
    
    // 한국 가요 (시대별)
    { term: "조용필", era: "1980s-1990s" },
    { term: "김건모", era: "1990s" },
    { term: "신승훈", era: "1990s" },
    { term: "박진영", era: "1990s-2000s" },
    { term: "윤종신", era: "1990s-2000s" },
    { term: "김범수", era: "2000s" },
    { term: "박효신", era: "2000s" },
    { term: "이승기", era: "2000s-2010s" },
    { term: "장범준", era: "2010s-2020s" },
    { term: "10cm", era: "2010s-2020s" },
    
    // 해외 팝 (시대별)
    { term: "Beatles", era: "1960s" },
    { term: "Michael Jackson", era: "1980s-1990s" },
    { term: "Madonna", era: "1980s-1990s" },
    { term: "Whitney Houston", era: "1980s-1990s" },
    { term: "Backstreet Boys", era: "1990s" },
    { term: "Britney Spears", era: "2000s" },
    { term: "Beyonce", era: "2000s-2010s" },
    { term: "Taylor Swift", era: "2000s-2020s" },
    { term: "Ed Sheeran", era: "2010s-2020s" },
    { term: "Billie Eilish", era: "2010s-2020s" },
    { term: "Harry Styles", era: "2010s-2020s" },
    { term: "Dua Lipa", era: "2010s-2020s" },
    
    // 장르별 다양한 곡들
    { term: "jazz classics", era: "Classic" },
    { term: "rock hits", era: "Classic" },
    { term: "R&B soul", era: "Classic" },
    { term: "indie music", era: "Modern" },
    { term: "electronic music", era: "Modern" },
    { term: "acoustic songs", era: "Timeless" }
  ];

  // 추천 이유 템플릿
  const recommendationReasons = [
    "오늘의 기분에 딱 맞는 멜로디로 마음을 달래줄 거예요",
    "특별한 하루를 만들어줄 감성적인 곡이에요",
    "듣기만 해도 기분이 좋아지는 매력적인 곡입니다",
    "시간이 지나도 변하지 않는 명곡의 감동을 선사해요",
    "새로운 음악적 경험을 제공하는 흥미로운 곡이에요",
    "일상에 활력을 불어넣어줄 에너지 넘치는 곡입니다",
    "마음의 평온을 찾게 해주는 아름다운 선율이에요",
    "추억과 감성을 자극하는 따뜻한 곡입니다",
    "현재의 음악 트렌드를 반영한 세련된 곡이에요",
    "음악적 완성도가 높은 클래식한 명곡입니다"
  ];

  // iTunes API에서 곡 검색
  const fetchRandomSong = async () => {
    try {
      // 랜덤하게 검색어 선택
      const randomTerm = musicSearchTerms[Math.floor(Math.random() * musicSearchTerms.length)];
      
             // iTunes API 호출 (limit을 20으로 설정하고 country 파라미터 추가)
       const response = await fetch(
         `https://itunes.apple.com/search?term=${encodeURIComponent(randomTerm.term)}&media=music&entity=song&limit=20&country=US`
       );
      
      if (!response.ok) {
        throw new Error('API 호출 실패');
      }
      
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        // 결과에서 랜덤하게 곡 선택
        const randomSong = data.results[Math.floor(Math.random() * data.results.length)];
        
        // 장르 정보 추출 (없으면 기본값)
        const genre = randomSong.primaryGenreName || '음악';
        
        // 랜덤한 추천 이유 선택
        const randomReason = recommendationReasons[Math.floor(Math.random() * recommendationReasons.length)];
        
        return {
          title: randomSong.trackName || randomSong.collectionName || 'Unknown Title',
          artist: randomSong.artistName || 'Unknown Artist',
          genre: genre,
          reason: randomReason,
          era: randomTerm.era,
          previewUrl: randomSong.previewUrl || null
        };
      }
    } catch (error) {
      console.error('곡 가져오기 실패:', error);
    }
    
    // API 실패 시 백업 곡 목록
    const backupSongs = [
      { title: "좋은 날", artist: "아이유", genre: "K-Pop", reason: "언제 들어도 기분 좋은 명곡이에요", era: "2010s" },
      { title: "Spring Day", artist: "BTS", genre: "K-Pop", reason: "따뜻한 감성의 아름다운 곡입니다", era: "2010s" },
      { title: "Hotel California", artist: "Eagles", genre: "Rock", reason: "시대를 초월한 록의 명곡이에요", era: "1970s" }
    ];
    
    return backupSongs[Math.floor(Math.random() * backupSongs.length)];
  };

  // 운세는 날짜 기반, 곡은 API에서 가져오기
  const getDailyContent = async () => {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate() + user.uid.charCodeAt(0);
    
    // 운세는 하루에 한 번 고정
    const fortuneIndex = seed % fortunes.length;
    
    // 곡은 API에서 실시간으로 가져오기
    const randomSong = await fetchRandomSong();
    
    return {
      fortune: fortunes[fortuneIndex],
      song: randomSong
    };
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      // 곡 새로고침 효과
      setSongRefresh(true);
      
      // 로딩 효과를 위한 딜레이
      setTimeout(async () => {
        try {
          const content = await getDailyContent();
          setFortune(content.fortune);
          setSong(content.song);
        } catch (error) {
          console.error('콘텐츠 로딩 실패:', error);
          // 에러 시 백업 데이터 사용
          const today = new Date();
          const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate() + user.uid.charCodeAt(0);
          const fortuneIndex = seed % fortunes.length;
          setFortune(fortunes[fortuneIndex]);
          setSong({
            title: "음악 추천",
            artist: "VERYUS",
            genre: "다양함",
            reason: "오늘도 좋은 음악과 함께 즐거운 하루 보내세요!"
          });
        } finally {
          setLoading(false);
          
          // 새로고침 효과 종료
          setTimeout(() => {
            setSongRefresh(false);
          }, 500);
        }
      }, 1000);
    }
  }, [isOpen, user.uid]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getGradeEmoji = (grade?: string) => {
    const gradeEmojis = ['🍒', '🫐', '🥝', '🍎', '🍈', '🍉', '🌍', '🪐', '☀️', '🌌', '🍺', '⚡', '⭐', '🌙'];
    return gradeEmojis.includes(grade || '') ? grade : '🍒';
  };

  return (
    <div className="daily-fortune-bubble" ref={modalRef}>
      <div className="bubble-arrow"></div>
      <div className="daily-fortune-content">
        <div className="daily-fortune-header">
          <div className="user-info">
            <span className="user-grade">{getGradeEmoji(user.grade)}</span>
            <h2>{user.nickname || '사용자'}님의 오늘</h2>
          </div>
          <button className="close-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="loading-content">
            <div className="loading-spinner">
              <Sparkles size={24} className="sparkle-icon" />
            </div>
            <p>준비 중...</p>
          </div>
        ) : (
          <div className="daily-content">
            {/* 오늘의 운세 */}
            <div className="fortune-section">
              <div className="section-header">
                <Star size={16} className="section-icon" />
                <h3>오늘의 운세</h3>
              </div>
              <div className="fortune-card">
                <p className="fortune-message">{fortune?.message}</p>
                <div className="fortune-details">
                  <div className="fortune-item">
                    <span className="label">행운의 색상:</span>
                    <span className="value">{fortune?.luckyColor}</span>
                  </div>
                  <div className="fortune-item">
                    <span className="label">행운의 숫자:</span>
                    <span className="value">{fortune?.luckyNumber}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 오늘의 곡 추천 */}
            <div className={`song-section ${songRefresh ? 'refreshing' : ''}`}>
              <div className="section-header">
                <Music size={16} className="section-icon" />
                <h3>추천곡</h3>
                <span className="refresh-indicator">🎵</span>
              </div>
              <div className="song-card">
                <div className="song-info">
                  <h4 className="song-title">{song?.title}</h4>
                  <p className="song-artist">{song?.artist}</p>
                </div>
                <div className="song-reason">
                  <Heart size={12} className="heart-icon" />
                  <p>{song?.reason}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyFortune; 