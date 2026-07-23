import React, { useMemo } from 'react';
import { MentionsInput, Mention } from 'react-mentions';
import type { UserMention } from '../utils/getUserMentions';
import {
  MENTION_MARKUP,
  displayMention,
  extractMentionedNicknames,
} from '../utils/mentionUtils';
import mentionsStyle, { mentionChipStyle } from '../styles/mentionsStyle';
import './MentionInputField.css';

interface MentionInputFieldProps {
  value: string;
  onChange: (value: string) => void;
  mentionUsers: UserMention[];
  placeholder?: string;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  showTaggedSummary?: boolean;
  onCompositionStart?: () => void;
  onCompositionEnd?: () => void;
  inputRef?: React.Ref<any>;
}

const MentionInputField: React.FC<MentionInputFieldProps> = ({
  value,
  onChange,
  mentionUsers,
  placeholder = '댓글을 입력하세요... (@로 사람 태그)',
  className = '',
  minHeight = 80,
  maxHeight = 200,
  showTaggedSummary = true,
  onCompositionStart,
  onCompositionEnd,
  inputRef,
}) => {
  const mentionData = useMemo(
    () => mentionUsers.map((u) => ({ id: u.nickname, display: u.nickname })),
    [mentionUsers]
  );

  const taggedNicknames = useMemo(
    () => extractMentionedNicknames(value),
    [value]
  );

  return (
    <div className={`mention-input-field ${className}`.trim()}>
      <MentionsInput
        ref={inputRef}
        value={value}
        onChange={(_e, newValue) => onChange(newValue)}
        placeholder={placeholder}
        className="mention-input-field__control"
        style={{
          ...mentionsStyle,
          control: {
            ...mentionsStyle.control,
            minHeight,
            maxHeight,
          },
          highlighter: {
            ...mentionsStyle.highlighter,
            minHeight,
            maxHeight,
            overflow: 'auto',
          },
          input: {
            ...mentionsStyle.input,
            minHeight,
            maxHeight,
            overflow: 'auto',
          },
        }}
        allowSuggestionsAboveCursor
        singleLine={false}
        a11ySuggestionsListLabel="멘션할 사용자"
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onCompositionUpdate={onCompositionStart}
      >
        <Mention
          trigger="@"
          data={mentionData}
          markup={MENTION_MARKUP}
          displayTransform={displayMention}
          appendSpaceOnAdd
          style={mentionChipStyle}
          renderSuggestion={(entry, _search, highlightedDisplay, _index, focused) => (
            <div
              className={`mention-suggestion ${focused ? 'is-focused' : ''}`}
            >
              <span className="mention-suggestion__at">@</span>
              <span className="mention-suggestion__name">{highlightedDisplay}</span>
              {focused && <span className="mention-suggestion__hint">태그</span>}
            </div>
          )}
        />
      </MentionsInput>

      {showTaggedSummary && taggedNicknames.length > 0 && (
        <div className="mention-tagged-summary" aria-live="polite">
          <span className="mention-tagged-summary__label">태그됨</span>
          <div className="mention-tagged-summary__chips">
            {taggedNicknames.map((nick) => (
              <span key={nick} className="mention-tagged-chip">
                @{nick}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MentionInputField;
