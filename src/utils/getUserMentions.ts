import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface UserMention {
  uid: string;
  nickname: string;
}

export async function getUserMentions(): Promise<UserMention[]> {
  const querySnapshot = await getDocs(collection(db, 'users'));
  const users: UserMention[] = [];
  querySnapshot.forEach(doc => {
    const data = doc.data();
    if (data.nickname && data.uid) {
      users.push({ uid: data.uid, nickname: data.nickname });
    }
  });
  return users;
} 