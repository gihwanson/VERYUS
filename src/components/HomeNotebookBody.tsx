import React, { useCallback, useEffect, useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'react-toastify';
import { Pencil, Check, Plus, Trash2, ImagePlus, Type, Heading2, Calendar } from 'lucide-react';
import { storage } from '../firebase';
import { canEditHomeNotebookBody } from './AdminTypes';
import {
  createNotebookBlockId,
  fetchHomeNotebookBody,
  saveHomeNotebookBody,
  sortNotebookBlocks,
  type HomeNotebookBlock,
  type HomeNotebookBlockType,
} from '../utils/homeNotebookBody';
import '../styles/warm-paper-home-notebook.css';

interface HomeNotebookBodyProps {
  user: {
    nickname?: string;
    role?: string;
  } | null;
}

const BLOCK_LABELS: Record<HomeNotebookBlockType, string> = {
  heading: '소제목',
  text: '글',
  image: '사진',
  timeline: '활동 이력',
};

const HomeNotebookBody: React.FC<HomeNotebookBodyProps> = ({ user }) => {
  const canEdit = canEditHomeNotebookBody(user);
  const [blocks, setBlocks] = useState<HomeNotebookBlock[]>([]);
  const [draftBlocks, setDraftBlocks] = useState<HomeNotebookBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraftBlocks(blocks);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user?.nickname) return;
    setSaving(true);
    try {
      await saveHomeNotebookBody(draftBlocks, user.nickname);
      const saved = sortNotebookBlocks(draftBlocks);
      setBlocks(saved);
      setDraftBlocks(saved);
      setEditing(false);
      toast.success('본문이 저장되었습니다.');
    } catch (error) {
      console.error('홈 본문 저장 실패:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const addBlock = (type: HomeNotebookBlockType) => {
    const next: HomeNotebookBlock = {
      id: createNotebookBlockId(),
      type,
      text: type === 'heading' || type === 'timeline' ? '' : undefined,
      body: type === 'text' || type === 'timeline' ? '' : undefined,
      date: type === 'timeline' ? '' : undefined,
      order: draftBlocks.length,
    };
    setDraftBlocks((prev) => [...prev, next]);
  };

  const updateBlock = (id: string, patch: Partial<HomeNotebookBlock>) => {
    setDraftBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const removeBlock = (id: string) => {
    if (!window.confirm('이 블록을 삭제할까요?')) return;
    setDraftBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleImageUpload = async (blockId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드할 수 있습니다.');
      return;
    }
    setUploading(true);
    try {
      const storageRef = ref(storage, `homeNotebook/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateBlock(blockId, { imageUrl: url });
    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      toast.error('이미지 업로드에 실패했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const displayBlocks = editing ? draftBlocks : blocks;

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
        return block.imageUrl ? (
          <figure className="notebook-body__figure">
            <div className="notebook-body__photo-frame">
              <img src={block.imageUrl} alt={block.body || '베리어스 활동 사진'} loading="lazy" />
            </div>
            {block.body?.trim() && (
              <figcaption className="notebook-body__caption">{block.body}</figcaption>
            )}
          </figure>
        ) : null;
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
          {block.imageUrl ? (
            <div className="notebook-body__photo-frame notebook-body__photo-frame--edit">
              <img src={block.imageUrl} alt="" />
            </div>
          ) : (
            <label className="notebook-body__upload-btn">
              <ImagePlus size={16} aria-hidden />
              {uploading ? '업로드 중…' : '사진 선택'}
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(block.id, file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <input
            type="text"
            className="notebook-body__input"
            placeholder="사진 설명 (선택)"
            value={block.body || ''}
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
            {editing
              ? displayBlocks.map(renderEditBlock)
              : displayBlocks.map((block) => (
                  <div key={block.id} className="notebook-body__block">
                    {renderViewBlock(block)}
                  </div>
                ))}
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
