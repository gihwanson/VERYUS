import React, { useMemo, useState } from 'react';
import { getGradeName } from '../../../utils/gradeDisplay';
import { normalizeBuskingNickname } from '../BuskingMember/buskingParticipantsUtils';
import type { BuskingMemberOption } from '../BuskingMember/useBuskingMemberList';

interface FreeSongDuetProposalSectionProps {
  canPropose: boolean;
  isParticipant: boolean;
  isLeader: boolean;
  canSubmitMore: boolean;
  submissionLimit: number;
  participants: string[];
  userNickname: string;
  members: BuskingMemberOption[];
  membersLoading: boolean;
  actionLoading: boolean;
  onSubmit: (title: string, partnerNickname: string) => Promise<boolean>;
}

const FreeSongDuetProposalSection: React.FC<FreeSongDuetProposalSectionProps> = ({
  canPropose,
  isParticipant,
  isLeader,
  canSubmitMore,
  submissionLimit,
  participants,
  userNickname,
  members,
  membersLoading,
  actionLoading,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [partnerNickname, setPartnerNickname] = useState('');

  const partnerOptions = useMemo(() => {
    const participantSet = new Set(participants.map((name) => normalizeBuskingNickname(name)));
    const self = normalizeBuskingNickname(userNickname);
    return members
      .filter((member) => {
        const nickname = normalizeBuskingNickname(member.nickname);
        return Boolean(nickname) && nickname !== self && participantSet.has(nickname);
      })
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
  }, [members, participants, userNickname]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (actionLoading || !canSubmitMore) return;
    const ok = await onSubmit(title, partnerNickname);
    if (ok) {
      setTitle('');
      setPartnerNickname('');
    }
  };

  return (
    <div className="setlist-manage-panel">
      <h2 className="setlist-manage-heading free-song-heading">제안곡 전송</h2>
      <p className="setlist-manage-sub free-song-desc">
        지구·토성·태양 등급은 참가 멤버 중 원하는 등급의 파트너에게 듀엣을 제안할 수 있습니다.
        {isLeader
          ? ' 리더가 보낸 제안곡은 3곡 한도에 포함되지 않습니다.'
          : ` 제안곡도 합격곡과 같이 최대 ${submissionLimit}곡 한도에 포함되며, 파트너가 전송한 곡과 합산됩니다.`}
      </p>

      {!canPropose ? (
        <p className="free-song-empty-sub" style={{ marginTop: 12 }}>
          지구·토성·태양 등급만 듀엣을 제안할 수 있습니다.
        </p>
      ) : !isParticipant ? (
        <p className="free-song-empty-sub" style={{ marginTop: 12 }}>
          참가 멤버로 편성된 뒤에 제목과 파트너를 넣어 전송할 수 있습니다.
        </p>
      ) : !canSubmitMore ? (
        <p className="free-song-empty-sub" style={{ marginTop: 12 }}>
          {`전송 한도(${submissionLimit}곡)에 도달했습니다. 합격곡·듀엣 제안·파트너 전송 곡을 합쳐 집계됩니다.`}
        </p>
      ) : membersLoading ? (
        <p className="free-song-empty-sub" style={{ marginTop: 12 }}>파트너 목록을 불러오는 중…</p>
      ) : partnerOptions.length === 0 ? (
        <p className="free-song-empty-sub" style={{ marginTop: 12 }}>
          참가 멤버 중 선택할 파트너가 없습니다.
        </p>
      ) : (
        <form className="free-song-manual-entry__form" style={{ marginTop: 14 }} onSubmit={(event) => void handleSubmit(event)}>
          <label className="free-song-manual-entry__label" htmlFor="duet-proposal-title">제목</label>
          <input
            id="duet-proposal-title"
            className="free-song-manual-entry__input"
            value={title}
            maxLength={80}
            placeholder="제안곡 제목"
            disabled={actionLoading}
            onChange={(event) => setTitle(event.target.value)}
          />
          <label className="free-song-manual-entry__label" htmlFor="duet-proposal-partner">파트너</label>
          <select
            id="duet-proposal-partner"
            className="free-song-manual-entry__input"
            value={partnerNickname}
            disabled={actionLoading}
            onChange={(event) => setPartnerNickname(event.target.value)}
          >
            <option value="">같이 할 파트너</option>
            {partnerOptions.map((member) => (
              <option key={member.nickname} value={member.nickname}>
                {`${getGradeName(member.grade)} · ${member.nickname}`}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="free-song-btn free-song-btn--submit free-song-manual-entry__submit"
            disabled={actionLoading || !title.trim() || !partnerNickname}
          >
            {actionLoading ? '전송 중…' : '제안곡 전송'}
          </button>
        </form>
      )}
    </div>
  );
};

export default FreeSongDuetProposalSection;
