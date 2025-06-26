import { addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface NotificationData {
  type: 'comment' | 'reply' | 'like' | 'approval' | 'rejection' | 'guestbook' | 'mention' | 'new_post' | 'partnership' | 'partnership_closed' | 'partnership_confirmed';
  toUid: string;
  fromNickname: string;
  postId?: string;
  postTitle?: string;
  postType?: 'free' | 'recording' | 'evaluation' | 'partner';
  commentId?: string;
  message?: string;
}

export class NotificationService {
  // 게시판 타입별 라우팅
  static getRouteByPostType(postType: string, postId: string): string {
    const routes: Record<string, string> = {
      'free': `/free/${postId}`,
      'recording': `/recording/${postId}`,
      'evaluation': `/evaluation/${postId}`,
      'partner': `/boards/partner/${postId}`
    };
    return routes[postType] || `/free/${postId}`;
  }

  // 알림 메시지 생성
  static getNotificationMessage(type: string): string {
    const messages: Record<string, string> = {
      'comment': '내 게시글에 댓글이 달렸습니다.',
      'reply': '내 댓글에 답글이 달렸습니다.',
      'like': '내 게시글을 좋아합니다.',
      'approval': '내 게시글이 승인되었습니다.',
      'rejection': '내 게시글이 거부되었습니다.',
      'guestbook': '방명록에 메시지를 남겼습니다.',
      'mention': '게시글에서 나를 언급했습니다.',
      'new_post': '새 게시글이 작성되었습니다.',
      'partnership': '파트너 신청이 있습니다.',
      'partnership_closed': '지원한 파트너 모집이 완료되었습니다.',
      'partnership_confirmed': '파트너로 확정되셨습니다!'
    };
    return messages[type] || '새 알림이 있습니다.';
  }

  // 중복 알림 체크 (같은 사용자가 같은 게시글에 연속으로 댓글 달 때 등)
  static async checkDuplicateNotification(data: NotificationData): Promise<boolean> {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5분 전

      // 단순화된 쿼리 - 인덱스 오류 방지
      const q = query(
        collection(db, 'notifications'),
        where('toUid', '==', data.toUid),
        where('fromNickname', '==', data.fromNickname),
        where('type', '==', data.type)
      );

      const snapshot = await getDocs(q);
      
      // 클라이언트 사이드에서 시간 및 postId 필터링
      const recentNotifications = snapshot.docs.filter(doc => {
        const notificationData = doc.data();
        const createdAt = notificationData.createdAt?.toDate();
        const isRecent = createdAt && createdAt > fiveMinutesAgo;
        const isSamePost = notificationData.postId === (data.postId || '');
        return isRecent && isSamePost;
      });

      return recentNotifications.length > 0; // 중복이면 true
    } catch (error) {
      console.error('중복 알림 체크 실패:', error);
      return false; // 체크 실패 시 알림 생성 허용
    }
  }

  // 알림 생성
  static async createNotification(data: NotificationData): Promise<boolean> {
    try {
      // 자기 자신에게는 알림 보내지 않음
      if (data.toUid === data.fromNickname) {
        return false;
      }

      // 중복 알림 체크 (댓글, 답글, 좋아요만)
      if (['comment', 'reply', 'like'].includes(data.type)) {
        const isDuplicate = await this.checkDuplicateNotification(data);
        if (isDuplicate) {
          return false;
        }
      }

      // 알림 데이터 생성
      const notificationDoc = {
        ...data,
        message: data.message || this.getNotificationMessage(data.type),
        createdAt: serverTimestamp(),
        isRead: false
      };

      await addDoc(collection(db, 'notifications'), notificationDoc);
      return true;
    } catch (error) {
      console.error('알림 생성 실패:', error);
      return false;
    }
  }

  // 특정 타입의 알림 생성 헬퍼 함수들
  static async createCommentNotification(toUid: string, fromNickname: string, postId: string, postTitle: string, postType: string = 'free') {
    return this.createNotification({
      type: 'comment',
      toUid,
      fromNickname,
      postId,
      postTitle,
      postType: postType as any
    });
  }

  static async createReplyNotification(toUid: string, fromNickname: string, postId: string, postTitle: string, commentId: string, postType: string = 'free') {
    return this.createNotification({
      type: 'reply',
      toUid,
      fromNickname,
      postId,
      postTitle,
      commentId,
      postType: postType as any
    });
  }

  static async createLikeNotification(toUid: string, fromNickname: string, postId: string, postTitle: string, postType: string = 'free') {
    return this.createNotification({
      type: 'like',
      toUid,
      fromNickname,
      postId,
      postTitle,
      postType: postType as any
    });
  }

  static async createGuestbookNotification(toUid: string, fromNickname: string) {
    return this.createNotification({
      type: 'guestbook',
      toUid,
      fromNickname
    });
  }

  static async createApprovalNotification(toUid: string, postId: string, postTitle: string, postType: string = 'evaluation') {
    return this.createNotification({
      type: 'approval',
      toUid,
      fromNickname: '시스템',
      postId,
      postTitle,
      postType: postType as any
    });
  }

  static async createRejectionNotification(toUid: string, postId: string, postTitle: string, postType: string = 'evaluation') {
    return this.createNotification({
      type: 'rejection',
      toUid,
      fromNickname: '시스템',
      postId,
      postTitle,
      postType: postType as any
    });
  }

  static async createPartnershipClosedNotification(toUid: string, postId: string, postTitle: string, fromNickname: string) {
    return this.createNotification({
      type: 'partnership_closed',
      toUid,
      fromNickname,
      postId,
      postTitle,
      postType: 'partner'
    });
  }

  static async createPartnershipConfirmedNotification(toUid: string, postId: string, postTitle: string, fromNickname: string) {
    return this.createNotification({
      type: 'partnership_confirmed',
      toUid,
      fromNickname,
      postId,
      postTitle,
      postType: 'partner'
    });
  }
} 