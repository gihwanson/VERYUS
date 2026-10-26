export const CONTEST_SUB_ROLES = ['코러스', '랩', '연주', '파트 보컬'] as const;

export type ContestSubRole = (typeof CONTEST_SUB_ROLES)[number];

export type ContestStageTeamLike = {
  members?: string[];
  mainUid?: string;
  subUid?: string;
  coMainUid?: string;
  partnerRole?: 'main' | 'sub' | string;
  subRole?: string;
};

export function isContestSubRole(value: string): value is ContestSubRole {
  return (CONTEST_SUB_ROLES as readonly string[]).includes(value);
}

/** 빈 칸은 메인 우선, 그다음 서브. 이미 찬 칸을 다시 누르면 해제한다. */
export function assignContestStageUid(
  mainUid: string,
  subUid: string,
  uid: string
): { mainUid: string; subUid: string } {
  if (uid === mainUid) return { mainUid: '', subUid };
  if (uid === subUid) return { mainUid, subUid: '' };
  if (!mainUid) return { mainUid: uid, subUid };
  if (!subUid) return { mainUid, subUid: uid };
  return { mainUid, subUid };
}

export function contestStageRoles(team: ContestStageTeamLike): {
  mainUids: string[];
  subUids: string[];
  subRole: string;
} | null {
  const members = Array.isArray(team.members) ? team.members.filter(Boolean) : [];
  const mainUid = (team.mainUid || members[0] || '').trim();
  if (!mainUid) return null;
  const partnerUid = (team.coMainUid || team.subUid || members.find((uid) => uid !== mainUid) || '').trim();
  const bothMains = Boolean(team.coMainUid) || team.partnerRole === 'main';
  if (bothMains && partnerUid && partnerUid !== mainUid) {
    return { mainUids: [mainUid, partnerUid], subUids: [], subRole: '' };
  }
  const subUids = partnerUid ? [partnerUid] : [];
  if (subUids.length === 0) return null;
  return {
    mainUids: [mainUid],
    subUids,
    subRole: (team.subRole || '').trim(),
  };
}

/** 서로 메인인 무대면 멤버 uid 둘. 메인·서브 무대면 null. */
export function contestBothMainUids(team: ContestStageTeamLike): string[] | null {
  const roles = contestStageRoles(team);
  if (!roles || roles.mainUids.length < 2) return null;
  return roles.mainUids;
}

/** 점수 저장 키. 서로 메인은 멤버별, 메인·서브는 팀 하나. */
export function contestGradeTargetIds(team: ContestStageTeamLike & { id: string }): string[] {
  return contestBothMainUids(team) ?? [team.id];
}

export function formatContestStageLines(
  team: ContestStageTeamLike,
  nicknameOf: (uid: string) => string
): { title: string; support: string; bothMains: boolean } | null {
  const roles = contestStageRoles(team);
  if (!roles) return null;
  const mainNames = roles.mainUids.map((uid) => nicknameOf(uid) || uid).filter(Boolean);
  if (mainNames.length === 0) return null;
  if (roles.mainUids.length >= 2) {
    return {
      title: `메인 ${mainNames[0]}`,
      support: mainNames.slice(1).map((name) => `메인 ${name}`).join(' · '),
      bothMains: true,
    };
  }
  const subNames = roles.subUids.map((uid) => nicknameOf(uid) || uid).filter(Boolean);
  if (subNames.length === 0) return null;
  const roleSuffix = roles.subRole ? ` (${roles.subRole})` : '';
  return {
    title: `메인 ${mainNames[0]}`,
    support: `서브 ${subNames.join(', ')}${roleSuffix}`,
    bothMains: false,
  };
}

export function formatContestStageInline(
  team: ContestStageTeamLike,
  nicknameOf: (uid: string) => string
): string {
  const lines = formatContestStageLines(team, nicknameOf);
  if (!lines) return '';
  return `${lines.title} · ${lines.support}`;
}

/** 팀 목록 「서로 메인 ↔ 서브」 버튼: 3단계 (서로 메인 → 뒤 멤버 서브 → 앞 멤버 서브 → 서로 메인) */
export type ContestStageRoleToggleStep = 'to-default-sub' | 'swap-sub' | 'to-co-main';

export function contestStageRoleToggleStep(team: ContestStageTeamLike): ContestStageRoleToggleStep | null {
  const members = Array.isArray(team.members) ? team.members.filter(Boolean) : [];
  if (members.length < 2) return null;
  const [firstUid, secondUid] = members;
  const bothMains = Boolean(team.coMainUid) || team.partnerRole === 'main';
  if (bothMains) return 'to-default-sub';
  const mainUid = (team.mainUid || firstUid).trim();
  const subUid = (team.subUid || '').trim();
  if (mainUid === firstUid && subUid === secondUid) return 'swap-sub';
  if (mainUid === secondUid && subUid === firstUid) return 'to-co-main';
  return 'swap-sub';
}

export function contestStageRoleToggleLabel(step: ContestStageRoleToggleStep): string {
  switch (step) {
    case 'to-default-sub':
      return '한 명은 서브로';
    case 'swap-sub':
      return '다른 멤버를 서브로';
    case 'to-co-main':
      return '서로 메인으로';
  }
}
