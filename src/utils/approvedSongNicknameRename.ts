import { doc, Timestamp, writeBatch } from 'firebase/firestore';
import type { ApprovedSong } from '../components/ApprovedSongsUtils';
import { db } from '../firebase';
import {
  approvedSongCountsByNicknameFromDocs,
  notifyStaffOnApprovedSongCountMilestones,
} from './approvedSongMilestone';

const BATCH_LIMIT = 400;

export function memberNicknameKey(value: string): string {
  return value.trim();
}

export function songMembersContainNickname(
  members: string[] | undefined,
  nickname: string
): boolean {
  const key = memberNicknameKey(nickname);
  if (!key || !Array.isArray(members)) return false;
  return members.some((member) => memberNicknameKey(String(member)) === key);
}

/** 멤버 배열에서 닉네임을 바꾸고, 바꾼 결과만 반환. 변경이 없으면 null. */
export function replaceApprovedSongMemberNickname(
  members: string[],
  from: string,
  to: string
): string[] | null {
  const fromKey = memberNicknameKey(from);
  const toKey = memberNicknameKey(to);
  if (!fromKey || !toKey || fromKey === toKey) return null;

  let changed = false;
  const next: string[] = [];
  const seen = new Set<string>();

  for (const raw of members) {
    const name = memberNicknameKey(String(raw));
    if (!name) continue;
    const replaced = name === fromKey ? toKey : name;
    if (replaced !== name) changed = true;
    if (seen.has(replaced)) continue;
    seen.add(replaced);
    next.push(replaced);
  }

  return changed ? next : null;
}

export function listUnmatchedApprovedSongNicknames(
  songs: ApprovedSong[],
  registeredNicknames: string[]
): Array<{ nickname: string; songCount: number }> {
  const registered = new Set(
    registeredNicknames.map((name) => memberNicknameKey(name)).filter(Boolean)
  );
  const counts = new Map<string, number>();

  for (const song of songs) {
    const seen = new Set<string>();
    for (const raw of song.members || []) {
      const name = memberNicknameKey(String(raw));
      if (!name || registered.has(name) || seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([nickname, songCount]) => ({ nickname, songCount }))
    .sort((a, b) => b.songCount - a.songCount || a.nickname.localeCompare(b.nickname, 'ko'));
}

export async function renameApprovedSongMember(params: {
  songs: ApprovedSong[];
  from: string;
  to: string;
  updatedBy: string;
}): Promise<number> {
  const fromKey = memberNicknameKey(params.from);
  const toKey = memberNicknameKey(params.to);
  if (!fromKey || !toKey) {
    throw new Error('기존 닉네임과 새 닉네임을 입력해 주세요.');
  }
  if (fromKey === toKey) {
    throw new Error('기존 닉네임과 새 닉네임이 같습니다.');
  }

  const updates: Array<{ id: string; members: string[] }> = [];
  const nextSongs = params.songs.map((song) => {
    const members = replaceApprovedSongMemberNickname(song.members || [], fromKey, toKey);
    if (!members) return song;
    updates.push({ id: song.id, members });
    return { ...song, members };
  });

  if (updates.length === 0) {
    throw new Error('해당 닉네임이 들어간 합격곡이 없습니다.');
  }

  const toCountDoc = (song: ApprovedSong) => ({
    data: () => ({
      title: song.title,
      titleNoSpace: song.titleNoSpace,
      members: song.members,
    }),
  });

  const countsBefore = approvedSongCountsByNicknameFromDocs(params.songs.map(toCountDoc));

  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_LIMIT).forEach((item) => {
      batch.update(doc(db, 'approvedSongs', item.id), {
        members: item.members,
        updatedAt: Timestamp.now(),
        updatedBy: params.updatedBy,
      });
    });
    await batch.commit();
  }

  const countsAfter = approvedSongCountsByNicknameFromDocs(nextSongs.map(toCountDoc));
  void notifyStaffOnApprovedSongCountMilestones({
    countsByNicknameBefore: countsBefore,
    countsByNicknameAfter: countsAfter,
    affectedNicknames: [fromKey, toKey],
  }).catch((error) => console.error('합격곡 마일스톤 알림 실패:', error));

  return updates.length;
}
