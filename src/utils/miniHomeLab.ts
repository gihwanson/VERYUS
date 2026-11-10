import { doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';

export const MINI_HOME_LAB_DOC_ID = 'main';

export type MiniHomeBackgroundId =
  | 'peach'
  | 'mint'
  | 'lavender'
  | 'midnight'
  | 'paper'
  | 'vinyl';

export type MiniHomeBackgroundOption = {
  id: MiniHomeBackgroundId;
  name: string;
  description: string;
  roomClass: string;
};

export const MINI_HOME_BACKGROUNDS: MiniHomeBackgroundOption[] = [
  {
    id: 'peach',
    name: '피치 룸',
    description: '싸이월드 감성의 따뜻한 노랑·살구',
    roomClass: 'mhl-room--peach',
  },
  {
    id: 'mint',
    name: '민트 카페',
    description: '연한 민트·창가 느낌',
    roomClass: 'mhl-room--mint',
  },
  {
    id: 'lavender',
    name: '라벤더',
    description: '보라 파스텔 · 현재 VERYUS 톤',
    roomClass: 'mhl-room--lavender',
  },
  {
    id: 'midnight',
    name: '미드나잇',
    description: '다크 공연장 무드',
    roomClass: 'mhl-room--midnight',
  },
  {
    id: 'paper',
    name: '크림 페이퍼',
    description: '웜페이퍼·노트북 UI',
    roomClass: 'mhl-room--paper',
  },
  {
    id: 'vinyl',
    name: '레트로 바이닐',
    description: '버건디·레코드샵',
    roomClass: 'mhl-room--vinyl',
  },
];

const BG_IDS = new Set(MINI_HOME_BACKGROUNDS.map((b) => b.id));

export function getMiniHomeBackground(id: string | undefined | null): MiniHomeBackgroundOption {
  const found = MINI_HOME_BACKGROUNDS.find((b) => b.id === id);
  return found ?? MINI_HOME_BACKGROUNDS[0];
}

export type MiniHomeCharacterSlot = 'center' | 'left' | 'right';

export type MiniHomeCharacterPose = 'neutral' | 'wave' | 'music';

export type MiniHomeCharacterSize = 's' | 'm' | 'l';

export type MiniHomeCharacterFrame = 'circle' | 'polaroid' | 'ribbon';

export type MiniHomeCharacterPoseOption = {
  id: MiniHomeCharacterPose;
  name: string;
  emoji: string;
  roomClass: string;
};

export const MINI_HOME_CHARACTER_POSES: MiniHomeCharacterPoseOption[] = [
  { id: 'neutral', name: '기본', emoji: '✨', roomClass: 'mhl-pose--neutral' },
  { id: 'wave', name: '인사', emoji: '👋', roomClass: 'mhl-pose--wave' },
  { id: 'music', name: '연주', emoji: '🎵', roomClass: 'mhl-pose--music' },
];

export type MiniHomeCharacterSlotOption = {
  id: MiniHomeCharacterSlot;
  name: string;
  roomClass: string;
};

export const MINI_HOME_CHARACTER_SLOTS: MiniHomeCharacterSlotOption[] = [
  { id: 'center', name: '가운데', roomClass: 'mhl-char-slot--center' },
  { id: 'left', name: '왼쪽', roomClass: 'mhl-char-slot--left' },
  { id: 'right', name: '오른쪽', roomClass: 'mhl-char-slot--right' },
];

export type MiniHomeCharacterSizeOption = {
  id: MiniHomeCharacterSize;
  name: string;
  roomClass: string;
};

export const MINI_HOME_CHARACTER_SIZES: MiniHomeCharacterSizeOption[] = [
  { id: 's', name: '작게', roomClass: 'mhl-char-size--s' },
  { id: 'm', name: '보통', roomClass: 'mhl-char-size--m' },
  { id: 'l', name: '크게', roomClass: 'mhl-char-size--l' },
];

export type MiniHomeCharacterFrameOption = {
  id: MiniHomeCharacterFrame;
  name: string;
  roomClass: string;
};

export const MINI_HOME_CHARACTER_FRAMES: MiniHomeCharacterFrameOption[] = [
  { id: 'circle', name: '동그라미', roomClass: 'mhl-char-frame--circle' },
  { id: 'polaroid', name: '폴라로이드', roomClass: 'mhl-char-frame--polaroid' },
  { id: 'ribbon', name: '리본', roomClass: 'mhl-char-frame--ribbon' },
];

const SLOT_IDS = new Set(MINI_HOME_CHARACTER_SLOTS.map((s) => s.id));
const POSE_IDS = new Set(MINI_HOME_CHARACTER_POSES.map((p) => p.id));
const SIZE_IDS = new Set(MINI_HOME_CHARACTER_SIZES.map((s) => s.id));
const FRAME_IDS = new Set(MINI_HOME_CHARACTER_FRAMES.map((f) => f.id));

export type MiniHomeLabState = {
  backgroundId: MiniHomeBackgroundId;
  tagline: string;
  characterSlot: MiniHomeCharacterSlot;
  characterPose: MiniHomeCharacterPose;
  characterSize: MiniHomeCharacterSize;
  characterFrame: MiniHomeCharacterFrame;
  /** Firestore에 캐릭터 필드가 저장된 경우만 true (1단계만 저장한 문서 구분) */
  hasCharacterLayer: boolean;
};

export function getMiniHomeCharacterPose(id: string | undefined | null): MiniHomeCharacterPoseOption {
  const found = MINI_HOME_CHARACTER_POSES.find((p) => p.id === id);
  return found ?? MINI_HOME_CHARACTER_POSES[0];
}

export function getMiniHomeCharacterSlot(id: string | undefined | null): MiniHomeCharacterSlotOption {
  const found = MINI_HOME_CHARACTER_SLOTS.find((s) => s.id === id);
  return found ?? MINI_HOME_CHARACTER_SLOTS[0];
}

export function getMiniHomeCharacterSize(id: string | undefined | null): MiniHomeCharacterSizeOption {
  const found = MINI_HOME_CHARACTER_SIZES.find((s) => s.id === id);
  return found ?? MINI_HOME_CHARACTER_SIZES[0];
}

export function getMiniHomeCharacterFrame(id: string | undefined | null): MiniHomeCharacterFrameOption {
  const found = MINI_HOME_CHARACTER_FRAMES.find((f) => f.id === id);
  return found ?? MINI_HOME_CHARACTER_FRAMES[0];
}

export function miniHomeLabRef(userId: string) {
  return doc(db, 'users', userId, 'miniHomeLab', MINI_HOME_LAB_DOC_ID);
}

export function subscribeMiniHomeLab(
  userId: string,
  onChange: (state: MiniHomeLabState | null) => void
): Unsubscribe {
  return onSnapshot(
    miniHomeLabRef(userId),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const data = snap.data();
      const rawId = String(data.backgroundId ?? 'peach');
      const backgroundId = (BG_IDS.has(rawId as MiniHomeBackgroundId)
        ? rawId
        : 'peach') as MiniHomeBackgroundId;
      const slotRaw = String(data.characterSlot ?? 'center');
      const poseRaw = String(data.characterPose ?? 'neutral');
      const sizeRaw = String(data.characterSize ?? 'm');
      const frameRaw = String(data.characterFrame ?? 'circle');

      onChange({
        backgroundId,
        tagline: String(data.tagline ?? '').slice(0, 80),
        characterSlot: (SLOT_IDS.has(slotRaw as MiniHomeCharacterSlot)
          ? slotRaw
          : 'center') as MiniHomeCharacterSlot,
        characterPose: (POSE_IDS.has(poseRaw as MiniHomeCharacterPose)
          ? poseRaw
          : 'neutral') as MiniHomeCharacterPose,
        characterSize: (SIZE_IDS.has(sizeRaw as MiniHomeCharacterSize)
          ? sizeRaw
          : 'm') as MiniHomeCharacterSize,
        characterFrame: (FRAME_IDS.has(frameRaw as MiniHomeCharacterFrame)
          ? frameRaw
          : 'circle') as MiniHomeCharacterFrame,
        hasCharacterLayer: 'characterSlot' in data,
      });
    },
    () => onChange(null)
  );
}

