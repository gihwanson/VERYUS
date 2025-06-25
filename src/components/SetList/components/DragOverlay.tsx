import React from 'react';
import type { DragData, Song, FlexibleCard } from '../types';

interface DragOverlayProps {
  dragData?: DragData;
  song?: Song;
  flexibleCard?: FlexibleCard;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({ dragData, song, flexibleCard }) => {
  if (!dragData || (!song && !flexibleCard)) return null;

  const isSong = dragData.type === 'song' && song;
  const isFlexibleCard = dragData.type === 'flexible' && flexibleCard;

  return (
    <div
      style={{
        position: 'fixed',
        left: dragData.x - 100,
        top: dragData.y - 60,
        width: '200px',
        height: '120px',
        background: isSong ? 
          'linear-gradient(135deg, #E5DAF5 0%, #F3E8FF 100%)' :
          'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        pointerEvents: 'none',
        transform: 'scale(1.1) rotate(5deg)',
        boxShadow: isSong ? 
          '0 20px 40px rgba(138, 85, 204, 0.6)' :
          '0 20px 40px rgba(245, 158, 11, 0.6)',
        opacity: 0.9,
        border: isSong ? '2px solid #8A55CC' : '2px solid #F59E0B'
      }}
    >
      <div style={{ 
        fontSize: '20px', 
        marginBottom: '8px', 
        color: isSong ? '#8A55CC' : '#92400E' 
      }}>
        {isSong ? '♪' : '🎤'}
      </div>
      <h4 style={{ 
        fontSize: '14px', 
        fontWeight: 600, 
        marginBottom: '6px',
        textAlign: 'center',
        color: isSong ? '#7C4DBC' : '#92400E',
        margin: '0 0 6px 0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%'
      }}>
        {isSong ? song!.title : `${flexibleCard!.nickname} (${flexibleCard!.totalSlots}곡)`}
      </h4>
      <p style={{ 
        fontSize: '12px', 
        textAlign: 'center',
        color: '#666',
        margin: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%'
      }}>
        {isSong ? 
          song!.members.join(', ') : 
          `${flexibleCard!.slots.filter(slot => slot.isCompleted).length} / ${flexibleCard!.totalSlots} 완료`
        }
      </p>
    </div>
  );
}; 