import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Palette, Moon, Sun, Sparkles, Stars } from 'lucide-react';
// import { useGlassmorphism } from '@/hooks/useGlassmorphism';

type Theme = 'dark' | 'light' | 'glassmorphism' | 'neoglass';

const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>('dark');
  
  // useGlassmorphism hook disabled for now

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove('dark', 'glassmorphism-theme', 'neoglass-theme');
    
    // Apply new theme
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else if (newTheme === 'glassmorphism') {
      root.classList.add('glassmorphism-theme');
    } else if (newTheme === 'neoglass') {
      root.classList.add('neoglass-theme');
    }
    // Light theme - no classes needed, uses default styles
  };

  const toggleTheme = () => {
    const newTheme =
      theme === 'dark'
        ? 'light'
        : theme === 'light'
        ? 'glassmorphism'
        : theme === 'glassmorphism'
        ? 'neoglass'
        : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const getThemeIcon = () => {
    switch (theme) {
      case 'dark':
        return <Moon className="h-4 w-4" />;
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'glassmorphism':
        return <Sparkles className="h-4 w-4" />;
      case 'neoglass':
        return <Stars className="h-4 w-4" />;
      default:
        return <Moon className="h-4 w-4" />;
    }
  };

  const getThemeLabel = () => {
    switch (theme) {
      case 'dark':
        return 'Темная';
      case 'light':
        return 'Светлая';
      case 'glassmorphism':
        return 'Glassmorphism';
      case 'neoglass':
        return 'NeoGlass';
      default:
        return 'Темная';
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="gap-2"
    >
      {getThemeIcon()}
      {getThemeLabel()}
    </Button>
  );
};

export default ThemeToggle;