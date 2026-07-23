import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserMention {
  uid: string;
  nickname: string;
}

export async function getUserMentions(): Promise<UserMention[]> {
  const querySnapshot = await getDocs(collection(db, 'users'));
  const users: UserMention[] = [];
  const seenNicknames = new Set<string>();

  querySnapshot.forEach((userDoc) => {
    const data = userDoc.data();
    const nickname = typeof data.nickname === 'string' ? data.nickname.trim() : '';
    if (!nickname) return;

    // doc.id를 우선 사용 (data.uid가 없거나 불일치하는 경우 대비)
    const uid = (typeof data.uid === 'string' && data.uid) || userDoc.id;
    if (!uid) return;

    // 동일 닉네임 중복 시 첫 사용자만 (자동완성 충돌 방지)
    if (seenNicknames.has(nickname)) return;
    seenNicknames.add(nickname);

    users.push({ uid, nickname });
  });

  users.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
  return users;
}
