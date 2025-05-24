import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const createTagNotification = async ({
  taggedUser,
  taggerNickname,
  postId,
  postType,
  postTitle,
  commentId = null,
  commentText = null
}) => {
  try {
    // 자기 자신을 태그한 경우 알림 생성하지 않음
    if (taggedUser === taggerNickname) return;

    const notificationData = {
      receiverNickname: taggedUser,
      senderNickname: taggerNickname,
      type: 'tag',
      message: commentId 
        ? `${taggerNickname}님이 댓글에서 회원님을 태그했습니다: "${commentText?.slice(0, 20)}${commentText?.length > 20 ? '...' : ''}"`
        : `${taggerNickname}님이 게시글에서 회원님을 태그했습니다`,
      icon: '🏷️',
      relatedPostId: postId,
      relatedPostType: postType,
      relatedPostTitle: postTitle,
      commentId,
      createdAt: serverTimestamp(),
      isRead: false
    };

    await addDoc(collection(db, 'notifications'), notificationData);
  } catch (error) {
    console.error('태그 알림 생성 중 오류:', error);
  }
};

export const processTaggedUsers = (text) => {
  const tagPattern = /@([a-zA-Z0-9_]+)/g;
  const matches = text.match(tagPattern);
  
  if (!matches) return [];
  
  // 중복 제거 및 @ 제거
  return [...new Set(matches)].map(tag => tag.slice(1));
}; 