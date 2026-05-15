import { GRADE_ORDER } from '../AdminTypes';
import { getGradeEmoji } from '../../utils/gradeDisplay';
import type { FlexibleCard, RequestSongCard, SetListEntry, SetListItem } from './types';

export type ParadeMemberGrade = {
  nickname: string;
  gradeEmoji: string;
  gradeRank: number;
};

/** 진행 탭 표시용 — 최고 등급 가운데, 나머지는 크기 순으로 양옆 */
export type ParadeMemberDisplay = ParadeMemberGrade & {
  layoutSlot: 'center' | `left-${number}` | `right-${number}`;
  sizeRank: number;
};

/** 등급 높은 순 정렬 후, 가운데·양옆 대칭 배치 */
export function layoutMemberGradesCentered(
  members: ParadeMemberGrade[]
): ParadeMemberDisplay[] {
  if (members.length === 0) return [];
  const sorted = [...members].sort((a, b) => b.gradeRank - a.gradeRank);
  if (sorted.length === 1) {
    return [{ ...sorted[0], layoutSlot: 'center', sizeRank: 0 }];
  }

  const center = sorted[0];
  const rest = sorted.slice(1);
  const left: ParadeMemberDisplay[] = [];
  const right: ParadeMemberDisplay[] = [];

  rest.forEach((m, i) => {
    const sizeRank = i + 1;
    const depth = Math.floor(i / 2) + 1;
    if (i % 2 === 0) {
      left.unshift({ ...m, layoutSlot: `left-${depth}`, sizeRank });
    } else {
      right.push({ ...m, layoutSlot: `right-${depth}`, sizeRank });
    }
  });

  return [...left, { ...center, layoutSlot: 'center', sizeRank: 0 }, ...right];
}

export type ParadeEntryKind = 'song' | 'flexible' | 'request';

export type ParadeEntry = {
  id: string;
  order: number;
  kind: ParadeEntryKind;
  nickname: string;
  gradeEmoji: string;
  memberGrades: ParadeMemberDisplay[];
  bubbleText: string;
  subLabel?: string;
};

export function paradeEntryIncludesNickname(entry: ParadeEntry, nickname: string): boolean {
  const me = nickname.trim();
  if (!me) return false;
  return entry.memberGrades.some((m) => m.nickname.trim() === me);
}

function getGradeRank(grade: string | undefined | null): number {
  const emoji = getGradeEmoji(grade);
  const idx = (GRADE_ORDER as readonly string[]).indexOf(emoji);
  return idx >= 0 ? idx : 0;
}

export function buildMemberGrades(
  members: string[],
  gradeByNickname: Record<string, string | undefined>
): ParadeMemberGrade[] {
  const unique = [...new Set(members.map((m) => m.trim()).filter(Boolean))];
  return unique
    .map((nickname) => ({
      nickname,
      gradeEmoji: getGradeEmoji(gradeByNickname[nickname]),
      gradeRank: getGradeRank(gradeByNickname[nickname])
    }))
    .sort((a, b) => b.gradeRank - a.gradeRank);
}

function isFlexible(entry: SetListEntry): entry is FlexibleCard {
  return 'type' in entry && entry.type === 'flexible';
}

function isRequestSong(entry: SetListEntry): entry is RequestSongCard {
  return 'type' in entry && entry.type === 'requestSong';
}

function isSong(entry: SetListEntry): entry is SetListItem {
  if ('type' in entry && entry.type === 'flexible') return false;
  if ('type' in entry && entry.type === 'requestSong') return false;
  return 'songId' in entry || 'title' in entry;
}

export function buildParadeEntries(
  items: SetListEntry[],
  gradeByNickname: Record<string, string | undefined>
): ParadeEntry[] {
  return items.map((item, index) => {
    if (isFlexible(item)) {
      const firstFilled = item.slots?.find((s) => s.title?.trim());
      const memberGrades = layoutMemberGradesCentered(
        buildMemberGrades([item.nickname], gradeByNickname)
      );
      return {
        id: item.id,
        order: index,
        kind: 'flexible',
        nickname: item.nickname,
        gradeEmoji: memberGrades.find((m) => m.layoutSlot === 'center')?.gradeEmoji ?? getGradeEmoji(undefined),
        memberGrades,
        bubbleText: firstFilled?.title?.trim() || `자유곡 ${item.totalSlots}곡`,
        subLabel: `${item.totalSlots}슬롯`
      };
    }

    if (isRequestSong(item)) {
      const first = item.songs?.[0];
      const nickname = first?.requestedBy?.trim() || '신청곡';
      const memberGrades = layoutMemberGradesCentered(
        buildMemberGrades([nickname], gradeByNickname)
      );
      return {
        id: item.id,
        order: index,
        kind: 'request',
        nickname,
        gradeEmoji: memberGrades.find((m) => m.layoutSlot === 'center')?.gradeEmoji ?? getGradeEmoji(undefined),
        memberGrades,
        bubbleText: first?.title?.trim() || `신청곡 ${item.songs?.length || 0}곡`,
        subLabel: item.songs?.length ? `${item.songs.length}곡` : undefined
      };
    }

    if (isSong(item)) {
      const members = (item.members || []).map((m) => m.trim()).filter(Boolean);
      const primary = members[0] || '멤버';
      const sortedMembers = buildMemberGrades(members.length > 0 ? members : [primary], gradeByNickname);
      const memberGrades = layoutMemberGradesCentered(sortedMembers);
      const displayName = members.length > 1 ? members.join(' · ') : primary;
      const membersLabel =
        members.length > 1 ? undefined : item.artist;

      return {
        id: item.songId || `song-${index}`,
        order: index,
        kind: 'song',
        nickname: displayName,
        gradeEmoji: memberGrades.find((m) => m.layoutSlot === 'center')?.gradeEmoji ?? getGradeEmoji(undefined),
        memberGrades,
        bubbleText: item.title || '제목 없음',
        subLabel: membersLabel || undefined
      };
    }

    const fallbackGrades = layoutMemberGradesCentered(buildMemberGrades(['?'], gradeByNickname));
    return {
      id: `unknown-${index}`,
      order: index,
      kind: 'song',
      nickname: '?',
      gradeEmoji: getGradeEmoji(undefined),
      memberGrades: fallbackGrades,
      bubbleText: '알 수 없는 항목'
    };
  });
}
