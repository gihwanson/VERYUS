import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, RefreshCw, Search, X } from 'lucide-react';
import {
  buildCurrentMemberEmailsFromUsersSnap,
  fetchAllEmailRegistrationHistories,
  fetchEmailHistoryPanelData,
  formatEmailHistoryEntryTime,
  syncCurrentMembersToEmailHistory,
  type CurrentMemberEmailRow,
  type EmailRegistrationHistoryDoc,
} from '../utils/emailRegistrationHistory';
import { getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { LoadingSpinner, EmptyState } from './AdminComponents';

type EmailHistoryView = 'duplicate' | 'single' | 'current';

interface AdminEmailHistoryPanelProps {
  isActive: boolean;
}

const AdminEmailHistoryPanel: React.FC<AdminEmailHistoryPanelProps> = ({ isActive }) => {
  const [histories, setHistories] = useState<Array<EmailRegistrationHistoryDoc & { id: string }>>([]);
  const [currentMembers, setCurrentMembers] = useState<CurrentMemberEmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<EmailHistoryView>('duplicate');
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const loadHistories = useCallback(async () => {
    setLoading(true);
    try {
      const { histories: data, currentMembers: members } = await fetchEmailHistoryPanelData();
      setHistories(data);
      setCurrentMembers(members);
    } catch (error) {
      console.error('이메일 이력 로딩 실패:', error);
      alert('이메일 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshWithSync = useCallback(async () => {
    setRefreshing(true);
    setSyncNote(null);
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const syncResult = await syncCurrentMembersToEmailHistory(usersSnap);
      const data = await fetchAllEmailRegistrationHistories();
      const members = buildCurrentMemberEmailsFromUsersSnap(usersSnap, data);
      setHistories(data);
      setCurrentMembers(members);

      const synced = syncResult.created + syncResult.linked;
      if (synced > 0) {
        setSyncNote(`현재 멤버 ${synced}명의 이메일을 이력에 저장했습니다.`);
      } else {
        setSyncNote('이력이 최신 상태입니다.');
      }
    } catch (error) {
      console.error('이메일 이력 동기화 실패:', error);
      alert('이메일 이력을 동기화하지 못했습니다.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void loadHistories();
  }, [isActive, loadHistories]);

  const { duplicateHistories, singleHistories } = useMemo(() => {
    const duplicate: typeof histories = [];
    const single: typeof histories = [];
    histories.forEach((item) => {
      if ((item.entries || []).length >= 2) duplicate.push(item);
      else single.push(item);
    });
    return { duplicateHistories: duplicate, singleHistories: single };
  }, [histories]);

  const filteredHistories = useMemo(() => {
    const source = view === 'duplicate' ? duplicateHistories : singleHistories;
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((item) => {
      if (item.email.toLowerCase().includes(q)) return true;
      return (item.entries || []).some((entry) =>
        entry.nickname.toLowerCase().includes(q)
      );
    });
  }, [view, duplicateHistories, singleHistories, search]);

  const filteredCurrentMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentMembers;
    return currentMembers.filter(
      (member) =>
        member.email.toLowerCase().includes(q) ||
        member.nickname.toLowerCase().includes(q)
    );
  }, [currentMembers, search]);

  const toggleExpanded = (email: string) => {
    setExpandedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="email-history-panel">
      <div className="email-history-header">
        <div>
          <h2>이메일 가입 이력</h2>
          <p>
            동일 이메일로 다시 가입한 계정을 가려내기 위한 기록입니다. 새로고침 시 현재
            멤버 이메일을 이력에 동기화합니다.
          </p>
          {syncNote && <p className="email-history-sync-note">{syncNote}</p>}
        </div>
        <button
          type="button"
          className="email-history-refresh"
          onClick={refreshWithSync}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'email-history-refresh-spin' : undefined} />
          {refreshing ? '동기화 중…' : '새로고침'}
        </button>
      </div>

      <div className="email-history-view-tabs" role="tablist" aria-label="이메일 이력 구분">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'duplicate'}
          className={`email-history-view-tab ${view === 'duplicate' ? 'active' : ''}`}
          onClick={() => setView('duplicate')}
        >
          중복 가입
          <span className="email-history-view-count">{duplicateHistories.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'single'}
          className={`email-history-view-tab ${view === 'single' ? 'active' : ''}`}
          onClick={() => setView('single')}
        >
          1회 가입
          <span className="email-history-view-count">{singleHistories.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'current'}
          className={`email-history-view-tab ${view === 'current' ? 'active' : ''}`}
          onClick={() => setView('current')}
        >
          현재 멤버
          <span className="email-history-view-count">{currentMembers.length}</span>
        </button>
      </div>

      <div className="controls-section controls-section--search-only">
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="이메일 또는 닉네임 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="clear-search" onClick={() => setSearch('')}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {view === 'current' ? (
        filteredCurrentMembers.length === 0 ? (
          <EmptyState
            message={search.trim() ? '검색 결과가 없습니다.' : '현재 가입 멤버가 없습니다.'}
          />
        ) : (
          <div className="email-history-list">
            {filteredCurrentMembers.map((member) => (
              <article key={member.uid} className="email-history-card">
                <div className="email-history-summary email-history-summary--static">
                  <div className="email-history-summary-main">
                    <div className="email-history-title">
                      <Mail size={16} />
                      <strong>{member.email}</strong>
                      {member.historyEntryCount >= 2 && (
                        <span className="email-history-badge">중복이력</span>
                      )}
                    </div>
                    <div className="email-history-meta">
                      <span>닉네임: {member.nickname}</span>
                      <span>가입: {formatEmailHistoryEntryTime(member.createdAt)}</span>
                      <span>이력 {member.historyEntryCount}건</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : filteredHistories.length === 0 ? (
        <EmptyState
          message={
            search.trim()
              ? '검색 결과가 없습니다.'
              : view === 'duplicate'
                ? '중복 가입 이력이 없습니다.'
                : '1회 가입 이력이 없습니다.'
          }
        />
      ) : (
        <div className="email-history-list">
          {filteredHistories.map((item) => {
            const expanded = expandedEmails.has(item.email);
            const entries = item.entries || [];
            const activeEntry = entries.find((e) => e.status === 'active');
            const deletedEntries = entries.filter((e) => e.status === 'deleted');
            const latestDeletedEntry = deletedEntries[deletedEntries.length - 1];
            const currentLabel = activeEntry
              ? activeEntry.nickname
              : latestDeletedEntry?.nickname
                ? `${latestDeletedEntry.nickname} (삭제됨)`
                : '없음 (삭제됨)';
            const previousNicknames = (
              activeEntry ? deletedEntries : deletedEntries.slice(0, -1)
            ).map((e) => e.nickname);
            const isDuplicate = entries.length >= 2;
            const hasReRegistration = deletedEntries.length > 0 && !!activeEntry;

            return (
              <article key={item.id} className="email-history-card">
                <button
                  type="button"
                  className="email-history-summary"
                  onClick={() => toggleExpanded(item.email)}
                >
                  <div className="email-history-summary-main">
                    <div className="email-history-title">
                      <Mail size={16} />
                      <strong>{item.email}</strong>
                      {isDuplicate && (
                        <span className="email-history-badge">
                          {hasReRegistration ? '재가입' : '중복'}
                        </span>
                      )}
                    </div>
                    <div className="email-history-meta">
                      <span>현재: {currentLabel}</span>
                      {previousNicknames.length > 0 && (
                        <span>이전 닉네임: {previousNicknames.join(', ')}</span>
                      )}
                      <span>기록 {entries.length}건</span>
                    </div>
                  </div>
                  <span className="email-history-expand">{expanded ? '▲' : '▼'}</span>
                </button>

                {expanded && (
                  <ul className="email-history-entries">
                    {[...entries].reverse().map((entry, idx) => (
                      <li
                        key={`${entry.uid}-${idx}`}
                        className={`email-history-entry email-history-entry--${entry.status}`}
                      >
                        <div className="email-history-entry-row">
                          <strong>{entry.nickname}</strong>
                          <span>{entry.status === 'active' ? '가입 중' : '삭제됨'}</span>
                        </div>
                        <div className="email-history-entry-row email-history-entry-sub">
                          <span>가입: {formatEmailHistoryEntryTime(entry.registeredAt)}</span>
                          {entry.deletedAt != null && (
                            <span>삭제: {formatEmailHistoryEntryTime(entry.deletedAt)}</span>
                          )}
                          {entry.deletedBy && <span>처리: {entry.deletedBy}</span>}
                        </div>
                      </li>
                    ))}
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

export default AdminEmailHistoryPanel;
