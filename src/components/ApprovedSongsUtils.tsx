import { Timestamp } from 'firebase/firestore';
import { GRADE_ORDER, GRADE_SYSTEM } from './AdminTypes';

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
    isRegularMember?: boolean;
  };
}

export type SongType = 'all' | 'solo' | 'duet';
export type SortType = 'title' | 'latest';
export type TabType = 'all' | 'solo' | 'duet' | 'manage' | 'grade';

/** 멤버 전원이 현재 등록 회원인 합격곡만 표시 (삭제된 회원 포함 곡·듀엣 제외) */
export const filterSongsWithExistingMembers = (
  songs: ApprovedSong[],
  userMap: UserMap
): ApprovedSong[] => {
  return songs.filter((song) => {
    const members = Array.isArray(song.members)
      ? song.members.map((member) => String(member).trim()).filter(Boolean)
      : [];
    if (members.length === 0) return false;
    return members.every((member) => Boolean(userMap[member]));
  });
};

// 곡 필터링 함수
export const filterSongsByType = (songs: ApprovedSong[], songType: SongType): ApprovedSong[] => {
  return songs.filter(song => {
    if (songType === 'solo') return Array.isArray(song.members) && song.members.length === 1;
    if (songType === 'duet') return Array.isArray(song.members) && song.members.length >= 2;
    return true;
  });
};

const MEMBER_SEARCH_DELIMITER = /[,，、·/&+]+/;

const normalizeMemberSearchText = (value: string) =>
  value.replace(/\s+/g, '').toLowerCase();

const parseMemberSearchTerms = (searchTerm: string): string[] =>
  searchTerm
    .split(MEMBER_SEARCH_DELIMITER)
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

const memberIncludesTerm = (members: string[], term: string): boolean => {
  const normalizedTerm = normalizeMemberSearchText(term);
  if (!normalizedTerm) return false;
  return members.some((member) =>
    normalizeMemberSearchText(String(member)).includes(normalizedTerm)
  );
};

const membersDisplayIncludesTerm = (members: string[], term: string): boolean => {
  const joined = members.map((m) => String(m).trim()).join(', ');
  const normalizedJoined = normalizeMemberSearchText(joined);
  const normalizedTerm = normalizeMemberSearchText(term);
  return normalizedTerm.length > 0 && normalizedJoined.includes(normalizedTerm);
};

