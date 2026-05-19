export const NERAE_NICKNAME = '너래';
export const NERAE_SUB_SEP = '__sub__';

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

export function buildSubParticipantDocId(ownerUid: string, subId: string): string {
  return `${ownerUid}${NERAE_SUB_SEP}${subId}`;
}

export function parseParticipantDocId(docId: string) {
  const idx = docId.indexOf(NERAE_SUB_SEP);
  if (idx < 0) {
    return { docId, ownerUid: docId, subAccountId: null as string | null };
  }
  return {
    docId,
    ownerUid: docId.slice(0, idx),
    subAccountId: docId.slice(idx + NERAE_SUB_SEP.length)
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
  return buildSubParticipantDocId(ownerUid, key);
}

export function getMemberOwnerUid(member: { uid: string; ownerUid?: string }) {
  return (member.ownerUid || member.uid || '').trim();
}

export function isOwnedByUser(member: { uid: string; ownerUid?: string }, ownerUid: string) {
  if (!ownerUid) return false;
  if (getMemberOwnerUid(member) === ownerUid) return true;
  return parseParticipantDocId(member.uid).ownerUid === ownerUid;
}

export function resolveActivePersonaDisplay(profile: NeraePersonaProfile) {
  const key = getActivePersonaKey(profile);
  if (key === 'main') {
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

export function createSubAccountId() {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
