import React, { useState, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { useActivityHistory } from '../hooks/useActivityHistory';
import {
  Container,
  Header,
  Title,
  TextArea,
  PreviewText,
  Button,
  ErrorMessage,
  LoadingSpinner
} from '../styles/ActivityHistoryStyles';

const ActivityHistory = memo(({ darkMode }) => {
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState('');
  const {
    text,
    loading,
    error,
    history,
    lastUpdated,
    updateHistory
  } = useActivityHistory();

  const nick = localStorage.getItem('nickname');
  const role = localStorage.getItem('role');
  const isAdmin = role === '운영진' || role === '리더' || nick === '너래';

  const handleEdit = useCallback(() => {
    setInputText(text);
    setEditing(true);
  }, [text]);

  const handleCancel = useCallback(() => {
    setInputText('');
    setEditing(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isAdmin) {
      alert('관리자만 수정할 수 있습니다');
      return;
    }

    if (!inputText.trim()) {
      alert('내용을 입력해주세요');
      return;
    }

    const success = await updateHistory(inputText, nick);
    if (success) {
      setEditing(false);
      alert('저장되었습니다');
    }
  }, [inputText, isAdmin, nick, updateHistory]);

  const handleChange = useCallback((e) => {
    setInputText(e.target.value);
  }, []);

  if (loading && !text) {
    return (
      <Container darkMode={darkMode}>
        <LoadingSpinner darkMode={darkMode} />
      </Container>
    );
  }

  return (
    <Container darkMode={darkMode}>
      <Header>
        <Title darkMode={darkMode}>활동 이력</Title>
        {isAdmin && !editing && (
          <Button
            darkMode={darkMode}
            onClick={handleEdit}
            disabled={loading}
          >
            수정
          </Button>
        )}
      </Header>

      {error && (
        <ErrorMessage darkMode={darkMode}>
          {error}
        </ErrorMessage>
      )}

      {editing ? (
        <>
          <TextArea
            darkMode={darkMode}
            value={inputText}
            onChange={handleChange}
            placeholder="활동 이력을 입력하세요..."
            disabled={loading}
          />
          <Button
            darkMode={darkMode}
            onClick={handleSave}
            disabled={loading}
            style={{ marginRight: '10px' }}
          >
            {loading ? <LoadingSpinner darkMode={darkMode} /> : '저장'}
          </Button>
          <Button
            darkMode={darkMode}
            onClick={handleCancel}
            disabled={loading}
            style={{ background: darkMode ? '#666' : '#9e9e9e' }}
          >
            취소
          </Button>
        </>
      ) : (
        <>
          <PreviewText darkMode={darkMode}>
            {text}
          </PreviewText>
          {lastUpdated && (
            <small style={{ color: darkMode ? '#999' : '#666' }}>
              마지막 수정: {lastUpdated.toLocaleString()}
            </small>
          )}
        </>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <Title darkMode={darkMode} style={{ fontSize: '18px' }}>
            최근 수정 이력
          </Title>
          {history.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '10px',
                margin: '5px 0',
                borderRadius: '4px',
                background: darkMode ? '#222' : '#f5f5f5',
                fontSize: '14px'
              }}
            >
              <div>수정자: {item.updatedBy}</div>
              <div>시간: {item.timestamp.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
});

ActivityHistory.propTypes = {
  darkMode: PropTypes.bool.isRequired
};

ActivityHistory.displayName = 'ActivityHistory';

export default ActivityHistory;
