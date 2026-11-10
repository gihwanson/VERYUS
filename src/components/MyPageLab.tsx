import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, FlaskConical, Home, Palette, Shield, Smile, User } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../firebase';
import { useUserProfile } from '../contexts/UserProfileContext';
import { checkAdminAccess } from './AdminTypes';
import {
  getMiniHomeBackground,
  getMiniHomeCharacterFrame,
  getMiniHomeCharacterPose,
  getMiniHomeCharacterSize,
  getMiniHomeCharacterSlot,
  MINI_HOME_BACKGROUNDS,
  MINI_HOME_CHARACTER_FRAMES,
  MINI_HOME_CHARACTER_POSES,
  MINI_HOME_CHARACTER_SIZES,
  MINI_HOME_CHARACTER_SLOTS,
  saveMiniHomeLab,
  subscribeMiniHomeLab,
  type MiniHomeBackgroundId,
  type MiniHomeCharacterFrame,
  type MiniHomeCharacterPose,
  type MiniHomeCharacterSize,
  type MiniHomeCharacterSlot,
  type MiniHomeLabState,
} from '../utils/miniHomeLab';
import './MyPageLab.css';

type PreviewUser = {
  uid: string;
  nickname: string;
  profileImageUrl?: string;
  grade?: string;
  role?: string;
};

type LabFeatureStatus = '준비 중' | '1단계 완료' | '2단계 완료' | '미정';

