export const colors = {
  primary: '#6200ee',
  primaryLight: '#9747FF',
  primaryDark: '#4a0072',
  secondary: '#03dac6',
  secondaryDark: '#018786',
  error: '#b00020',
  success: '#4caf50',
  warning: '#ff9800',
  info: '#2196f3',
  text: '#1a1a1a',
  textSecondary: '#666666',
  background: '#f8f9fa',
  surface: '#ffffff',
  surfaceHighlight: '#f8f9fa',
  border: '#e0e0e0',
  inputBg: '#ffffff'
};

export const lightTheme = {
  ...colors,
  mode: 'light'
};

export const darkTheme = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceHighlight: '#2c2c2c',
  primary: '#bb86fc',
  primaryLight: '#d7b7fc',
  primaryDark: '#9965f4',
  secondary: '#03dac6',
  secondaryDark: '#018786',
  text: '#ffffff',
  textSecondary: '#b3b3b3',
  border: '#333333',
  inputBg: '#2c2c2c',
  error: '#cf6679',
  success: '#4caf50',
  warning: '#ff9800',
  info: '#2196f3',
  mode: 'dark'
};

export const shadows = {
  small: '0 2px 4px rgba(0,0,0,0.05)',
  medium: '0 4px 6px rgba(0,0,0,0.07)',
  large: '0 8px 16px rgba(0,0,0,0.1)',
  focus: '0 0 0 3px rgba(98, 0, 238, 0.2)'
};

export const transitions = {
  fast: 'all 0.2s ease',
  medium: 'all 0.3s ease',
  slow: 'all 0.4s ease'
};

export const breakpoints = {
  mobile: 576,
  tablet: 768,
  desktop: 992,
  wide: 1200
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px'
};

export const typography = {
  fontFamily: {
    primary: "'Pretendard Variable', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif",
    code: "'JetBrains Mono', monospace"
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '24px',
    xxl: '32px'
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    loose: 1.8
  }
}; 