import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import {
  collection, doc, updateDoc, deleteDoc, addDoc, Timestamp, query, where, onSnapshot,
  limit, startAfter, getDocs, getDoc, serverTimestamp, increment, writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import CustomLink from "./CustomLink";
import Avatar from "./Avatar";
import { getThemeStyles } from "../components/style";
import { orderBy } from "firebase/firestore";


// 댓글 관련 상수 정의
const MAX_COMMENT_LENGTH = 1000;
const COMMENTS_PER_PAGE = 10;

/**
 * 댓글 시스템 통합 컴포넌트
 * CommentSection, CommentItem, ReplyItem을 통합 관리
 */
function CommentSystem({ postId, type, darkMode, postOwner, postTitle, globalProfilePics, globalGrades }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [replyCount, setReplyCount] = useState(0);
  const [sortOrder, setSortOrder] = useState("asc"); // asc: 오래된 순, desc: 최신 순
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [newCommentIds, setNewCommentIds] = useState([]);
  const [focusedCommentId, setFocusedCommentId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [visibleCommentCount, setVisibleCommentCount] = useState(0);
  const [expandedReplies, setExpandedReplies] = useState({});
  const [replyInfo, setReplyInfo] = useState(null); // 답글 작성 대상 정보 (commentId, authorName)
  
  const textareaRef = useRef(null);
  const commentsEndRef = useRef(null);
  const replyTextareaRef = useRef(null);
  
  const me = localStorage.getItem("nickname");
  
  // 스타일 가져오기
  const styles = getThemeStyles(darkMode);

  // URL에서 댓글 ID 가져오기 (댓글로 직접 이동 시)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const commentId = urlParams.get('comment');
    
    if (commentId) {
      setFocusedCommentId(commentId);
      
      // 해당 댓글이 있는지 확인하고 스크롤
      const checkCommentExists = async () => {
        try {
          const commentRef = doc(db, `${type}-${postId}-comments`, commentId);
          const commentSnap = await getDoc(commentRef);
          
          if (commentSnap.exists()) {
            // 댓글이 존재하면 포커스 설정
            setTimeout(() => {
              const element = document.getElementById(`comment-${commentId}`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-comment');
                setTimeout(() => {
                  element.classList.remove('highlight-comment');
                }, 3000);
              }
            }, 1000);
          }
        } catch (error) {
          console.error("댓글 확인 중 오류 발생:", error);
          setError("댓글을 확인하는 중 오류가 발생했습니다");
        }
      };
      
      checkCommentExists();
    }
  }, [postId, type]);

  // 댓글 로드 함수
  const loadComments = useCallback(() => {
    setIsLoading(true);
    setError("");
    
    try {
      // 정렬 순서에 따른 쿼리 생성
      const commentsQuery = query(
        collection(db, `${type}-${postId}-comments`),
        where("parentId", "==", null), // 루트 댓글만 가져오기
        orderBy("createdAt", sortOrder),
        limit(COMMENTS_PER_PAGE)
      );
      
      // 실시간 업데이트 구독
      const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
        const commentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          replies: [], // 답글 배열 초기화
          repliesLoaded: false // 답글 로드 상태
        }));
        
        setComments(commentsData);
        setVisibleCommentCount(commentsData.length);
        setIsLoading(false);
        
        // 마지막 문서 저장 (페이지네이션용)
        if (snapshot.docs.length > 0) {
          setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length >= COMMENTS_PER_PAGE);
        } else {
          setHasMore(false);
        }
        
        // 새로운 댓글 표시를 위해 ID 저장
        if (snapshot.docChanges().length > 0) {
          const newIds = snapshot.docChanges()
            .filter(change => change.type === 'added')
            .map(change => change.doc.id);
            
          if (newIds.length > 0) {
            setNewCommentIds(prev => [...prev, ...newIds]);
            // 5초 후 새 댓글 강조 표시 제거
            setTimeout(() => {
              setNewCommentIds(prev => prev.filter(id => !newIds.includes(id)));
            }, 5000);
          }
        }
      }, (error) => {
        console.error("댓글 로드 중 오류 발생:", error);
        setError("댓글을 불러오는 중 오류가 발생했습니다");
        setIsLoading(false);
      });
      
      // 전체 댓글 및 답글 수 가져오기
      const countQuery = collection(db, `${type}-${postId}-comments`);
      const countUnsubscribe = onSnapshot(countQuery, (snapshot) => {
        const allComments = snapshot.docs.map(doc => doc.data());
        const rootCount = allComments.filter(c => !c.parentId).length;
        const replyCount = allComments.filter(c => c.parentId).length;
        
        setCommentCount(rootCount);
        setReplyCount(replyCount);
      }, (error) => {
        console.error("댓글 수 로드 중 오류 발생:", error);
      });
      
      return () => {
        unsubscribe();
        countUnsubscribe();
      };
    } catch (err) {
      console.error("댓글 로드 초기화 오류:", err);
      setError("댓글을 불러오는 중 오류가 발생했습니다");
      setIsLoading(false);
      return () => {};
    }
  }, [postId, type, sortOrder]);

  // 초기 댓글 로드
  useEffect(() => {
    const unsubscribe = loadComments();
    return () => unsubscribe();
  }, [loadComments]);

  // 특정 댓글의 답글 로드
  const loadReplies = useCallback(async (commentId) => {
    if (!commentId) return;
    
    // 이미 로드된 답글이면 다시 로드하지 않음
    const commentIndex = comments.findIndex(c => c.id === commentId);
    if (commentIndex !== -1 && comments[commentIndex].repliesLoaded) {
      // 이미 로드된 경우에는 답글 표시 상태만 토글
      setExpandedReplies(prev => ({
        ...prev,
        [commentId]: !prev[commentId]
      }));
      return;
    }
    
    try {
      const repliesQuery = query(
        collection(db, `${type}-${postId}-comments`),
        where("parentId", "==", commentId),
        orderBy("createdAt", "asc")
      );
      
      // 답글 데이터 가져오기
      const snapshot = await getDocs(repliesQuery);
      const repliesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // 댓글 목록 업데이트 (해당 댓글에 답글 추가)
      setComments(prev => {
        const updated = [...prev];
        const index = updated.findIndex(c => c.id === commentId);
        if (index !== -1) {
          updated[index] = {
            ...updated[index],
            replies: repliesData,
            repliesLoaded: true,
            replyCount: repliesData.length
          };
        }
        return updated;
      });
      
      // 답글 표시 상태 업데이트
      setExpandedReplies(prev => ({
        ...prev,
        [commentId]: true
      }));
      
    } catch (error) {
      console.error("답글 로드 중 오류 발생:", error);
    }
  }, [comments, postId, type]);

  // 더 많은 댓글 로드
  const loadMoreComments = async () => {
    if (!lastVisible || isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    setError("");
    
    try {
      const nextQuery = query(
        collection(db, `${type}-${postId}-comments`),
        where("parentId", "==", null),
        orderBy("createdAt", sortOrder),
        startAfter(lastVisible),
        limit(COMMENTS_PER_PAGE)
      );
      
      const snapshot = await getDocs(nextQuery);
      
      if (snapshot.empty) {
        setHasMore(false);
        setIsLoadingMore(false);
        return;
      }
      
      const newComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        replies: [],
        repliesLoaded: false
      }));
      
      setComments(prev => [...prev, ...newComments]);
      setVisibleCommentCount(prev => prev + newComments.length);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
      
      // 더 불러올 댓글이 없으면 hasMore를 false로 설정
      if (snapshot.docs.length < COMMENTS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("댓글 더 불러오기 중 오류 발생:", error);
      setError("댓글을 더 불러오는 중 오류가 발생했습니다");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // 정렬 순서 변경
  const toggleSortOrder = useCallback(() => {
    const newOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(newOrder);
    // 정렬 순서가 바뀌면 댓글을 처음부터 다시 로드
    setComments([]);
    setLastVisible(null);
    setHasMore(true);
    setIsLoading(true);
    setVisibleCommentCount(0);
    setExpandedReplies({});
  }, [sortOrder]);

  // 새 댓글 작성 시작
  const startNewComment = () => {
    setReplyInfo(null);
    setIsPrivate(false);
    setNewComment("");
    
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // 답글 작성 시작
  const startReply = (commentId, authorName) => {
    setReplyInfo({ commentId, authorName });
    setIsPrivate(false);
    setNewComment("");
    
    // 답글 작성 폼으로 스크롤
    setTimeout(() => {
      if (replyTextareaRef.current) {
        replyTextareaRef.current.focus();
        replyTextareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // 댓글 추가 (새 댓글 또는 답글)
  const addComment = async () => {
    const trimmedComment = newComment.trim();
    
    if (!trimmedComment) {
      setError("댓글을 입력하세요");
      return;
    }
    
    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
      setError(`댓글은 최대 ${MAX_COMMENT_LENGTH}자까지 입력 가능합니다`);
      return;
    }
    
    try {
      setIsSubmitting(true);
      setError("");
      
      // 답글인지 새 댓글인지 확인
      const isReply = !!replyInfo;
      const parentId = isReply ? replyInfo.commentId : null;
      
      // 댓글/답글 데이터 준비
      const commentData = {
        nickname: me,
        text: trimmedComment,
        isPrivate: isPrivate,
        createdAt: serverTimestamp(),
        parentId,
        likes: 0,
        likedBy: []
      };
      
      // Firestore에 댓글/답글 추가
      const docRef = await addDoc(collection(db, `${type}-${postId}-comments`), commentData);
      
      // 게시글의 댓글 수 증가
      try {
        const postRef = doc(db, type, postId);
        await updateDoc(postRef, {
          commentCount: increment(1),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("게시글 댓글 수 업데이트 중 오류:", err);
      }
      
      // 알림 생성 로직
      await createNotificationsForComment(trimmedComment, isReply, parentId);
      
      // 입력 필드 초기화
      setNewComment("");
      setIsPrivate(false);
      setReplyInfo(null);
      
      // 답글인 경우 해당 댓글의 답글 목록 새로고침
      if (isReply) {
        await loadReplies(parentId);
      }
      
      // 댓글 위치로 스크롤
      if (sortOrder === "desc" && !isReply) {
        // 최신순일 때는 가장 위로 스크롤
        setTimeout(() => {
          window.scrollTo({
            top: textareaRef.current?.offsetTop - 100,
            behavior: "smooth"
          });
        }, 300);
      } else if (!isReply) {
        // 오래된순일 때는 가장 아래로 스크롤
        setTimeout(() => {
          commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 300);
      }
      
    } catch (error) {
      console.error("댓글 추가 중 오류 발생:", error);
      setError("댓글을 추가하는 중 오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 댓글/답글에 대한 알림 생성
  const createNotificationsForComment = async (commentText, isReply, parentId) => {
    try {
      // 1. 새 댓글인 경우 - 게시글 작성자에게 알림
      if (!isReply && postOwner !== me) {
        await addDoc(collection(db, "notifications"), {
          receiverNickname: postOwner,
          senderNickname: me,
          type: "comment",
          message: `${me}님이 회원님의 게시글에 댓글을 달았습니다: "${commentText.slice(0, 20)}${commentText.length > 20 ? '...' : ''}"`,
          icon: "💬",
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle || "게시글",
          createdAt: serverTimestamp(),
          isRead: false
        });
      }
      
      // 2. 답글인 경우 - 원 댓글 작성자에게 알림
      if (isReply) {
        // 원 댓글 정보 가져오기
        const commentRef = doc(db, `${type}-${postId}-comments`, parentId);
        const commentSnap = await getDoc(commentRef);
        
        if (commentSnap.exists()) {
          const parentComment = commentSnap.data();
          const parentAuthor = parentComment.nickname;
          
          // 자신의 댓글에 답글을 단 경우가 아닌 경우에만 알림 생성
          if (parentAuthor !== me) {
            await addDoc(collection(db, "notifications"), {
              receiverNickname: parentAuthor,
              senderNickname: me,
              type: "reply",
              message: `${me}님이 회원님의 댓글에 답글을 달았습니다: "${commentText.slice(0, 20)}${commentText.length > 20 ? '...' : ''}"`,
              icon: "↪️",
              relatedPostId: postId,
              relatedPostType: type,
              relatedPostTitle: postTitle || "게시글",
              parentCommentId: parentId,
              createdAt: serverTimestamp(),
              isRead: false
            });
          }
          
          // 답글이 달린 댓글의 작성자가 게시글 작성자가 아니고,
          // 답글 작성자가 게시글 작성자가 아닌 경우 게시글 작성자에게도 알림
          if (parentAuthor !== postOwner && me !== postOwner) {
            await addDoc(collection(db, "notifications"), {
              receiverNickname: postOwner,
              senderNickname: me,
              type: "reply_post",
              message: `${me}님이 회원님의 게시글에 새로운 답글을 달았습니다: "${commentText.slice(0, 20)}${commentText.length > 20 ? '...' : ''}"`,
              icon: "💬",
              relatedPostId: postId,
              relatedPostType: type,
              relatedPostTitle: postTitle || "게시글",
              createdAt: serverTimestamp(),
              isRead: false
            });
          }
        }
      }
    } catch (err) {
      console.error("알림 생성 중 오류:", err);
    }
  };

  // Enter 키로 댓글 제출 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitting && newComment.trim() && newComment.length <= MAX_COMMENT_LENGTH) {
        addComment();
      }
    }
  };

  // 댓글 작성 취소
  const cancelComment = () => {
    if (newComment.trim() && !window.confirm("작성 중인 댓글을 취소하시겠습니까?")) {
      return;
    }
    setNewComment("");
    setIsPrivate(false);
    setReplyInfo(null);
  };

  // 좋아요 토글
  const toggleLike = async (commentId, isLiked, parentId = null) => {
    if (isLiked) {
      setError("이미 좋아요를 눌렀습니다");
      return;
    }

    try {
      const commentRef = doc(db, `${type}-${postId}-comments`, commentId);
      const commentSnap = await getDoc(commentRef);
      
      if (!commentSnap.exists()) {
        setError("존재하지 않는 댓글입니다");
        return;
      }
      
      const commentData = commentSnap.data();
      const likedBy = commentData.likedBy || [];
      const updatedLikedBy = [...likedBy, me];
      const updatedLikes = (commentData.likes || 0) + 1;
      
      await updateDoc(commentRef, {
        likedBy: updatedLikedBy,
        likes: updatedLikes
      });
      
      // UI 업데이트
      if (parentId) {
        // 답글인 경우
        setComments(prev => {
          const updated = [...prev];
          const commentIndex = updated.findIndex(c => c.id === parentId);
          
          if (commentIndex !== -1) {
            const replyIndex = updated[commentIndex].replies.findIndex(r => r.id === commentId);
            
            if (replyIndex !== -1) {
              updated[commentIndex].replies[replyIndex] = {
                ...updated[commentIndex].replies[replyIndex],
                likes: updatedLikes,
                likedBy: updatedLikedBy
              };
            }
          }
          
          return updated;
        });
      } else {
        // 일반 댓글인 경우
        setComments(prev => 
          prev.map(comment => 
            comment.id === commentId 
              ? {...comment, likes: updatedLikes, likedBy: updatedLikedBy} 
              : comment
          )
        );
      }
      
      // 좋아요 효과 애니메이션
      const commentElement = document.getElementById(`comment-${commentId}`);
      if (commentElement) {
        commentElement.classList.add('liked-animation');
        setTimeout(() => {
          commentElement.classList.remove('liked-animation');
        }, 1000);
      }
      
      // 댓글 좋아요 알림 추가
      const author = commentData.nickname;
      if (author !== me) {
        const notificationType = parentId ? "like_reply" : "like_comment";
        const icon = "👍";
        const message = `${me}님이 회원님의 ${parentId ? '답글' : '댓글'}을 좋아합니다`;
        
        await addDoc(collection(db, "notifications"), {
          receiverNickname: author,
          senderNickname: me,
          type: notificationType,
          message,
          icon,
          relatedPostId: postId,
          relatedPostType: type,
          relatedPostTitle: postTitle || "게시글",
          commentId,
          createdAt: serverTimestamp(),
          isRead: false
        });
      }
      
    } catch (error) {
      console.error("좋아요 처리 중 오류 발생:", error);
      setError("좋아요 처리 중 오류가 발생했습니다");
    }
  };

  // 댓글 삭제 확인
  const confirmDeleteComment = (commentId, hasReplies = false, parentId = null) => {
    const isReply = !!parentId;
    let message = isReply 
      ? "정말 이 답글을 삭제하시겠습니까?" 
      : "정말 이 댓글을 삭제하시겠습니까?";
    
    if (hasReplies) {
      message = `이 댓글에 답글이 있습니다. 댓글을 삭제하면 모든 답글도 함께 삭제됩니다. 계속하시겠습니까?`;
    }
    
    if (window.confirm(message)) {
      deleteComment(commentId, parentId);
    }
  };

  // 댓글 삭제 실행
  const deleteComment = async (commentId, parentId = null) => {
    try {
      const isReply = !!parentId;
      
      if (!isReply) {
        // 일반 댓글인 경우, 해당 댓글에 달린 모든 답글도 함께 삭제
        const repliesQuery = query(
          collection(db, `${type}-${postId}-comments`),
          where("parentId", "==", commentId)
        );
        
        const repliesSnapshot = await getDocs(repliesQuery);
        const batch = writeBatch(db);
        
        // 모든 답글 삭제
        repliesSnapshot.forEach(replyDoc => {
          batch.delete(doc(db, `${type}-${postId}-comments`, replyDoc.id));
        });
        
        // 댓글 자체도 삭제
        batch.delete(doc(db, `${type}-${postId}-comments`, commentId));
        
        // 게시글 댓글 수 업데이트
        const postRef = doc(db, type, postId);
        const decrementCount = repliesSnapshot.size + 1; // 답글 수 + 댓글 1개
        batch.update(postRef, {
          commentCount: increment(-decrementCount),
          updatedAt: serverTimestamp()
        });
        
        await batch.commit();
        
        // UI 업데이트
        setComments(prev => prev.filter(c => c.id !== commentId));
        
      } else {
        // 답글인 경우
        await deleteDoc(doc(db, `${type}-${postId}-comments`, commentId));
        
        // 게시글 댓글 수 감소
        const postRef = doc(db, type, postId);
        await updateDoc(postRef, {
          commentCount: increment(-1),
          updatedAt: serverTimestamp()
        });
        
        // UI 업데이트 - 부모 댓글의 답글 목록에서 제거
        setComments(prev => {
          const updated = [...prev];
          const parentIndex = updated.findIndex(c => c.id === parentId);
          
          if (parentIndex !== -1) {
            updated[parentIndex].replies = updated[parentIndex].replies.filter(
              r => r.id !== commentId
            );
            // 답글 수도 업데이트
            updated[parentIndex].replyCount = updated[parentIndex].replies.length;
          }
          
          return updated;
        });
      }
      
    } catch (error) {
      console.error("댓글 삭제 중 오류 발생:", error);
      setError("댓글 삭제 중 오류가 발생했습니다");
    }
  };

  // 댓글 수정 페이지로 이동
  const goToEditComment = (commentId) => {
    window.location.href = `/comment-edit/${type}/${postId}/${commentId}`;
  };

  // 프로필 이미지 URL 가져오기 함수
  const getProfilePic = useCallback((nickname) => {
    return globalProfilePics && globalProfilePics[nickname] ? 
      globalProfilePics[nickname] : 
      "https://via.placeholder.com/30";
  }, [globalProfilePics]);

  // 등급 이모지 가져오기 함수
  const getGradeEmoji = useCallback((nickname) => {
    if (!nickname || !globalGrades || !globalGrades[nickname]) return null;
    
    const grade = globalGrades[nickname];
    const gradeEmojis = {
      "🍒": "🍒",
      "🫐": "🫐", 
      "🥝": "🥝",
      "🍎": "🍎",
      "🍈": "🍈",
      "🍉": "🍉",
      "🌏": "🌏",
      "🪐": "🪐",
      "🌞": "🌞",
      "🌌": "🌌"
    };
    
    return gradeEmojis[grade] || grade;
  }, [globalGrades]);

  // 날짜 포맷팅 함수
  const formatDate = useCallback((timestamp) => {
    if (!timestamp) return "날짜 정보 없음";
    
    try {
      const now = new Date();
      const commentDate = new Date(typeof timestamp === 'number' ? timestamp * 1000 : timestamp);
      
      // 오늘 날짜인 경우 시간만 표시
      if (commentDate.toDateString() === now.toDateString()) {
        return `오늘 ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
      }
      
      // 어제 날짜인 경우
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (commentDate.toDateString() === yesterday.toDateString()) {
        return `어제 ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
      }
      
      // 이번 주 내의 날짜인 경우
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(now.getDate() - 7);
      if (commentDate > oneWeekAgo) {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${days[commentDate.getDay()]}요일 ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
      }
      
           // 그 외 경우는 전체 날짜 표시
      return `${commentDate.getFullYear()}-${(commentDate.getMonth() + 1).toString().padStart(2, '0')}-${commentDate.getDate().toString().padStart(2, '0')} ${commentDate.getHours().toString().padStart(2, '0')}:${commentDate.getMinutes().toString().padStart(2, '0')}`;
    } catch (error) {
      console.error("날짜 변환 오류:", error);
      return "날짜 정보 오류";
    }
  }, []);

  // 메모이제이션된 스타일
  const memoizedStyles = useMemo(() => ({
    // 메인 컨테이너 스타일
    container: {
      marginTop: 40
    },
    
    // 댓글 입력 영역 스타일
    commentBox: {
      padding: 16,
      borderRadius: 12,
      background: darkMode ? "#333" : "#f3e7ff",
      border: `1px solid ${darkMode ? "#555" : "#d6c4f2"}`,
      marginBottom: 20,
    },
    
    // 댓글 섹션 제목 스타일
    sectionTitle: {
      color: darkMode ? "#e0d3ff" : "#7e57c2",
      fontSize: 18,
      marginTop: 0,
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 8
    },
    
    // 섹션 제목 카운트 스타일
    titleCount: {
      fontSize: 14,
      color: darkMode ? "#bb86fc" : "#9c68e6",
      fontWeight: "normal"
    },
    
    // 댓글 입력창 스타일
    textarea: {
      width: "100%",
      minHeight: "100px",
      padding: "12px 14px",
      borderRadius: 8,
      border: `1px solid ${darkMode ? "#555" : "#d6c4f2"}`,
      background: darkMode ? "#2a2a2a" : "#fff",
      color: darkMode ? "#e0e0e0" : "#333",
      fontSize: 15,
      fontFamily: "inherit",
      resize: "vertical",
      boxSizing: "border-box"
    },
    
    // 체크박스 레이블
    checkbox: {
      display: "flex",
      alignItems: "center",
      fontSize: 14,
      color: darkMode ? "#aaa" : "#666",
      cursor: "pointer"
    },
    
    // 댓글 수 표시 스타일
    charCount: {
      display: "flex", 
      justifyContent: "space-between", 
      marginTop: 8,
      fontSize: 14,
      color: darkMode ? "#aaa" : "#777"
    },
    
    // 버튼 영역 스타일
    buttonRow: {
      display: "flex", 
      justifyContent: "space-between", 
      marginTop: 12, 
      alignItems: "center"
    },
    
    // 기본 버튼 스타일
    button: {
      primary: {
        padding: "8px 16px",
        background: darkMode ? "#9c27b0" : "#7e57c2",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontWeight: "bold",
        fontSize: 14,
        cursor: "pointer",
        transition: "background 0.2s"
      },
      secondary: {
        padding: "8px 16px",
        background: darkMode ? "#555" : "#e0e0e0",
        color: darkMode ? "#e0e0e0" : "#333",
        border: "none",
        borderRadius: 6,
        fontSize: 14,
        cursor: "pointer",
        transition: "background 0.2s"
      },
      danger: {
        padding: "6px 12px",
        background: darkMode ? "rgba(220, 53, 69, 0.8)" : "rgba(220, 53, 69, 1)",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: 13,
        cursor: "pointer",
        transition: "background 0.2s"
      }
    },
    
    // 비밀댓글 안내 스타일
    privateInfo: {
      fontSize: 12, 
      color: darkMode ? "#ff9800" : "#e67e22",
      marginTop: 8
    },
    
    // 정렬 버튼 스타일
    sortButton: {
      background: "transparent",
      border: "none",
      display: "flex",
      alignItems: "center",
      gap: 4,
      color: darkMode ? "#bb86fc" : "#7e57c2",
      cursor: "pointer",
      fontSize: 14,
      padding: "4px 8px",
      borderRadius: 4,
      transition: "background 0.2s"
    },
    
    // 댓글 목록 헤더 스타일
    listHeader: {
      display: "flex", 
      justifyContent: "space-between", 
      alignItems: "center",
      marginBottom: 16
    },
    
    // 댓글 컨테이너 스타일
    commentContainer: {
      marginBottom: 16
    },
    
    // 댓글 박스 스타일
    commentItem: {
      background: darkMode ? "#333" : "#f3e7ff",
      border: `1px solid ${darkMode ? "#555" : "#b49ddb"}`,
      borderRadius: 10,
      padding: 16,
      color: darkMode ? "#fff" : "#000",
      position: "relative",
      transition: "background 0.3s, transform 0.2s",
    },
    
    // 비밀 댓글 스타일
    secretComment: {
      background: darkMode ? "#3a3a3a" : "#f0f0f0",
      border: `1px solid ${darkMode ? "#555" : "#ccc"}`,
      borderRadius: 10,
      padding: 16,
      color: darkMode ? "#aaa" : "#888",
    },
    
    // 댓글 헤더 스타일
    commentHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    
    // 유저 정보 스타일
    userInfo: {
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    
    // 댓글 텍스트 스타일
    commentText: {
      whiteSpace: "pre-wrap",
      fontSize: 15,
      lineHeight: 1.5,
      wordBreak: "break-word",
      color: darkMode ? "#eee" : "#333",
    },
    
    // 비밀 댓글 텍스트 스타일
    secretText: {
      color: darkMode ? "#999" : "#888",
      fontStyle: "italic",
      textAlign: "center",
    },
    
    // 댓글 액션 스타일
    commentAction: {
      display: "flex",
      gap: 8,
      marginTop: 12,
      flexWrap: "wrap",
    },
    
    // 댓글 액션 버튼 스타일
    actionButton: {
      padding: "6px 12px",
      background: darkMode ? "#7e57c2aa" : "#7e57c2",
      color: "white",
      border: "none",
      borderRadius: 6,
      fontSize: 13,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 4,
      transition: "background 0.2s",
      boxShadow: darkMode ? "none" : "0 2px 4px rgba(0,0,0,0.1)",
    },
    
    // 답글 컨테이너 스타일
    repliesContainer: {
      marginTop: 16,
      paddingLeft: 16,
      borderLeft: `2px solid ${darkMode ? "#555" : "#d6c4f2"}`,
    },
    
    // 답글 수 배지 스타일
    replyBadge: {
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 8px",
      borderRadius: 12,
      background: darkMode ? "#7e57c288" : "#e7d8ff",
      color: darkMode ? "#d4b8ff" : "#7e57c2",
      fontSize: 12,
      marginTop: 8,
      marginBottom: 8,
      cursor: "pointer",
    },
    
    // 답글 아이템 스타일
    replyItem: {
      marginTop: 10,
      paddingTop: 10,
      borderTop: `1px dashed ${darkMode ? "#555" : "#d6c4f2"}`,
    },
    
    // 날짜 스타일
    dateTime: {
      fontSize: 12,
      color: darkMode ? "#aaa" : "#666",
    },
    
    // 답글 텍스트 스타일
    replyText: {
      whiteSpace: "pre-wrap",
      fontSize: 14,
      lineHeight: 1.5,
      color: darkMode ? "#ddd" : "#333",
      wordBreak: "break-word"
    },
    
    // 답글 작성 영역 스타일
    replyBox: {
      marginTop: 12,
      padding: 12,
      background: darkMode ? "#444" : "#efe2ff",
      borderRadius: 8,
      transition: "all 0.3s ease",
    },
    
    // 더보기 버튼 스타일
    loadMoreButton: {
      width: "100%",
      padding: "10px",
      marginTop: "16px",
      marginBottom: "16px",
      background: darkMode ? "#333" : "#ede2fd",
      color: darkMode ? "#bb86fc" : "#7e57c2",
      border: `1px solid ${darkMode ? "#444" : "#d6c4f2"}`,
      borderRadius: "8px",
      cursor: "pointer",
      transition: "background 0.2s",
    },
    
    // 에러 메시지 스타일
    errorMessage: {
      padding: "8px 12px",
      marginBottom: 10,
      color: "#fff",
      backgroundColor: darkMode ? "rgba(220, 53, 69, 0.8)" : "rgba(220, 53, 69, 1)",
      borderRadius: 6,
      fontSize: 14
    },
    
    // 댓글 없음 스타일
    noComments: {
      textAlign: "center", 
      padding: "30px 20px", 
      color: darkMode ? "#aaa" : "#777",
      background: darkMode ? "#333" : "#f5f0ff",
      borderRadius: 12,
      margin: "20px 0"
    }
  }), [darkMode]);

  // 답글 자동 높이 조정 이벤트 핸들러
  const handleReplyInputChange = (e) => {
    setNewComment(e.target.value);
    
    // 텍스트 영역 높이 자동 조절
    if (replyTextareaRef.current) {
      replyTextareaRef.current.style.height = "auto";
      replyTextareaRef.current.style.height = `${replyTextareaRef.current.scrollHeight}px`;
    }
  };

  // CSS 애니메이션 추가
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
      @keyframes fadeBackground {
        0% { background-color: ${darkMode ? '#554070' : '#e0d3ff'}; }
        100% { background-color: transparent; }
      }
      .highlight-comment {
        background-color: ${darkMode ? '#554070' : '#e0d3ff'};
        transition: background-color 2s ease-out;
      }
      .liked-animation {
        animation: pulse 0.6s ease;
      }
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
      }
      .reply-transition {
        transition: max-height 0.3s ease-out, opacity 0.3s ease-out;
        overflow: hidden;
      }
      .fade-in {
        animation: fadeIn 0.3s ease-out;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [darkMode]);

  // 컴포넌트 렌더링 부분
  return (
    <div style={memoizedStyles.container}>
      {/* 댓글 작성 영역 */}
      <div style={memoizedStyles.commentBox} ref={textareaRef}>
        <h2 style={memoizedStyles.sectionTitle}>
          <span>💬 댓글 작성</span>
          {commentCount > 0 && (
            <span style={memoizedStyles.titleCount}>
              총 {commentCount + replyCount}개의 댓글
            </span>
          )}
        </h2>
        
        {error && (
          <div style={memoizedStyles.errorMessage}>
            {error}
          </div>
        )}
        
        {/* 답글 작성 중인지 표시 */}
        {replyInfo && (
          <div style={{
            padding: "8px 12px",
            marginBottom: 10,
            backgroundColor: darkMode ? "#4a3580" : "#e5daff",
            borderRadius: 6,
            fontSize: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>
              <strong>{replyInfo.authorName}</strong>님에게 답글 작성 중
            </span>
            <button 
              onClick={() => setReplyInfo(null)}
              style={{
                background: "transparent",
                border: "none",
                color: darkMode ? "#ddd" : "#333",
                cursor: "pointer",
                fontSize: 16
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* 댓글/답글 입력 영역 */}
        <textarea
          ref={replyInfo ? replyTextareaRef : textareaRef}
          value={newComment}
          onChange={replyInfo ? handleReplyInputChange : (e => setNewComment(e.target.value))}
          onKeyDown={handleKeyDown}
          placeholder={replyInfo 
            ? `${replyInfo.authorName}님에게 답글 작성...` 
            : "댓글을 입력하세요... (Shift+Enter: 줄바꿈, Enter: 등록)"
          }
          style={memoizedStyles.textarea}
          disabled={isSubmitting}
        />
        
        {/* 글자 수 카운터 */}
        <div style={memoizedStyles.charCount}>
          <span>{newComment.length}/{MAX_COMMENT_LENGTH}자</span>
          {newComment.length > MAX_COMMENT_LENGTH && (
            <span style={{ color: "red" }}>
              {newComment.length - MAX_COMMENT_LENGTH}자 초과
            </span>
          )}
        </div>
        
        {/* 비밀댓글 체크박스와 버튼 */}
        <div style={memoizedStyles.buttonRow}>
          <label style={memoizedStyles.checkbox}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
              disabled={isSubmitting}
              style={{ marginRight: 8 }}
            /> 
            <span>🔒 비밀{replyInfo ? '답글' : '댓글'}로 작성</span>
          </label>
          
          <div style={{ display: "flex", gap: 8 }}>
            {newComment.trim() && (
              <button 
                onClick={cancelComment}
                style={{
                  ...memoizedStyles.button.secondary,
                  opacity: isSubmitting ? 0.7 : 1,
                  cursor: isSubmitting ? "not-allowed" : "pointer"
                }}
                disabled={isSubmitting}
              >
                취소
              </button>
            )}
            
            <button 
              onClick={addComment} 
              style={{
                ...memoizedStyles.button.primary,
                opacity: (isSubmitting || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH) ? 0.7 : 1,
                cursor: (isSubmitting || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH) ? "not-allowed" : "pointer"
              }}
              disabled={isSubmitting || !newComment.trim() || newComment.length > MAX_COMMENT_LENGTH}
            >
              {isSubmitting ? "저장 중..." : `${replyInfo ? '답글' : '댓글'} 등록`}
            </button>
          </div>
        </div>
        
        {/* 비밀댓글 안내 */}
        {isPrivate && (
          <div style={memoizedStyles.privateInfo}>
            * 비밀{replyInfo ? '답글' : '댓글'}은 작성자와 게시글 작성자만 볼 수 있습니다
          </div>
        )}
      </div>

      {/* 댓글 목록 */}
      {comments.length > 0 ? (
        <div>
          {/* 댓글 목록 헤더 */}
          <div style={memoizedStyles.listHeader}>
            <h2 style={memoizedStyles.sectionTitle}>
              <span>💬 댓글 목록</span>
              <span style={memoizedStyles.titleCount}>
                {commentCount}개의 댓글, {replyCount}개의 답글
              </span>
            </h2>
            
            <button 
              onClick={toggleSortOrder}
              style={memoizedStyles.sortButton}
              title={sortOrder === "asc" ? "최신 댓글 순서로 보기" : "오래된 댓글 순서로 보기"}
            >
              <span>정렬: {sortOrder === "asc" ? "오래된 순" : "최신 순"}</span>
              <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
            </button>
          </div>
          
          {/* 댓글 리스트 */}
          <div style={{ marginTop: 20 }}>
            {comments.map(comment => {
              const isNewComment = newCommentIds.includes(comment.id);
              const isFocused = focusedCommentId === comment.id;
              const canView = !comment.isPrivate || comment.nickname === me || postOwner === me;
              const isLiked = comment.likedBy?.includes(me) || false;
              const hasReplies = comment.replyCount > 0 || comment.replies?.length > 0;
              const isExpanded = expandedReplies[comment.id] || false;
              
              return (
                <div 
                  key={comment.id} 
                  id={`comment-${comment.id}`}
                  style={{
                    ...memoizedStyles.commentContainer,
                    ...(isNewComment ? { animation: "fadeBackground 5s ease-out" } : {}),
                    ...(isFocused ? { scrollMarginTop: "70px" } : {})
                  }}
                >
                  {/* 메인 댓글 */}
                  <div style={canView ? memoizedStyles.commentItem : memoizedStyles.secretComment}>
                    {/* 댓글 헤더 (작성자 정보) */}
                    <div style={memoizedStyles.commentHeader}>
                      <div style={memoizedStyles.userInfo}>
                        <CustomLink to={`/userpage/${comment.nickname || "알 수 없음"}`} style={{ textDecoration: "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar 
                              src={getProfilePic(comment.nickname)}
                              size={28}
                              alt={comment.nickname || "사용자"}
                            />
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <strong style={{ color: darkMode ? "#fff" : "#333" }}>{comment.nickname || "알 수 없음"}</strong>
                              {getGradeEmoji(comment.nickname) && (
                                <span style={{ marginLeft: 4 }}>{getGradeEmoji(comment.nickname)}</span>
                              )}
                            </div>
                          </div>
                        </CustomLink>
                        {comment.isPrivate && (
                          <span style={{ fontSize: 14, color: darkMode ? "#ff9800" : "#e67e22" }}>🔒</span>
                        )}
                      </div>
                      <span style={memoizedStyles.dateTime}>
                        {formatDate(comment.createdAt?.seconds || comment.createdAt)}
                      </span>
                    </div>
                    
                    {/* 댓글 내용 */}
                    {canView ? (
                      <p style={memoizedStyles.commentText}>{comment.text}</p>
                    ) : (
                      <p style={memoizedStyles.secretText}>🔒 비밀댓글입니다</p>
                    )}

                    {/* 댓글 액션 버튼들 */}
                    {canView && (
                      <div style={memoizedStyles.commentAction}>
                        <button 
                          onClick={() => toggleLike(comment.id, isLiked)} 
                          style={{
                            ...memoizedStyles.actionButton,
                            background: isLiked 
                              ? (darkMode ? "#6a1b9a" : "#6a1b9a") 
                              : (darkMode ? "#7e57c2aa" : "#7e57c2"),
                          }}
                          disabled={isLiked}
                          title={isLiked ? "이미 좋아요를 눌렀습니다" : "좋아요"}
                        >
                          {isLiked ? "❤️" : "👍"} {comment.likes || 0}
                        </button>

                        <button 
                          style={memoizedStyles.actionButton} 
                          onClick={() => startReply(comment.id, comment.nickname)}
                        >
                          ↪️ 답글
                        </button>

                        {comment.nickname === me && (
                          <>
                            <button
                              onClick={() => goToEditComment(comment.id)}
                              style={{ 
                                ...memoizedStyles.actionButton, 
                                background: darkMode ? '#6a1b9a99' : '#6a1b9a' 
                              }}
                            >
                              ✏️ 수정
                            </button>
                            <button
                              onClick={() => confirmDeleteComment(comment.id, hasReplies)}
                              style={memoizedStyles.button.danger}
                            >
                              🗑️ 삭제
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* 답글 수 표시 및 토글 버튼 */}
                    {hasReplies && (
                      <div 
                        style={{
                          ...memoizedStyles.replyBadge,
                          marginTop: 12
                        }}
                        onClick={() => loadReplies(comment.id)}
                      >
                        <span style={{ marginRight: 4 }}>
                          {isExpanded ? "▼" : "►"}
                        </span>
                        <span>
                          💬 답글 {comment.replyCount || comment.replies?.length || 0}개
                          {isExpanded ? " 숨기기" : " 보기"}
                        </span>
                      </div>
                    )}

                    {/* 답글 목록 */}
                    {isExpanded && comment.replies && comment.replies.length > 0 && (
                      <div 
                        style={memoizedStyles.repliesContainer}
                        className="reply-transition fade-in"
                      >
                        {comment.replies.map(reply => {
                          const replyCanView = !reply.isPrivate || reply.nickname === me || postOwner === me;
                          const replyIsLiked = reply.likedBy?.includes(me) || false;
                          
                          return (
                            <div 
                              key={reply.id} 
                              id={`comment-${reply.id}`}
                              style={memoizedStyles.replyItem}
                            >
                              {/* 답글 헤더 */}
                              <div style={memoizedStyles.commentHeader}>
                                <div style={memoizedStyles.userInfo}>
                                  <CustomLink to={`/userpage/${reply.nickname || "알 수 없음"}`} style={{ textDecoration: "none" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <Avatar 
                                        src={getProfilePic(reply.nickname)}
                                        size={24}
                                        alt={reply.nickname || "사용자"}
                                      />
                                      <div style={{ display: "flex", alignItems: "center" }}>
                                        <strong style={{ color: darkMode ? "#fff" : "#333" }}>{reply.nickname || "알 수 없음"}</strong>
                                        {getGradeEmoji(reply.nickname) && (
                                          <span style={{ marginLeft: 4 }}>{getGradeEmoji(reply.nickname)}</span>
                                        )}
                                      </div>
                                    </div>
                                  </CustomLink>
                                  {reply.isPrivate && (
                                    <span style={{ fontSize: 14, color: darkMode ? "#ff9800" : "#e67e22" }}>🔒</span>
                                  )}
                                </div>
                                <span style={memoizedStyles.dateTime}>
                                  {formatDate(reply.createdAt?.seconds || reply.createdAt)}
                                </span>
                              </div>
                              
                              {/* 답글 내용 */}
                              {replyCanView ? (
                                <p style={memoizedStyles.replyText}>{reply.text}</p>
                              ) : (
                                <p style={memoizedStyles.secretText}>🔒 비밀답글입니다</p>
                              )}

                              {/* 답글 액션 버튼들 */}
                              {replyCanView && (
                                <div style={memoizedStyles.commentAction}>
                                  <button 
                                    onClick={() => toggleLike(reply.id, replyIsLiked, comment.id)} 
                                    style={{
                                      ...memoizedStyles.actionButton,
                                      background: replyIsLiked 
                                        ? (darkMode ? "#6a1b9a" : "#6a1b9a") 
                                        : (darkMode ? "#7e57c2aa" : "#7e57c2"),
                                      padding: "4px 10px"
                                    }}
                                    disabled={replyIsLiked}
                                    title={replyIsLiked ? "이미 좋아요를 눌렀습니다" : "좋아요"}
                                  >
                                    {replyIsLiked ? "❤️" : "👍"} {reply.likes || 0}
                                  </button>

                                  <button 
                                    style={{
                                      ...memoizedStyles.actionButton,
                                      padding: "4px 10px"
                                    }} 
                                    onClick={() => startReply(comment.id, reply.nickname)}
                                  >
                                    ↪️ 답글
                                  </button>

                                  {reply.nickname === me && (
                                    <>
                                      <button
                                        onClick={() => goToEditComment(reply.id)}
                                        style={{ 
                                          ...memoizedStyles.actionButton, 
                                          background: darkMode ? '#6a1b9a99' : '#6a1b9a',
                                          padding: "4px 10px"
                                        }}
                                      >
                                        ✏️ 수정
                                      </button>
                                      <button
                                        onClick={() => confirmDeleteComment(reply.id, false, comment.id)}
                                        style={{
                                          ...memoizedStyles.button.danger,
                                          padding: "4px 10px"
                                        }}
                                      >
                                        🗑️ 삭제
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* 댓글 더 불러오기 버튼 */}
            {hasMore && (
              <button 
                onClick={loadMoreComments}
                disabled={isLoadingMore}
                style={{
                  ...memoizedStyles.loadMoreButton,
                  opacity: isLoadingMore ? 0.7 : 1,
                  cursor: isLoadingMore ? "not-allowed" : "pointer"
                }}
              >
                {isLoadingMore ? "불러오는 중..." : "댓글 더 보기"}
              </button>
            )}
            
            {/* 스크롤 기준점 */}
            <div ref={commentsEndRef} />
          </div>
        </div>
            ) : isLoading ? (
        <div style={{ 
          textAlign: "center", 
          padding: "30px 20px", 
          color: darkMode ? "#aaa" : "#777",
          background: darkMode ? "#333" : "#f5f0ff",
          borderRadius: 12,
          margin: "20px 0"
        }}>
          <p>댓글을 불러오는 중입니다...</p>
        </div>
      ) : (
        <div style={memoizedStyles.noComments}>
          <p>아직 댓글이 없습니다. 첫 댓글을 작성해보세요!</p>
        </div>
      )}
    </div>
  );
}

CommentSystem.propTypes = {
  postId: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  darkMode: PropTypes.bool,
  postOwner: PropTypes.string.isRequired,
  postTitle: PropTypes.string,
  globalProfilePics: PropTypes.object,
  globalGrades: PropTypes.object
};

CommentSystem.defaultProps = {
  darkMode: false,
  postTitle: "",
  globalProfilePics: {},
  globalGrades: {}
};

// EditComment 컴포넌트 (댓글 수정 페이지)
function EditComment({ commentId, type, postId, darkMode, onSave, onCancel, initialText, isPrivate: initialIsPrivate }) {
  const [commentText, setCommentText] = useState(initialText || "");
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate || false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  
  // 스타일 가져오기
  const styles = getThemeStyles(darkMode);
  
  // 댓글 업데이트 함수
  const updateComment = async () => {
    if (!commentText.trim()) {
      setError("댓글 내용을 입력해주세요.");
      return;
    }
    
    if (commentText.length > MAX_COMMENT_LENGTH) {
      setError(`댓글은 최대 ${MAX_COMMENT_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    
    setIsLoading(true);
    setError("");
    
    try {
      const commentRef = doc(db, `${type}-${postId}-comments`, commentId);
      await updateDoc(commentRef, {
        text: commentText,
        isPrivate,
        updatedAt: serverTimestamp()
      });
      
      if (onSave) {
        onSave(commentText, isPrivate);
      }
    } catch (err) {
      console.error("댓글 수정 중 오류:", err);
      setError("댓글을 수정하는 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div style={{
      backgroundColor: darkMode ? "#333" : "#f5f0ff",
      borderRadius: 12,
      padding: 20,
      marginBottom: 20
    }}>
      <h3 style={{ color: darkMode ? "#bb86fc" : "#7e57c2", marginTop: 0 }}>
        댓글 수정
      </h3>
      
      {error && (
        <div style={{
          padding: "8px 12px",
          marginBottom: 10,
          color: "#fff",
          backgroundColor: darkMode ? "rgba(220, 53, 69, 0.8)" : "rgba(220, 53, 69, 1)",
          borderRadius: 6,
          fontSize: 14
        }}>
          {error}
        </div>
      )}
      
      <textarea
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        style={{
          ...styles.textarea,
          minHeight: "100px"
        }}
        placeholder="댓글 내용을 입력하세요..."
        disabled={isLoading}
      />
      
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        marginTop: 8,
        fontSize: 14,
        color: darkMode ? "#aaa" : "#777"
      }}>
        <span>{commentText.length}/{MAX_COMMENT_LENGTH}자</span>
        {commentText.length > MAX_COMMENT_LENGTH && (
          <span style={{ color: "red" }}>
            {commentText.length - MAX_COMMENT_LENGTH}자 초과
          </span>
        )}
      </div>
      
      <div style={{ marginTop: 12 }}>
        <label style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 16,
          fontSize: 14,
          color: darkMode ? "#aaa" : "#666",
          cursor: "pointer"
        }}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={() => setIsPrivate(!isPrivate)}
            style={{ marginRight: 8 }}
            disabled={isLoading}
          /> 
          <span>🔒 비밀댓글로 작성</span>
        </label>
      </div>
      
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={onCancel}
          style={{
            padding: "8px 16px",
            background: darkMode ? "#555" : "#e0e0e0",
            color: darkMode ? "#e0e0e0" : "#333",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: "pointer"
          }}
          disabled={isLoading}
        >
          취소
        </button>
        <button
          onClick={updateComment}
          style={{
            padding: "8px 16px",
            background: darkMode ? "#9c27b0" : "#7e57c2",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontWeight: "bold",
            fontSize: 14,
            cursor: "pointer",
            opacity: isLoading ? 0.7 : 1
          }}
          disabled={isLoading || !commentText.trim() || commentText.length > MAX_COMMENT_LENGTH}
        >
          {isLoading ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}

EditComment.propTypes = {
  commentId: PropTypes.string.isRequired,
  type: PropTypes.string.isRequired,
  postId: PropTypes.string.isRequired,
  darkMode: PropTypes.bool,
  onSave: PropTypes.func,
  onCancel: PropTypes.func,
  initialText: PropTypes.string,
  isPrivate: PropTypes.bool
};

EditComment.defaultProps = {
  darkMode: false,
  initialText: "",
  isPrivate: false
};

// 댓글 수정 페이지 (독립 페이지용)
function EditCommentPage({ darkMode }) {
  const [comment, setComment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const location = window.location.pathname;
  const segments = location.split('/');
  
  // URL에서 파라미터 추출
  const type = segments[2] || "";
  const postId = segments[3] || "";
  const commentId = segments[4] || "";
  
  useEffect(() => {
    // 댓글 정보 가져오기
    const fetchComment = async () => {
      if (!type || !postId || !commentId) {
        setError("댓글 정보를 찾을 수 없습니다.");
        setIsLoading(false);
        return;
      }
      
      try {
        const commentRef = doc(db, `${type}-${postId}-comments`, commentId);
        const commentSnap = await getDoc(commentRef);
        
        if (!commentSnap.exists()) {
          setError("댓글을 찾을 수 없습니다.");
          setIsLoading(false);
          return;
        }
        
        const commentData = commentSnap.data();
        setComment(commentData);
        
        // 현재 사용자가 이 댓글의 작성자인지 확인
        const currentUser = localStorage.getItem("nickname");
        if (commentData.nickname !== currentUser) {
          setError("다른 사용자의 댓글은 수정할 수 없습니다.");
        }
        
        // 게시글 제목 가져오기
        try {
          const postRef = doc(db, type, postId);
          const postSnap = await getDoc(postRef);
          
          if (postSnap.exists()) {
            setPostTitle(postSnap.data().title || "게시글");
          }
        } catch (err) {
          console.error("게시글 정보 가져오기 오류:", err);
        }
        
      } catch (err) {
        console.error("댓글 정보 가져오기 오류:", err);
        setError("댓글 정보를 불러오는 중 오류가 발생했습니다.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchComment();
  }, [type, postId, commentId]);
  
  // 댓글 수정 완료 후 처리
  const handleSave = () => {
    // 해당 게시글 페이지로 이동
    window.location.href = `/post/${type}/${postId}?comment=${commentId}`;
  };
  
  // 취소 시 처리
  const handleCancel = () => {
    window.history.back();
  };
  
  // 로딩 화면
  if (isLoading) {
    return (
      <div style={{ 
        padding: "40px 20px", 
        textAlign: "center",
        color: darkMode ? "#e0e0e0" : "#333"
      }}>
        <p>댓글 정보를 불러오는 중...</p>
      </div>
    );
  }
  
  // 에러 화면
  if (error) {
    return (
      <div style={{ 
        padding: "40px 20px", 
        textAlign: "center",
        color: darkMode ? "#e0e0e0" : "#333"
      }}>
        <h2 style={{ color: darkMode ? "#cf6679" : "#f44336" }}>오류</h2>
        <p>{error}</p>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: "8px 16px",
            backgroundColor: darkMode ? "#bb86fc" : "#7e57c2",
            color: "white",
            border: "none",
            borderRadius: "6px",
            marginTop: "20px",
            cursor: "pointer"
          }}
        >
          이전 페이지로 돌아가기
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ padding: "20px" }}>
      <div style={{
        maxWidth: "800px",
        margin: "0 auto"
      }}>
        <div style={{
          marginBottom: "20px",
          padding: "15px",
          backgroundColor: darkMode ? "#2a2a2a" : "#f0e6ff",
          borderRadius: "8px",
          color: darkMode ? "#e0e0e0" : "#333"
        }}>
          <h2 style={{ margin: 0, color: darkMode ? "#bb86fc" : "#7e57c2" }}>댓글 수정</h2>
          {postTitle && (
            <p style={{ marginBottom: 0 }}>
              게시글: <a 
                href={`/post/${type}/${postId}`}
                style={{ 
                  color: darkMode ? "#bb86fc" : "#7e57c2",
                  textDecoration: "none"
                }}
              >
                {postTitle}
              </a>
            </p>
          )}
        </div>
        
        {comment && (
          <EditComment
            commentId={commentId}
            type={type}
            postId={postId}
            darkMode={darkMode}
            onSave={handleSave}
            onCancel={handleCancel}
            initialText={comment.text}
            isPrivate={comment.isPrivate}
          />
        )}
      </div>
    </div>
  );
}

EditCommentPage.propTypes = {
  darkMode: PropTypes.bool
};

EditCommentPage.defaultProps = {
  darkMode: false
};

// 컴포넌트 내보내기
export {
  CommentSystem,
  EditComment,
  EditCommentPage
};

export default CommentSystem;
