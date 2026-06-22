import { addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface NotificationData {
  type:
    | 'comment'
    | 'reply'
    | 'like'
    | 'approval'
    | 'rejection'
    | 'guestbook'
    | 'guestbook_reply'
    | 'mention'
    | 'new_post'
    | 'partnership'
    | 'partnership_closed'
    | 'partnership_confirmed'
    | 'grade_request_pending'
    | 'grade_change_approved'
    | 'grade_change_rejected'
    | 'approved_song_milestone';
  toUid: string;
  /** 알림을 보낸 사람의 uid (있으면 자기 자신에게 보내기 방지에 사용) */
  fromUid?: string;
  fromNickname: string;
  postId?: string;
  postTitle?: string;
  postType?: 'free' | 'recording' | 'evaluation' | 'balance' | 'partner';
  commentId?: string;
  message?: string;
  route?: string;
  roomId?: string;
  /** 방명록이 달린 마이페이지 주인 uid — 알림 탭/푸시에서 /mypage/:uid 로 이동 */
  guestbookOwnerUid?: string;
}

export class NotificationService {
  static resolveNotificationRoute(data: {
    type?: string;
    postId?: string;
    postType?: string;
    route?: string;
    roomId?: string;
    guestbookOwnerUid?: string;
  }): string {
    const type = String(data.type || '');
    const postId = String(data.postId || '');
    const postType = String(data.postType || '');
    const roomId = String(data.roomId || '');
    const route = String(data.route || '');

    if (route) {
      if (route === '/anonymous-chat' && roomId) {
        return `/anonymous-chat?roomId=${encodeURIComponent(roomId)}`;
      }
      return route;
    }

    if (
      type === 'anonymous_chat' ||
      type === 'anonymous_chat_ban' ||
      type === 'anonymous_chat_kick'
    ) {
      return roomId ? `/anonymous-chat?roomId=${encodeURIComponent(roomId)}` : '/anonymous-chat';
    }

    if (type === 'grade_request_pending') {
      return '/admin?tab=approvals';
    }

    if (type === 'approved_song_milestone') {
      return '/hall-of-fame';
    }

    if (type === 'guestbook' || type === 'guestbook_reply') {
      const uid = String(data.guestbookOwnerUid || '');
      return uid ? `/mypage/${uid}` : '/mypage';
    }

    if (type === 'partnership' || type === 'partnership_closed' || type === 'partnership_confirmed') {
      return postId ? `/boards/partner/${postId}` : '/boards/partner';
    }

    if (postId && postType) {
      return this.getRouteByPostType(postType, postId);
    }

    if (postId) {
      return `/free/${postId}`;
    }

    return '/notifications';
  }

  /** 푸시/알림 목록에 쓰는 게시판 짧은 이름 */
  static boardLabel(postType?: string): string {
    const labels: Record<string, string> = {
      free: '자유',
      recording: '녹음',
      evaluation: '평가',
      balance: '밸런스',
      partner: '파트너',
      home: '메인'
    };
    return labels[postType || ''] || '게시판';
  }

  static clampText(text: string, maxChars: number): string {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (t.length <= maxChars) return t;
    return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
  }

  /** 댓글 알림 본문 (비밀 댓글이면 내용 미포함) */
  static buildCommentMessage(
    fromNickname: string,
    postTitle: string,
    postType: string,
    opts?: { commentPreview?: string; isSecret?: boolean }
  ): string {
    const board = this.boardLabel(postType);
    const title = this.clampText(postTitle || '제목 없음', 40);
    if (opts?.isSecret) {
      return `[${board}]「${title}」에 ${fromNickname}님이 비밀 댓글을 남겼습니다.`;
    }
    if (opts?.commentPreview) {
      const prev = this.clampText(opts.commentPreview, 72);
      return `[${board}]「${title}」— ${fromNickname}님: ${prev}`;
    }
    return `[${board}]「${title}」에 ${fromNickname}님이 댓글을 남겼습니다.`;
  }

  /** 답글 알림 본문 */
  static buildReplyMessage(
    fromNickname: string,
    postTitle: string,
    postType: string,
    opts?: { replyPreview?: string; isSecret?: boolean }
  ): string {
    const board = this.boardLabel(postType);
    const title = this.clampText(postTitle || '제목 없음', 36);
    if (opts?.isSecret) {
      return `[${board}]「${title}」글의 내 댓글에 ${fromNickname}님이 비밀 답글을 남겼습니다.`;
    }
    if (opts?.replyPreview) {
      const prev = this.clampText(opts.replyPreview, 64);
      return `[${board}]「${title}」— ${fromNickname}님의 답글: ${prev}`;
    }
    return `[${board}]「${title}」글의 내 댓글에 ${fromNickname}님이 답글을 남겼습니다.`;
  }

  /** 댓글 좋아요 알림 본문 */
  static buildCommentLikeMessage(
    fromNickname: string,
    postTitle: string,
    postType: string,
    commentPreview: string
  ): string {
    const board = this.boardLabel(postType);
    const title = this.clampText(postTitle || '제목 없음', 32);
    const prev = this.clampText(commentPreview, 36);
    return `[${board}]「${title}」의 댓글「${prev}」에 ${fromNickname}님이 좋아요를 눌렀습니다.`;
  }

  // 게시판 타입별 라우팅
  static getRouteByPostType(postType: string, postId: string): string {
    const routes: Record<string, string> = {
      'free': `/free/${postId}`,
      'recording': `/recording/${postId}`,
      'evaluation': `/evaluation/${postId}`,
      'balance': `/balance/${postId}`,
      'partner': `/boards/partner/${postId}`,
      'home': '/'
    };
    return routes[postType] || `/free/${postId}`;
  }

  // 알림 메시지 생성
  static getNotificationMessage(type: string): string {
    const messages: Record<string, string> = {
      'comment': '내 게시글에 댓글이 달렸습니다.',
      'reply': '내 댓글에 답글이 달렸습니다.',
      'like': '내 게시글을 좋아합니다.',
      'approval': '내 게시글이 합격되었습니다.',
      'rejection': '내 게시글이 불합격되었습니다.',
      'guestbook': '방명록에 메시지를 남겼습니다.',
      'guestbook_reply': '방명록 글에 답글이 달렸습니다.',
      'mention': '게시글에서 나를 언급했습니다.',
      'new_post': '새 게시글이 작성되었습니다.',
      'partnership': '파트너 신청이 있습니다.',
      'partnership_closed': '지원한 파트너 모집이 완료되었습니다.',
      'partnership_confirmed': '파트너로 확정되셨습니다!',
      grade_request_pending: '등급 변경 승인 요청이 있습니다.',
      grade_change_approved: '등급 변경 요청이 승인되었습니다.',
      grade_change_rejected: '등급 변경 요청이 반려되었습니다.',
      approved_song_milestone: '회원이 합격곡 마일스톤을 달성했습니다.',
      anonymous_chat_ban: '익명채팅방 퇴장 안내가 도착했습니다.',
      anonymous_chat_kick: '익명채팅방에서보내졌습니다.'
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
        if (!isRecent || !isSamePost) return false;

        if (data.type === 'reply') {
          return notificationData.commentId === (data.commentId || '');
        }
        if (data.type === 'like' && data.commentId) {
          return notificationData.commentId === data.commentId;
        }
        if (data.type === 'like') {
          return !notificationData.commentId;
        }
        return true;
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
      console.info('[notify] createNotification:start', {
        type: data.type,
        toUid: data.toUid,
        fromUid: data.fromUid,
        postId: data.postId
      });
      // 자기 자신에게는 알림 보내지 않음
      if (data.fromUid && data.toUid === data.fromUid) {
        console.info('[notify] skipped:self-notification', { toUid: data.toUid, fromUid: data.fromUid });
        return false;
      }

      // 중복 알림 체크: 답글/좋아요만 (댓글은 같은 글에 여러 번 달 수 있어 매번 알림이 가야 함)
      if (['reply', 'like'].includes(data.type)) {
        const isDuplicate = await this.checkDuplicateNotification(data);
        if (isDuplicate) {
          console.info('[notify] skipped:duplicate', {
            type: data.type,
            toUid: data.toUid,
            postId: data.postId,
            commentId: data.commentId
          });
          return false;
        }
      }

      // 알림 데이터 생성
      const notificationDoc = {
        ...data,
        route: data.route || this.resolveNotificationRoute(data),
        message: data.message || this.getNotificationMessage(data.type),
        createdAt: serverTimestamp(),
        isRead: false
      };

      await addDoc(collection(db, 'notifications'), notificationDoc);
      console.info('[notify] createNotification:success', {
        type: data.type,
        toUid: data.toUid,
        postId: data.postId
      });
      return true;
    } catch (error) {
      console.error('알림 생성 실패:', error);
      return false;
    }
  }

  // 특정 타입의 알림 생성 헬퍼 함수들
  static async createCommentNotification(
    toUid: string,
    fromUid: string,
    fromNickname: string,
    postId: string,
    postTitle: string,
    postType: string = 'free',
    opts?: { commentPreview?: string; isSecret?: boolean }
  ) {
    const message = this.buildCommentMessage(fromNickname, postTitle, postType, opts);
    return this.createNotification({
      type: 'comment',
      toUid,
      fromUid,
      fromNickname,
      postId,
      postTitle,
      postType: postType as any,
      message
    });
  }

  static async createReplyNotification(
    toUid: string,
    fromUid: string,
    fromNickname: string,
    postId: string,
    postTitle: string,
    commentId: string,
    postType: string = 'free',
    opts?: { replyPreview?: string; isSecret?: boolean }
  ) {
    const message = this.buildReplyMessage(fromNickname, postTitle, postType, opts);
    return this.createNotification({
      type: 'reply',
      toUid,
      fromUid,
      fromNickname,
      postId,
      postTitle,
      commentId,
      postType: postType as any,
      message
    });
  }

  static async createLikeNotification(
    toUid: string,
    fromUid: string,
    fromNickname: string,
    postId: string,
    postTitle: string,
    postType: string = 'free',
    commentId?: string,
    commentPreview?: string
  ) {
    const message =
      commentId && commentPreview?.trim()
        ? this.buildCommentLikeMessage(fromNickname, postTitle, postType, commentPreview)
        : `[${this.boardLabel(postType)}]「${this.clampText(postTitle || '', 36)}」에 ${fromNickname}님이 좋아요를 눌렀습니다.`;
    return this.createNotification({
      type: 'like',
      toUid,
      fromUid,
      fromNickname,
      postId,
      postTitle,
      postType: postType as any,
      commentId,
      message
    });
  }

  static async createGuestbookNotification(
    toUid: string,
    fromUid: string,
    fromNickname: string,
    messagePreview?: string,
    guestbookOwnerUid?: string
  ) {
    const message = messagePreview?.trim()
      ? `${fromNickname}님의 방명록: ${this.clampText(messagePreview.trim(), 100)}`
      : `${fromNickname}님이 방명록에 메시지를 남겼습니다.`;
    return this.createNotification({
      type: 'guestbook',
      toUid,
      fromUid,
      fromNickname,
      message,
      guestbookOwnerUid: guestbookOwnerUid || toUid
    });
  }

  /** 방명록 특정 글에 대한 답장 — 원글 작성자(toUid)에게 전달 */
  static async createGuestbookReplyNotification(
    toUid: string,
    fromUid: string,
    fromNickname: string,
    messagePreview?: string,
    guestbookOwnerUid?: string
  ) {
    const message = messagePreview?.trim()
      ? `${fromNickname}님의 방명록 답글: ${this.clampText(messagePreview.trim(), 100)}`
      : `${fromNickname}님이 회원님의 방명록 글에 답글을 남겼습니다.`;
    return this.createNotification({
      type: 'guestbook_reply',
      toUid,
      fromUid,
      fromNickname,
      message,
      guestbookOwnerUid
    });
  }

  static async createApprovalNotification(toUid: string, postId: string, postTitle: string, postType: string = 'evaluation') {
    return this.createNotification({
      type: 'approval',
      toUid,
      fromNickname: '시스템',
      postId,
      postTitle,
      postType: postType as any,
      message: `"${postTitle}" 게시글이 합격되었습니다.`
    });
  }

  static async createRejectionNotification(toUid: string, postId: string, postTitle: string, postType: string = 'evaluation') {
    return this.createNotification({
      type: 'rejection',
      toUid,
      fromNickname: '시스템',
      postId,
      postTitle,
      postType: postType as any,
      message: `"${postTitle}" 게시글이 불합격되었습니다.`
    });
  }

  static async createPartnershipClosedNotification(
    toUid: string,
    postId: string,
    postTitle: string,
    fromNickname: string,
    fromUid: string
  ) {
    const t = this.clampText(postTitle, 36);
    const message = `${fromNickname}님이 파트너 모집「${t}」를 마감했습니다.`;
    return this.createNotification({
      type: 'partnership_closed',
      toUid,
      fromUid,
      fromNickname,
      postId,
      postTitle,
      postType: 'partner',
      message
    });
  }

  static async createPartnershipConfirmedNotification(
    toUid: string,
    postId: string,
    postTitle: string,
    fromNickname: string,
    fromUid: string
  ) {
    const t = this.clampText(postTitle, 36);
    const message = `「${t}」모집에서 ${fromNickname}님이 회원님을 파트너로 확정했습니다.`;
    return this.createNotification({
      type: 'partnership_confirmed',
      toUid,
      fromUid,
      fromNickname,
      postId,
      postTitle,
      postType: 'partner',
      message
    });
  }

  /** 등급 변경 승인 대기가 생겼을 때 리더·운영진·너래에게 알림(푸시 트리거 포함) */
  static async notifyStaffOfPendingGradeRequest(params: {
    requesterUid: string;
    requesterNickname: string;
    requestedGrade: string;
  }): Promise<void> {
    const { requesterUid, requesterNickname, requestedGrade } = params;
    try {
      const uidSet = new Set<string>();

      const [leaderSnap, staffSnap, neraeSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', '리더'))),
        getDocs(query(collection(db, 'users'), where('role', '==', '운영진'))),
        getDocs(query(collection(db, 'users'), where('nickname', '==', '너래')))
      ]);

      leaderSnap.docs.forEach((d) => uidSet.add(d.id));
      staffSnap.docs.forEach((d) => uidSet.add(d.id));
      neraeSnap.docs.forEach((d) => uidSet.add(d.id));

      const message = `${requesterNickname}님이 등급 변경을 요청했습니다. 관리자 패널의 「등급 승인」 탭에서 처리해 주세요.`;
      const postTitle = `요청 등급: ${requestedGrade}`;

      await Promise.all(
        [...uidSet].map(async (toUid) => {
          if (!toUid || toUid === requesterUid) return;
          await this.createNotification({
            type: 'grade_request_pending',
            toUid,
            fromUid: requesterUid,
            fromNickname: requesterNickname,
            postTitle,
            message
          });
        })
      );
    } catch (error) {
      console.error('등급 승인 요청 알림(운영진) 전송 실패:', error);
    }
  }

  /** 회원에게 등급 승인·반려 결과 알림 */
  static async notifyUserGradeRequestResolved(params: {
    toUid: string;
    approved: boolean;
    gradeEmoji?: string;
    gradeName?: string;
  }): Promise<void> {
    const { toUid, approved, gradeEmoji, gradeName } = params;
    const label =
      gradeEmoji && gradeName ? `${gradeEmoji} ${gradeName}` : gradeEmoji || gradeName || '';
    const message = approved
      ? label
        ? `요청하신 등급으로 변경되었습니다. (${label})`
        : '요청하신 등급으로 변경되었습니다.'
      : '등급 변경 요청이 반려되었습니다. 프로필에 반영된 등급이 유지됩니다.';
    try {
      await this.createNotification({
        type: approved ? 'grade_change_approved' : 'grade_change_rejected',
        toUid,
        fromNickname: 'VERYUS 운영',
        message
      });
    } catch (e) {
      console.error('등급 승인 결과 알림 실패:', e);
    }
  }
} 