export async function saveMiniHomeLab(
  userId: string,
  patch: Partial<MiniHomeLabState>,
  updatedBy: string
): Promise<void> {
  const backgroundId = patch.backgroundId;
  if (backgroundId && !BG_IDS.has(backgroundId)) {
    throw new Error('알 수 없는 배경입니다.');
  }
  const tagline = patch.tagline != null ? patch.tagline.trim().slice(0, 80) : undefined;

  if (patch.characterSlot && !SLOT_IDS.has(patch.characterSlot)) {
    throw new Error('알 수 없는 캐릭터 위치입니다.');
  }
  if (patch.characterPose && !POSE_IDS.has(patch.characterPose)) {
    throw new Error('알 수 없는 포즈입니다.');
  }
  if (patch.characterSize && !SIZE_IDS.has(patch.characterSize)) {
    throw new Error('알 수 없는 크기입니다.');
  }
  if (patch.characterFrame && !FRAME_IDS.has(patch.characterFrame)) {
    throw new Error('알 수 없는 프레임입니다.');
  }

  await setDoc(
    miniHomeLabRef(userId),
    {
      ...(backgroundId ? { backgroundId } : {}),
      ...(tagline !== undefined ? { tagline } : {}),
      ...(patch.characterSlot ? { characterSlot: patch.characterSlot } : {}),
      ...(patch.characterPose ? { characterPose: patch.characterPose } : {}),
      ...(patch.characterSize ? { characterSize: patch.characterSize } : {}),
      ...(patch.characterFrame ? { characterFrame: patch.characterFrame } : {}),
      updatedAt: serverTimestamp(),
      updatedBy,
    },
    { merge: true }
  );
}
