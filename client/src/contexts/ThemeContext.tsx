import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type ThemeMode = 'normal' | 'stealth';

interface ThemeContextType {
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        // Load from localStorage or default to 'normal'
        const saved = localStorage.getItem('boardgame-theme');
        return (saved as ThemeMode) || 'normal';
    });

    useEffect(() => {
        localStorage.setItem('boardgame-theme', theme);
        // Add class to body for global styling
        document.body.className = `theme-${theme}`;
    }, [theme]);

    const setTheme = (newTheme: ThemeMode) => {
        setThemeState(newTheme);
    };

    const toggleTheme = () => {
        setThemeState(prev => prev === 'normal' ? 'stealth' : 'normal');
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
