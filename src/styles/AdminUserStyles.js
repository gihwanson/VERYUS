import styled from 'styled-components';
import { breakpoints, shadows, transitions, typography } from './theme';

export const Container = styled.div`
  padding: ${({ theme }) => theme.spacing?.lg || '24px'};
  background: ${({ theme }) => theme.background || '#f8f9fa'};
  min-height: 100vh;
  
  @media (max-width: ${breakpoints.mobile}px) {
    padding: ${({ theme }) => theme.spacing?.md || '16px'};
  }
`;

export const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing?.xl || '32px'};
  background: ${({ theme }) => theme.surface || '#ffffff'};
  padding: ${({ theme }) => theme.spacing?.lg || '24px'};
  border-radius: 12px;
  box-shadow: ${shadows.small};
  
  @media (max-width: ${breakpoints.mobile}px) {
    flex-direction: column;
    align-items: stretch;
    gap: ${({ theme }) => theme.spacing?.md || '16px'};
    padding: ${({ theme }) => theme.spacing?.md || '16px'};
  }
`;

export const Title = styled.h1`
  color: ${({ theme }) => theme.text};
  margin: 0;
  font-size: ${typography.fontSize.xl};
  font-weight: ${typography.fontWeight.semibold};
  font-family: ${typography.fontFamily.primary};
  
  @media (max-width: ${breakpoints.mobile}px) {
    font-size: ${typography.fontSize.lg};
  }
`;

export const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing?.md || '16px'};
  align-items: center;
  flex-wrap: wrap;
  
  @media (max-width: ${breakpoints.mobile}px) {
    gap: ${({ theme }) => theme.spacing?.sm || '8px'};
  }
`;

export const SearchInput = styled.input`
  padding: ${({ theme }) => theme.spacing?.sm || '8px'} ${({ theme }) => theme.spacing?.md || '16px'};
  border: 1px solid ${({ theme }) => theme.border || '#e0e0e0'};
  border-radius: 8px;
  background: ${({ theme }) => theme.inputBg || '#ffffff'};
  color: ${({ theme }) => theme.text || '#1a1a1a'};
  min-width: 240px;
  font-size: ${typography.fontSize.md};
  transition: ${transitions.fast};
  
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || '#6200ee'};
    box-shadow: ${shadows.focus};
  }
  
  &::placeholder {
    color: ${({ theme }) => theme.textSecondary || '#666666'};
  }
  
  @media (max-width: ${breakpoints.mobile}px) {
    width: 100%;
    min-width: unset;
    font-size: ${typography.fontSize.sm};
  }
`;

export const Table = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  overflow: hidden;
  background: ${({ theme }) => theme.surface};
  box-shadow: ${shadows.small};
  margin-top: ${({ theme }) => theme.spacing?.xl || '32px'};
  
  @media (max-width: ${breakpoints.mobile}px) {
    border: none;
    background: transparent;
    box-shadow: none;
    margin-top: ${({ theme }) => theme.spacing?.lg || '24px'};
  }
`;

export const TableHeader = styled.div`
  display: grid;
  grid-template-columns: 50px 1.5fr 1.5fr 120px 120px 120px;
  padding: 16px;
  background: ${({ theme }) => theme.surfaceHighlight};
  font-weight: ${typography.fontWeight.semibold};
  color: ${({ theme }) => theme.text};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  
  @media (max-width: ${breakpoints.mobile}px) {
    display: none;
  }
`;

export const TableRow = styled.div`
  display: grid;
  grid-template-columns: 50px 1.5fr 1.5fr 120px 120px 120px;
  padding: ${({ theme }) => theme.spacing?.md || '16px'};
  border-bottom: 1px solid ${({ theme }) => theme.border || '#e0e0e0'};
  align-items: center;
  transition: ${transitions.fast};
  
  &:hover {
    background: ${({ theme }) => theme.surfaceHighlight || '#f8f9fa'};
  }
  
  &:last-child {
    border-bottom: none;
  }
  
  @media (max-width: ${breakpoints.mobile}px) {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing?.sm || '12px'};
    background: ${({ theme }) => theme.surface || '#ffffff'};
    margin-bottom: ${({ theme }) => theme.spacing?.sm || '12px'};
    border-radius: 8px;
    padding: ${({ theme }) => theme.spacing?.lg || '20px'};
    box-shadow: ${shadows.small};
    
    > * {
      width: 100%;
    }
  }
