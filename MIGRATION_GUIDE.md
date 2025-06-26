# 📨 메시지 데이터베이스 구조 마이그레이션 가이드

## 🚨 현재 구조의 문제점

### 기존 구조 (비효율적)
```
messages/
  ├── messageId1 → { fromUid, toUid, content, ... }
  ├── messageId2 → { fromUid, toUid, content, ... }
  ├── messageId3 → { fromUid, toUid, content, ... }
  └── ... (모든 메시지가 하나의 컬렉션에)
```

**문제점:**
- 모든 메시지가 하나의 컬렉션에 저장되어 확장성 문제
- `where` 조건으로 필터링하는 비효율적인 쿼리
- 대화방별 관리 어려움
- 안읽은 메시지 수 계산 복잡성

## ✅ 개선된 구조 (효율적)

### 새로운 구조
```
conversations/
  ├── conversationId1/
  │   ├── (conversation metadata)
  │   ├── messages/
  │   │   ├── messageId1 → { content, fromUid, ... }
  │   │   └── messageId2 → { content, fromUid, ... }
  │   └── participants/
  │       ├── userId1 → { lastReadAt, joinedAt }
  │       └── userId2 → { lastReadAt, joinedAt }
  └── conversationId2/
      └── ...
```

**장점:**
- 대화방별로 메시지가 분리되어 효율적인 쿼리
- 안읽은 메시지 수 계산 최적화
- 참여자별 읽음 상태 관리
- 확장성과 성능 개선

## 🔄 마이그레이션 프로세스

### 1. 대화방 ID 생성 규칙
```typescript
// 일반 1:1 대화
conversationId = `${uid1}_${uid2}` (사전순 정렬)

// 게시글 관련 대화
conversationId = `${uid1}_${uid2}_${postId}` (사전순 정렬)

// 공지방
conversationId = 'announcement'
```

### 2. 마이그레이션 단계

#### Step 1: 기존 메시지 분석
- 모든 메시지를 `fromUid`, `toUid`, `postId` 기준으로 그룹화
- 대화방별 참여자 식별

#### Step 2: 대화방 생성
- 각 그룹에 대해 `conversations/{conversationId}` 문서 생성
- 마지막 메시지 정보, 참여자 목록 저장

#### Step 3: 메시지 이동
- 각 메시지를 해당 대화방의 서브컬렉션으로 복사
- `conversations/{conversationId}/messages/{messageId}`

#### Step 4: 참여자 정보 생성
- 각 참여자의 읽음 상태 초기화
- `conversations/{conversationId}/participants/{userId}`

## 🛠️ 마이그레이션 실행 방법

### 관리자 패널에서 실행
1. **관리자 패널** → **사용자 관리** 탭으로 이동
2. **"메시지 DB 마이그레이션"** 버튼 클릭
3. 확인 대화상자에서 **"확인"** 클릭
4. 마이그레이션 진행 상황 모니터링

### 코드에서 직접 실행 (개발자용)
```typescript
import { migrateExistingMessages } from './utils/chatService';

// 마이그레이션 실행
const success = await migrateExistingMessages();
if (success) {
  console.log('마이그레이션 성공!');
} else {
  console.log('마이그레이션 실패');
}
```

## ⚠️ 주의사항

### 마이그레이션 전 준비사항
1. **백업 생성**: Firebase 콘솔에서 데이터 내보내기
2. **사용자 공지**: 채팅 기능 일시 중단 안내
3. **테스트 환경 검증**: 개발 환경에서 먼저 테스트

### 마이그레이션 중
- 채팅 기능이 일시적으로 중단될 수 있음
- 마이그레이션 진행 중에는 새 메시지 전송 금지
- 에러 발생 시 즉시 중단하고 백업 복원

### 마이그레이션 후
1. **데이터 검증**: 메시지 수, 대화방 수 확인
2. **기능 테스트**: 채팅 전송, 읽음 처리 테스트
3. **성능 모니터링**: 쿼리 성능 개선 확인

## 🔧 신규 채팅 서비스 사용법

### 메시지 전송
```typescript
import { sendMessage } from './utils/chatService';

await sendMessage(
  fromUid,
  toUid, 
  content,
  fromNickname,
  toNickname,
  fromUserRole,
  postData, // 게시글 관련 시 필요
  fileData  // 파일 첨부 시 필요
);
```

### 대화방 목록 구독
```typescript
import { subscribeToUserConversations } from './utils/chatService';

const unsubscribe = subscribeToUserConversations(userId, (conversations) => {
  setConversations(conversations);
});
```

### 메시지 목록 구독
```typescript
import { subscribeToConversationMessages } from './utils/chatService';

const unsubscribe = subscribeToConversationMessages(conversationId, (messages) => {
  setMessages(messages);
});
```

### 읽음 처리
```typescript
import { markMessagesAsRead } from './utils/chatService';

await markMessagesAsRead(conversationId, userId);
```

## 📊 예상 개선 효과

### 쿼리 성능
- **기존**: `O(전체 메시지 수)` - 모든 메시지 스캔
- **개선**: `O(대화방별 메시지 수)` - 해당 대화방만 스캔

### 데이터 구조
- **기존**: 평면적 구조로 관리 복잡
- **개선**: 계층적 구조로 논리적 분리

### 확장성
- **기존**: 메시지 증가 시 성능 저하
- **개선**: 대화방별 분리로 확장성 확보

---

💡 **문의사항이나 문제가 발생하면 개발팀에 즉시 연락해주세요!** 