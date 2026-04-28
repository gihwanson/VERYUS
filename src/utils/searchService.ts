import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  QueryConstraint,
  Timestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  author: string;
  boardType: 'free' | 'recording' | 'evaluation' | 'partner';
  createdAt: any;
  tags?: string[];
  score?: number;
  viewCount?: number;
}

export interface SearchFilters {
  boardType: string;
  dateRange: string;
  author: string;
  tags: string[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

// 게시판 타입 매핑
const BOARD_TYPE_MAPPING: Record<string, string[]> = {
  'all': ['free', 'recording', 'evaluation', 'partner'],
  'free': ['free'],
  'recording': ['recording'],
  'evaluation': ['evaluation'],
  'partner': ['partner']
};

// 날짜 범위 계산
const getDateRange = (range: string): Date | null => {
  const now = new Date();
  
  switch (range) {
    case '1d':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '1m':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '3m':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
};

// 검색어 정규화 (공백, 특수문자 제거)
const normalizeQuery = (query: string): string => {
  return query
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣]/g, '')
    .replace(/\s+/g, ' ');
};

// 텍스트에서 검색어 매치 확인
const isMatchingText = (text: string, searchQuery: string): boolean => {
  if (!text || !searchQuery) return false;
  
  const normalizedText = normalizeQuery(text);
  const normalizedQuery = normalizeQuery(searchQuery);
  
  return normalizedText.includes(normalizedQuery);
};

// Firestore 쿼리 생성
const buildFirestoreQuery = (
  boardTypes: string[],
  filters: SearchFilters,
  searchLimit: number = 50
) => {
  const queries: Promise<SearchResult[]>[] = [];
  
  for (const boardType of boardTypes) {
    const constraints: QueryConstraint[] = [];
    
    // 게시판 타입 필터
    if (boardType !== 'all') {
      constraints.push(where('type', '==', boardType));
    }
    
    // 날짜 범위 필터
    const dateLimit = getDateRange(filters.dateRange);
    if (dateLimit) {
      constraints.push(where('createdAt', '>=', Timestamp.fromDate(dateLimit)));
    }
    
    // 작성자 필터
    if (filters.author.trim()) {
      constraints.push(where('writerNickname', '==', filters.author.trim()));
    }
    
    // 정렬
    const sortField = filters.sortBy === 'viewCount' ? 'viewCount' : 'createdAt';
    const sortDirection = filters.sortOrder;
    constraints.push(orderBy(sortField, sortDirection));
    
    // 제한
    constraints.push(limit(searchLimit));
    
    // 쿼리 실행
    const q = query(collection(db, 'posts'), ...constraints);
    
    queries.push(
      getDocs(q).then(snapshot => 
        snapshot.docs.map(doc => ({
          id: doc.id,
          boardType: boardType as any,
          ...doc.data()
        })) as SearchResult[]
      )
    );
  }
  
  return Promise.all(queries);
};

// 결과 필터링 및 정렬
const filterAndSortResults = (
  allResults: SearchResult[],
  searchQuery: string,
  filters: SearchFilters
): SearchResult[] => {
  let filteredResults = allResults;
  
  // 검색어 필터링
  if (searchQuery.trim()) {
    filteredResults = allResults.filter(result => 
      isMatchingText(result.title, searchQuery) ||
      isMatchingText(result.content, searchQuery) ||
      isMatchingText(result.author, searchQuery)
    );
  }
  
  // 태그 필터링
  if (filters.tags.length > 0) {
    filteredResults = filteredResults.filter(result => 
      result.tags && result.tags.some(tag => 
        filters.tags.includes(tag)
      )
    );
  }
  
  // 중복 제거 (같은 ID)
  const uniqueResults = filteredResults.reduce((acc, current) => {
    const existingItem = acc.find(item => item.id === current.id);
    if (!existingItem) {
      acc.push(current);
    }
    return acc;
  }, [] as SearchResult[]);
  
  // 최종 정렬 (Firestore에서 못한 것들)
  return uniqueResults.sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (filters.sortBy) {
      case 'title':
        aValue = a.title?.toLowerCase() || '';
        bValue = b.title?.toLowerCase() || '';
        break;
      case 'author':
        aValue = a.author?.toLowerCase() || '';
        bValue = b.author?.toLowerCase() || '';
        break;
      case 'viewCount':
        aValue = a.viewCount || 0;
        bValue = b.viewCount || 0;
        break;
      default: // createdAt
        aValue = a.createdAt?.seconds || 0;
        bValue = b.createdAt?.seconds || 0;
        break;
    }
    
    if (filters.sortOrder === 'asc') {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
    }
  });
};

// 메인 검색 함수
export const performSearch = async (
  searchQuery: string,
  filters: SearchFilters
): Promise<SearchResult[]> => {
  try {
    // 검색어와 태그가 모두 없으면 빈 결과 반환
    if (!searchQuery.trim() && filters.tags.length === 0) {
      return [];
    }
    
    // 게시판 타입 결정
    const boardTypes = BOARD_TYPE_MAPPING[filters.boardType] || BOARD_TYPE_MAPPING['all'];
    
    // Firestore 쿼리 실행
    const queryResults = await buildFirestoreQuery(boardTypes, filters);
    
    // 모든 결과 합치기
    const allResults = queryResults.flat();
    
    // 필터링 및 정렬
    const finalResults = filterAndSortResults(allResults, searchQuery, filters);
    
    // 결과 제한 (최대 100개)
    return finalResults.slice(0, 100);
    
  } catch (error) {
    console.error('검색 중 오류 발생:', error);
    throw new Error('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
};

// 인기 태그 조회
export const getPopularTags = async (): Promise<string[]> => {
  try {
    // 최근 게시물들에서 태그 추출
    const recentQuery = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    
    const snapshot = await getDocs(recentQuery);
    const tagCounts: Record<string, number> = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.tags && Array.isArray(data.tags)) {
        data.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });
    
    // 사용 빈도순으로 정렬하여 상위 20개 반환
    return Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([tag]) => tag);
      
  } catch (error) {
    console.error('인기 태그 조회 중 오류:', error);
    // 기본 태그 반환
    return [
      '팝', '발라드', '록', '힙합', '재즈', '클래식',
      '기타', '피아노', '보컬', '작곡', '편곡', '믹싱',
      '초보', '고수', '연습', '공연', '합주', '솔로'
    ];
  }
};

// 검색 히스토리 관리 (로컬 스토리지)
export const saveSearchHistory = (query: string): void => {
  if (!query.trim()) return;
  
  try {
    const history = getSearchHistory();
    const newHistory = [query, ...history.filter(item => item !== query)];
    localStorage.setItem('search_history', JSON.stringify(newHistory.slice(0, 10)));
  } catch (error) {
    console.error('검색 히스토리 저장 오류:', error);
  }
};

export const getSearchHistory = (): string[] => {
  try {
    const history = localStorage.getItem('search_history');
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('검색 히스토리 조회 오류:', error);
    return [];
  }
};

export const clearSearchHistory = (): void => {
  try {
    localStorage.removeItem('search_history');
  } catch (error) {
    console.error('검색 히스토리 삭제 오류:', error);
  }
}; 