const MyPageLab: React.FC = () => {
  const navigate = useNavigate();
  const { uid: routeUid } = useParams<{ uid?: string }>();
  const { profile } = useUserProfile();
  const [previewUser, setPreviewUser] = useState<PreviewUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [labState, setLabState] = useState<MiniHomeLabState | null>(null);
  const [draftBg, setDraftBg] = useState<MiniHomeBackgroundId>('peach');
  const [draftTagline, setDraftTagline] = useState('');
  const [draftSlot, setDraftSlot] = useState<MiniHomeCharacterSlot>('center');
  const [draftPose, setDraftPose] = useState<MiniHomeCharacterPose>('neutral');
  const [draftSize, setDraftSize] = useState<MiniHomeCharacterSize>('m');
  const [draftFrame, setDraftFrame] = useState<MiniHomeCharacterFrame>('circle');
  const [saving, setSaving] = useState(false);

  const targetUid = routeUid?.trim() || (profile?.uid ? String(profile.uid) : '');
  const isAdmin = checkAdminAccess({
    nickname: profile?.nickname as string | undefined,
    role: profile?.role as string | undefined,
  });

  const labFeatures = useMemo(
    (): Array<{ id: string; label: string; status: LabFeatureStatus }> => [
      {
        id: 'stage',
        label: '미니룸·배경',
        status: labState?.backgroundId ? '1단계 완료' : '준비 중',
      },
      {
        id: 'avatar',
        label: '캐릭터 레이어',
        status: labState?.hasCharacterLayer ? '2단계 완료' : '준비 중',
      },
      { id: 'guestbook', label: '방명록 연동', status: '준비 중' },
      { id: 'publish', label: '일반 마이페이지 공개', status: '미정' },
    ],
    [labState?.backgroundId, labState?.hasCharacterLayer]
  );

  useEffect(() => {
    if (!targetUid) {
      setPreviewUser(null);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    void getDoc(doc(db, 'users', targetUid)).then((snap) => {
      if (cancelled) return;
      if (!snap.exists()) {
        setPreviewUser(null);
        setLoadError('회원 정보를 찾을 수 없습니다.');
        return;
      }
      const data = snap.data();
      setPreviewUser({
        uid: snap.id,
        nickname: String(data.nickname ?? '이름 없음'),
        profileImageUrl: data.profileImageUrl as string | undefined,
        grade: data.grade as string | undefined,
        role: data.role as string | undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [targetUid]);

  useEffect(() => {
    if (!targetUid || !isAdmin) {
      setLabState(null);
      return;
    }
    return subscribeMiniHomeLab(targetUid, (next) => {
      setLabState(next);
      const bg = next?.backgroundId ?? 'peach';
      setDraftBg(bg);
      setDraftTagline(next?.tagline ?? '');
      setDraftSlot(next?.characterSlot ?? 'center');
      setDraftPose(next?.characterPose ?? 'neutral');
      setDraftSize(next?.characterSize ?? 'm');
      setDraftFrame(next?.characterFrame ?? 'circle');
    });
  }, [targetUid, isAdmin]);

  const activeBg = getMiniHomeBackground(labState?.backgroundId ?? draftBg);
  const previewBg = getMiniHomeBackground(draftBg);
  const previewSlot = getMiniHomeCharacterSlot(draftSlot);
  const previewPose = getMiniHomeCharacterPose(draftPose);
  const previewSize = getMiniHomeCharacterSize(draftSize);
  const previewFrame = getMiniHomeCharacterFrame(draftFrame);
  const displayTagline = draftTagline.trim() || labState?.tagline || '한 줄 소개가 여기에 표시됩니다.';

  const isSelf = profile?.uid && previewUser?.uid === String(profile.uid);
  const canEdit = Boolean(isAdmin && targetUid);

  const persistLab = async () => {
    if (!canEdit || !targetUid || !profile?.uid) return;
    setSaving(true);
    try {
      await saveMiniHomeLab(
        targetUid,
        {
          backgroundId: draftBg,
          tagline: draftTagline,
          characterSlot: draftSlot,
          characterPose: draftPose,
          characterSize: draftSize,
          characterFrame: draftFrame,
        },
        String(profile.uid)
      );
      toast.success('미니룸 꾸미기를 저장했습니다.');
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mypage-lab">
      <header className="mypage-lab__header">
        <button type="button" className="mypage-lab__back" onClick={() => navigate('/admin')}>
          <ArrowLeft size={18} aria-hidden />
          관리자 패널
        </button>
        <span className="mypage-lab__badge">
          <Shield size={14} aria-hidden />
          관리자 전용 · 미니홈 실험실
        </span>
        <h1 className="mypage-lab__title">싸이월드형 마이페이지 (프리뷰)</h1>
        <p className="mypage-lab__lead">
          <strong>1단계 배경</strong>과 <strong>2단계 캐릭터</strong>를 실험실에서 꾸밀 수 있습니다.
          일반 회원에게는 노출되지 않습니다.
        </p>
      </header>

      {loadError ? <p className="mypage-lab__error">{loadError}</p> : null}

      <section className="mypage-lab__stage-wrap" aria-label="미니홈 미리보기">
        <div className="mypage-lab__stage">
          <p className="mypage-lab__stage-label">
            미니룸 · {previewBg.name}
            {labState?.backgroundId && labState.backgroundId !== draftBg ? ' (미저장 미리보기)' : ''}
          </p>
          <div className={`mypage-lab__room ${previewBg.roomClass}`}>
            <div
              className={`mypage-lab__room-inner ${previewSlot.roomClass} ${previewSize.roomClass} ${previewPose.roomClass}`}
            >
              <div
                className={`mypage-lab__char-layer ${previewSlot.roomClass} ${previewSize.roomClass} ${previewFrame.roomClass}`}
              >
                <span className="mypage-lab__pose-bubble" aria-hidden>
                  {previewPose.emoji}
                </span>
                <div className="mypage-lab__avatar">
                  {previewUser?.profileImageUrl ? (
                    <img src={previewUser.profileImageUrl} alt="" decoding="async" />
                  ) : (
                    <User size={48} strokeWidth={1.5} aria-hidden />
                  )}
                </div>
              </div>
              <div className="mypage-lab__hud">
                <p className="mypage-lab__nickname">{previewUser?.nickname ?? '…'}</p>
                {previewUser?.grade ? <p className="mypage-lab__meta">{previewUser.grade}</p> : null}
                <p className="mypage-lab__tagline">{displayTagline}</p>
              </div>
            </div>
          </div>
          {labState ? (
            <p className="mypage-lab__saved-hint">
              저장된 배경: {activeBg.name}
              {labState.tagline ? ` · “${labState.tagline}”` : ''}
            </p>
          ) : (
            <p className="mypage-lab__saved-hint">아직 저장된 꾸미기가 없습니다. 아래에서 선택 후 저장하세요.</p>
          )}
        </div>

        <aside className="mypage-lab__side">
          <h2 className="mypage-lab__side-title">
            <FlaskConical size={18} aria-hidden />
            진행 체크
          </h2>
          <ul className="mypage-lab__checklist">
            {labFeatures.map((f) => (
              <li key={f.id}>
                <span>{f.label}</span>
                <span
                  className={`mypage-lab__chip${
                    f.status === '1단계 완료' || f.status === '2단계 완료'
                      ? ' mypage-lab__chip--done'
                      : ''
                  }`}
                >
                  {f.status}
                </span>
              </li>
            ))}
          </ul>
          <p className="mypage-lab__uid-hint">
            대상 UID: <code>{targetUid || '—'}</code>
            {isSelf ? ' (본인)' : routeUid ? ' (타 회원 미리보기)' : ''}
          </p>
        </aside>
      </section>

      {canEdit ? (
        <section className="mypage-lab__editor" aria-label="1단계 꾸미기">
          <h2 className="mypage-lab__editor-title">
            <Palette size={18} aria-hidden />
            1단계 · 미니룸 배경
          </h2>
          <label className="mypage-lab__field-label" htmlFor="mhl-tagline">
            한 줄 소개 (실험용)
          </label>
          <input
            id="mhl-tagline"
            className="mypage-lab__field"
            maxLength={80}
            placeholder="다양한 음악을 우리답게"
            value={draftTagline}
            onChange={(e) => setDraftTagline(e.target.value)}
          />
          <p className="mypage-lab__field-hint">{draftTagline.length}/80</p>

          <p className="mypage-lab__field-label">배경 테마</p>
          <div className="mypage-lab__bg-grid">
            {MINI_HOME_BACKGROUNDS.map((bg) => {
              const selected = draftBg === bg.id;
              return (
                <button
                  key={bg.id}
                  type="button"
                  className={`mypage-lab__bg-card${selected ? ' mypage-lab__bg-card--active' : ''}`}
                  onClick={() => setDraftBg(bg.id)}
                  aria-pressed={selected}
                >
                  <span className={`mypage-lab__bg-swatch ${bg.roomClass}`} aria-hidden />
                  <span className="mypage-lab__bg-name">{bg.name}</span>
                  <span className="mypage-lab__bg-desc">{bg.description}</span>
                  {selected ? <Check className="mypage-lab__bg-check" size={16} aria-hidden /> : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="mypage-lab__btn mypage-lab__btn--primary mypage-lab__save"
            disabled={saving}
            onClick={() => void persistLab()}
          >
            {saving ? '저장 중…' : '1단계 저장'}
          </button>
        </section>
      ) : null}

      {canEdit ? (
        <section className="mypage-lab__editor" aria-label="2단계 캐릭터">
          <h2 className="mypage-lab__editor-title">
            <Smile size={18} aria-hidden />
            2단계 · 캐릭터 레이어
          </h2>
          <p className="mypage-lab__field-label">미니룸 안 위치</p>
          <div className="mypage-lab__option-row">
            {MINI_HOME_CHARACTER_SLOTS.map((slot) => {
              const selected = draftSlot === slot.id;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`mypage-lab__option-pill${selected ? ' mypage-lab__option-pill--active' : ''}`}
                  onClick={() => setDraftSlot(slot.id)}
                  aria-pressed={selected}
                >
                  {slot.name}
                </button>
              );
            })}
          </div>

          <p className="mypage-lab__field-label">포즈 (말풍선)</p>
          <div className="mypage-lab__option-row">
            {MINI_HOME_CHARACTER_POSES.map((pose) => {
              const selected = draftPose === pose.id;
              return (
                <button
                  key={pose.id}
                  type="button"
                  className={`mypage-lab__option-pill${selected ? ' mypage-lab__option-pill--active' : ''}`}
                  onClick={() => setDraftPose(pose.id)}
                  aria-pressed={selected}
                >
                  <span aria-hidden>{pose.emoji}</span> {pose.name}
                </button>
              );
            })}
          </div>

          <p className="mypage-lab__field-label">크기</p>
          <div className="mypage-lab__option-row">
            {MINI_HOME_CHARACTER_SIZES.map((size) => {
              const selected = draftSize === size.id;
              return (
                <button
                  key={size.id}
                  type="button"
                  className={`mypage-lab__option-pill${selected ? ' mypage-lab__option-pill--active' : ''}`}
                  onClick={() => setDraftSize(size.id)}
                  aria-pressed={selected}
                >
                  {size.name}
                </button>
              );
            })}
          </div>

          <p className="mypage-lab__field-label">프레임</p>
          <div className="mypage-lab__option-row">
            {MINI_HOME_CHARACTER_FRAMES.map((frame) => {
              const selected = draftFrame === frame.id;
              return (
                <button
                  key={frame.id}
                  type="button"
                  className={`mypage-lab__option-pill${selected ? ' mypage-lab__option-pill--active' : ''}`}
                  onClick={() => setDraftFrame(frame.id)}
                  aria-pressed={selected}
                >
                  {frame.name}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="mypage-lab__btn mypage-lab__btn--primary mypage-lab__save"
            disabled={saving}
            onClick={() => void persistLab()}
          >
            {saving ? '저장 중…' : '미니룸·캐릭터 전체 저장'}
          </button>
        </section>
      ) : null}

      <nav className="mypage-lab__actions" aria-label="바로가기">
        <Link to="/mypage" className="mypage-lab__btn mypage-lab__btn--secondary">
          <Home size={16} aria-hidden />
          현재 공식 마이페이지
        </Link>
        {previewUser?.uid ? (
          <Link
            to={`/mypage/${previewUser.uid}`}
            className="mypage-lab__btn mypage-lab__btn--secondary"
          >
            공식 마이페이지 (이 UID)
          </Link>
        ) : null}
        <Link to="/mypage-lab" className="mypage-lab__btn mypage-lab__btn--secondary">
          내 실험실
        </Link>
      </nav>
    </div>
  );
};

export default MyPageLab;
