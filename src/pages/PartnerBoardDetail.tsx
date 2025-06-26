import React, { useEffect } from 'react';
import { doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';

const PartnerBoardDetail = () => {
  const postId = 'your-post-id'; // Replace with actual post ID

  useEffect(() => {
    if (!postId) return;
    const docRef = doc(db, 'partners', postId);
    updateDoc(docRef, { viewCount: increment(1) });
  }, [postId]);

  return <div />;
};

export default PartnerBoardDetail; 