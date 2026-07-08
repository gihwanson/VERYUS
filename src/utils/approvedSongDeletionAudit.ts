import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  ApprovedSongAutoDeletionRecord,
  DeletedApprovedSongSummary,
} from '../components/AdminTypes';

/** 관리자 패널 회원 삭제 시 자동 삭제된 합격곡 감사 로그 */
export const APPROVED_SONG_DELETION_AUDIT_COLLECTION = 'approved_song_deletion_audit';

export interface SaveApprovedSongDeletionAuditInput {
  deletedMemberUid: string;
  deletedMemberNickname: string;
  deletedByUid: string;
  deletedByNickname: string;
  approvedSongs: DeletedApprovedSongSummary[];
}

export async function saveApprovedSongDeletionAudit(
  input: SaveApprovedSongDeletionAuditInput
): Promise<void> {
  if (input.approvedSongs.length === 0) return;

  await addDoc(collection(db, APPROVED_SONG_DELETION_AUDIT_COLLECTION), {
    source: 'member_delete',
    deletedMemberUid: input.deletedMemberUid,
    deletedMemberNickname: input.deletedMemberNickname,
    deletedByUid: input.deletedByUid,
    deletedByNickname: input.deletedByNickname,
    approvedSongs: input.approvedSongs,
    songCount: input.approvedSongs.length,
    deletedAt: serverTimestamp(),
  });
}

export interface SaveOrphanApprovedSongDeletionAuditInput {
  deletedByUid: string;
  deletedByNickname: string;
  approvedSongs: DeletedApprovedSongSummary[];
  orphanMemberNicknames: string[];
}

export async function saveOrphanApprovedSongDeletionAudit(
  input: SaveOrphanApprovedSongDeletionAuditInput
): Promise<void> {
  if (input.approvedSongs.length === 0) return;

  await addDoc(collection(db, APPROVED_SONG_DELETION_AUDIT_COLLECTION), {
    source: 'orphan_cleanup',
    deletedMemberUid: '',
    deletedMemberNickname: '고아 합격곡 정리',
    deletedByUid: input.deletedByUid,
    deletedByNickname: input.deletedByNickname,
    approvedSongs: input.approvedSongs,
    orphanMemberNicknames: input.orphanMemberNicknames,
    songCount: input.approvedSongs.length,
    deletedAt: serverTimestamp(),
  });
}

export async function fetchApprovedSongDeletionAudits(
  maxRecords = 100
): Promise<ApprovedSongAutoDeletionRecord[]> {
  const snapshot = await getDocs(
    query(
      collection(db, APPROVED_SONG_DELETION_AUDIT_COLLECTION),
      orderBy('deletedAt', 'desc'),
      limit(maxRecords)
    )
  );

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as ApprovedSongAutoDeletionRecord[];
}

/** 이전 admin_deletion_records 컬렉션 호환 (합격곡만 추출) */
export async function fetchLegacyApprovedSongDeletionAudits(
  maxRecords = 50
): Promise<ApprovedSongAutoDeletionRecord[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, 'admin_deletion_records'),
        orderBy('deletedAt', 'desc'),
        limit(maxRecords)
      )
    );

    return snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        const songs = Array.isArray(data.approvedSongs) ? data.approvedSongs : [];
        if (songs.length === 0) return null;
        return {
          id: `legacy-${docSnap.id}`,
          source: 'member_delete',
          deletedMemberUid: String(data.deletedUserUid || ''),
          deletedMemberNickname: String(data.deletedUserNickname || ''),
          deletedByUid: String(data.deletedByUid || ''),
          deletedByNickname: String(data.deletedByNickname || ''),
          deletedAt: data.deletedAt,
          approvedSongs: songs,
          songCount: songs.length,
        } as ApprovedSongAutoDeletionRecord;
      })
      .filter(Boolean) as ApprovedSongAutoDeletionRecord[];
  } catch {
    return [];
  }
}

export async function fetchAllApprovedSongDeletionAudits(
  maxRecords = 100
): Promise<ApprovedSongAutoDeletionRecord[]> {
  const [current, legacy] = await Promise.all([
    fetchApprovedSongDeletionAudits(maxRecords),
    fetchLegacyApprovedSongDeletionAudits(maxRecords),
  ]);

  const merged = [...current];
  const seen = new Set(current.map((record) => record.id));

  legacy.forEach((record) => {
    const key = `${record.deletedMemberNickname}-${record.songCount}-${formatAuditKeyTime(record.deletedAt)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(record);
    }
  });

  return merged.sort((a, b) => getAuditTime(b.deletedAt) - getAuditTime(a.deletedAt));
}

function getAuditTime(value: ApprovedSongAutoDeletionRecord['deletedAt']): number {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatAuditKeyTime(value: ApprovedSongAutoDeletionRecord['deletedAt']): string {
  const ms = getAuditTime(value);
  return ms ? String(ms) : '';
}

export function getOtherMembersOnDeletedSong(
  song: DeletedApprovedSongSummary,
  deletedMemberNickname: string
): string[] {
  const deleted = deletedMemberNickname.trim();
  return (song.members || [])
    .map((member) => String(member).trim())
    .filter((member) => member && member !== deleted);
}

export function songHadOtherMembers(
  song: DeletedApprovedSongSummary,
  deletedMemberNickname: string
): boolean {
  return getOtherMembersOnDeletedSong(song, deletedMemberNickname).length > 0;
}

export function getOrphanMembersOnSong(
  song: DeletedApprovedSongSummary,
  orphanMemberNicknames: string[]
): string[] {
  const orphanSet = new Set(orphanMemberNicknames.map((n) => n.trim()).filter(Boolean));
  return (song.members || [])
    .map((member) => String(member).trim())
    .filter((member) => member && orphanSet.has(member));
}

export function songHasRegisteredAndOrphanMembers(
  song: DeletedApprovedSongSummary,
  orphanMemberNicknames: string[]
): boolean {
  const orphanSet = new Set(orphanMemberNicknames.map((n) => n.trim()).filter(Boolean));
  const members = (song.members || []).map((m) => String(m).trim()).filter(Boolean);
  const hasOrphan = members.some((m) => orphanSet.has(m));
  const hasRegistered = members.some((m) => !orphanSet.has(m));
  return hasOrphan && hasRegistered;
}
