import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useNavigate } from "react-router-dom";

function CreateContest({ darkMode }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("vocal"); // vocal, dance, etc
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState([{ id: 1, members: [], memberSearch: "" }]);
  
  // 심사위원 관련 상태
  const [users, setUsers] = useState([]); // 모든 사용자 목록
  const [searchKeyword, setSearchKeyword] = useState(""); // 검색 키워드
  const [selectedJudges, setSelectedJudges] = useState([]); // 선택된 심사위원 목록
  const [filteredUsers, setFilteredUsers] = useState([]); // 필터링된 사용자 목록

  // 컴포넌트 마운트 시 권한 체크
  useEffect(() => {
    const userRole = localStorage.getItem("role");
    if (!userRole) {
      alert("권한이 없습니다. 운영진만 콘테스트를 생성할 수 있습니다.");
      navigate("/scores");
      return;
    }
    
    if (userRole !== "운영진" && userRole !== "부운영진" && userRole !== "리더") {
      alert("운영진 및 리더만 콘테스트를 생성할 수 있습니다.");
      navigate("/scores");
      return;
    }
  }, [navigate]);

  // 사용자 목록 가져오기
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const usersData = usersSnapshot.docs
          .map(doc => ({
            id: doc.id,
            nickname: doc.data().nickname,
            role: doc.data().role || "일반회원"
          }))
          .filter(user => user.nickname); // nickname이 존재하는 사용자만 필터링
        setUsers(usersData);
        setFilteredUsers(usersData);
      } catch (error) {
        console.error("사용자 목록 로딩 오류:", error);
      }
    };
    fetchUsers();
  }, []);

  // 검색어에 따른 사용자 필터링
  useEffect(() => {
    if (!searchKeyword) {
      setFilteredUsers(users.filter(user => 
        !selectedJudges.some(judge => judge.id === user.id)
      ));
      return;
    }

    const filtered = users.filter(user => 
      user.nickname && // nickname이 존재하는지 확인
      user.nickname.toLowerCase().includes(searchKeyword.toLowerCase()) &&
      !selectedJudges.some(judge => judge.id === user.id)
    );
    setFilteredUsers(filtered);
  }, [searchKeyword, users, selectedJudges]);

  // 팀원 추가 함수
  const addTeamMember = (teamIndex, user) => {
    const newTeams = [...teams];
    if (!newTeams[teamIndex].members.some(member => member.id === user.id)) {
      newTeams[teamIndex].members.push({
        id: user.id,
        nickname: user.nickname
      });
      newTeams[teamIndex].memberSearch = "";
    }
    setTeams(newTeams);
  };

  // 팀원 제거 함수
  const removeTeamMember = (teamIndex, userId) => {
    const newTeams = [...teams];
    newTeams[teamIndex].members = newTeams[teamIndex].members.filter(
      member => member.id !== userId
    );
    setTeams(newTeams);
  };

  // 팀원 검색어 변경 함수
  const handleTeamMemberSearch = (teamIndex, searchValue) => {
    const newTeams = [...teams];
    newTeams[teamIndex].memberSearch = searchValue;
    setTeams(newTeams);
  };

  // 팀 추가 함수
  const addTeam = () => {
    setTeams([...teams, { 
      id: teams.length + 1, 
      members: [],
      memberSearch: "" 
    }]);
  };

  // 마지막 팀 삭제 함수
  const removeLastTeam = () => {
    if (teams.length > 1) {
      setTeams(teams.slice(0, -1));
    } else {
      alert("최소 1개의 팀이 필요합니다.");
    }
  };

  // 심사위원 추가
  const addJudge = (user) => {
    setSelectedJudges([...selectedJudges, user]);
    setSearchKeyword("");
  };

  // 심사위원 제거
  const removeJudge = (userId) => {
    setSelectedJudges(selectedJudges.filter(judge => judge.id !== userId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const nickname = localStorage.getItem("nickname");
      const userRole = localStorage.getItem("role");

      if (!nickname) {
        alert("로그인이 필요합니다.");
        navigate("/login");
        return;
      }

      // 한 번 더 권한 체크
      if (!userRole || (userRole !== "운영진" && userRole !== "부운영진" && userRole !== "리더")) {
        alert("운영진 및 리더만 콘테스트를 생성할 수 있습니다.");
        navigate("/scores");
        return;
      }

      // 팀원 유효성 검사
      const emptyTeams = teams.filter(team => team.members.length === 0);
      if (emptyTeams.length > 0) {
        alert(`팀 ${emptyTeams.map(team => team.id).join(', ')}에 팀원이 없습니다.\n모든 팀에 최소 1명 이상의 팀원이 필요합니다.`);
        setLoading(false);
        return;
      }

      // 등급전일 경우 심사위원 유효성 검사
      if (category === "grade" && selectedJudges.length === 0) {
        alert("등급전의 경우 최소 1명 이상의 심사위원이 필요합니다.");
        setLoading(false);
        return;
      }

      // 콘테스트 생성
      const contestData = {
        title,
        description,
        category,
        endDate: new Date(endDate),
        organizer: nickname,
        organizerRole: userRole,
        createdAt: serverTimestamp(),
        status: "진행중",
        participantCount: teams.length,
        judges: category === "grade" ? selectedJudges.map(judge => ({
          id: judge.id,
          nickname: judge.nickname,
          role: judge.role
        })) : []
      };

      const contestRef = await addDoc(collection(db, "contests"), contestData);

      // 팀 정보 저장
      for (const team of teams) {
        await addDoc(collection(db, "contestTeams"), {
          contestId: contestRef.id,
          teamNumber: team.id,
          memberIds: team.members.map(member => member.id),
          members: team.members.map(member => member.nickname),
          createdAt: serverTimestamp()
        });
      }

      alert("콘테스트와 팀이 생성되었습니다!");
      navigate(`/scores`);
    } catch (error) {
      console.error("콘테스트 생성 오류:", error);
      alert("콘테스트 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const containerStyle = {
    padding: "20px",
    backgroundColor: darkMode ? "#2d2d2d" : "#ffffff",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    maxWidth: "800px",
    margin: "0 auto"
  };

  const formStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "20px"
  };

  const inputStyle = {
    padding: "12px",
    borderRadius: "4px",
    border: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    backgroundColor: darkMode ? "#3d3d3d" : "#ffffff",
    color: darkMode ? "#ffffff" : "#333333",
    fontSize: "16px"
  };

  const labelStyle = {
    color: darkMode ? "#ffffff" : "#333333",
    marginBottom: "5px",
    display: "block"
  };

  const buttonStyle = {
    padding: "12px",
    backgroundColor: "#7e57c2",
    color: "#ffffff",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "16px",
    opacity: loading ? 0.7 : 1
  };

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "15px"
  };

  const cellStyle = {
    padding: "8px",
    border: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    backgroundColor: darkMode ? "#3d3d3d" : "#ffffff",
    color: darkMode ? "#ffffff" : "#333333"
  };

  const judgeListStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "10px"
  };

  const judgeItemStyle = {
    backgroundColor: darkMode ? "#4d4d4d" : "#f0f0f0",
    padding: "8px 12px",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  };

  const removeButtonStyle = {
    backgroundColor: "transparent",
    border: "none",
    color: darkMode ? "#ff6b6b" : "#dc3545",
    cursor: "pointer",
    padding: "0 4px"
  };

  const dropdownStyle = {
    position: "absolute",
    top: "100%",
    left: "0",
    right: "0",
    backgroundColor: darkMode ? "#3d3d3d" : "#ffffff",
    border: `1px solid ${darkMode ? "#4d4d4d" : "#e0e0e0"}`,
    borderRadius: "4px",
    maxHeight: "200px",
    overflowY: "auto",
    zIndex: 1000
  };

  const dropdownItemStyle = {
    padding: "8px 12px",
    cursor: "pointer",
    color: darkMode ? "#ffffff" : "#333333",
    "&:hover": {
      backgroundColor: darkMode ? "#4d4d4d" : "#f0f0f0"
    }
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ color: darkMode ? "#ffffff" : "#333333", marginBottom: "20px" }}>
        새 콘테스트 만들기
      </h2>
      
      <form onSubmit={handleSubmit} style={formStyle}>
        <div>
          <label style={labelStyle}>콘테스트 제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder="콘테스트 제목을 입력하세요"
            required
          />
        </div>

        <div>
          <label style={labelStyle}>설명</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: "100px" }}
            placeholder="콘테스트에 대한 설명을 입력하세요"
            required
          />
        </div>

        <div>
          <label style={labelStyle}>카테고리</label>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              if (e.target.value === "nomal") {
                setSelectedJudges([]); // 일반 콘테스트로 변경 시 심사위원 초기화
              }
            }}
            style={inputStyle}
            required
          >
            <option value="nomal">일반 콘테스트</option>
            <option value="grade">등급전</option>
          </select>
        </div>

        {category === "grade" && (
          <div>
            <label style={labelStyle}>심사위원</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={inputStyle}
                placeholder="심사위원 검색..."
              />
              {searchKeyword && (
                <div style={dropdownStyle}>
                  {filteredUsers.map(user => (
                    <div
                      key={user.id}
                      style={dropdownItemStyle}
                      onClick={() => addJudge(user)}
                    >
                      {user.nickname} ({user.role})
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={judgeListStyle}>
              {selectedJudges.map(judge => (
                <div key={judge.id} style={judgeItemStyle}>
                  <span>{judge.nickname}</span>
                  <button
                    type="button"
                    onClick={() => removeJudge(judge.id)}
                    style={removeButtonStyle}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label style={labelStyle}>종료일</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>팀 리스트</label>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>팀 번호</th>
                <th style={cellStyle}>팀원</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, teamIndex) => (
                <tr key={team.id}>
                  <td style={{...cellStyle, textAlign: 'center'}}>{team.id}</td>
                  <td style={cellStyle}>
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        value={team.memberSearch}
                        onChange={(e) => handleTeamMemberSearch(teamIndex, e.target.value)}
                        style={{...inputStyle, width: "100%", padding: "8px"}}
                        placeholder="팀원 검색..."
                      />
                      {team.memberSearch && (
                        <div style={dropdownStyle}>
                          {users
                            .filter(user => 
                              user.nickname &&
                              user.nickname.toLowerCase().includes(team.memberSearch.toLowerCase()) &&
                              !team.members.some(member => member.id === user.id)
                            )
                            .map(user => (
                              <div
                                key={user.id}
                                style={dropdownItemStyle}
                                onClick={() => addTeamMember(teamIndex, user)}
                              >
                                {user.nickname}
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>
                    <div style={judgeListStyle}>
                      {team.members.map(member => (
                        <div key={member.id} style={judgeItemStyle}>
                          <span>{member.nickname}</span>
                          <button
                            type="button"
                            onClick={() => removeTeamMember(teamIndex, member.id)}
                            style={removeButtonStyle}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              type="button" 
              onClick={addTeam}
              style={{...buttonStyle, backgroundColor: "#4caf50"}}
            >
              팀 추가
            </button>
            <button 
              type="button" 
              onClick={removeLastTeam}
              style={{...buttonStyle, backgroundColor: "#f44336"}}
              disabled={teams.length === 1}
            >
              마지막 팀 삭제
            </button>
          </div>
        </div>

        <button 
          type="submit" 
          style={buttonStyle}
          disabled={loading}
        >
          {loading ? "생성 중..." : "콘테스트 생성하기"}
        </button>
      </form>
    </div>
  );
}

export default CreateContest; 