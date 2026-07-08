import {

  collection,

  getDocs,

  query,

  where,

  type DocumentReference,

} from 'firebase/firestore';

import { db } from '../firebase';

import type { ApprovedSong } from '../components/ApprovedSongsUtils';



export interface ApprovedSongRemovalTarget {

  ref: DocumentReference;

  id: string;

  title: string;

  members: string[];

}



const normalizeNickname = (value: string) => value.trim();



const songMembersIncludeNickname = (members: unknown, nickname: string): boolean => {

  if (!Array.isArray(members)) return false;

  const trimmed = normalizeNickname(nickname);

  if (!trimmed) return false;

  return members.some((member) => normalizeNickname(String(member)) === trimmed);

};



const toRemovalTarget = (docSnap: {

  id: string;

  ref: DocumentReference;

  data: () => Record<string, unknown>;

}): ApprovedSongRemovalTarget => {

  const data = docSnap.data();

  const members = Array.isArray(data.members)

    ? data.members.map((member) => String(member).trim()).filter(Boolean)

    : [];

  return {

    ref: docSnap.ref,

    id: docSnap.id,

    title: String(data.title || data.titleNoSpace || '(제목 없음)'),

    members,

  };

};



/** 닉네임이 members에 포함된 합격곡 수집 (듀엣·합창 포함, 해당 곡 전체 삭제 대상) */

export async function collectApprovedSongsForNickname(

  nickname: string

): Promise<ApprovedSongRemovalTarget[]> {

  const trimmed = normalizeNickname(nickname);

  if (!trimmed) return [];



  const targetMap = new Map<string, ApprovedSongRemovalTarget>();



  const addTargets = (docs: { id: string; ref: DocumentReference; data: () => Record<string, unknown> }[]) => {

    docs.forEach((docSnap) => {

      targetMap.set(docSnap.id, toRemovalTarget(docSnap));

    });

  };



  const queries = [
    getDocs(
      query(collection(db, 'approvedSongs'), where('members', 'array-contains', trimmed))
    ),
  ];

  if (trimmed !== nickname) {
    queries.push(
      getDocs(
        query(collection(db, 'approvedSongs'), where('members', 'array-contains', nickname))
      )
    );
  }

  const snapshots = await Promise.all(queries);
  snapshots.forEach((snap) => addTargets(snap.docs));



  return Array.from(targetMap.values());

}



/** @deprecated collectApprovedSongsForNickname 사용 */

export async function collectApprovedSongRefsForNickname(

  nickname: string

): Promise<DocumentReference[]> {

  const targets = await collectApprovedSongsForNickname(nickname);

  return targets.map((target) => target.ref);

}



/** 등록된 회원(userMap)에 없는 멤버가 포함된 합격곡 찾기 */

export function findOrphanedApprovedSongs(

  songs: ApprovedSong[],

  registeredNicknames: Set<string>

): ApprovedSong[] {

  return songs.filter((song) => {

    const members = Array.isArray(song.members)

      ? song.members.map((member) => normalizeNickname(String(member))).filter(Boolean)

      : [];

    if (members.length === 0) return true;

    return members.some((member) => !registeredNicknames.has(member));

  });

}


