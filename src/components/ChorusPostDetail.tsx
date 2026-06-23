import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  collection,
  addDoc,
  serverTimestamp,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getPostListGradeSpanProps } from '../utils/gradeDisplay';
import {
  ArrowLeft,
  Heart,
  Trash,
  Eye,
  Clock,
  AlertTriangle,
  Loader,
  MessageSquare,
  Layers,
} from 'lucide-react';
import ChorusLayerSection, { type ChorusLayerSectionHandle } from './ChorusLayerSection';
import { getPublicRoleBadge, shouldShowPublicPosition } from '../utils/publicRoleBadge';
import { stopBoardAudio } from '../utils/boardAudioPlayer';
import '../styles/ChorusPostWrite.css';

interface User {
  uid: string;
  email: string;
  nickname: string;
  role?: string;
  grade?: string;
  position?: string;
  isLoggedIn: boolean;
}

interface ChorusPost {
  id: string;
  title: string;
  description: string;
  writerUid: string;
  writerNickname: string;
  createdAt: any;
  audioUrl: string;
  duration: number;
  likesCount: number;
  commentCount: number;
  views: number;
  likes: string[];
  writerGrade?: string;
  writerPosition?: string;
  writerRole?: string;
  fileName?: string;
}

const ChorusPostDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const layerSectionRef = useRef<ChorusLayerSectionHandle>(null);

  const [user, setUser] = useState<User | null>(null);
  const [post, setPost] = useState<ChorusPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageContent, setMessageContent] = useState('');

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (userString) {
      setUser(JSON.parse(userString));
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    void updateDoc(doc(db, 'posts', id), { views: increment(1) }).catch(() => {});

    const unsubscribe = onSnapshot(
      doc(db, 'posts', id),
      (docSnapshot) => {
        if (!docSnapshot.exists()) {
          setError('게시글을 찾을 수 없습니다.');
          setLoading(false);
          return;
        }
        const data = docSnapshot.data();
        const { writerGrade, writerRole, writerPosition, ...rest } = data;
        setPost((prev) => ({
          ...(prev || {}),
          ...rest,
          id: docSnapshot.id,
          likes: Array.isArray(data.likes) ? data.likes : [],
          writerGrade: prev?.writerGrade ?? writerGrade,
          writerRole: prev?.writerRole ?? writerRole,
          writerPosition: prev?.writerPosition ?? writerPosition,
        }) as ChorusPost);
        setLoading(false);
      },
      () => {
        setError('게시글을 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    if (!post?.writerUid) return;
    const userRef = doc(db, 'users', post.writerUid);
    const unsubscribe = onSnapshot(userRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setPost((prevPost) => {
          if (!prevPost) return null;
          return {
            ...prevPost,
            writerGrade: userData.grade || '🍒',
            writerRole: userData.role || '일반',
            writerPosition: userData.position || '',
          };
        });
      }
    });
    return () => unsubscribe();
  }, [post?.writerUid]);

  useEffect(() => {
    return () => stopBoardAudio();
  }, []);

  const handleLike = async () => {
    if (!user || !post) return;
    const likesArr = Array.isArray(post.likes) ? post.likes : [];
    try {
      const postRef = doc(db, 'posts', post.id);
      const isLiked = likesArr.includes(user.uid);
      await updateDoc(postRef, {
        likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
        likesCount: isLiked ? (post.likesCount || 0) - 1 : (post.likesCount || 0) + 1,
      });
    } catch {
      alert('좋아요 처리 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!post || !user || (user.uid !== post.writerUid && user.role !== '리더' && user.nickname !== '너래')) {
      alert('삭제 권한이 없습니다.');
      return;
    }
    if (!window.confirm('정말 이 게시글을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      alert('게시글이 삭제되었습니다.');
      navigate('/chorus', { state: { preserveScroll: true } });
    } catch {
      alert('게시글 삭제 중 오류가 발생했습니다.');
    }
  };

  const formatDate = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - d.getTime()) / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMinutes < 60) return `${diffMinutes}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 30) return `${diffDays}일 전`;
    return d.toLocaleDateString('ko-KR');
  };

  if (error) {
    return (
      <div className="post-detail-container">
        <div className="post-navigation">
          <button className="back-button" onClick={() => navigate('/chorus', { state: { preserveScroll: true } })}>
            <ArrowLeft size={20} />
            목록으로
          </button>
        </div>
        <div className="error-container">
          <AlertTriangle size={48} />
          <h3>{error}</h3>
        </div>
      </div>
    );
  }

  if (loading || !post) {
    return (
      <div className="post-detail-container">
        <div className="loading-container">
          <Loader className="loading-spinner" />
          게시글을 불러오는 중...
        </div>
      </div>
    );
  }


  return (
    <div className="post-detail-container">
      <div className="post-navigation glassmorphism">
        <button
          className="back-button glassmorphism"
          onClick={() => navigate('/chorus', { state: { preserveScroll: true } })}
        >
          <ArrowLeft size={20} />
          목록으로
        </button>
      </div>

      <article className="post-detail">
        <div className="post-detail-header">
          <div className="title-section">
            <span className="category-tag">이어 부르기</span>
            <h1 className="post-detail-title">{post.title}</h1>
          </div>
          <div className="post-detail-meta">
            <div className="post-detail-author">
              <div className="author-section">
                <span className="author-info" onClick={() => navigate(`/mypage/${post.writerUid}`)}>
                  <span {...getPostListGradeSpanProps(post.writerGrade)} />
                  {post.writerNickname}
                </span>
                <span className={`role-badge ${getPublicRoleBadge(post.writerRole, post.writerPosition)}`}>
                  {getPublicRoleBadge(post.writerRole, post.writerPosition)}
                </span>
              </div>
              <div className="post-detail-info">
                <span className="post-detail-date">
                  <Clock size={16} />
                  {formatDate(post.createdAt)}
                </span>
                <span className="post-detail-views">
                  <Eye size={16} />
                  조회 {post.views || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="post-detail-content">
          {post.description && <div className="chorus-description">{post.description}</div>}
          <div className="chorus-player-block">
            <audio src={post.audioUrl} controls preload="metadata" className="chorus-base-audio" />
            {user && (
              <div className="chorus-player-block__actions">
                <button
                  type="button"
                  className="chorus-player-block__layer-btn"
                  onClick={() =>
                    layerSectionRef.current?.startHarmonyOn({
                      parentKey: 'base',
                      audioUrl: post.audioUrl,
                      label: post.writerNickname,
                    })
                  }
                  title="이 녹음에 화음 쌓기"
                >
                  <Layers size={14} aria-hidden />
                  레이어
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="post-detail-footer">
          <div className="post-stats">
            <button
              onClick={handleLike}
              className={`stat-button ${user && post.likes.includes(user.uid) ? 'liked' : ''}`}
              disabled={!user}
            >
              <Heart size={20} fill={user && post.likes.includes(user.uid) ? 'currentColor' : 'none'} />
              <span>{post.likesCount || 0}</span>
            </button>
            <button className="message-btn" onClick={() => setShowMessageModal(true)}>
              <MessageSquare size={18} /> 쪽지
            </button>
            {user && (user.uid === post.writerUid || user.role === '리더' || user.nickname === '너래') && (
              <button onClick={handleDelete} className="action-button">
                <Trash size={20} />
                삭제
              </button>
            )}
          </div>
        </div>
      </article>

      <ChorusLayerSection
        ref={layerSectionRef}
        postId={post.id}
        post={{ id: post.id, title: post.title, writerUid: post.writerUid, writerNickname: post.writerNickname }}
        user={user}
        basePhrase={{
          audioUrl: post.audioUrl,
          writerNickname: post.writerNickname,
          writerGrade: post.writerGrade,
          writerUid: post.writerUid,
          duration: post.duration,
        }}
      />

      {showMessageModal && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="message-modal" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--paper-card, #fffdf8)', borderRadius: 16, padding: 32, maxWidth: 360, margin: '120px auto' }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>{post.writerNickname}님에게 쪽지 보내기</h3>
            <textarea
              value={messageContent}
              onChange={(e) => setMessageContent(e.target.value)}
              placeholder="쪽지 내용을 입력하세요..."
              style={{ width: '100%', minHeight: 80, borderRadius: 8, border: '1px solid #e8dcc8', padding: 12, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowMessageModal(false)}>취소</button>
              <button
                onClick={async () => {
                  if (!messageContent.trim()) return alert('쪽지 내용을 입력하세요.');
                  await addDoc(collection(db, 'messages'), {
                    fromUid: user?.uid,
                    fromNickname: user?.nickname,
                    toUid: post.writerUid,
                    toNickname: post.writerNickname,
                    content: messageContent.trim(),
                    createdAt: serverTimestamp(),
                    isRead: false,
                  });
                  setShowMessageModal(false);
                  setMessageContent('');
                  alert('쪽지를 보냈습니다.');
                }}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChorusPostDetail;
