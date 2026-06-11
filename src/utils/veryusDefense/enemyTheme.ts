import type { DefenseUnit } from './constants';

export type EnemyInstrumentId =
  | 'tambourine'
  | 'castanet'
  | 'triangle'
  | 'maraca'
  | 'claves'
  | 'bell';

export const ENEMY_BASE = {
  label: '탬버린 요새',
  subtitle: '리듬 군단 본부',
} as const;

const INSTRUMENTS: Array<{ id: EnemyInstrumentId; label: string; emoji: string }> = [
  { id: 'tambourine', label: '미니 탬버린', emoji: '🪘' },
  { id: 'castanet', label: '캐스터네츠', emoji: '🪇' },
  { id: 'triangle', label: '트라이앵글', emoji: '🔺' },
  { id: 'maraca', label: '마라카스', emoji: '🪇' },
  { id: 'claves', label: '클라베스', emoji: '🪵' },
  { id: 'bell', label: '징', emoji: '🔔' },
];

const hashUnitId = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
};

export type EnemyInstrumentVisual = {
  id: EnemyInstrumentId;
  label: string;
  emoji: string;
  size: 'sm' | 'md' | 'lg';
};

export function getEnemyInstrumentVisual(unit: Pick<DefenseUnit, 'id' | 'nickname' | 'isBoss'>): EnemyInstrumentVisual {
  if (unit.isBoss) {
    return { id: 'tambourine', label: '대형 탬버린', emoji: '🪘', size: 'lg' };
  }

  const fromName = INSTRUMENTS.find(
    (item) =>
      unit.nickname.includes(item.label) ||
      unit.nickname.includes(item.label.replace('미니 ', ''))
  );
  if (fromName) {
    return { ...fromName, size: 'sm' };
  }

  const picked = INSTRUMENTS[hashUnitId(unit.id) % INSTRUMENTS.length];
  return { ...picked, size: 'sm' };
}

export const ENEMY_INSTRUMENT_LIST = INSTRUMENTS;
