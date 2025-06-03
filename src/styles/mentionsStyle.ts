const mentionsStyle = {
  control: {
    backgroundColor: '#fff',
    fontSize: 14,
    borderRadius: 12,
    border: '2px solid #E5E7EB',
    padding: 16,
    minHeight: 100,
    color: '#1F2937',
  },
  highlighter: {
    overflow: 'hidden',
  },
  input: {
    margin: 0,
    minHeight: 100,
    outline: 0,
    border: 0,
    width: '100%',
    background: 'transparent',
    color: '#1F2937',
  },
  suggestions: {
    list: {
      backgroundColor: '#fff',
      border: '1px solid #E5E7EB',
      fontSize: 14,
      borderRadius: 8,
      zIndex: 100,
      boxShadow: '0 2px 8px rgba(124,58,237,0.08)',
    },
    item: {
      padding: '8px 16px',
      borderBottom: '1px solid #F3F4F6',
      color: '#1F2937',
      cursor: 'pointer',
    },
    itemFocused: {
      backgroundColor: '#F6F2FF',
      color: '#8A55CC',
    },
  },
};

export default mentionsStyle; 