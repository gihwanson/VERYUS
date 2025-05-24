import TagInput from './TagInput';
import { processTaggedUsers, createTagNotification } from '../utils/tagNotification';

const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!title.trim() || !content.trim()) {
    alert('제목과 내용을 모두 입력해주세요.');
    return;
  }

  try {
    const postData = {
      title: title.trim(),
      content: content.trim(),
      author: me,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      likes: [],
      comments: [],
      views: 0
    };

    const postRef = await addDoc(collection(db, type), postData);

    // 태그된 사용자들에게 알림 생성
    const taggedUsers = processTaggedUsers(content);
    for (const taggedUser of taggedUsers) {
      await createTagNotification({
        taggedUser,
        taggerNickname: me,
        postId: postRef.id,
        postType: type,
        postTitle: title
      });
    }

    navigate(`/post/${type}/${postRef.id}`);
  } catch (error) {
    console.error('게시글 작성 중 오류:', error);
    alert('게시글 작성 중 오류가 발생했습니다.');
  }
};

return (
  <div className="post-editor" style={styles.container}>
    <input
      type="text"
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      placeholder="제목을 입력하세요"
      style={styles.titleInput}
      maxLength={100}
    />
    
    <TagInput
      value={content}
      onChange={setContent}
      onTag={(username) => console.log('Tagged:', username)}
      placeholder="내용을 입력하세요..."
      darkMode={dark}
      maxLength={10000}
      style={{ marginTop: '16px' }}
    />

    <div style={styles.buttonContainer}>
      <button
        onClick={() => navigate(-1)}
        style={styles.cancelButton}
      >
        취소
      </button>
      <button
        onClick={handleSubmit}
        disabled={!title.trim() || !content.trim()}
        style={{
          ...styles.submitButton,
          opacity: (!title.trim() || !content.trim()) ? 0.6 : 1,
          cursor: (!title.trim() || !content.trim()) ? 'not-allowed' : 'pointer'
        }}
      >
        작성완료
      </button>
    </div>
  </div>
); 