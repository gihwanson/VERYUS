import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from '../firebase';
import { ArrowLeft, UserRound, Save, Loader, X, FileAudio } from 'lucide-react';
import { rejectBoardAttachmentIfTooLarge } from '../utils/boardAttachmentLimits';
import '../styles/FreePostWrite.css';
import '../styles/RecordingPostWrite.css';
import '../styles/NewcomerPostWrite.css';

interface User {
  uid: string;
  email: string;
  nickname?: string;
  grade?: string;
  role?: string;
  position?: string;
  isLoggedIn: boolean;
}

const categories = [{ id: 'intro', name: '자기소개', icon: '👋' }];

const INTRO_TEMPLATE = `1. 좋아하는 장르는?
->
2. 좋아하는 가수는?
->
3. 좋아하는 노래는?
->
4. 하고싶은말
->
`;

const NewcomerPostWrite: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(INTRO_TEMPLATE);
  const [category] = useState('intro');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const [user] = useState<User | null>(() => {
    const userStr = localStorage.getItem('veryus_user');
    return userStr ? JSON.parse(userStr) : null;
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
  const [existingAudioUrl, setExistingAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [displayFileName, setDisplayFileName] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removeExistingAudio, setRemoveExistingAudio] = useState(false);

  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      void (async () => {
        const postDoc = await getDoc(doc(db, 'posts', id));
        if (postDoc.exists()) {
          const data = postDoc.data();
          if (data.type && data.type !== 'newcomer') {
            alert('신입게시판 글이 아닙니다.');
            navigate('/newcomer');
            return;
          }
          setTitle(data.title || '');
          setContent(data.content || INTRO_TEMPLATE);
          if (data.audioUrl) {
            setExistingAudioUrl(data.audioUrl);
            setDisplayFileName(data.fileName || '첨부된 녹음파일');
            setFileName(data.fileName || null);
            setDuration(typeof data.duration === 'number' ? data.duration : 0);
          }
        } else {
          alert('게시글을 찾을 수 없습니다.');
          navigate('/newcomer');
        }
      })();
    }
  }, [id, navigate]);

  const handleBack = () => {
    navigate(isEditMode && id ? `/newcomer/${id}` : '/newcomer');
  };

  const extractDuration = (url: string, tryCount = 0) => {
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (tryCount < 5) {
        setTimeout(() => extractDuration(url, tryCount + 1), 200);
      } else {
        setDuration(0);
      }
    });
  };

  const formatDurationLabel = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (rejectBoardAttachmentIfTooLarge(file, file.name, e.target)) return;

    const audioMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/aac',
      'audio/x-aac',
      'audio/flac',
      'audio/x-flac',
      'audio/ogg',
      'audio/x-ogg',
      'audio/webm',
      'audio/x-ms-wma',
      'audio/caf',
      'audio/amr',
      'audio/x-amr',
      'audio/3gpp',
      'audio/x-3gpp',
    ];
    const videoMimeTypes = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/webm',
      'video/ogg',
      'video/3gpp',
      'video/x-flv',
      'video/x-matroska',
    ];

    const fileType = file.type.toLowerCase();
    const isAudio = audioMimeTypes.some((type) => fileType.includes(type));
    const isVideo = videoMimeTypes.some((type) => fileType.includes(type));
    const lowerName = file.name.toLowerCase();
    const audioExtensions = ['.mp3', '.m4a', '.wav', '.aac', '.caf', '.amr', '.flac', '.ogg', '.wma', '.webm', '.3gp'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm', '.3gp'];
    const hasAudioExt = audioExtensions.some((ext) => lowerName.endsWith(ext));
    const hasVideoExt = videoExtensions.some((ext) => lowerName.endsWith(ext));

    if (isVideo || hasVideoExt) {
      alert('영상 파일은 업로드할 수 없습니다. 오디오 파일만 업로드 가능합니다.');
      e.target.value = '';
      return;
    }

    if (!isAudio && !hasAudioExt) {
      alert('오디오 파일만 업로드 가능합니다. (mp3, m4a, wav, aac, caf, amr, flac, ogg, wma 등)');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setDisplayFileName(null);
    setFileName(null);
    setRemoveExistingAudio(false);
    try {
      const fileRef = storageRef(storage, `newcomer/${user.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(fileRef, file);
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        },
        () => {
          alert('파일 업로드 중 오류가 발생했습니다.');
          setUploading(false);
          setUploadProgress(null);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setPendingAudioUrl(url);
          setFileName(file.name);
          setExistingAudioUrl(null);
          setUploading(false);
          setUploadProgress(null);
          setDisplayFileName(file.name);
          extractDuration(url);
        }
      );
    } catch {
      alert('파일 업로드 중 오류가 발생했습니다.');
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const clearAudio = () => {
    setPendingAudioUrl(null);
    setDisplayFileName(null);
    setFileName(null);
    setDuration(0);
    if (existingAudioUrl || (!pendingAudioUrl && displayFileName)) {
      setRemoveExistingAudio(true);
    }
    setExistingAudioUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }

    try {
      setIsSubmitting(true);

      let audioDownloadUrl = '';
      let savedFileName = '';
      let savedDuration = 0;

      if (pendingAudioUrl) {
        audioDownloadUrl = pendingAudioUrl;
        savedFileName = fileName || '';
        savedDuration = duration;
      } else if (existingAudioUrl && !removeExistingAudio) {
        audioDownloadUrl = existingAudioUrl;
        savedFileName = fileName || '';
        savedDuration = duration;
      }

      let writerGrade = user.grade;
      let writerRole = user.role;
      let writerPosition = user.position;
      if (!writerGrade || !writerRole || !writerPosition) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          writerGrade = userData.grade || writerGrade;
          writerRole = userData.role || writerRole;
          writerPosition = userData.position || writerPosition;
        }
      }

      const audioFields = {
        audioUrl: audioDownloadUrl || null,
        duration: audioDownloadUrl ? savedDuration : 0,
        fileName: audioDownloadUrl ? savedFileName : '',
      };

      if (isEditMode && id) {
        await updateDoc(doc(db, 'posts', id), {
          title,
          content,
          category,
          ...audioFields,
          updatedAt: serverTimestamp(),
        });
        alert('게시글이 수정되었습니다.');
        navigate(`/newcomer/${id}`);
      } else {
        await addDoc(collection(db, 'posts'), {
          title,
          content,
          category,
          type: 'newcomer',
          writerUid: user.uid,
          writerNickname: user.nickname || '익명',
          writerGrade: writerGrade || '🍒',
          writerRole: writerRole || '일반',
          writerPosition: writerPosition || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          views: 0,
          likesCount: 0,
          commentCount: 0,
          likes: [],
          ...audioFields,
        });
        void import('../utils/skinUnlockService').then(({ queueSkinUnlockSync }) => {
          queueSkinUnlockSync({ uid: user.uid, nickname: user.nickname });
        });
        navigate('/newcomer');
      }
    } catch (error) {
      console.error('게시글 작성/수정 중 오류:', error);
      alert('게시글 작성/수정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="board-container free-post-write-page newcomer-post-write-page">
      <div className="free-post-write">
        <header className="free-post-write__top">
          <button type="button" className="free-post-write__back" onClick={handleBack}>
            <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
            {isEditMode ? '글로 돌아가기' : '목록으로'}
          </button>
          <div className="free-post-write__title-wrap">
            <UserRound className="free-post-write__title-icon" size={26} strokeWidth={2} aria-hidden />
            <div>
              <h1 className="free-post-write__title">{isEditMode ? '자기소개 수정' : '신입 자기소개 작성'}</h1>
              <p className="free-post-write__subtitle">
                {isEditMode
                  ? '내용을 고친 뒤 저장하면 게시글이 바로 반영됩니다.'
                  : '양식에 맞춰 자기소개를 작성해 주세요. 녹음파일은 선택 사항입니다.'}
              </p>
            </div>
          </div>
        </header>

        <main className="write-form free-post-write__form">
          <form onSubmit={handleSubmit}>
            <section className="free-post-write__section" aria-labelledby="newcomer-cat-label">
              <span id="newcomer-cat-label" className="free-post-write__section-label">
                카테고리
              </span>
              <div className="free-post-write__category-grid" role="listbox" aria-label="게시글 카테고리">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="option"
                    aria-selected={category === cat.id}
                    className="free-post-write__category-btn free-post-write__category-btn--active"
                  >
                    <span className="free-post-write__category-emoji" aria-hidden>
                      {cat.icon}
                    </span>
                    {cat.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="free-post-write__section">
              <label htmlFor="newcomer-post-title" className="free-post-write__section-label">
                제목
              </label>
              <input
                id="newcomer-post-title"
                type="text"
                className="title-input free-post-write__title-input"
                placeholder="예: 안녕하세요, 신입 OOO입니다!"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                autoComplete="off"
              />
            </section>

            <section className="free-post-write__section">
              <label htmlFor="newcomer-post-content" className="free-post-write__section-label">
                내용
              </label>
              <textarea
                id="newcomer-post-content"
                className="content-textarea free-post-write__textarea newcomer-post-write__textarea"
                placeholder="자기소개 양식에 맞춰 작성해 주세요"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={9}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(Math.max(target.scrollHeight, 150), 260) + 'px';
                }}
              />
            </section>

            <section className="free-post-write__section rec-post-write__section">
              <span className="free-post-write__section-label">녹음파일</span>
              <p className="free-post-write__hint" style={{ color: '#b45309', fontWeight: 600 }}>
                *녹음파일 업로드 필수 아님
              </p>
              <label className={`rec-post-write__upload${uploading ? ' rec-post-write__upload--busy' : ''}`}>
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.amr,.flac,.ogg,.wma"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  disabled={uploading || isSubmitting}
                />
                <div className="rec-post-write__upload-inner">
                  <FileAudio className="rec-post-write__upload-icon" size={36} strokeWidth={1.5} aria-hidden />
                  <strong>탭하여 녹음파일 선택</strong>
                  <span>MP3 · M4A · WAV 등 · 최대 20MB (영상 파일은 업로드할 수 없습니다)</span>
                </div>
              </label>

              {(displayFileName || (uploading && uploadProgress !== null)) && (
                <div className="rec-post-write__file-status">
                  {displayFileName && <div className="rec-post-write__file-name">{displayFileName}</div>}
                  {duration > 0 && displayFileName && !uploading && (
                    <div className="rec-post-write__file-meta">재생 길이 약 {formatDurationLabel(duration)}</div>
                  )}
                  {uploading && uploadProgress !== null && (
                    <div
                      className="rec-post-write__progress-track"
                      role="progressbar"
                      aria-valuenow={Math.round(uploadProgress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="rec-post-write__progress-fill" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                  {uploading && <span className="rec-post-write__uploading-label">업로드 중…</span>}
                  {!uploading && displayFileName && (
                    <button
                      type="button"
                      className="free-post-write__mini-btn free-post-write__mini-btn--remove"
                      style={{ marginTop: '0.75rem' }}
                      onClick={clearAudio}
                    >
                      파일 제거
                    </button>
                  )}
                </div>
              )}
            </section>

            <div className="free-post-write__actions">
              <button type="submit" className="submit-button free-post-write__submit" disabled={isSubmitting || uploading}>
                {isSubmitting ? (
                  <>
                    <Loader className="loading-spinner" size={18} aria-hidden />
                    저장 중…
                  </>
                ) : (
                  <>
                    <Save size={18} aria-hidden />
                    {isEditMode ? '수정 완료' : '등록하기'}
                  </>
                )}
              </button>
              <button type="button" className="cancel-button free-post-write__cancel" onClick={handleBack} disabled={isSubmitting}>
                <X size={18} aria-hidden />
                취소
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
};

export default NewcomerPostWrite;
