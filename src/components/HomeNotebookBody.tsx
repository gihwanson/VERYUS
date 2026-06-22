import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'react-toastify';
import {
  Pencil,
  Check,
  Plus,
  Trash2,
  ImagePlus,
  Type,
  Heading2,
  Calendar,
} from 'lucide-react';
import { storage, auth } from '../firebase';
import { canEditHomeNotebookBody } from './AdminTypes';
import HomeNotebookPhotoGallery from './HomeNotebookPhotoGallery';
import {
  createNotebookBlockId,
  fetchHomeNotebookBody,
  saveHomeNotebookBody,
  sortNotebookBlocks,
  splitNotebookBlocks,
  type HomeNotebookBlock,
  type HomeNotebookBlockType,
} from '../utils/homeNotebookBody';
interface HomeNotebookBodyProps {
  user: {
    uid?: string;
    email?: string;
    nickname?: string;
    role?: string;
    grade?: string;
    isLoggedIn?: boolean;
  } | null;
}

const BLOCK_LABELS: Record<HomeNotebookBlockType, string> = {
  heading: '소제목',
  text: '글',
  image: '사진',
  timeline: '활동 이력',
};

const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/*';

const isImageFile = (file: File) =>
  file.type.startsWith('image/') ||
  /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);

const isPermissionDeniedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = String((error as { code: string }).code);
  return code === 'permission-denied' || code === 'storage/unauthorized';
};

const HomeNotebookBody: React.FC<HomeNotebookBodyProps> = ({ user }) => {
  const canEdit = canEditHomeNotebookBody(user);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState<HomeNotebookBlock[]>([]);
  const [draftBlocks, setDraftBlocks] = useState<HomeNotebookBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickingForBlockId, setPickingForBlockId] = useState<string | null>(null);
  /** 이번 편집에서 '사진' 추가로 연 업로드 블록 — 기존 사진은 편집 UI에 노출하지 않음 */
  const [pendingImageBlockId, setPendingImageBlockId] = useState<string | null>(null);

  const commentUser = useMemo(() => {
    if (!user?.uid) return null;
    return {
      uid: user.uid,
      email: user.email || '',
      nickname: user.nickname,
      role: user.role,
      grade: user.grade,
      isLoggedIn: user.isLoggedIn ?? true,
    };
  }, [user]);

  const loadBody = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHomeNotebookBody();
      setBlocks(data);
      setDraftBlocks(data);
    } catch (error) {
      console.error('홈 본문 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBody();
  }, [loadBody]);

  const startEditing = () => {
    setDraftBlocks(blocks);
    setPendingImageBlockId(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraftBlocks(blocks);
    setPendingImageBlockId(null);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!canEdit || !user?.nickname) {
      toast.error('본문을 편집할 권한이 없습니다. (리더·운영진만 가능)');
      return;
    }
    if (!auth.currentUser) {
      toast.error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }
    setSaving(true);
    try {
      const blocksToSave = sortNotebookBlocks(
        draftBlocks.filter((block) => block.type !== 'image' || Boolean(block.imageUrl))
      );
      await saveHomeNotebookBody(blocksToSave, user.nickname);
      setBlocks(blocksToSave);
      setDraftBlocks(blocksToSave);
      setPendingImageBlockId(null);
      setEditing(false);
      toast.success('본문이 저장되었습니다.');
    } catch (error) {
      console.error('홈 본문 저장 실패:', error);
      toast.error(
        isPermissionDeniedError(error)
          ? '저장 권한이 없습니다. 리더 또는 운영진 계정인지 확인해 주세요.'
          : '저장 중 오류가 발생했습니다.'
      );
    } finally {
      setSaving(false);
    }
  };

  const openImagePicker = useCallback(
    (blockId: string) => {
      if (uploading) return;
      setPickingForBlockId(blockId);
      requestAnimationFrame(() => {
        imageInputRef.current?.click();
      });
    },
    [uploading]
  );

  const addBlock = (type: HomeNotebookBlockType) => {
    const blockId = createNotebookBlockId();
    const next: HomeNotebookBlock = {
      id: blockId,
      type,
      text: type === 'heading' || type === 'timeline' ? '' : undefined,
      body: type === 'text' || type === 'timeline' || type === 'image' ? '' : undefined,
      date: type === 'timeline' ? '' : undefined,
      order: draftBlocks.length,
    };
    setDraftBlocks((prev) => [...prev, next]);
    if (type === 'image') {
      setPendingImageBlockId(blockId);
      requestAnimationFrame(() => openImagePicker(blockId));
    }
  };

  const updateBlock = (id: string, patch: Partial<HomeNotebookBlock>) => {
    setDraftBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => {
    if (!window.confirm('이 블록을 삭제할까요?')) return;
    setDraftBlocks((prev) => prev.filter((b) => b.id !== id));
    if (pendingImageBlockId === id) {
      setPendingImageBlockId(null);
    }
  };

  const handleImageUpload = async (blockId: string, file: File) => {
    if (!canEdit) {
      toast.error('사진을 업로드할 권한이 없습니다. (리더·운영진만 가능)');
      return;
    }
    if (!auth.currentUser) {
      toast.error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
      return;
    }
    if (!isImageFile(file)) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    setUploading(true);
    try {
      const storageRef = ref(storage, `homeNotebook/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateBlock(blockId, { imageUrl: url, uploadedAt: Date.now() });
    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      toast.error(
        isPermissionDeniedError(error)
          ? '업로드 권한이 없습니다. 리더 또는 운영진 계정인지 확인해 주세요.'
          : '이미지 업로드에 실패했습니다.'
      );
    } finally {
      setUploading(false);
    }
  };

  const displayBlocks = editing ? draftBlocks : blocks;
  const editBlocks = useMemo(
    () =>
      editing
        ? draftBlocks.filter(
            (block) => block.type !== 'image' || block.id === pendingImageBlockId
          )
        : draftBlocks,
    [draftBlocks, editing, pendingImageBlockId]
  );
  const { imageBlocks, contentBlocks } = useMemo(
    () => splitNotebookBlocks(displayBlocks),
    [displayBlocks]
  );

  const renderViewBlock = (block: HomeNotebookBlock) => {
    switch (block.type) {
      case 'heading':
        return (
          <h3 className="notebook-body__heading">{block.text || '제목 없음'}</h3>
        );
      case 'text':
        return (
          <p className="notebook-body__paragraph">
            {(block.body || '').split('\n').map((line, i, arr) => (
              <React.Fragment key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </React.Fragment>
            ))}
          </p>
        );
      case 'image':
        return null;
      case 'timeline':
        return (
          <div className="notebook-body__timeline-item">
            <div className="notebook-body__timeline-marker" aria-hidden />
            <div className="notebook-body__timeline-content">
              {block.date?.trim() && (
                <time className="notebook-body__timeline-date">{block.date}</time>
              )}
              <strong className="notebook-body__timeline-title">
                {block.text || '활동'}
              </strong>
              {block.body?.trim() && (
                <p className="notebook-body__timeline-desc">{block.body}</p>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const renderEditBlock = (block: HomeNotebookBlock) => (
    <div key={block.id} className="notebook-body__edit-block">
      <div className="notebook-body__edit-block-head">
        <span className="notebook-body__edit-block-type">{BLOCK_LABELS[block.type]}</span>
        <button
          type="button"
          className="notebook-body__edit-remove"
          onClick={() => removeBlock(block.id)}
          aria-label="블록 삭제"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      </div>

      {block.type === 'heading' && (
        <input
          type="text"
          className="notebook-body__input"
          placeholder="소제목"
          value={block.text || ''}
          onChange={(e) => updateBlock(block.id, { text: e.target.value })}
        />
      )}

      {block.type === 'text' && (
        <textarea
          className="notebook-body__textarea"
          placeholder="본문을 입력하세요"
          rows={4}
          value={block.body || ''}
          onChange={(e) => updateBlock(block.id, { body: e.target.value })}
        />
      )}

      {block.type === 'image' && (
        <>
          {block.imageUrl && block.id === pendingImageBlockId ? (
            <div className="notebook-body__photo-frame notebook-body__photo-frame--edit">
              <img src={block.imageUrl} alt="" />
            </div>
          ) : null}
          <button
            type="button"
            className="notebook-body__upload-btn"
            disabled={uploading}
            onClick={() => openImagePicker(block.id)}
          >
            <ImagePlus size={16} aria-hidden />
            {uploading && pickingForBlockId === block.id
              ? '업로드 중…'
              : block.imageUrl && block.id === pendingImageBlockId
                ? '사진 변경'
                : '사진 선택'}
          </button>
          <input
            type="text"
            className="notebook-body__input"
            placeholder="사진 설명 (선택)"
            value={block.body ?? ''}
            onChange={(e) => updateBlock(block.id, { body: e.target.value })}
          />
        </>
      )}

      {block.type === 'timeline' && (
        <>
          <input
            type="text"
            className="notebook-body__input"
            placeholder="날짜 (예: 2025.03)"
            value={block.date || ''}
            onChange={(e) => updateBlock(block.id, { date: e.target.value })}
          />
          <input
            type="text"
            className="notebook-body__input"
            placeholder="활동 제목"
            value={block.text || ''}
            onChange={(e) => updateBlock(block.id, { text: e.target.value })}
          />
          <textarea
            className="notebook-body__textarea"
            placeholder="활동 내용"
            rows={3}
            value={block.body || ''}
            onChange={(e) => updateBlock(block.id, { body: e.target.value })}
          />
        </>
      )}
    </div>
  );

  return (
    <section className="notebook-section notebook-section--body" aria-label="본문">
      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="notebook-body__file-input"
        disabled={uploading}
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pickingForBlockId) void handleImageUpload(pickingForBlockId, file);
          e.target.value = '';
          setPickingForBlockId(null);
        }}
      />
      <div className="notebook-section__header">
        <h2 className="notebook-section__title">
          <span className="notebook-section__numeral">Ⅱ.</span>
          <span>본문</span>
        </h2>
        {canEdit && !editing && (
          <button
            type="button"
            className="notebook-body__edit-toggle"
            onClick={startEditing}
            aria-label="본문 편집"
          >
            <Pencil size={15} aria-hidden />
            <span>편집</span>
          </button>
        )}
        {canEdit && editing && (
          <div className="notebook-body__edit-actions">
            <button
              type="button"
              className="notebook-body__edit-cancel"
              onClick={cancelEditing}
              disabled={saving}
            >
              취소
            </button>
            <button
              type="button"
              className="notebook-body__edit-save"
              onClick={() => void handleSave()}
              disabled={saving || uploading}
            >
              <Check size={15} aria-hidden />
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        )}
      </div>

      <article className="notebook-body-page">
        {loading ? (
          <div className="notebook-body__empty notebook-body__empty--loading">
            <span className="notebook-body__loading-line" />
            <span className="notebook-body__loading-line notebook-body__loading-line--short" />
          </div>
        ) : displayBlocks.length === 0 && !editing ? (
          <div className="notebook-body__empty">
            <p>아직 기록된 활동이 없습니다.</p>
            <p className="notebook-body__empty-sub">베리어스의 오프 활동과 순간들이 이곳에 채워집니다.</p>
          </div>
        ) : (
          <div className="notebook-body__content">
            {editing ? (
              editBlocks.map(renderEditBlock)
            ) : (
              <>
                {imageBlocks.length > 0 && (
                  <HomeNotebookPhotoGallery images={imageBlocks} user={commentUser} />
                )}
                {contentBlocks.map((block) => {
                  const rendered = renderViewBlock(block);
                  if (!rendered) return null;
                  return (
                    <div key={block.id} className="notebook-body__block">
                      {rendered}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {editing && (
          <div className="notebook-body__add-bar">
            <span className="notebook-body__add-label">
              <Plus size={14} aria-hidden />
              추가
            </span>
            <button type="button" onClick={() => addBlock('heading')}>
              <Heading2 size={14} aria-hidden />
              소제목
            </button>
            <button type="button" onClick={() => addBlock('text')}>
              <Type size={14} aria-hidden />
              글
            </button>
            <button type="button" onClick={() => addBlock('image')}>
              <ImagePlus size={14} aria-hidden />
              사진
            </button>
            <button type="button" onClick={() => addBlock('timeline')}>
              <Calendar size={14} aria-hidden />
              활동 이력
            </button>
          </div>
        )}

      </article>
    </section>
  );
};

export default HomeNotebookBody;
