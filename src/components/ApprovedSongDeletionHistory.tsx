import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { ChevronDown, ChevronUp, Music2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import type { ApprovedSongAutoDeletionRecord } from './AdminTypes';
import type { ApprovedSong } from './ApprovedSongsUtils';
import { findOrphanedApprovedSongs } from '../utils/approvedSongMemberCleanup';
import {
  fetchAllApprovedSongDeletionAudits,
  getOrphanMembersOnSong,
  getOtherMembersOnDeletedSong,
  saveOrphanApprovedSongDeletionAudit,
  songHadOtherMembers,
  songHasRegisteredAndOrphanMembers,
} from '../utils/approvedSongDeletionAudit';
import GlobalLoadingScreen from './GlobalLoadingScreen';

interface ApprovedSongDeletionHistoryProps {
  isLeader?: boolean;
}

const ApprovedSongDeletionHistory: React.FC<ApprovedSongDeletionHistoryProps> = ({
  isLeader = false,
}) => {
  const userString = localStorage.getItem('veryus_user');
  const currentUser = userString ? JSON.parse(userString) : null;

  const [records, setRecords] = useState<ApprovedSongAutoDeletionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [orphanCleanupLoading, setOrphanCleanupLoading] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllApprovedSongDeletionAudits();
      setRecords(data);
    } catch (error) {
      console.error('합격곡 삭제 내역 로딩 실패:', error);
      alert('합격곡 삭제 내역을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((record) =>
      record.deletedMemberNickname.toLowerCase().includes(q) ||
      record.deletedByNickname.toLowerCase().includes(q) ||
      (record.orphanMemberNicknames || []).some((n) => n.toLowerCase().includes(q)) ||
      record.approvedSongs.some((song) =>
        song.title.toLowerCase().includes(q) ||
        song.members.some((member) => member.toLowerCase().includes(q))
      )
    );
  }, [records, search]);

  const formatTime = (value: ApprovedSongAutoDeletionRecord['deletedAt']) => {
    const date =
      value instanceof Timestamp ? value.toDate() :
      value instanceof Date ? value :
      new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR');
  };

  const toggleExpanded = (recordId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const handleCleanupOrphanedSongs = async () => {
    setOrphanCleanupLoading(true);
    try {
      const [songsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'approvedSongs')),
        getDocs(collection(db, 'users')),
      ]);

      const registeredNicknames = new Set(
        usersSnap.docs
          .map((userDoc) => String(userDoc.data().nickname || '').trim())
          .filter(Boolean)
      );

      const orphanedSongs = findOrphanedApprovedSongs(
        songsSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as ApprovedSong[],
        registeredNicknames
      );

      if (orphanedSongs.length === 0) {
        alert('정리할 고아 합격곡이 없습니다.');
        return;
      }

      const preview = orphanedSongs
        .slice(0, 5)
        .map((song) => `- ${song.title} (${(song.members || []).join(', ')})`)
        .join('\n');
      const moreCount = orphanedSongs.length > 5 ? `\n... 외 ${orphanedSongs.length - 5}곡` : '';

      if (
        !window.confirm(
          `삭제된 회원이 포함된 합격곡 ${orphanedSongs.length}곡을 DB에서 삭제할까요?\n\n${preview}${moreCount}`
        )
      ) {
        return;
      }

      const CHUNK = 450;
      for (let i = 0; i < orphanedSongs.length; i += CHUNK) {
        const batch = writeBatch(db);
        orphanedSongs.slice(i, i + CHUNK).forEach((song) => {
          batch.delete(doc(db, 'approvedSongs', song.id));
        });
        await batch.commit();
      }

      const orphanMemberNicknames = Array.from(
        new Set(
          orphanedSongs.flatMap((song) =>
            (song.members || [])
              .map((member) => String(member).trim())
              .filter((member) => member && !registeredNicknames.has(member))
          )
        )
      ).sort((a, b) => a.localeCompare(b, 'ko'));

      const deletedSongs = orphanedSongs.map((song) => ({
        id: song.id,
        title: song.title,
        members: Array.isArray(song.members) ? song.members.map(String) : [],
      }));

      if (currentUser?.uid) {
        await saveOrphanApprovedSongDeletionAudit({
          deletedByUid: currentUser.uid,
          deletedByNickname: currentUser.nickname || '관리자',
          approvedSongs: deletedSongs,
          orphanMemberNicknames,
        });
      }

      await loadRecords();
      alert(`고아 합격곡 ${orphanedSongs.length}곡을 삭제했습니다.\n삭제 내역에 기록되었습니다.`);
    } catch (error) {
      console.error('고아 합격곡 정리 실패:', error);
      alert('고아 합격곡 정리에 실패했습니다.');
    } finally {
      setOrphanCleanupLoading(false);
    }
  };

  if (loading) {
    return <GlobalLoadingScreen message="삭제 내역을 불러오는 중..." />;
  }

  return (
    <div className="approved-song-deletion-history">
      <div className="approved-song-deletion-history__intro">
        <h3>합격곡 자동·수동 삭제 내역</h3>
        <p>
          관리자 패널에서 멤버를 삭제할 때 자동으로 함께 삭제된 합격곡, 또는 「고아 합격곡 정리」로
          수동 삭제한 합격곡 기록입니다. 다른 멤버의 곡이 잘못 삭제되지 않았는지 확인하는
          감사 기록입니다.
        </p>
      </div>

      <div className="approved-song-deletion-history__toolbar">
        <div className="approved-song-deletion-history__search">
          <Search size={18} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="삭제된 멤버, 관리자, 곡 제목 검색..."
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="검색어 지우기">
              <X size={16} />
            </button>
          )}
        </div>
        <button type="button" className="approved-song-deletion-history__refresh" onClick={loadRecords}>
          <RefreshCw size={16} />
          새로고침
        </button>
        {isLeader && (
          <button
            type="button"
            className="approved-song-deletion-history__cleanup"
            onClick={handleCleanupOrphanedSongs}
            disabled={orphanCleanupLoading}
          >
            {orphanCleanupLoading ? '정리 중...' : '고아 합격곡 정리'}
          </button>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <p className="approved-song-deletion-history__empty">
          {records.length === 0
            ? '아직 기록된 자동 삭제 내역이 없습니다.'
            : '검색 조건에 맞는 내역이 없습니다.'}
        </p>
      ) : (
        <div className="approved-song-deletion-history__list">
          {filteredRecords.map((record) => {
            const expanded = expandedIds.has(record.id);
            const songCount = record.songCount ?? record.approvedSongs?.length ?? 0;
            const isOrphanCleanup = record.source === 'orphan_cleanup';
            const orphanNicknames = record.orphanMemberNicknames || [];

            const hasCoMemberDeletions = isOrphanCleanup
              ? record.approvedSongs.some((song) =>
                  songHasRegisteredAndOrphanMembers(song, orphanNicknames)
                )
              : record.approvedSongs.some((song) =>
                  songHadOtherMembers(song, record.deletedMemberNickname)
                );

            return (
              <article
                key={record.id}
                className={`approved-song-deletion-history__card${
                  isOrphanCleanup ? ' approved-song-deletion-history__card--orphan' : ''
                }`}
              >
                <button
                  type="button"
                  className="approved-song-deletion-history__summary"
                  onClick={() => toggleExpanded(record.id)}
                >
                  <div className="approved-song-deletion-history__summary-main">
                    <div className="approved-song-deletion-history__title-row">
                      <Trash2 size={16} />
                      {isOrphanCleanup ? (
                        <>
                          <strong>고아 합격곡 정리</strong>
                          <span>합격곡 {songCount}곡 수동 삭제</span>
                        </>
                      ) : (
                        <>
                          <strong>{record.deletedMemberNickname}</strong>
                          <span>회원 삭제로 합격곡 {songCount}곡 자동 삭제</span>
                        </>
                      )}
                    </div>
                    <div className="approved-song-deletion-history__meta">
                      <span>{formatTime(record.deletedAt)}</span>
                      <span>처리: {record.deletedByNickname}</span>
                      {isOrphanCleanup && orphanNicknames.length > 0 && (
                        <span>미등록 멤버: {orphanNicknames.join(', ')}</span>
                      )}
                    </div>
                    {hasCoMemberDeletions && (
                      <p className="approved-song-deletion-history__warning">
                        ⚠️ 다른 멤버가 포함된 듀엣/합창곡이 함께 삭제된 기록이 있습니다.
                      </p>
                    )}
                  </div>
                  {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {expanded && (
                  <ul className="approved-song-deletion-history__songs">
                    {record.approvedSongs.map((song) => {
                      if (isOrphanCleanup) {
                        const orphanOnSong = getOrphanMembersOnSong(song, orphanNicknames);
                        const registeredOnSong = (song.members || [])
                          .map((m) => String(m).trim())
                          .filter((m) => m && !orphanOnSong.includes(m));
                        return (
                          <li
                            key={song.id}
                            className={
                              registeredOnSong.length > 0
                                ? 'approved-song-deletion-history__song--with-others'
                                : undefined
                            }
                          >
                            <Music2 size={14} />
                            <span className="approved-song-deletion-history__song-title">{song.title}</span>
                            <span className="approved-song-deletion-history__song-members">
                              멤버: {(song.members || []).join(', ')}
                            </span>
                            {orphanOnSong.length > 0 && (
                              <span className="approved-song-deletion-history__song-alert">
                                미등록 멤버({orphanOnSong.join(', ')}) 포함
                              </span>
                            )}
                            {registeredOnSong.length > 0 && (
                              <span className="approved-song-deletion-history__song-alert">
                                등록 멤버({registeredOnSong.join(', ')}) 곡도 함께 삭제됨
                              </span>
                            )}
                          </li>
                        );
                      }

                      const otherMembers = getOtherMembersOnDeletedSong(
                        song,
                        record.deletedMemberNickname
                      );
                      return (
                        <li
                          key={song.id}
                          className={
                            otherMembers.length > 0
                              ? 'approved-song-deletion-history__song--with-others'
                              : undefined
                          }
                        >
                          <Music2 size={14} />
                          <span className="approved-song-deletion-history__song-title">{song.title}</span>
                          <span className="approved-song-deletion-history__song-members">
                            멤버: {(song.members || []).join(', ')}
                          </span>
                          {otherMembers.length > 0 && (
                            <span className="approved-song-deletion-history__song-alert">
                              다른 멤버({otherMembers.join(', ')}) 곡도 함께 삭제됨
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApprovedSongDeletionHistory;
