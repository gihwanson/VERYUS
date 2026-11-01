import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  deleteField,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';
import { getGradeEmoji } from './gradeDisplay';

async function syncWriterGradeInDocuments(targetUid: string, grade: string) {
  const CHUNK = 450;
  const commitRefs = async (refs: DocumentReference[]) => {
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(db);
      refs.slice(i, i + CHUNK).forEach((ref) => batch.update(ref, { writerGrade: grade }));
      await batch.commit();
    }
  };

  const postsSnapshot = await getDocs(
    query(collection(db, 'posts'), where('writerUid', '==', targetUid))
  );
  const commentsSnapshot = await getDocs(
    query(collection(db, 'comments'), where('writerUid', '==', targetUid))
  );
  await commitRefs(postsSnapshot.docs.map((d) => d.ref));
  await commitRefs(commentsSnapshot.docs.map((d) => d.ref));
}

/** 관리자 패널과 동일: users.grade + 게시물/댓글 writerGrade */
export async function applyMemberGradeInAdminPanel(uid: string, gradeRaw: string): Promise<void> {
  const grade = getGradeEmoji(gradeRaw);
  await updateDoc(doc(db, 'users', uid), {
    grade,
    pendingGrade: deleteField(),
    pendingGradeRequestedAt: deleteField(),
  });
  await syncWriterGradeInDocuments(uid, grade);
}
