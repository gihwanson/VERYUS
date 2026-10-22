import React, { useMemo, useState } from 'react';
import type { ApprovedSong } from './ApprovedSongsUtils';
import {
  listUnmatchedApprovedSongNicknames,
  memberNicknameKey,
  renameApprovedSongMember,
  songMembersContainNickname,
} from '../utils/approvedSongNicknameRename';

interface ApprovedSongMemberRenamePanelProps {
  songs: ApprovedSong[];
  registeredNicknames: string[];
  updatedBy: string;
}

const ApprovedSongMemberRenamePanel: React.FC<ApprovedSongMemberRenamePanelProps> = ({
  songs,
  registeredNicknames,
  updatedBy,
}) => {
  const [fromNickname, setFromNickname] = useState('');
  const [toNickname, setToNickname] = useState('');
  const [saving, setSaving] = useState(false);

  const unmatched = useMemo(
    () => listUnmatchedApprovedSongNicknames(songs, registeredNicknames),
    [songs, registeredNicknames]
  );

  const songNicknames = useMemo(() => {
    const names = new Set<string>();
    songs.forEach((song) => {
      (song.members || []).forEach((member) => {
        const name = memberNicknameKey(String(member));
        if (name) names.add(name);
      });
    });
    return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [songs]);

  const matchedSongs = useMemo(() => {
    const key = memberNicknameKey(fromNickname);
    if (!key) return [];
    return songs.filter((song) => songMembersContainNickname(song.members, key));
  }, [songs, fromNickname]);

  const handleApply = async () => {
    const from = memberNicknameKey(fromNickname);
    const to = memberNicknameKey(toNickname);
    if (!from || !to) {
      alert('기존 닉네임과 새 닉네임을 입력해 주세요.');
      return;
    }
    if (from === to) {
      alert('기존 닉네임과 새 닉네임이 같습니다.');
      return;
    }
    if (matchedSongs.length === 0) {
      alert('해당 닉네임이 들어간 합격곡이 없습니다.');
      return;
    }
    const confirmed = window.confirm(
      `「${from}」을 「${to}」으로 ${matchedSongs.length}곡에서 바꿉니다.\n듀엣·합창곡은 이 닉네임만 바뀌고 다른 멤버는 그대로 둡니다.`
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const updated = await renameApprovedSongMember({
        songs,
        from,
        to,
        updatedBy,
      });
      alert(`${updated}곡의 닉네임을 바꿨습니다.`);
      setFromNickname('');
      setToNickname('');
    } catch (error) {
      const message = error instanceof Error ? error.message : '닉네임 변경에 실패했습니다.';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="approved-songs-rename">
      <h4 className="approved-songs-rename__title">닉네임 일괄 변경</h4>
      <p className="approved-songs-rename__desc">
        예전 닉네임이 들어간 합격곡을 한 번에 현재 닉네임으로 바꿉니다. 곡을 하나씩 열지 않아도 됩니다.
      </p>

      {unmatched.length > 0 && (
        <div className="approved-songs-rename__orphans">
          <span className="approved-songs-rename__label">현재 회원과 다른 닉네임</span>
          <div className="approved-songs-rename__chips">
            {unmatched.map((item) => (
              <button
                key={item.nickname}
                type="button"
                className={`approved-songs-rename__chip${
                  memberNicknameKey(fromNickname) === item.nickname ? ' is-selected' : ''
                }`}
                onClick={() => setFromNickname(item.nickname)}
              >
                {item.nickname}
                <span>{item.songCount}곡</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="approved-songs-rename__fields">
        <label className="approved-songs-rename__field">
          <span>기존 닉네임</span>
          <input
            value={fromNickname}
            onChange={(event) => setFromNickname(event.target.value)}
            list="approved-song-rename-from"
            placeholder="합격곡에 적힌 이름"
            disabled={saving}
          />
        </label>
        <label className="approved-songs-rename__field">
          <span>새 닉네임</span>
          <input
            value={toNickname}
            onChange={(event) => setToNickname(event.target.value)}
            list="approved-song-rename-to"
            placeholder="바꿀 이름"
            disabled={saving}
          />
        </label>
      </div>
      <datalist id="approved-song-rename-from">
        {songNicknames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id="approved-song-rename-to">
        {registeredNicknames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {memberNicknameKey(fromNickname) && (
        <p className="approved-songs-rename__count">
          {matchedSongs.length > 0
            ? `${matchedSongs.length}곡에 이 닉네임이 있습니다.`
            : '이 닉네임이 들어간 합격곡이 없습니다.'}
        </p>
      )}

      {matchedSongs.length > 0 && (
        <ul className="approved-songs-rename__preview">
          {matchedSongs.slice(0, 12).map((song) => (
            <li key={song.id}>
              {song.title || '(제목 없음)'}
              <span>{(song.members || []).filter(Boolean).join(', ')}</span>
            </li>
          ))}
          {matchedSongs.length > 12 && <li>외 {matchedSongs.length - 12}곡</li>}
        </ul>
      )}

      <button
        type="button"
        className="approved-songs-btn save approved-songs-rename__submit"
        onClick={() => void handleApply()}
        disabled={saving || matchedSongs.length === 0 || !memberNicknameKey(toNickname)}
      >
        {saving ? '변경 중…' : '한 번에 변경'}
      </button>
    </div>
  );
};

export default ApprovedSongMemberRenamePanel;
