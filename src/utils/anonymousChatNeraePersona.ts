export const NERAE_NICKNAME = '너래';
/** @deprecated 구형 부계정 participant 문서 ID 접두 (마이그레이션용) */
export const NERAE_SUB_SEP = '__sub__';
export const MAX_NERAE_SUB_ACCOUNTS = 1;

export type NeraeSubAccount = {
  id: string;
  customNickname: string;
};

export type RoomPresenceByRoom = Record<
  string,
  {
    mainJoinedAtMs?: number;
    subs?: Record<string, number>;
  }
>;

export type NeraePersonaProfile = {
  customNickname: string;
  profileNickname?: string;
  activePersona?: string;
  subAccounts?: NeraeSubAccount[];
  presenceByRoom?: RoomPresenceByRoom;
};

export type NeraeChatUser = {
  uid?: string;
  nickname?: string;
  role?: string;
};

export function canUseNeraeSubAccounts(user?: NeraeChatUser | null) {
  if (!user) return false;
  return user.nickname === NERAE_NICKNAME || user.role === '리더';
}

export function getOwnedSubDocIds(profile?: Pick<NeraePersonaProfile, 'subAccounts'> | null) {
  return (profile?.subAccounts || []).map((item) => item.id.trim()).filter(Boolean);
}

export function isLegacySubParticipantDocId(docId: string) {
  return docId.includes(NERAE_SUB_SEP);
}

/** 부계정 participant 문서 ID — 불투명 ID 그대로 사용 */
export function getSubParticipantDocId(subId: string) {
  return subId.trim();
}

/** @deprecated 신규 코드는 getSubParticipantDocId 사용 */
export function buildSubParticipantDocId(ownerUid: string, subId: string): string {
  if (isLegacySubParticipantDocId(subId)) return subId;
  return `${ownerUid}${NERAE_SUB_SEP}${subId}`;
}

export function parseParticipantDocId(docId: string) {
  const idx = docId.indexOf(NERAE_SUB_SEP);
  if (idx < 0) {
    return { docId, ownerUid: docId, subAccountId: null as string | null, isLegacySub: false };
  }
  return {
    docId,
    ownerUid: docId.slice(0, idx),
    subAccountId: docId.slice(idx + NERAE_SUB_SEP.length),
    isLegacySub: true
  };
}

export function getActivePersonaKey(profile: Pick<NeraePersonaProfile, 'activePersona'>) {
  const key = (profile.activePersona || 'main').trim();
  if (!key || key === 'main') return 'main';
  return key;
}

export function getActiveParticipantDocId(ownerUid: string, profile: NeraePersonaProfile) {
  const key = getActivePersonaKey(profile);
  if (key === 'main') return ownerUid;
  return getSubParticipantDocId(key);
}

/** 본인 소유 participant인지 (타인에게 연결 정보 노출 없음) */
export function isOwnedByUser(
  member: { uid: string },
  ownerUid: string,
  ownedSubDocIds: string[] = []
) {
  if (!ownerUid) return false;
  if (member.uid === ownerUid) return true;
  if (ownedSubDocIds.includes(member.uid)) return true;
  if (isLegacySubParticipantDocId(member.uid)) {
    return parseParticipantDocId(member.uid).ownerUid === ownerUid;
  }
  return false;
}

/** 지정한 persona 키(main 또는 부계정 id)에 대한 표시 닉네임 */
export function resolvePersonaDisplayForKey(profile: NeraePersonaProfile, personaKey: string) {
  const key = (personaKey || 'main').trim();
  if (!key || key === 'main') {
    return {
      personaKey: 'main' as const,
      nickname: profile.customNickname.trim(),
      profileNickname: profile.profileNickname || '',
      isSub: false
    };
  }
  const sub = (profile.subAccounts || []).find((item) => item.id === key);
  return {
    personaKey: key,
    nickname: (sub?.customNickname || '').trim() || '익명',
    profileNickname: '',
    isSub: true
  };
}

export function resolveActivePersonaDisplay(profile: NeraePersonaProfile) {
  return resolvePersonaDisplayForKey(profile, getActivePersonaKey(profile));
}

