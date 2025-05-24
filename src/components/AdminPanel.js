import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import {
  collection, getDocs, doc, deleteDoc, query, orderBy, limit, where, updateDoc, onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";
import {
  containerStyle, darkContainerStyle, titleStyle, smallBtn, purpleBtn
} from "../components/style";

function AdminPanel({ darkMode }) {
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("reported"); // "reported", "users", "stats"
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFilter, setSearchFilter] = useState("nickname"); // "nickname", "email"
  const [sortBy, setSortBy] = useState("reports"); // "reports", "date", "title"
  const [sortOrder, setSortOrder] = useState("desc"); // "asc", "desc"
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 사용자 데이터 실시간 리스너 설정
      const userUnsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
        const userData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setUsers(userData);
        console.log("사용자 데이터 실시간 업데이트:", userData.length, "명");
      });
      
      // 게시글 데이터 실시간 리스너 설정
      const postQuery = query(
        collection(db, "posts"), 
        orderBy("reports", "desc")
      );
      const postUnsubscribe = onSnapshot(postQuery, (snapshot) => {
        const postData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setPosts(postData);
        console.log("게시글 데이터 실시간 업데이트:", postData.length, "개");
      });
      
      setLoading(false);
      
      // cleanup 함수 반환
      return () => {
        userUnsubscribe();
        postUnsubscribe();
      };
    } catch (error) {
      console.error("데이터 로딩 중 오류:", error);
      alert("데이터를 불러오는 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  const deletePost = async (id) => {
    if (!window.confirm("해당 글을 삭제할까요?")) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, "posts", id));
      // 실시간 리스너가 있으므로 로컬 상태 업데이트 제거
      alert("삭제되었습니다");
    } catch (error) {
      console.error("게시글 삭제 중 오류:", error);
      alert("게시글을 삭제하는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const ignoredReports = async (id) => {
    if (!window.confirm("이 게시글의 신고를 무시하시겠습니까?")) return;
    
    try {
      setLoading(true);
      await updateDoc(doc(db, "posts", id), { reports: 0 });
      // 실시간 리스너가 있으므로 로컬 상태 업데이트 제거
      alert("게시글 신고가 초기화되었습니다");
    } catch (error) {
      console.error("신고 초기화 중 오류:", error);
      alert("신고를 초기화하는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 사용자 삭제 함수 추가
  const deleteUser = async (id, nickname) => {
    if (!window.confirm(`정말로 "${nickname}" 사용자를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, "users", id));
      // 실시간 리스너가 있으므로 로컬 상태 업데이트 제거
      alert("사용자가 삭제되었습니다");
    } catch (error) {
      console.error("사용자 삭제 중 오류:", error);
      alert("사용자를 삭제하는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // 검색 시 첫 페이지로 이동
  };

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  // 검색 및 정렬 적용
  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    return user.nickname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           user.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const filteredPosts = posts
    .filter(post => {
      if (activeTab === "reported") {
        return post.reports >= 2;
      }
      return true;
    })
    .filter(post => {
      if (!searchTerm) return true;
      return post.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             post.nickname?.toLowerCase().includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "reports":
          comparison = (a.reports || 0) - (b.reports || 0);
          break;
        case "date":
          comparison = (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
          break;
        case "title":
          comparison = (a.title || "").localeCompare(b.title || "");
          break;
        default:
          comparison = (a.reports || 0) - (b.reports || 0);
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });

  // 페이지네이션
  const totalPages = Math.ceil(
    activeTab === "users" 
      ? filteredUsers.length / itemsPerPage 
      : filteredPosts.length / itemsPerPage
  );
  
  const currentItems = activeTab === "users" 
    ? filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    : filteredPosts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const pageNumbers = [];
  for (let i = 1; i <= totalPages; i++) {
    pageNumbers.push(i);
  }

  // 스타일 정의
  const tabStyle = {
    display: "flex",
    marginBottom: 20
  };

  const tabItemStyle = (isActive) => ({
    padding: "10px 20px",
    cursor: "pointer",
    background: isActive 
      ? (darkMode ? "#7e57c2" : "#9c68e6") 
      : (darkMode ? "#444" : "#e0e0e0"),
    color: isActive 
      ? (darkMode ? "#fff" : "#fff") 
      : (darkMode ? "#ccc" : "#666"),
    borderRadius: "8px 8px 0 0",
    marginRight: 5,
    fontWeight: isActive ? "bold" : "normal"
  });

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10
  };

  const thStyle = {
    textAlign: "left",
    padding: 10,
    background: darkMode ? "#444" : "#e6dcf7",
    color: darkMode ? "#fff" : "#333",
    cursor: "pointer"
  };

  const tdStyle = {
    padding: 10,
    borderBottom: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    color: darkMode ? "#fff" : "#333"
  };

  const buttonRowStyle = {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10
  };

  const paginationStyle = {
    display: "flex",
    justifyContent: "center",
    margin: "20px 0",
    gap: 5
  };

  const pageButtonStyle = (isActive) => ({
    padding: "5px 10px",
    background: isActive 
      ? (darkMode ? "#7e57c2" : "#9c68e6") 
      : (darkMode ? "#444" : "#e0e0e0"),
    color: isActive 
      ? (darkMode ? "#fff" : "#fff") 
      : (darkMode ? "#ccc" : "#666"),
    borderRadius: 4,
    cursor: "pointer",
    border: "none"
  });

  const searchContainerStyle = {
    display: "flex",
    marginBottom: 15,
    gap: 10
  };

  const searchInputStyle = {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 4,
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    background: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#333"
  };

  const filterSelectStyle = {
    padding: "8px 12px",
    borderRadius: 4,
    border: `1px solid ${darkMode ? "#555" : "#ddd"}`,
    background: darkMode ? "#333" : "#fff",
    color: darkMode ? "#fff" : "#333"
  };

  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>👑 관리자 패널</h1>
      
      {/* 탭 메뉴 */}
      <div style={tabStyle}>
        <div 
          style={tabItemStyle(activeTab === "reported")} 
          onClick={() => setActiveTab("reported")}
        >
          🚨 신고된 게시글
        </div>
        <div 
          style={tabItemStyle(activeTab === "users")} 
          onClick={() => setActiveTab("users")}
        >
          👥 회원 관리
        </div>
        <div 
          style={tabItemStyle(activeTab === "stats")} 
          onClick={() => setActiveTab("stats")}
        >
          📊 통계
        </div>
      </div>
      
      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}>
          로딩 중...
        </div>
      ) : (
        <>
          {/* 검색 및 필터링 UI */}
          <div style={searchContainerStyle}>
            <input
              type="text"
              placeholder={`${activeTab === "users" ? "회원" : "게시글"} 검색...`}
              value={searchTerm}
              onChange={handleSearch}
              style={searchInputStyle}
            />
            
            {activeTab === "reported" && (
              <>
                <select 
                  value={sortBy} 
                  onChange={handleSortChange}
                  style={filterSelectStyle}
                >
                  <option value="reports">신고수</option>
                  <option value="date">날짜</option>
                  <option value="title">제목</option>
                </select>
                
                <button 
                  onClick={toggleSortOrder} 
                  style={{
                    ...smallBtn,
                    background: darkMode ? "#555" : "#e0e0e0"
                  }}
                >
                  {sortOrder === "asc" ? "↑" : "↓"}
                </button>
              </>
            )}
          </div>
          
          {activeTab === "reported" && (
            <>
              <h2>신고 2회 이상 게시글</h2>
              
              {filteredPosts.length === 0 ? (
                <p>해당 게시글이 없습니다</p>
              ) : (
                <>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>제목</th>
                        <th style={thStyle}>작성자</th>
                        <th style={thStyle}>신고수</th>
                        <th style={thStyle}>작성일</th>
                        <th style={thStyle}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.map(post => (
                        <tr key={post.id}>
                          <td style={tdStyle}>{post.title}</td>
                          <td style={tdStyle}>{post.nickname || "알 수 없음"}</td>
                          <td style={tdStyle}>{post.reports || 0}</td>
                          <td style={tdStyle}>
                            {post.createdAt 
                              ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() 
                              : "알 수 없음"}
                          </td>
                          <td style={tdStyle}>
                            <div style={buttonRowStyle}>
                              <button 
                                onClick={() => ignoredReports(post.id)} 
                                style={{
                                  ...smallBtn,
                                  background: darkMode ? "#555" : "#e0e0e0"
                                }}
                              >
                                무시
                              </button>
                              <button 
                                onClick={() => deletePost(post.id)} 
                                style={{
                                  ...smallBtn,
                                  background: "red",
                                  color: "white"
                                }}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* 페이지네이션 */}
                  <div style={paginationStyle}>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      style={{
                        ...pageButtonStyle(false),
                        opacity: currentPage === 1 ? 0.5 : 1
                      }}
                    >
                      이전
                    </button>
                    
                    {pageNumbers.map(number => (
                      <button
                        key={number}
                        onClick={() => setCurrentPage(number)}
                        style={pageButtonStyle(currentPage === number)}
                      >
                        {number}
                      </button>
                    ))}
                    
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      style={{
                        ...pageButtonStyle(false),
                        opacity: currentPage === totalPages ? 0.5 : 1
                      }}
                    >
                      다음
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          
          {activeTab === "users" && (
            <>
              <h2>회원 목록</h2>
              
              {filteredUsers.length === 0 ? (
                <p>회원이 없습니다</p>
              ) : (
                <>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>닉네임</th>
                        <th style={thStyle}>이메일</th>
                        <th style={thStyle}>등급</th>
                        <th style={thStyle}>가입일</th>
                        <th style={thStyle}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentItems.map(user => (
                        <tr key={user.id}>
                          <td style={tdStyle}>{user.nickname || "알 수 없음"}</td>
                          <td style={tdStyle}>{user.email || "알 수 없음"}</td>
                          <td style={tdStyle}>{user.grade || "없음"}</td>
                          <td style={tdStyle}>
                            {user.createdAt 
                              ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() 
                              : "알 수 없음"}
                          </td>
                          <td style={tdStyle}>
                            <div style={buttonRowStyle}>
                              <button 
                                onClick={() => deleteUser(user.id, user.nickname)} 
                                style={{
                                  ...smallBtn,
                                  background: "red",
                                  color: "white"
                                }}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* 페이지네이션 */}
                  <div style={paginationStyle}>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      style={{
                        ...pageButtonStyle(false),
                        opacity: currentPage === 1 ? 0.5 : 1
                      }}
                    >
                      이전
                    </button>
                    
                    {pageNumbers.map(number => (
                      <button
                        key={number}
                        onClick={() => setCurrentPage(number)}
                        style={pageButtonStyle(currentPage === number)}
                      >
                        {number}
                      </button>
                    ))}
                    
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      style={{
                        ...pageButtonStyle(false),
                        opacity: currentPage === totalPages ? 0.5 : 1
                      }}
                    >
                      다음
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          
          {activeTab === "stats" && (
            <div>
              <h2>사이트 통계</h2>
              
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                gap: 20,
                marginTop: 20 
              }}>
                <div style={{ 
                  padding: 20, 
                  background: darkMode ? "#444" : "#f3e7ff", 
                  borderRadius: 8,
                  textAlign: "center"
                }}>
                  <h3>총 회원수</h3>
                  <p style={{ fontSize: 28, fontWeight: "bold" }}>{users.length}</p>
                </div>
                
                <div style={{ 
                  padding: 20, 
                  background: darkMode ? "#444" : "#f3e7ff", 
                  borderRadius: 8,
                  textAlign: "center"
                }}>
                  <h3>총 게시글수</h3>
                  <p style={{ fontSize: 28, fontWeight: "bold" }}>{posts.length}</p>
                </div>
                
                <div style={{ 
                  padding: 20, 
                  background: darkMode ? "#444" : "#f3e7ff", 
                  borderRadius: 8,
                  textAlign: "center"
                }}>
                  <h3>신고된 게시글</h3>
                  <p style={{ fontSize: 28, fontWeight: "bold" }}>
                    {posts.filter(p => p.reports >= 2).length}
                  </p>
                </div>
              </div>
              
              <div style={{ marginTop: 30 }}>
                <h3>최근 가입 회원</h3>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>닉네임</th>
                      <th style={thStyle}>가입일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users
                      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                      .slice(0, 5)
                      .map((user, index) => (
                        <tr key={`recent-user-${user.id}-${index}`}>
                          <td style={tdStyle}>{user.nickname || "알 수 없음"}</td>
                          <td style={tdStyle}>
                            {user.createdAt 
                              ? new Date(user.createdAt.seconds * 1000).toLocaleDateString() 
                              : "알 수 없음"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      
      <div style={{ marginTop: 30, textAlign: "center" }}>
        <button 
          onClick={fetchData} 
          style={{
            ...purpleBtn,
            margin: "0 auto"
          }}
        >
          데이터 새로고침
        </button>
      </div>
    </div>
  );
}

AdminPanel.propTypes = {
  darkMode: PropTypes.bool
};

AdminPanel.defaultProps = {
  darkMode: false
};

export default AdminPanel;
