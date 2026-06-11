const STORAGE_KEY = 'veryus_last_game_id';

export const setLastPlayedGame = (gameId: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, gameId);
  } catch {
    /* ignore */
  }
};

export const getLastPlayedGame = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
