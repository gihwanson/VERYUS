import type { User as FirebaseUser } from 'firebase/auth';
import { checkAdminAccess } from '../components/AdminTypes';

export interface VeryusUser {
  uid: string;
  email: string;
  nickname?: string;
  role?: string;
  grade?: string;
  profileImageUrl?: string;
  position?: string;
  notificationsEnabled?: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
}

const STORAGE_KEY = 'veryus_user';

export const readVeryusUserFromStorage = (): VeryusUser | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VeryusUser;
  } catch (error) {
    console.warn('veryus_user 파싱 실패:', error);
    return null;
  }
};

export const writeVeryusUserToStorage = (user: VeryusUser): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
};

export const mergeVeryusUserFromAuth = (
  authUser: FirebaseUser,
  userData: Record<string, unknown> = {},
  previous: VeryusUser | null = null
): VeryusUser => {
  const nickname =
    (userData.nickname as string | undefined) ??
    previous?.nickname ??
    authUser.displayName ??
    '';
  const role = (userData.role as string | undefined) ?? previous?.role ?? '일반';
  const grade = (userData.grade as string | undefined) ?? previous?.grade ?? '🍒';
  const profileImageUrl =
    (userData.profileImageUrl as string | undefined) ??
    previous?.profileImageUrl ??
    authUser.photoURL ??
    undefined;
  const position = (userData.position as string | undefined) ?? previous?.position;
  const notificationsEnabled =
    (userData.notificationsEnabled as boolean | undefined) ?? previous?.notificationsEnabled ?? false;
  const isAdmin = checkAdminAccess({ nickname, role });

  return {
    uid: authUser.uid,
    email: authUser.email ?? previous?.email ?? '',
    nickname,
    role,
    grade,
    profileImageUrl,
    position,
    notificationsEnabled,
    isAdmin,
    isLoggedIn: true
  };
};
