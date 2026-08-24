'use client';

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

type ThemeSnapshot = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
};

const THEME_STORAGE_KEY = 'theme';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';
const SERVER_SNAPSHOT: ThemeSnapshot = {
  theme: 'system',
  resolvedTheme: 'light',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const listeners = new Set<() => void>();
let cachedClientSnapshot: ThemeSnapshot | undefined;

function isTheme(value: string | undefined | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemPreference(): ResolvedTheme {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
}

function getDocumentTheme(): Theme {
  const documentTheme = document.documentElement.dataset.theme;
  if (isTheme(documentTheme)) return documentTheme;

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
  } catch {
    // Storage may be unavailable in private browsing or embedded previews.
  }

  return 'system';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemPreference() : theme;
}

function applyThemeToDocument(theme: Theme): ResolvedTheme {
  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}

function persistTheme(theme: Theme) {
  try {
    if (theme === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Keep the in-page preference working even when storage is unavailable.
  }
}

function emitThemeChange() {
  cachedClientSnapshot = undefined;
  listeners.forEach((listener) => listener());
}

function updateTheme(theme: Theme) {
  persistTheme(theme);
  applyThemeToDocument(theme);
  emitThemeChange();
}

function getClientSnapshot(): ThemeSnapshot {
  const theme = getDocumentTheme();
  const resolvedTheme = document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light';

  if (
    cachedClientSnapshot?.theme === theme &&
    cachedClientSnapshot.resolvedTheme === resolvedTheme
  ) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = { theme, resolvedTheme };
  return cachedClientSnapshot;
}

function getServerSnapshot(): ThemeSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribeToTheme(listener: () => void) {
  listeners.add(listener);

  const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  const handleSystemThemeChange = () => {
    if (getDocumentTheme() !== 'system') return;
    applyThemeToDocument('system');
    emitThemeChange();
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;

    const theme = event.newValue === 'light' || event.newValue === 'dark'
      ? event.newValue
      : 'system';
    applyThemeToDocument(theme);
    emitThemeChange();
  };

  // Reconcile with the bootstrap script in case the system preference changed
  // in the short window before React subscribed.
  applyThemeToDocument(getDocumentTheme());
  mediaQuery.addEventListener('change', handleSystemThemeChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    listeners.delete(listener);
    mediaQuery.removeEventListener('change', handleSystemThemeChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme, resolvedTheme } = useSyncExternalStore(
    subscribeToTheme,
    getClientSnapshot,
    getServerSnapshot,
  );

  const setTheme = useCallback((newTheme: Theme) => {
    updateTheme(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    updateTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
