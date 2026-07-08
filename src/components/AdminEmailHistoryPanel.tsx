import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCw, Search, X } from 'lucide-react';
import {
  fetchAllEmailRegistrationHistories,
  formatEmailHistoryEntryTime,
  type EmailRegistrationHistoryDoc,
} from '../utils/emailRegistrationHistory';
import { LoadingSpinner, EmptyState } from './AdminComponents';

const AdminEmailHistoryPanel: React.FC = () => {
  const [histories, setHistories] = useState<Array<EmailRegistrationHistoryDoc & { id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());

  const loadHistories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllEmailRegistrationHistories();
      setHistories(data);
    } catch (error) {
      console.error('이메일 이력 로딩 실패:', error);
      alert('이메일 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistories();
  }, [loadHistories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return histories;
    return histories.filter((item) => {
      if (item.email.toLowerCase().includes(q)) return true;
      return (item.entries || []).some((entry) =>
        entry.nickname.toLowerCase().includes(q)
      );
    });
  }, [histories, search]);

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
            가입·삭제된 이메일과 닉네임 매칭 기록입니다. 같은 이메일로 재가입한 경우에도
            이전 닉네임을 확인할 수 있습니다.
          </p>
        </div>
        <button type="button" className="email-history-refresh" onClick={loadHistories}>
          <RefreshCw size={16} />
          새로고침
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

      {filtered.length === 0 ? (
        <EmptyState message="이메일 이력이 없습니다." />
      ) : (
        <div className="email-history-list">
          {filtered.map((item) => {
            const expanded = expandedEmails.has(item.email);
            const entries = item.entries || [];
            const activeEntry = entries.find((e) => e.status === 'active');
            const previousNicknames = entries
              .filter((e) => e.status === 'deleted')
              .map((e) => e.nickname);
            const hasReRegistration = entries.filter((e) => e.status === 'deleted').length > 0
              && entries.filter((e) => e.status === 'active').length > 0;

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
                      {hasReRegistration && (
                        <span className="email-history-badge">재가입</span>
                      )}
                    </div>
                    <div className="email-history-meta">
                      <span>
                        현재: {activeEntry ? activeEntry.nickname : '없음 (삭제됨)'}
                      </span>
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
