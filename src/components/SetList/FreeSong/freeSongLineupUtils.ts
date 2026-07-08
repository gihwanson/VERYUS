import type { FreeSongLineupItem, FreeSongLineupItemKind } from './types';

export type FreeSongManualLineupKind = Extract<
  FreeSongLineupItemKind,
  'request' | 'openMic' | 'other' | 'custom'
>;

export function isManualLineupItem(item: FreeSongLineupItem): boolean {
  return (
    item.kind === 'request' ||
    item.kind === 'openMic' ||
    item.kind === 'other' ||
    item.kind === 'custom'
  );
}

export function createManualLineupId(): string {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseMemberInput(raw: string): string[] {
  return raw
    .split(/[,，、/·|\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getDefaultManualTitle(kind: FreeSongManualLineupKind): string {
  switch (kind) {
    case 'request':
      return '신청곡';
    case 'openMic':
      return '오픈마이크';
    default:
      return '';
  }
}

export function requiresManualTitleInput(kind: FreeSongManualLineupKind): boolean {
  return kind === 'other' || kind === 'custom';
}
