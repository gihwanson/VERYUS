import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp, getDoc, doc as firestoreDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ArrowLeft, Users, X, FileAudio, Send, Mic, Square, CheckCircle2 } from 'lucide-react';
import {
  startChorusRecording,
  extractAudioDuration,
  formatAudioDuration,
  validateAudioFile,
  type ChorusRecorderHandle,
} from '../utils/chorusAudioRecorder';
import { uploadChorusAudio, recordingBlobFileName, waitForFirebaseAuth, formatUploadError } from '../utils/chorusAudioUpload';
import { toast } from 'react-toastify';
import '../styles/ChorusPostWrite.css';

interface User {
  uid: string;
  email: string;
  nickname: string;
  grade?: string;
  role?: string;
  position?: string;
}

const MAX_RECORD_SECONDS = 180;

const ChorusPostWrite: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitPhase, setSubmitPhase] = useState<'idle' | 'upload' | 'save'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<ChorusRecorderHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const userString = localStorage.getItem('veryus_user');
    if (!userString) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userString));
  }, [navigate]);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  };

  const clearPreview = useCallback(() => {
    revokePreviewUrl();
    setAudioPreviewUrl(null);
    setAudioBlob(null);
    setDuration(0);
    setFileName(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.cancel();
      revokePreviewUrl();
    };
  }, []);

  const applyBlobPreview = async (blob: Blob, name: string) => {
    revokePreviewUrl();
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setAudioBlob(blob);
    setAudioPreviewUrl(url);
    setFileName(name);
    const dur = await extractAudioDuration(url);
    setDuration(dur);
  };

  const stopRecordingAndGetBlob = async (): Promise<Blob | null> => {
    if (!recorderRef.current) return null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecording(false);
    try {
      const blob = await recorderRef.current.stop();
      recorderRef.current = null;
      if (!blob || blob.size === 0) {
        alert('녹음된 내용이 없습니다. 조금 더 길게 녹음해 주세요.');
        return null;
      }
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
      await applyBlobPreview(blob, recordingBlobFileName(ext));
      return blob;
    } catch {
      alert('녹음 저장에 실패했습니다.');
      return null;
    }
  };

  const handleStartRecording = async () => {
    try {
      clearPreview();
      const handle = await startChorusRecording();
      recorderRef.current = handle;
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s + 1 >= MAX_RECORD_SECONDS) {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
            void stopRecordingAndGetBlob();
            return MAX_RECORD_SECONDS;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      alert('마이크 권한이 필요합니다.\n브라우저 주소창 옆 🔒 아이콘에서 마이크를 허용해 주세요.');
    }
  };

  const handleStopRecording = async () => {
    await stopRecordingAndGetBlob();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateAudioFile(file);
    if (err) {
      alert(err);
      e.target.value = '';
      return;
    }
    await applyBlobPreview(file, file.name);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (loading) return;
    setSubmitError(null);

    if (!title.trim()) {
      const msg = '곡 제목을 입력해 주세요.';
      setSubmitError(msg);
      toast.warn(msg);
      return;
    }

    let blob = audioBlob;
    if (recording) {
      const recorded = await stopRecordingAndGetBlob();
      if (recorded) blob = recorded;
    }

    if (!blob || blob.size === 0) {
      const msg =
        '녹음된 오디오가 없습니다.\n「탭해서 녹음」으로 녹음을 시작한 뒤, 「녹음 끝내기」버튼을 눌러 주세요.';
      setSubmitError(msg);
      toast.warn(msg);
      return;
    }

    let uid: string;
    try {
      uid = await waitForFirebaseAuth();
    } catch {
      const msg = '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.';
      setSubmitError(msg);
      toast.error(msg);
      navigate('/login');
      return;
    }

    if (!user || user.uid !== uid) {
      const msg = '로그인 정보가 일치하지 않습니다. 다시 로그인해 주세요.';
      setSubmitError(msg);
      toast.error(msg);
      navigate('/login');
      return;
    }

    try {
      setLoading(true);
      setSubmitPhase('upload');
      setUploadProgress(0);

      let audioDownloadUrl = '';
      if (blob instanceof File) {
        audioDownloadUrl = await uploadChorusAudio(uid, blob, blob.name, setUploadProgress);
      } else {
        const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
        const name = fileName || recordingBlobFileName(ext);
        audioDownloadUrl = await uploadChorusAudio(uid, blob, name, setUploadProgress);
      }

      setSubmitPhase('save');
      setUploadProgress(100);

      let writerGrade = user.grade;
      let writerRole = user.role;
      let writerPosition = user.position;
      if (!writerGrade || !writerRole || !writerPosition) {
        const userDoc = await getDoc(firestoreDoc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          writerGrade = userData.grade || writerGrade;
          writerRole = userData.role || writerRole;
          writerPosition = userData.position || writerPosition;
        }
      }

      const finalDuration = duration > 0 ? duration : 1;

      await addDoc(collection(db, 'posts'), {
        type: 'chorus',
        title: title.trim(),
        description,
        writerUid: uid,
        writerNickname: user.nickname,
        writerGrade: writerGrade || '🍒',
        writerRole: writerRole || '일반',
        writerPosition: writerPosition || '',
        createdAt: serverTimestamp(),
        audioUrl: audioDownloadUrl,
        duration: finalDuration,
        fileName: fileName || '',
        likesCount: 0,
        commentCount: 0,
        views: 0,
        likes: [],
      });
      toast.success('1소절이 올라갔어요! 다음 사람이 이어서 불러 줄 거예요 🎤');
      navigate('/chorus');
    } catch (error) {
      console.error('합창 업로드 오류:', error);
      const msg = formatUploadError(error);
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setSubmitPhase('idle');
      setUploadProgress(null);
    }
  };

  const step = !title.trim() ? 1 : !audioBlob && !recording ? 2 : 3;
  const canSubmit = Boolean(title.trim() && (audioBlob || recording));

  return (
    <div className="board-container chorus-post-write-page">
      <div className="chorus-post-write">
        <header className="chorus-post-write__top">
          <button type="button" className="chorus-post-write__back" onClick={() => navigate('/chorus')}>
            <ArrowLeft size={20} strokeWidth={2.25} aria-hidden />
            목록으로
          </button>
          <div className="chorus-post-write__title-wrap">
            <Users className="chorus-post-write__title-icon" size={26} strokeWidth={2} aria-hidden />
            <div>
              <h1 className="chorus-post-write__title">첫 소절 올리기</h1>
              <p className="chorus-post-write__subtitle">
                노래의 첫 소절을 녹음해 주세요. 다음 사람이 이어서 불러요.
              </p>
            </div>
          </div>
        </header>

        <div className="chorus-post-write__steps">
          <span className={step >= 1 ? 'active' : ''}>① 제목</span>
          <span className={step >= 2 ? 'active' : ''}>② 1소절 녹음</span>
          <span className={step >= 3 ? 'active' : ''}>③ 올리기</span>
        </div>

        <main className="write-form chorus-post-write__form">
          <section className="chorus-post-write__section">
            <label htmlFor="chorus-post-title" className="chorus-post-write__section-label">
              ① 곡 제목
            </label>
            <input
              id="chorus-post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 아이유 - 밤편지"
              className="title-input chorus-post-write__title-input"
              autoComplete="off"
            />
          </section>

          <section className="chorus-post-write__section">
            <span className="chorus-post-write__section-label">② 1소절 녹음</span>
            <p className="chorus-post-write__section-hint">
              녹음을 시작한 뒤, 끝날 때 <strong>「녹음 중」버튼을 한 번 더</strong> 눌러 주세요.
            </p>

            <div className="chorus-post-write__audio-actions">
              {!recording ? (
                <button type="button" className="chorus-post-write__rec-btn chorus-post-write__rec-btn--big" onClick={handleStartRecording}>
                  <Mic size={28} />
                  <span>탭해서 녹음</span>
                </button>
              ) : (
                <button type="button" className="chorus-post-write__rec-btn chorus-post-write__rec-btn--big chorus-post-write__rec-btn--active" onClick={handleStopRecording}>
                  <span className="chorus-post-write__rec-pulse" />
                  <Square size={22} />
                  <span>녹음 끝내기 ({formatAudioDuration(recordingSeconds)})</span>
                </button>
              )}
              <label className="chorus-post-write__upload">
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac,.caf,.amr,.flac,.ogg,.wma"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  disabled={recording}
                />
                <FileAudio size={18} />
                파일로 올리기
              </label>
            </div>

            {audioPreviewUrl && (
              <div className="chorus-post-write__preview">
                <CheckCircle2 size={20} className="chorus-post-write__preview-check" />
                <div>
                  <strong>녹음 완료!</strong>
                  <audio src={audioPreviewUrl} controls preload="metadata" />
                  {duration > 0 && <span className="chorus-post-write__file-meta">{formatAudioDuration(duration)}</span>}
                </div>
                <button type="button" onClick={clearPreview} className="chorus-post-write__clear">다시 녹음</button>
              </div>
            )}
          </section>

          <section className="chorus-post-write__section">
            <label htmlFor="chorus-post-desc" className="chorus-post-write__section-label">
              안내 메모 <span className="chorus-post-write__optional">(선택)</span>
            </label>
            <textarea
              id="chorus-post-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="예: 1절만 불렀어요 / 템포 느리게 맞춰 주세요"
              className="content-textarea chorus-post-write__textarea"
              rows={3}
            />
          </section>

          {uploadProgress !== null && (
            <div className="chorus-post-write__progress-wrap">
              <div className="chorus-post-write__progress-bar" style={{ width: `${uploadProgress}%` }} />
              <span>
                {submitPhase === 'save' ? '게시글 등록 중…' : `오디오 업로드 중… ${Math.round(uploadProgress)}%`}
              </span>
            </div>
          )}

          {submitError && (
            <div className="chorus-post-write__error" role="alert">
              {submitError}
            </div>
          )}

          <div className="chorus-post-write__actions">
            <button
              type="button"
              className={`submit-button chorus-post-write__submit${canSubmit ? '' : ' chorus-post-write__submit--muted'}`}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading
                ? (submitPhase === 'save' ? '등록 중…' : '업로드 중…')
                : (<><Send size={18} aria-hidden />1소절 올리기</>)}
            </button>
            <button type="button" className="cancel-button chorus-post-write__cancel" onClick={() => navigate('/chorus')} disabled={loading}>
              <X size={18} aria-hidden />
              취소
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ChorusPostWrite;