export function createSubAccountId() {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isRoomNicknameTaken(
  participants: { uid: string; nickname?: string }[],
  nickname: string,
  excludeParticipantDocId?: string
) {
  const target = nickname.trim();
  if (!target) return false;
  return participants.some((member) => {
    if (excludeParticipantDocId && member.uid === excludeParticipantDocId) return false;
    return (member.nickname || '').trim() === target;
  });
}

/**
 * 프로필 부계정과 같은 닉네임인데 문서 ID만 다른 중복 participant (구형 __sub__ 문서 등)
 */
/** 멤버 participant 문서 ID → persona 키(main 또는 부계정 id) */
export function resolvePersonaKeyFromMemberDocId(
  memberDocId: string,
  ownerUid: string,
  ownedSubDocIds: string[] = []
): 'main' | string | null {
  if (!memberDocId || !ownerUid) return null;
  if (memberDocId === ownerUid) return 'main';
  if (ownedSubDocIds.includes(memberDocId)) return memberDocId;
  if (isLegacySubParticipantDocId(memberDocId)) {
    const parsed = parseParticipantDocId(memberDocId);
    if (parsed.ownerUid !== ownerUid) return null;
    return parsed.subAccountId || memberDocId;
  }
  return null;
}

/** 입장 멤버 목록에서 현재 채팅 중인 카드인지 */
export function isMemberDocActivePersona(
  memberDocId: string,
  activeParticipantDocId: string,
  activePersonaKey: string,
  ownerUid: string,
  ownedSubDocIds: string[],
  options?: { memberNickname?: string; profile?: NeraePersonaProfile | null }
) {
  if (!memberDocId || !ownerUid) return false;
  if (memberDocId === activeParticipantDocId) return true;

  const memberPersonaKey = resolvePersonaKeyFromMemberDocId(memberDocId, ownerUid, ownedSubDocIds);
  if (memberPersonaKey && memberPersonaKey === activePersonaKey) return true;

  const activeSub = (options?.profile?.subAccounts || []).find((item) => item.id === activePersonaKey);
  const memberNick = (options?.memberNickname || '').trim();
  if (activeSub && memberNick && memberNick === activeSub.customNickname.trim()) {
    return isOwnedByUser({ uid: memberDocId }, ownerUid, ownedSubDocIds);
  }

  return false;
}

export function listOwnedSubParticipantDuplicates(
  participants: { uid: string; nickname?: string }[],
  ownerUid: string,
  profile: NeraePersonaProfile
) {
  const ownedSubDocIds = getOwnedSubDocIds(profile);
  const duplicateDocIds: string[] = [];

  for (const sub of profile.subAccounts || []) {
    const canonicalId = getSubParticipantDocId(sub.id);
    const nick = sub.customNickname.trim();
    if (!nick) continue;

    participants.forEach((member) => {
      if (member.uid === canonicalId) return;
      if (!isOwnedByUser(member, ownerUid, ownedSubDocIds)) return;
      if ((member.nickname || '').trim() !== nick) return;
      duplicateDocIds.push(member.uid);
    });
  }

  return [...new Set(duplicateDocIds)];
}

type MessageSenderFields = {
  uid: string;
  senderParticipantDocId?: string;
  senderLabel?: string;
};

type ParticipantNickFields = {
  uid: string;
  nickname: string;
  isSubAccount?: boolean;
};

/** senderLabel ↔ participant nickname (본계정은 "닉(프로필)" 형식 허용) */
export function nickLabelMatches(senderLabel: string, memberNickname: string) {
  const label = senderLabel.trim();
  const nick = memberNickname.trim();
  if (!label || !nick) return false;
  if (label === nick) return true;
  return label.startsWith(`${nick}(`);
}

/** 메시지 실제 발신 participant 문서 ID */
export function resolveMessageSenderParticipantDocId(
  message: MessageSenderFields,
  ownerUid: string,
  participants: ParticipantNickFields[],
  ownedSubDocIds: string[] = []
): string {
  const explicit = (message.senderParticipantDocId || '').trim();
  const label = (message.senderLabel || '').trim();

  if (!ownerUid || message.uid !== ownerUid) {
    return explicit || message.uid;
  }

  const ownedDocIds = new Set<string>([ownerUid, ...ownedSubDocIds]);
  participants.forEach((p) => {
    if (isOwnedByUser(p, ownerUid, ownedSubDocIds)) ownedDocIds.add(p.uid);
  });

  if (explicit && ownedDocIds.has(explicit)) return explicit;
  if (explicit && isLegacySubParticipantDocId(explicit)) {
    const parsed = parseParticipantDocId(explicit);
    if (parsed.ownerUid === ownerUid) return explicit;
  }

  const owned = participants.filter((p) => isOwnedByUser(p, ownerUid, ownedSubDocIds));
  let labelMatchUid: string | null = null;
  if (label) {
    const matches = owned.filter((p) => nickLabelMatches(label, p.nickname || ''));
    if (matches.length === 1) {
      labelMatchUid = matches[0].uid;
    } else if (matches.length > 1) {
      const sub = matches.find((p) => p.isSubAccount || ownedSubDocIds.includes(p.uid));
      labelMatchUid = (sub || matches[0]).uid;
    }
  }

  if (labelMatchUid) {
    if (!explicit || explicit === ownerUid) return labelMatchUid;
    if (explicit === labelMatchUid) return explicit;
  }

  if (explicit) return explicit;
  return ownerUid;
}

/** 현재 선택한 persona(본·부계정)가 보낸 메시지인지 — 말풍선 mine/other 구분용 */
export function isMessageSentByActivePersona(
  message: MessageSenderFields,
  activeParticipantDocId: string,
  activePersonaKey: string,
  ownerUid: string,
  participants: ParticipantNickFields[],
  profile: NeraePersonaProfile | null | undefined,
  ownedSubDocIds: string[] = []
) {
  if (!activeParticipantDocId || !ownerUid) return false;
  if (message.uid !== ownerUid) return false;

  const senderDocId = resolveMessageSenderParticipantDocId(
    message,
    ownerUid,
    participants,
    ownedSubDocIds
  );
  if (senderDocId === activeParticipantDocId) return true;

  const senderPersonaKey = resolvePersonaKeyFromMemberDocId(senderDocId, ownerUid, ownedSubDocIds);
  if (senderPersonaKey && senderPersonaKey === activePersonaKey) return true;

  const label = (message.senderLabel || '').trim();

  if (activePersonaKey === 'main') {
    const sentAsSub = (profile?.subAccounts || []).some((sub) =>
      nickLabelMatches(label, sub.customNickname)
    );
    if (sentAsSub) return false;
    return senderDocId === ownerUid || senderPersonaKey === 'main';
  }

  const activeSub = (profile?.subAccounts || []).find((item) => item.id === activePersonaKey);
  if (!activeSub) return false;
  if (!nickLabelMatches(label, activeSub.customNickname)) return false;

  return (
    isOwnedByUser({ uid: senderDocId }, ownerUid, ownedSubDocIds) ||
    (isLegacySubParticipantDocId(senderDocId) &&
      parseParticipantDocId(senderDocId).ownerUid === ownerUid)
  );
}

/** Firebase UID 기준 본인(본·부계정 공통)이 보낸 메시지인지 — 읽음 숫자 표시용 */
export function isMessageSentByOwnedAccount(message: { uid: string }, ownerUid: string) {
  return Boolean(ownerUid && message.uid === ownerUid);
}

/** 현재 활성 participant가 보낸 메시지인지 */
export function isMessageFromParticipant(
  message: MessageSenderFields,
  activeParticipantDocId: string,
  ownerUid: string,
  participants: ParticipantNickFields[],
  ownedSubDocIds: string[] = [],
  profile?: NeraePersonaProfile | null,
  activePersonaKey?: string
) {
  const personaKey =
    activePersonaKey ||
    (activeParticipantDocId === ownerUid
      ? 'main'
      : ownedSubDocIds.includes(activeParticipantDocId)
        ? activeParticipantDocId
        : 'main');
  return isMessageSentByActivePersona(
    message,
    activeParticipantDocId,
    personaKey,
    ownerUid,
    participants,
    profile,
    ownedSubDocIds
  );
}
