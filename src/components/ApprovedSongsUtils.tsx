import { Timestamp } from 'firebase/firestore';
import { GRADE_ORDER } from './AdminTypes';

// 타입 정의
export interface ApprovedSong {
  id: string;
  title: string;
  titleNoSpace: string;
  members: string[];
  createdAt: Timestamp;
  createdBy: string;
  createdByRole: string;
  approvedPostId?: string;
  audioUrl?: string;
  duration?: number;
  fileName?: string;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface UserMap {
  [nickname: string]: {
    grade?: string;
  };
}

export type SongType = 'all' | 'solo' | 'duet';
export type SortType = 'title' | 'latest';
export type TabType = 'all' | 'solo' | 'duet' | 'manage' | 'grade';

// 곡 필터링 함수
export const filterSongsByType = (songs: ApprovedSong[], songType: SongType): ApprovedSong[] => {
  return songs.filter(song => {
    if (songType === 'solo') return Array.isArray(song.members) && song.members.length === 1;
    if (songType === 'duet') return Array.isArray(song.members) && song.members.length >= 2;
    return true;
  });
};

// 검색 필터링 함수
export const filterSongsBySearch = (songs: ApprovedSong[], searchTerm: string): ApprovedSong[] => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return songs;
  
  return songs.filter(song => {
    const titleMatch = song.title?.toLowerCase().includes(term);
    const memberMatch = Array.isArray(song.members) && 
      song.members.some((m: string) => m.toLowerCase().includes(term));
    return titleMatch || memberMatch;
  });
};

// 버스킹 검색 함수
export const searchBuskingSongs = (songs: ApprovedSong[], attendees: string[]): ApprovedSong[] => {
  if (attendees.length === 0) return [];
  
  return songs.filter(song =>
    Array.isArray(song.members) && 
    song.members.every((member: string) => attendees.includes(member))
  ).map(song => ({ 
    ...song, 
    members: [...(song.members || [])].sort() 
  }));
};

// 등급 인덱스 가져오기 (안전한 방식)
export const getGradeIndex = (grade: string): number => {
  return GRADE_ORDER.indexOf(grade as any);
};

// 등급순 정렬 함수
export const sortSongsByGrade = (songs: ApprovedSong[], userMap: UserMap): ApprovedSong[] => {
  return [...songs].sort((a, b) => {
    const getMaxGradeIdx = (song: ApprovedSong) => {
      const idxs = (song.members || []).map((m: string) => 
        getGradeIndex(userMap[m]?.grade || '🍒')
      );
      return Math.min(...(idxs.length ? idxs : [GRADE_ORDER.length - 1]));
    };
    return getMaxGradeIdx(a) - getMaxGradeIdx(b);
  });
};

// 최고 등급 가져오기
export const getMaxGrade = (song: ApprovedSong, userMap: UserMap): string => {
  const idxs = (song.members || []).map((m: string) => 
    getGradeIndex(userMap[m]?.grade || '🍒')
  );
  const minIdx = Math.min(...(idxs.length ? idxs : [GRADE_ORDER.length - 1]));
  return GRADE_ORDER[minIdx] || '🍒';
};

// 중복 없는 닉네임 추출
export const getUniqueMembers = (songs: ApprovedSong[]): string[] => {
  const allMembers = songs.flatMap(song => 
    Array.isArray(song.members) ? song.members : []
  );
  return Array.from(new Set(allMembers));
};

// 폼 데이터 검증
export const validateSongForm = (form: { title: string; members: string[] }): boolean => {
  return form.title.trim() !== '' && !form.members.some(m => !m.trim());
};

// Firestore 데이터를 ApprovedSong 타입으로 변환
export const convertFirestoreData = (doc: any): ApprovedSong => {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title || '',
    titleNoSpace: data.titleNoSpace || '',
    members: Array.isArray(data.members) ? data.members : [],
    createdAt: data.createdAt || Timestamp.now(),
    createdBy: data.createdBy || '',
    createdByRole: data.createdByRole || '',
    approvedPostId: data.approvedPostId || '',
    audioUrl: data.audioUrl || '',
    duration: typeof data.duration === 'number' ? data.duration : undefined,
    fileName: data.fileName || '',
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy
  } as ApprovedSong;
}; 