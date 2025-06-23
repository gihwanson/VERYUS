import React, { useState, useEffect, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  SortAsc, 
  SortDesc, 
  Calendar, 
  User, 
  Tag, 
  X,
  TrendingUp,
  Hash,
  Users
} from 'lucide-react';
import { useDebounce } from '../utils/hooks';
import { showErrorToast } from '../utils/errorHandler';
import { performSearch, getPopularTags, saveSearchHistory } from '../utils/searchService';
import type { SearchResult as SearchResultType, SearchFilters as SearchFiltersType } from '../utils/searchService';
import { 
  collection as fbCollection, 
  query as fbQuery, 
  where as fbWhere, 
  limit as fbLimit, 
  getDocs as fbGetDocs 
} from 'firebase/firestore';
import { db } from '../firebase';
import './SearchSystem.css';

// 타입은 searchService에서 import
type SearchResult = SearchResultType;
type SearchFilters = SearchFiltersType;

// 사용자 검색 결과 타입
interface UserSearchResult {
  uid: string;
  nickname: string;
  grade?: string;
  role?: string;
  profileImageUrl?: string;
}

interface SearchSystemProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

const BOARD_TYPES = [
  { value: 'all', label: '전체', color: '#8A55CC' },
  { value: 'free', label: '자유게시판', color: '#10B981' },
  { value: 'recording', label: '녹음게시판', color: '#F59E0B' },
  { value: 'evaluation', label: '평가게시판', color: '#EF4444' },
  { value: 'partner', label: '파트너모집', color: '#8B5CF6' }
];

const DATE_RANGES = [
  { value: 'all', label: '전체 기간' },
  { value: '1d', label: '최근 1일' },
  { value: '1w', label: '최근 1주' },
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '1y', label: '최근 1년' }
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: '작성일', icon: Calendar },
  { value: 'viewCount', label: '조회수', icon: TrendingUp },
  { value: 'title', label: '제목', icon: Hash },
  { value: 'author', label: '작성자', icon: User }
];

const POPULAR_TAGS = [
  '팝', '발라드', '록', '힙합', '재즈', '클래식', 
  '기타', '피아노', '보컬', '작곡', '편곡', '믹싱',
  '초보', '고수', '연습', '공연', '합주', '솔로'
];

