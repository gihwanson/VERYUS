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
    createdAt?: unknown;
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

// 멤버별 최초 합격곡 등재일
export const getMemberFirstApprovedDates = (songs: ApprovedSong[]): Record<string, Date> => {
  const dates: Record<string, Date> = {};

  for (const song of songs) {
    if (!Array.isArray(song.members) || !song.createdAt) continue;

    const date = song.createdAt instanceof Timestamp
      ? song.createdAt.toDate()
      : new Date(song.createdAt);

    for (const member of song.members) {
      const nickname = member.trim();
      if (!nickname) continue;
      if (!dates[nickname] || date < dates[nickname]) {
        dates[nickname] = date;
      }
    }
  }

  return dates;
};

export const formatApprovedDateKorean = (date: Date | undefined): string => {
  if (!date) return '';
  return `(${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일)`;
};

export const isApprovedInCurrentMonth = (
  date: Date | undefined,
  referenceDate: Date = new Date()
): boolean => {
  if (!date) return false;
  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth()
  );
};

export const parseFirestoreDate = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (value instanceof Date) return value;
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export const isJoinedInCurrentMonth = (
  date: Date | undefined,
  referenceDate: Date = new Date()
): boolean => isApprovedInCurrentMonth(date, referenceDate);

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