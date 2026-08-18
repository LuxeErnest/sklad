import { useEffect, useState } from 'react';

const UniversalBackground = () => {
  const [currentTheme, setCurrentTheme] = useState<string>('dark');

  useEffect(() => {
    // Check current theme
    const checkTheme = () => {
      const root = document.documentElement;
      if (root.classList.contains('neoglass-theme')) {
        setCurrentTheme('neoglass');
      } else if (root.classList.contains('glassmorphism-theme')) {
        setCurrentTheme('glassmorphism');
      } else if (root.classList.contains('dark')) {
        setCurrentTheme('dark');
      } else {
        setCurrentTheme('light');
      }
    };

    // Check initially
    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  // Dark theme - custom gray gradient background
  if (currentTheme === 'dark') {
    return (
      <div className="absolute inset-0 -z-10 dark-custom-gradient" />
    );
  }

  // Light theme - purple to pink gradient background
  if (currentTheme === 'light') {
    return (
      <div className="absolute inset-0 -z-10 light-neutral-gradient" />
    );
  }

  // Glassmorphism theme - custom gray gradient (without drone for now)
  if (currentTheme === 'glassmorphism') {
    return (
      <div className="absolute inset-0 -z-10 glassmorphism-custom-gradient" />
    );
  }

  // NeoGlass theme - deeper blue glass gradient
  if (currentTheme === 'neoglass') {
    return (
      <div className="absolute inset-0 -z-10 neoglass-custom-gradient" />
    );
  }

  // Fallback
  return (
    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" />
  );
};

export default UniversalBackground;
