import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/Colors';

type ColorScheme = 'light' | 'dark';

interface ThemeContextType {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
  colors: typeof Colors.light;
  isSystemTheme: boolean;
  setIsSystemTheme: (isSystem: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@hagee_theme_preference';
const SYSTEM_THEME_STORAGE_KEY = '@hagee_system_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>('light');
  const [isSystemTheme, setIsSystemThemeState] = useState(true);

  // Load saved theme preference on app start
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Update theme when system theme changes and user prefers system theme
  useEffect(() => {
    if (isSystemTheme && systemColorScheme) {
      setColorSchemeState(systemColorScheme);
    }
  }, [systemColorScheme, isSystemTheme]);

  const loadThemePreference = async () => {
    try {
      const [savedTheme, savedSystemPref] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(SYSTEM_THEME_STORAGE_KEY),
      ]);

      const useSystemTheme = savedSystemPref !== null ? JSON.parse(savedSystemPref) : true;
      setIsSystemThemeState(useSystemTheme);

      if (useSystemTheme) {
        setColorSchemeState(systemColorScheme || 'light');
      } else if (savedTheme) {
        setColorSchemeState(savedTheme as ColorScheme);
      }
    } catch (error) {
      console.error('Failed to load theme preference:', error);
    }
  };

  const setColorScheme = async (scheme: ColorScheme) => {
    try {
      setColorSchemeState(scheme);
      setIsSystemThemeState(false);
      await Promise.all([
        AsyncStorage.setItem(THEME_STORAGE_KEY, scheme),
        AsyncStorage.setItem(SYSTEM_THEME_STORAGE_KEY, JSON.stringify(false)),
      ]);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const setIsSystemTheme = async (isSystem: boolean) => {
    try {
      setIsSystemThemeState(isSystem);
      await AsyncStorage.setItem(SYSTEM_THEME_STORAGE_KEY, JSON.stringify(isSystem));
      
      if (isSystem && systemColorScheme) {
        setColorSchemeState(systemColorScheme);
      }
    } catch (error) {
      console.error('Failed to save system theme preference:', error);
    }
  };

  const toggleColorScheme = () => {
    const newScheme = colorScheme === 'light' ? 'dark' : 'light';
    setColorScheme(newScheme);
  };

  const colors = Colors[colorScheme];

  const value: ThemeContextType = {
    colorScheme,
    setColorScheme,
    toggleColorScheme,
    colors,
    isSystemTheme,
    setIsSystemTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
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