`;

export const Cell = styled.div`
  font-size: ${typography.fontSize.md};
  color: ${({ theme }) => theme.text || '#1a1a1a'};
  
  @media (max-width: ${breakpoints.mobile}px) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ${({ theme }) => theme.spacing?.xs || '4px'} 0;
    
    &::before {
      content: attr(data-label);
      font-weight: ${typography.fontWeight.semibold};
      color: ${({ theme }) => theme.textSecondary || '#666666'};
      margin-right: ${({ theme }) => theme.spacing?.sm || '8px'};
    }
  }
`;

export const Button = styled.button`
  padding: ${({ theme }) => theme.spacing?.sm || '8px'} ${({ theme }) => theme.spacing?.md || '16px'};
  border: none;
  border-radius: 8px;
  background: ${({ theme, variant }) => 
    variant === 'secondary' ? theme.secondary || '#03dac6' : theme.primary || '#6200ee'};
  color: white;
  cursor: pointer;
  font-weight: ${typography.fontWeight.medium};
  font-size: ${typography.fontSize.md};
  transition: ${transitions.fast};
  white-space: nowrap;
  
  &:hover:not(:disabled) {
    background: ${({ theme, variant }) => 
      variant === 'secondary' ? theme.secondaryDark || '#018786' : theme.primaryDark || '#4a0072'};
    transform: translateY(-1px);
  }
  
  &:active:not(:disabled) {
    transform: translateY(0);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${({ theme }) => theme.textSecondary || '#666666'};
  }
  
  @media (max-width: ${breakpoints.mobile}px) {
    width: 100%;
    font-size: ${typography.fontSize.sm};
    padding: ${({ theme }) => theme.spacing?.xs || '4px'} ${({ theme }) => theme.spacing?.sm || '8px'};
  }
`;

export const Select = styled.select`
  padding: ${({ theme }) => theme.spacing?.sm || '8px'} ${({ theme }) => theme.spacing?.md || '16px'};
  border: 1px solid ${({ theme }) => theme.border || '#e0e0e0'};
  border-radius: 8px;
  background: ${({ theme }) => theme.inputBg || '#ffffff'};
  color: ${({ theme }) => theme.text || '#1a1a1a'};
  font-size: ${typography.fontSize.md};
  transition: ${transitions.fast};
  cursor: pointer;
  min-width: 120px;
  
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.primary || '#6200ee'};
    box-shadow: ${shadows.focus};
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: ${({ theme }) => theme.textSecondary || '#666666'};
  }
  
  @media (max-width: ${breakpoints.mobile}px) {
    width: 100%;
    font-size: ${typography.fontSize.sm};
    padding: ${({ theme }) => theme.spacing?.xs || '4px'} ${({ theme }) => theme.spacing?.sm || '8px'};
  }
`;

export const Modal = styled.div`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: ${({ theme }) => theme.surface || '#ffffff'};
  padding: ${({ theme }) => theme.spacing?.xl || '24px'};
  border-radius: 12px;
  box-shadow: ${shadows.large};
  max-width: 90%;
  width: 500px;
  
  @media (max-width: ${breakpoints.mobile}px) {
    width: 95%;
    padding: ${({ theme }) => theme.spacing?.lg || '20px'};
  }
`;

export const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const Alert = styled.div`
  padding: ${({ theme }) => theme.spacing?.md || '16px'};
  border-radius: 8px;
  margin-bottom: ${({ theme }) => theme.spacing?.md || '16px'};
  font-weight: ${typography.fontWeight.medium};
  background: ${({ type, theme }) => {
    switch (type) {
      case 'error':
        return `${theme.error || '#b00020'}15`;
      case 'success':
        return `${theme.success || '#4caf50'}15`;
      case 'warning':
        return `${theme.warning || '#ff9800'}15`;
      default:
        return `${theme.info || '#2196f3'}15`;
    }
  }};
  color: ${({ type, theme }) => {
    switch (type) {
      case 'error':
        return theme.error || '#b00020';
      case 'success':
        return theme.success || '#4caf50';
      case 'warning':
        return theme.warning || '#ff9800';
      default:
        return theme.info || '#2196f3';
    }
  }};
  
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing?.sm || '12px'};
  
  &::before {
    content: ${({ type }) => {
      switch (type) {
        case 'error':
          return '"⚠️"';
        case 'success':
          return '"✅"';
        case 'warning':
          return '"⚡"';
        default:
          return '"ℹ️"';
      }
    }};
  }
`;