// 검색 필터링 함수 (단일: 제목·닉네임, 복수: 쉼표 등으로 구분한 듀엣/합창 멤버 전원 매칭)
export const filterSongsBySearch = (songs: ApprovedSong[], searchTerm: string): ApprovedSong[] => {
  const raw = searchTerm.trim();
  if (!raw) return songs;

  const terms = parseMemberSearchTerms(raw);
  const isMultiMemberSearch = terms.length >= 2;

  return songs.filter((song) => {
    const members = Array.isArray(song.members)
      ? song.members.map((m) => String(m).trim()).filter(Boolean)
      : [];
    const titleLower = song.title?.toLowerCase() || '';

    if (isMultiMemberSearch) {
      return terms.every((term) => memberIncludesTerm(members, term));
    }

    const singleTerm = terms[0] || raw.toLowerCase();
    const titleMatch = titleLower.includes(singleTerm);
    const memberMatch = memberIncludesTerm(members, singleTerm);
    const duetDisplayMatch = membersDisplayIncludesTerm(members, raw);
    return titleMatch || memberMatch || duetDisplayMatch;
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

/** 합격곡 관리 탭 등재 닉네임 (관리 목록용, 일반멤버 전환·삭제된 회원 제외) */
export const getApprovedSongMembers = (songs: ApprovedSong[], userMap: UserMap): string[] => {
  return getUniqueMembers(songs)
    .filter((nickname) => Boolean(userMap[nickname]))
    .filter((nickname) => !userMap[nickname]?.isRegularMember)
    .sort((a, b) => a.localeCompare(b, 'ko'));
};

/** 합격곡 관리 탭 버스킹멤버 (당월 최초 등재·일반멤버 전환·삭제된 회원 제외) */
export const getBuskingMembers = (songs: ApprovedSong[], userMap: UserMap): string[] => {
  const firstApprovedDates = getMemberFirstApprovedDates(songs);
  return getApprovedSongMembers(songs, userMap).filter(
    (nickname) => !isApprovedInCurrentMonth(firstApprovedDates[nickname])
  );
};

/** 합격곡 관리 탭 일반멤버 */
export const getRegularMembers = (
  allNicknames: string[],
  buskingMembers: string[],
  userMap: UserMap,
  songs: ApprovedSong[] = []
): string[] => {
  const buskingSet = new Set(buskingMembers);
  const firstApprovedDates = getMemberFirstApprovedDates(songs);
  return allNicknames
    .filter((nickname) => {
      if (userMap[nickname]?.grade === GRADE_SYSTEM.CRESCENT) return false;
      if (userMap[nickname]?.isRegularMember) return true;
      if (isApprovedInCurrentMonth(firstApprovedDates[nickname])) return true;
      if (buskingSet.has(nickname)) return false;
      const joinDate = parseFirestoreDate(userMap[nickname]?.createdAt);
      return !isJoinedInCurrentMonth(joinDate);
    })
    .sort((a, b) => a.localeCompare(b, 'ko'));
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

export const buildUserMapFromSnapshot = (
  docs: Array<{ data: () => Record<string, unknown> }>
): { map: UserMap; nicknames: string[] } => {
  const map: UserMap = {};
  const nicknames: string[] = [];
  docs.forEach((snapshotDoc) => {
    const data = snapshotDoc.data();
    const nickname = typeof data.nickname === 'string' ? data.nickname : '';
    if (!nickname) return;
    map[nickname] = {
      grade: typeof data.grade === 'string' ? data.grade : undefined,
      createdAt: data.createdAt,
      isRegularMember: Boolean(data.isRegularMember),
    };
    nicknames.push(nickname);
  });
  return { map, nicknames };
};

// 폼 데이터 검증
export const validateSongForm = (form: { title: string; members: string[] }): boolean => {
  return form.title.trim() !== '' && !form.members.some(m => !m.trim());
};

const normalizeApprovedSongTitle = (title: string) =>
  title.replace(/\s/g, '').toLowerCase();

const normalizeApprovedSongMembers = (members: string[]) =>
  members.map((m) => m.trim()).filter(Boolean).sort();

/** 곡 제목과 닉네임(멤버) 조합이 기존 합격곡과 중복인지 확인 */
export const findDuplicateApprovedSong = (
  songs: ApprovedSong[],
  title: string,
  members: string[],
  excludeId?: string | null
): ApprovedSong | undefined => {
  const normalizedTitle = normalizeApprovedSongTitle(title);
  const normalizedMembers = normalizeApprovedSongMembers(members);

  return songs.find((song) => {
    if (excludeId && song.id === excludeId) return false;
    const songTitle = normalizeApprovedSongTitle(song.titleNoSpace || song.title);
    if (songTitle !== normalizedTitle) return false;
    const songMembers = normalizeApprovedSongMembers(
      Array.isArray(song.members) ? song.members.map((m) => String(m)) : []
    );
    if (songMembers.length !== normalizedMembers.length) return false;
    return songMembers.every((m, i) => m === normalizedMembers[i]);
  });
};

/** 중복 합격곡 등록 시 사용자 확인 */
export const confirmDuplicateApprovedSongRegistration = (duplicate: ApprovedSong): boolean => {
  const membersLabel = normalizeApprovedSongMembers(
    Array.isArray(duplicate.members) ? duplicate.members.map((m) => String(m)) : []
  ).join(', ');
  return window.confirm(
    `이미 등록된 곡입니다.\n\n곡명: ${duplicate.title}\n닉네임: ${membersLabel}\n\n그래도 등록하시겠습니까?`
  );
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