import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { toast } from 'react-toastify';
import { X, MessageSquare, Heart, Eye } from 'lucide-react';
import { db } from '../firebase';
import CommentSection from './CommentSection';
import type { User as CommentUser } from './CommentSectionUtils';
import {
  ensureHomeNotebookPhotoPost,
  getHomeNotebookPhotoPostId,
  HOME_NOTEBOOK_BODY_WRITER_UID,
  type HomeNotebookBlock,
} from '../utils/homeNotebookBody';

const GRID_MAX_ROWS = 2;
const GRID_COLUMNS_MOBILE = 3;
const GRID_COLUMNS_DESKTOP = 4;
const DESKTOP_BREAKPOINT = 640;

interface HomeNotebookPhotoGalleryProps {
  images: HomeNotebookBlock[];
  user: CommentUser | null;
  openPhotoId?: string | null;
  onOpenPhotoIdChange?: (photoId: string | null) => void;
}

interface PhotoEngagement {
  commentCount: number;
  likesCount: number;
  viewsCount: number;
  isLiked: boolean;
}

const EMPTY_ENGAGEMENT: PhotoEngagement = {
  commentCount: 0,
  likesCount: 0,
  viewsCount: 0,
  isLiked: false,
};

const useGridColumns = (): number => {
  const [columns, setColumns] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT
      ? GRID_COLUMNS_DESKTOP
      : GRID_COLUMNS_MOBILE
  );

  useEffect(() => {
    const onResize = () => {
      setColumns(window.innerWidth >= DESKTOP_BREAKPOINT ? GRID_COLUMNS_DESKTOP : GRID_COLUMNS_MOBILE);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return columns;
};

const DECORATION_STYLES = ['pin', 'tape-tr', 'tape-tl', 'pin'] as const;
type DecorationStyle = (typeof DECORATION_STYLES)[number];

const getPhotoDecoration = (index: number): DecorationStyle =>
  DECORATION_STYLES[index % DECORATION_STYLES.length];

const PhotoDecor: React.FC<{ style: DecorationStyle }> = ({ style }) => (
  <span className={`notebook-photo-decor notebook-photo-decor--${style}`} aria-hidden />
);

const PhotoTile: React.FC<{
  block: HomeNotebookBlock;
  isNewest: boolean;
  decorIndex: number;
  engagement?: PhotoEngagement;
  onOpen?: () => void;
  onLike?: () => void;
}> = ({
  block,
  isNewest,
  decorIndex,
  engagement = EMPTY_ENGAGEMENT,
  onOpen,
  onLike,
}) => {
  const decor = getPhotoDecoration(decorIndex);
  const { commentCount, likesCount, viewsCount, isLiked } = engagement;

  return (
    <figure className="notebook-photo-gallery__item">
      <button
        type="button"
        className={`notebook-photo-gallery__thumb notebook-photo-gallery__thumb--${decor}`}
        onClick={onOpen}
        aria-label={block.body?.trim() || '베리어스 활동 사진'}
      >
        <PhotoDecor style={decor} />
        <img src={block.imageUrl} alt={block.body?.trim() || '베리어스 활동 사진'} loading="lazy" />
        {isNewest && <span className="notebook-photo-gallery__new">new!</span>}
      </button>

      <div className="notebook-photo-gallery__stats" aria-label="반응">
        <button
          type="button"
          className={`notebook-photo-gallery__stat notebook-photo-gallery__stat--like${
            isLiked ? ' notebook-photo-gallery__stat--liked' : ''
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onLike?.();
          }}
          aria-pressed={isLiked}
          aria-label={`좋아요 ${likesCount}개`}
        >
          <Heart size={11} aria-hidden fill={isLiked ? 'currentColor' : 'none'} />
          <span>{likesCount}</span>
        </button>
        <button
          type="button"
          className="notebook-photo-gallery__stat notebook-photo-gallery__stat--comment"
          onClick={onOpen}
          aria-label={`댓글 ${commentCount}개`}
        >
          <MessageSquare size={11} aria-hidden />
          <span>{commentCount}</span>
        </button>
        <span
          className="notebook-photo-gallery__stat notebook-photo-gallery__stat--views notebook-photo-gallery__stat--readonly"
          aria-label={`조회 ${viewsCount}회`}
        >
          <Eye size={11} aria-hidden />
          <span>{viewsCount}</span>
        </span>
      </div>

      {block.body?.trim() && (
        <figcaption className="notebook-photo-gallery__caption">{block.body}</figcaption>
      )}
    </figure>
  );
};

interface PhotoDetailModalProps {
  block: HomeNotebookBlock;
  isNewest: boolean;
  decorIndex: number;
  engagement: PhotoEngagement;
  user: CommentUser | null;
  onClose: () => void;
  onLike: () => void;
}

const PhotoDetailModal: React.FC<PhotoDetailModalProps> = ({
  block,
  isNewest,
  decorIndex,
  engagement,
  user,
  onClose,
  onLike,
}) => {
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const commentsRef = useRef<HTMLDivElement>(null);
  const decor = getPhotoDecoration(decorIndex);
  const postId = getHomeNotebookPhotoPostId(block.id);
  const post = useMemo(
    () => ({
      id: postId,
      title: block.body?.trim() || '활동 사진',
      writerUid: HOME_NOTEBOOK_BODY_WRITER_UID,
      writerNickname: 'VERYUS',
    }),
    [block.body, postId]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureHomeNotebookPhotoPost(block);
      if (cancelled) return;
      setReady(true);
      try {
        await updateDoc(doc(db, 'posts', postId), { views: increment(1) });
      } catch (error) {
        console.error('사진 조회수 업데이트 실패:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [block, postId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (zoomed) {
        setZoomed(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, zoomed]);

  return createPortal(
    <>
      <div
        className="notebook-photo-detail-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="사진 상세"
        onClick={onClose}
      >
        <div className="notebook-photo-detail" onClick={(event) => event.stopPropagation()}>
          <header className="notebook-photo-detail__header">
            <h3 className="notebook-photo-detail__title">활동 사진</h3>
            <button
              type="button"
              className="notebook-photo-detail__close"
              onClick={onClose}
              aria-label="닫기"
            >
              <X size={18} aria-hidden />
            </button>
          </header>

          <div className="notebook-photo-detail__body">
            <div className="notebook-photo-detail__media">
              <button
                type="button"
                className={`notebook-photo-detail__media-btn notebook-photo-gallery__thumb--${decor}`}
                onClick={() => setZoomed(true)}
                aria-label="사진 확대"
              >
                <PhotoDecor style={decor} />
                <img
                  src={block.imageUrl}
                  alt={block.body?.trim() || '베리어스 활동 사진'}
                />
                {isNewest && <span className="notebook-photo-gallery__new">new!</span>}
                <span className="notebook-photo-detail__zoom-hint">탭하여 확대</span>
              </button>
            </div>

            {block.body?.trim() && (
              <p className="notebook-photo-detail__caption">{block.body}</p>
            )}

            <div className="notebook-photo-detail__stats">
              <button
                type="button"
                className={`notebook-photo-gallery__stat notebook-photo-gallery__stat--like notebook-photo-gallery__stat--detail${
                  engagement.isLiked ? ' notebook-photo-gallery__stat--liked' : ''
                }`}
                onClick={onLike}
                aria-pressed={engagement.isLiked}
                aria-label={`좋아요 ${engagement.likesCount}개`}
              >
                <Heart size={14} aria-hidden fill={engagement.isLiked ? 'currentColor' : 'none'} />
                <span>{engagement.likesCount}</span>
              </button>
              <button
                type="button"
                className="notebook-photo-gallery__stat notebook-photo-gallery__stat--comment notebook-photo-gallery__stat--detail"
                onClick={() =>
                  commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                aria-label={`댓글 ${engagement.commentCount}개`}
              >
                <MessageSquare size={14} aria-hidden />
                <span>{engagement.commentCount}</span>
              </button>
              <span
                className="notebook-photo-gallery__stat notebook-photo-gallery__stat--views notebook-photo-gallery__stat--detail notebook-photo-gallery__stat--readonly"
                aria-label={`조회 ${engagement.viewsCount}회`}
              >
                <Eye size={14} aria-hidden />
                <span>{engagement.viewsCount}</span>
              </span>
            </div>

            <div className="notebook-photo-detail__comments" ref={commentsRef}>
              {ready ? (
                <CommentSection
                  postId={postId}
                  user={user}
                  post={post}
                  emptyCommentMessageVisibleToRoles={['일반', '리더', '부운영진', '운영진', '평가자', '']}
                />
              ) : (
                <p className="notebook-photo-detail__comments-loading">댓글을 불러오는 중…</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {zoomed && (
        <div
          className="notebook-photo-zoom"
          role="dialog"
          aria-modal="true"
          aria-label="사진 확대"
          onClick={() => setZoomed(false)}
        >
          <button
            type="button"
            className="notebook-photo-zoom__close"
            onClick={() => setZoomed(false)}
            aria-label="확대 닫기"
          >
            <X size={22} aria-hidden />
          </button>
          <img
            className="notebook-photo-zoom__img"
            src={block.imageUrl}
            alt={block.body?.trim() || '베리어스 활동 사진'}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>,
    document.body
  );
};

const HomeNotebookPhotoGallery: React.FC<HomeNotebookPhotoGalleryProps> = ({
  images,
  user,
  openPhotoId,
  onOpenPhotoIdChange,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [photoEngagement, setPhotoEngagement] = useState<Record<string, PhotoEngagement>>({});
  const columns = useGridColumns();

  const maxVisible = columns * GRID_MAX_ROWS;
  const hasMore = images.length > maxVisible;
  const previewImages = useMemo(
    () => (hasMore ? images.slice(0, maxVisible) : images),
    [hasMore, images, maxVisible]
  );
  const hiddenCount = Math.max(0, images.length - maxVisible);

  const setActivePhoto = useCallback(
    (photoId: string | null) => {
      setActivePhotoId(photoId);
      onOpenPhotoIdChange?.(photoId);
    },
    [onOpenPhotoIdChange]
  );

  useEffect(() => {
    if (!openPhotoId) return;
    setActivePhotoId(openPhotoId);
  }, [openPhotoId]);

  useEffect(() => {
    if (!showAll) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAll(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showAll]);

  useEffect(() => {
    if (images.length === 0) {
      setPhotoEngagement({});
      return;
    }

    const unsubs = images.map((block) => {
      const postId = getHomeNotebookPhotoPostId(block.id);
      void ensureHomeNotebookPhotoPost(block);
      return onSnapshot(
        doc(db, 'posts', postId),
        (snap) => {
          const data = snap.data();
          const likes = Array.isArray(data?.likes) ? data.likes : [];
          setPhotoEngagement((prev) => ({
            ...prev,
            [block.id]: {
              commentCount: snap.exists() ? Number(data?.commentCount || 0) : 0,
              likesCount: snap.exists() ? Number(data?.likesCount || 0) : 0,
              viewsCount: snap.exists() ? Number(data?.views || 0) : 0,
              isLiked: Boolean(user?.uid && likes.includes(user.uid)),
            },
          }));
        },
        () => {
          setPhotoEngagement((prev) => ({
            ...prev,
            [block.id]: EMPTY_ENGAGEMENT,
          }));
        }
      );
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [images, user?.uid]);

  const handlePhotoLike = useCallback(
    async (blockId: string) => {
      if (!user?.uid) {
        toast.error('로그인이 필요합니다.');
        return;
      }

      const stats = photoEngagement[blockId] ?? EMPTY_ENGAGEMENT;
      const postId = getHomeNotebookPhotoPostId(blockId);

      try {
        await updateDoc(doc(db, 'posts', postId), {
          likes: stats.isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
          likesCount: increment(stats.isLiked ? -1 : 1),
        });
      } catch (error) {
        console.error('사진 좋아요 처리 실패:', error);
        toast.error('좋아요 처리 중 오류가 발생했습니다.');
      }
    },
    [photoEngagement, user?.uid]
  );

  const getEngagement = (blockId: string) => photoEngagement[blockId] ?? EMPTY_ENGAGEMENT;

  const activeIndex = activePhotoId ? images.findIndex((img) => img.id === activePhotoId) : -1;
  const activeBlock = activeIndex >= 0 ? images[activeIndex] : null;

  const openPhoto = (photoId: string) => {
    setShowAll(false);
    setActivePhoto(photoId);
  };

  const closePhoto = () => {
    setActivePhoto(null);
  };

  if (images.length === 0) return null;

  return (
    <>
      <section className="notebook-photo-gallery" aria-label="활동 사진 연대기">
        <div
          className="notebook-photo-gallery__grid"
          style={{ '--photo-cols': columns } as React.CSSProperties}
        >
          {previewImages.map((block, index) => (
            <PhotoTile
              key={block.id}
              block={block}
              isNewest={index === 0}
              decorIndex={index}
              engagement={getEngagement(block.id)}
              onOpen={() => openPhoto(block.id)}
              onLike={() => void handlePhotoLike(block.id)}
            />
          ))}
        </div>

        {hasMore && (
          <div className="notebook-photo-gallery__more-wrap">
            <button
              type="button"
              className="notebook-photo-gallery__more-btn"
              onClick={() => setShowAll(true)}
            >
              더보기 (+{hiddenCount})
            </button>
          </div>
        )}
      </section>

      {showAll &&
        createPortal(
          <div
            className="notebook-photo-gallery__modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="활동 사진 전체 보기"
            onClick={() => setShowAll(false)}
          >
            <div
              className="notebook-photo-gallery__modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="notebook-photo-gallery__modal-header">
                <h3 className="notebook-photo-gallery__modal-title">활동 사진</h3>
                <button
                  type="button"
                  className="notebook-photo-gallery__modal-close"
                  onClick={() => setShowAll(false)}
                  aria-label="닫기"
                >
                  <X size={18} aria-hidden />
                </button>
              </header>
              <div
                className="notebook-photo-gallery__modal-grid"
                style={{ '--photo-cols': columns } as React.CSSProperties}
              >
                {images.map((block, index) => (
                  <PhotoTile
                    key={block.id}
                    block={block}
                    isNewest={index === 0}
                    decorIndex={index}
                    engagement={getEngagement(block.id)}
                    onOpen={() => openPhoto(block.id)}
                    onLike={() => void handlePhotoLike(block.id)}
                  />
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}

      {activeBlock && (
        <PhotoDetailModal
          block={activeBlock}
          isNewest={activeIndex === 0}
          decorIndex={activeIndex}
          engagement={getEngagement(activeBlock.id)}
          user={user}
          onClose={closePhoto}
          onLike={() => void handlePhotoLike(activeBlock.id)}
        />
      )}
    </>
  );
};

export default HomeNotebookPhotoGallery;
