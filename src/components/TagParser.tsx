import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { resolveNicknameToUid } from '../utils/mentionUtils';

interface TagParserProps {
  content: string;
}

/** @[display](id) | @{{id}} | @[id] | @닉네임 */
const MENTION_REGEX =
  /@\[([^\]]+)\]\(([^)]+)\)|@\{\{([^}]+)\}\}|@\[([^\]]+)\]|@([가-힣a-zA-Z0-9_.-]+)/g;

const TagParser: React.FC<TagParserProps> = ({ content }) => {
  const navigate = useNavigate();

  const handleMentionClick = useCallback(
    async (nickname: string) => {
      const uid = await resolveNicknameToUid(nickname);
      if (uid) {
        navigate(`/mypage/${uid}`);
      }
    },
    [navigate]
  );

  const parseContent = (text: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    MENTION_REGEX.lastIndex = 0;

    while ((match = MENTION_REGEX.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const nickname = (
        match[1] || match[2] || match[3] || match[4] || match[5] || ''
      ).trim();
      parts.push(
        <button
          key={`${match.index}-${nickname}`}
          type="button"
          className="mention-tag"
          title={`${nickname} 프로필 보기`}
          onClick={() => handleMentionClick(nickname)}
        >
          @{nickname}
        </button>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return <>{parseContent(content || '')}</>;
};

export default TagParser;
