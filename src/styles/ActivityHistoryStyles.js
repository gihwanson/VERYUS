import styled from 'styled-components';
import { colors, typography, shadows, transitions, breakpoints } from './theme';

export const Container = styled.div`
  max-width: 100%;
  margin: 20px 0;
  padding: 24px;
  background: ${({ darkMode }) => darkMode ? '#333' : '#f3e7ff'};
  border-radius: 16px;
  border: 1px solid ${({ darkMode }) => darkMode ? '#555' : '#b49ddb'};
  color: ${({ darkMode }) => darkMode ? '#fff' : '#000'};
  line-height: 1.8;
  box-shadow: ${shadows.medium};
  transition: ${transitions.medium};

  @media (max-width: ${breakpoints.tablet}px) {
    padding: 20px;
    margin: 15px 0;
    border-radius: 14px;
  }

  @media (max-width: ${breakpoints.mobile}px) {
    padding: 16px;
    margin: 10px 0;
    border-radius: 12px;
    max-width: 100%;
  }
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;

  @media (max-width: ${breakpoints.mobile}px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
`;

export const Title = styled.h2`
  color: ${({ darkMode }) => darkMode ? '#bb86fc' : '#7e57c2'};
  margin-bottom: 16px;
  font-size: 24px;
  font-weight: 600;

  @media (max-width: ${breakpoints.mobile}px) {
    font-size: 20px;
    margin-bottom: 12px;
  }
`;

export const TextArea = styled.textarea`
  width: 100%;
  height: 300px;
  margin: 10px 0 15px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid ${({ darkMode }) => darkMode ? '#555' : '#ddd'};
  background: ${({ darkMode }) => darkMode ? '#222' : '#fff'};
  color: ${({ darkMode }) => darkMode ? '#fff' : '#000'};
  resize: vertical;
  font-size: 14px;
  line-height: 1.6;
  transition: ${transitions.medium};

  &:focus {
    outline: none;
    border-color: ${({ darkMode }) => darkMode ? '#bb86fc' : '#7e57c2'};
    box-shadow: 0 0 0 2px ${({ darkMode }) => darkMode ? 'rgba(187, 134, 252, 0.2)' : 'rgba(126, 87, 194, 0.2)'};
  }

  @media (max-width: ${breakpoints.mobile}px) {
    height: 250px;
  }
`;

export const PreviewText = styled.pre`
  white-space: pre-wrap;
  margin-top: 10px;
  padding: 15px;
  background: ${({ darkMode }) => darkMode ? '#222' : '#fff'};
  border-radius: 8px;
  color: ${({ darkMode }) => darkMode ? '#fff' : '#000'};
  border: 1px solid ${({ darkMode }) => darkMode ? '#444' : '#ddd'};
  max-height: 500px;
  overflow-y: auto;

  @media (max-width: ${breakpoints.mobile}px) {
    padding: 12px;
    border-radius: 6px;
    max-height: 300px;
  }
`;

export const Button = styled.button`
  background: ${({ darkMode }) => darkMode ? '#bb86fc' : '#7e57c2'};
  color: ${({ darkMode }) => darkMode ? '#000' : '#fff'};
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: ${transitions.medium};
  margin-top: 10px;

  &:hover {
    background: ${({ darkMode }) => darkMode ? '#9965f4' : '#6a1b9a'};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

export const ErrorMessage = styled.div`
  color: ${colors.error};
  background: ${({ darkMode }) => darkMode ? 'rgba(255, 82, 82, 0.1)' : 'rgba(255, 82, 82, 0.05)'};
  padding: 12px;
  border-radius: 8px;
  margin: 10px 0;
  font-size: 14px;
`;

export const LoadingSpinner = styled.div`
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid ${({ darkMode }) => darkMode ? '#bb86fc' : '#7e57c2'};
  border-radius: 50%;
  border-top-color: transparent;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`; 