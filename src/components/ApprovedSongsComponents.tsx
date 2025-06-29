import React from 'react';
import type { ApprovedSong, SongType, TabType } from './ApprovedSongsUtils';
import { GRADE_ORDER } from './AdminTypes';

// 탭 버튼 컴포넌트
interface TabButtonProps {
  icon: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export const TabButton: React.FC<TabButtonProps> = ({ icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick} 
    className={`approved-songs-tab ${isActive ? 'active' : ''}`}
  >
    <span className="approved-songs-tab-icon">{icon}</span>
    <span>{label}</span>
  </button>
);

// 필터 탭 컴포넌트
interface FilterTabProps {
  type: TabType;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export const FilterTab: React.FC<FilterTabProps> = ({ type, label, isActive, onClick }) => (
  <button 
    onClick={onClick} 
    className={`approved-songs-filter-tab ${isActive ? 'active' : ''}`}
  >
    {label}
  </button>
);

// 곡 리스트 아이템 컴포넌트
interface SongListItemProps {
  song: ApprovedSong;
  isAdmin: boolean;
  onEdit: (song: ApprovedSong) => void;
  onDelete: (songId: string) => void;
  showGrade?: boolean;
  grade?: string;
}

export const SongListItem: React.FC<SongListItemProps> = ({ 
  song, 
  isAdmin, 
  onEdit, 
  onDelete, 
  showGrade = false, 
  grade 
}) => (
  <li className="approved-songs-list-item">
    {showGrade && grade && (
      <span className="approved-songs-grade-badge">{grade}</span>
    )}
    <span className="approved-songs-title-text">{song.title}</span>
    <span className="approved-songs-members">
      {song.members?.join(', ')}
    </span>
    {isAdmin && (
      <div className="approved-songs-actions-group">
        <button
          className="approved-songs-btn edit"
          onClick={() => onEdit(song)}
        >
          ✏️ 수정
        </button>
        <button
          className="approved-songs-btn remove"
          onClick={() => onDelete(song.id)}
        >
          🗑️ 삭제
        </button>
      </div>
    )}
  </li>
);

// 곡 리스트 컴포넌트
interface SongListProps {
  songs: ApprovedSong[];
  isAdmin: boolean;
  onEdit: (song: ApprovedSong) => void;
  onDelete: (songId: string) => void;
  showGrade?: boolean;
  userMap?: Record<string, { grade?: string }>;
}

export const SongList: React.FC<SongListProps> = ({ 
  songs, 
  isAdmin, 
  onEdit, 
  onDelete, 
  showGrade = false, 
  userMap = {} 
}) => (
  <div className="approved-songs-card">
    <ul className="approved-songs-list">
      {songs.map(song => {
        let grade: string | undefined;
        if (showGrade && userMap) {
          // 등급 계산 로직은 여기서 처리
          const idxs = (song.members || []).map((m: string) => {
            return GRADE_ORDER.indexOf(userMap[m]?.grade as any || '🍒');
          });
          const minIdx = Math.min(...(idxs.length ? idxs : [GRADE_ORDER.length - 1]));
          grade = GRADE_ORDER[minIdx] || '🍒';
        }
        
        return (
          <SongListItem
            key={song.id}
            song={song}
            isAdmin={isAdmin}
            onEdit={onEdit}
            onDelete={onDelete}
            showGrade={showGrade}
            grade={grade}
          />
        );
      })}
    </ul>
  </div>
);

// 검색 입력 컴포넌트
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ value, onChange, placeholder }) => (
  <div className="approved-songs-search">
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="approved-songs-search-input"
    />
  </div>
);

// 폼 입력 컴포넌트
interface FormInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export const FormInput: React.FC<FormInputProps> = ({ label, value, onChange, placeholder }) => (
  <div className="approved-songs-form-group">
    <label className="approved-songs-label">{label}</label>
    <input 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      className="approved-songs-input"
      placeholder={placeholder}
    />
  </div>
);

// 멤버 입력 컴포넌트
interface MemberInputProps {
  members: string[];
  onChange: (members: string[]) => void;
}

export const MemberInput: React.FC<MemberInputProps> = ({ members, onChange }) => (
  <div className="approved-songs-form-group">
    <label className="approved-songs-label">참여 닉네임</label>
    {members.map((member, idx) => (
      <div key={idx} className="approved-songs-member-row">
        <input
          value={member}
          onChange={e => onChange(members.map((m, i) => i === idx ? e.target.value : m))}
          className="approved-songs-member-input"
          placeholder={`닉네임 ${idx + 1}`}
        />
        {members.length > 1 && (
          <button 
            type="button" 
            onClick={() => onChange(members.filter((_, i) => i !== idx))} 
            className="approved-songs-btn delete"
          >
            삭제
          </button>
        )}
        {idx === members.length - 1 && (
          <button 
            type="button" 
            onClick={() => onChange([...members, ''])} 
            className="approved-songs-btn add"
          >
            추가
          </button>
        )}
      </div>
    ))}
  </div>
);

// 액션 버튼 컴포넌트
interface ActionButtonsProps {
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  cancelLabel?: string;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ 
  onSave, 
  onCancel, 
  saveLabel = "💾 저장", 
  cancelLabel = "❌ 취소" 
}) => (
  <div className="approved-songs-actions">
    <button 
      className="approved-songs-btn save"
      onClick={onSave}
    >
      {saveLabel}
    </button>
    <button 
      className="approved-songs-btn cancel"
      onClick={onCancel}
    >
      {cancelLabel}
    </button>
  </div>
); 