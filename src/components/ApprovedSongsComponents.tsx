import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
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

// 오디오 플레이어 컴포넌트
const SimpleAudioPlayer: React.FC<{ audioUrl: string; duration?: number }> = ({ audioUrl, duration }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px', 
      width: '100%',
      marginTop: '8px',
      padding: '8px',
      background: 'rgba(255, 255, 255, 0.05)',
      borderRadius: '8px'
    }}>
      <button 
        onClick={handlePlayPause} 
        style={{
          background: 'rgba(138, 85, 204, 0.8)',
          border: 'none',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'white',
          flexShrink: 0
        }}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)', minWidth: 35 }}>
          {formatTime(currentTime)}
        </span>
        <div
          style={{ 
            flex: 1, 
            height: 6, 
            background: 'rgba(255, 255, 255, 0.2)', 
            borderRadius: 3, 
            cursor: 'pointer', 
            position: 'relative' 
          }}
          onClick={e => {
            const bar = e.currentTarget;
            const rect = bar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = x / rect.width;
            if (audioRef.current && audioDuration) {
              audioRef.current.currentTime = percent * audioDuration;
              setCurrentTime(percent * audioDuration);
            }
          }}
        >
          <div
            style={{
              width: audioDuration ? `${(currentTime / audioDuration) * 100}%` : '0%',
              height: '100%',
              background: 'linear-gradient(90deg, #8A55CC 60%, #B497D6 100%)',
              borderRadius: 3,
              transition: 'width 0.1s',
            }}
          />
        </div>
        <span style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.8)', minWidth: 35 }}>
          {formatTime(audioDuration || duration || 0)}
        </span>
      </div>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
    </div>
  );
};

// 곡 리스트 아이템 컴포넌트
interface SongListItemProps {
  song: ApprovedSong;
  isAdmin: boolean;
  onEdit: (song: ApprovedSong) => void;
  onDelete: (songId: string) => void;
  showGrade?: boolean;
  grade?: string;
  audioUrl?: string;
  audioDuration?: number;
}

export const SongListItem: React.FC<SongListItemProps> = ({ 
  song, 
  isAdmin, 
  onEdit, 
  onDelete, 
  showGrade = false, 
  grade,
  audioUrl,
  audioDuration
}) => (
  <li className="approved-songs-list-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
      {showGrade && grade && (
        <span className="approved-songs-grade-badge">{grade}</span>
      )}
      <span className="approved-songs-title-text" style={{ flex: '1 1 200px' }}>{song.title}</span>
      <span className="approved-songs-members" style={{ flex: '1 1 150px' }}>
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
    </div>
    {audioUrl && (
      <SimpleAudioPlayer audioUrl={audioUrl} duration={audioDuration} />
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
  audioMap?: Record<string, { audioUrl: string; duration?: number }>;
}

export const SongList: React.FC<SongListProps> = ({ 
  songs, 
  isAdmin, 
  onEdit, 
  onDelete, 
  showGrade = false, 
  userMap = {},
  audioMap = {}
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
        
        // 오디오 정보 찾기 (제목과 공백 제거한 제목 모두 체크)
        const audioInfo = audioMap[song.title.trim()] || audioMap[song.titleNoSpace] || 
                          audioMap[song.title.replace(/\s/g, '')];
        
        return (
          <SongListItem
            key={song.id}
            song={song}
            isAdmin={isAdmin}
            onEdit={onEdit}
            onDelete={onDelete}
            showGrade={showGrade}
            grade={grade}
            audioUrl={audioInfo?.audioUrl}
            audioDuration={audioInfo?.duration}
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