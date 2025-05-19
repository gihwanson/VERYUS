import React from "react";
import PropTypes from "prop-types";
import CustomLink from "./CustomLink";
import {
  containerStyle, darkContainerStyle, titleStyle
} from "../components/style";

function NotFound({ darkMode }) {
  return (
    <div style={darkMode ? darkContainerStyle : containerStyle}>
      <h1 style={titleStyle}>⚠️ 페이지를 찾을 수 없습니다</h1>
      <p>요청하신 페이지를 찾을 수 없습니다.</p>
      <CustomLink to="/" style={{ color: "#7e57c2", marginTop: 20, display: "inline-block" }}>
        🏠 홈으로 돌아가기
      </CustomLink>
    </div>
  );
}

NotFound.propTypes = {
  darkMode: PropTypes.bool
};

NotFound.defaultProps = {
  darkMode: false
};

export default NotFound;
