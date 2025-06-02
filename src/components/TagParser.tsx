import React from 'react';

interface TagParserProps {
  content: string;
}

const TagParser: React.FC<TagParserProps> = ({ content }) => {
  // @닉네임 패턴을 찾아서 하이라이트 처리
  const parseContent = (text: string) => {
    const mentionRegex = /@(\w+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      // 매치 이전 텍스트 추가
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // 매치된 @닉네임을 하이라이트 스팬으로 추가
      parts.push(
        <span key={match.index} className="mention-tag">
          {match[0]}
        </span>
      );

      lastIndex = match.index + match[0].length;
    }

    // 나머지 텍스트 추가
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return <>{parseContent(content)}</>;
};

export default TagParser; 