const SearchSystem: React.FC<SearchSystemProps> = memo(({ 
  isOpen, 
  onClose, 
  initialQuery = '' 
}) => {
  const navigate = useNavigate();
  
  // 검색 상태
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>({
    boardType: 'all',
    dateRange: 'all',
    author: '',
    tags: [],
    sortBy: 'createdAt',
    sortOrder: 'desc'
  });
  
  // UI 상태
  const [results, setResults] = useState<SearchResult[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [tagInput, setTagInput] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  
  // 디바운스된 검색어
  const debouncedQuery = useDebounce(query, 300);
  
  // 사용자 검색 함수
  const searchUsers = async (searchQuery: string): Promise<UserSearchResult[]> => {
    if (!searchQuery.trim()) return [];
    
    try {
      const usersQuery = fbQuery(
        fbCollection(db, 'users'),
        fbWhere('nickname', '>=', searchQuery),
        fbWhere('nickname', '<=', searchQuery + '\uf8ff'),
        fbLimit(10)
      );
      
      const snapshot = await fbGetDocs(usersQuery);
      return snapshot.docs.map((doc: any) => ({
        uid: doc.id,
        nickname: doc.data().nickname,
        grade: doc.data().grade,
        role: doc.data().role,
        profileImageUrl: doc.data().profileImageUrl
      })) as UserSearchResult[];
      
    } catch (error) {
      console.error('사용자 검색 실패:', error);
      return [];
    }
  };
  
  // 검색 실행
  const performSearchAction = async (searchQuery: string, searchFilters: SearchFilters) => {
    if (!searchQuery.trim() && searchFilters.tags.length === 0) {
      setResults([]);
      setUserResults([]);
      return;
    }
    
    setLoading(true);
    try {
      // 병렬로 게시글 검색과 사용자 검색 실행
      const [searchResults, userSearchResults] = await Promise.all([
        searchQuery.trim() || searchFilters.tags.length > 0 
          ? performSearch(searchQuery, searchFilters)
          : Promise.resolve([]),
        searchQuery.trim() ? searchUsers(searchQuery) : Promise.resolve([])
      ]);
      
      setResults(searchResults);
      setUserResults(userSearchResults);
      
      // 검색 히스토리 저장 (선택적)
      if (searchQuery.trim()) {
        saveSearchHistory(searchQuery);
      }
      
    } catch (error) {
      showErrorToast(error, 'Search');
      setResults([]);
      setUserResults([]);
    } finally {
      setLoading(false);
    }
  };
  
  // 디바운스된 검색 실행
  useEffect(() => {
    if (debouncedQuery || filters.tags.length > 0) {
      performSearchAction(debouncedQuery, filters);
    }
  }, [debouncedQuery, filters]);
  
  // 컴포넌트 초기화 시 인기 태그 업데이트
  useEffect(() => {
    // 인기 태그 동적 로드 (기본 태그 대신)
    getPopularTags().then(tags => {
      // POPULAR_TAGS를 동적으로 업데이트할 수 있지만, 
      // 여기서는 tagSuggestions에서 처리됩니다.
    }).catch(error => {
      console.error('인기 태그 로드 실패:', error);
    });
  }, []);
  
  // 필터 변경 핸들러
  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  // 태그 추가
  const addTag = (tag: string) => {
    if (tag && !filters.tags.includes(tag)) {
      handleFilterChange('tags', [...filters.tags, tag]);
    }
    setTagInput('');
    setShowTagSuggestions(false);
  };
  
  // 태그 제거
  const removeTag = (tagToRemove: string) => {
    handleFilterChange('tags', filters.tags.filter(tag => tag !== tagToRemove));
  };
  
  // 검색 결과 클릭
  const handleResultClick = (result: SearchResult) => {
    const boardPaths = {
      free: '/free',
      recording: '/recording', 
      evaluation: '/evaluation',
      partner: '/boards/partner'
    };
    
    navigate(`${boardPaths[result.boardType]}/${result.id}`);
    onClose();
  };

  // 사용자 검색 결과 클릭
  const handleUserResultClick = (user: UserSearchResult) => {
    navigate(`/mypage/${user.uid}`);
    onClose();
  };
  
  // 태그 제안 필터링
  const tagSuggestions = useMemo(() => {
    if (!tagInput) return POPULAR_TAGS;
    return POPULAR_TAGS.filter(tag => 
      tag.toLowerCase().includes(tagInput.toLowerCase()) &&
      !filters.tags.includes(tag)
    );
  }, [tagInput, filters.tags]);
  
  // 검색 결과 하이라이팅
  const highlightText = (text: string | undefined | null, query: string) => {
    // text가 없거나 query가 없으면 원본 텍스트 반환
    if (!text || !query) return text || '';
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="search-highlight">{part}</mark>
      ) : part
    );
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="search-system-overlay" onClick={onClose}>
      <div className="search-system-modal" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="search-header">
          <div className="search-input-container">
            <input
              type="text"
              placeholder="검색어를 입력하세요..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
              autoFocus
            />
            <button 
              className="search-close-btn"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
          
          {/* 필터 토글 */}
          <button 
            className={`filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            필터
          </button>
        </div>
        
        {/* 필터 섹션 */}
        {showFilters && (
          <div className="search-filters">
            {/* 게시판 필터 */}
            <div className="filter-group">
              <label className="filter-label">게시판</label>
              <div className="board-type-filters">
                {BOARD_TYPES.map(board => (
                  <button
                    key={board.value}
                    className={`board-filter ${filters.boardType === board.value ? 'active' : ''}`}
                    onClick={() => handleFilterChange('boardType', board.value)}
                    style={{ 
                      borderColor: filters.boardType === board.value ? board.color : '#E5DAF5',
                      backgroundColor: filters.boardType === board.value ? `${board.color}20` : 'transparent'
                    }}
                  >
                    {board.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* 날짜 필터 */}
            <div className="filter-group">
              <label className="filter-label">기간</label>
              <select 
                value={filters.dateRange}
                onChange={(e) => handleFilterChange('dateRange', e.target.value)}
                className="date-filter"
              >
                {DATE_RANGES.map(range => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 작성자 필터 */}
            <div className="filter-group">
              <label className="filter-label">작성자</label>
              <input
                type="text"
                placeholder="작성자명 입력"
                value={filters.author}
                onChange={(e) => handleFilterChange('author', e.target.value)}
                className="author-filter"
              />
            </div>
            
            {/* 태그 필터 */}
            <div className="filter-group">
              <label className="filter-label">태그</label>
              <div className="tag-filter-container">
                <div className="selected-tags">
                  {filters.tags.map(tag => (
                    <span key={tag} className="selected-tag">
                      <Hash size={12} />
                      {tag}
                      <button onClick={() => removeTag(tag)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="tag-input-container">
                  <input
                    type="text"
                    placeholder="태그 입력..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onFocus={() => setShowTagSuggestions(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault();
                        addTag(tagInput.trim());
                      }
                    }}
                    className="tag-input"
                  />
                  {showTagSuggestions && tagSuggestions.length > 0 && (
                    <div className="tag-suggestions">
                      {tagSuggestions.map(tag => (
                        <button
                          key={tag}
                          className="tag-suggestion"
                          onClick={() => addTag(tag)}
                        >
                          <Hash size={12} />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* 정렬 옵션 */}
            <div className="filter-group">
              <label className="filter-label">정렬</label>
              <div className="sort-options">
                <select
                  value={filters.sortBy}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  className="sort-select"
                >
                  {SORT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  className={`sort-order ${filters.sortOrder === 'desc' ? 'active' : ''}`}
                  onClick={() => handleFilterChange('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  {filters.sortOrder === 'desc' ? <SortDesc size={16} /> : <SortAsc size={16} />}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 검색 결과 */}
        <div className="search-results">
          {loading && (
            <div className="search-loading">
              <div className="loading-spinner"></div>
              <span>검색 중...</span>
            </div>
          )}
          
          {!loading && query && results.length === 0 && userResults.length === 0 && (
            <div className="no-results">
              <Search size={48} className="no-results-icon" />
              <h3>검색 결과가 없습니다</h3>
              <p>다른 키워드로 검색해보세요</p>
            </div>
          )}
          
          {!loading && (userResults.length > 0 || results.length > 0) && (
            <div className="results-list">
              <div className="results-header">
                <span className="results-count">
                  총 {userResults.length + results.length}개의 결과
                </span>
              </div>
              
              {/* 사용자 검색 결과 */}
              {userResults.length > 0 && (
                <div className="user-results-section">
                  <div className="section-header">
                    <Users size={16} />
                    <span>사용자 ({userResults.length})</span>
                  </div>
                  
                  {userResults.map(user => (
                    <div 
                      key={user.uid}
                      className="user-result-item"
                      onClick={() => handleUserResultClick(user)}
                    >
                      <div className="user-avatar">
                        {user.profileImageUrl ? (
                          <img src={user.profileImageUrl} alt={user.nickname} />
                        ) : (
                          user.nickname?.charAt(0) || 'U'
                        )}
                      </div>
                      
                      <div className="user-info">
                        <div className="user-nickname">
                          {highlightText(user.nickname || '사용자', query)}
                          <span className="user-grade">{user.grade || '🍒'}</span>
                        </div>
                        
                        {user.role && user.role !== '일반' && (
                          <div className="user-role">{user.role}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 게시글 검색 결과 */}
              {results.length > 0 && (
                <div className="post-results-section">
                  <div className="section-header">
                    <Hash size={16} />
                    <span>게시글 ({results.length})</span>
                  </div>
                  
                  {results.map(result => (
                    <div 
                      key={result.id}
                      className="result-item"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="result-header">
                        <span className={`result-board ${result.boardType}`}>
                          {BOARD_TYPES.find(b => b.value === result.boardType)?.label}
                        </span>
                        <span className="result-date">
                          {new Date(result.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <h3 className="result-title">
                        {highlightText(result.title || '제목 없음', query)}
                      </h3>
                      
                      <p className="result-content">
                        {highlightText(result.content || '내용 없음', query)}
                      </p>
                      
                      <div className="result-meta">
                        <span className="result-author">
                          <User size={12} />
                          {result.author || '익명'}
                        </span>
                        
                        {result.viewCount && (
                          <span className="result-views">
                            <TrendingUp size={12} />
                            {result.viewCount}
                          </span>
                        )}
                        
                        {result.tags && result.tags.length > 0 && (
                          <div className="result-tags">
                            {result.tags.map(tag => (
                              <span key={tag} className="result-tag">
                                <Hash size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          

        </div>
      </div>
    </div>
  );
});

SearchSystem.displayName = 'SearchSystem';

export default SearchSystem; 