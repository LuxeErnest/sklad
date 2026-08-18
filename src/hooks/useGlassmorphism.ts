import { useEffect } from 'react';

export const useGlassmorphism = () => {
  useEffect(() => {
    const applyGlassmorphismStyles = () => {
      const isGlassmorphism = document.documentElement.classList.contains('glassmorphism-theme');
      
      if (!isGlassmorphism) return;

      // Apply glassmorphism to all cards
      const cards = document.querySelectorAll('.card, [class*="card"]');
      cards.forEach(card => {
        const element = card as HTMLElement;
        element.style.background = 'rgba(30, 30, 30, 0.25)';
        element.style.backdropFilter = 'blur(20px)';
        // Вендорное свойство отсутствует в типах CSSStyleDeclaration,

        // поэтому задаётся штатным setProperty, а не присваиванием.

        element.style.setProperty('-webkit-backdrop-filter', 'blur(20px)');
        element.style.border = '1px solid rgba(255, 255, 255, 0.18)';
        element.style.borderRadius = '16px';
        element.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.37)';
      });

      // Apply glassmorphism to all buttons
      const buttons = document.querySelectorAll('button');
      buttons.forEach(button => {
        const element = button as HTMLElement;
        element.style.background = 'rgba(30, 30, 30, 0.25)';
        element.style.backdropFilter = 'blur(20px)';
        // Вендорное свойство отсутствует в типах CSSStyleDeclaration,

        // поэтому задаётся штатным setProperty, а не присваиванием.

        element.style.setProperty('-webkit-backdrop-filter', 'blur(20px)');
        element.style.border = '1px solid rgba(255, 255, 255, 0.18)';
        element.style.borderRadius = '12px';
        element.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.37)';
        element.style.color = 'rgba(255, 255, 255, 0.95)';
      });

      // Apply glassmorphism to all inputs
      const inputs = document.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        const element = input as HTMLElement;
        element.style.background = 'rgba(30, 30, 30, 0.25)';
        element.style.backdropFilter = 'blur(20px)';
        // Вендорное свойство отсутствует в типах CSSStyleDeclaration,

        // поэтому задаётся штатным setProperty, а не присваиванием.

        element.style.setProperty('-webkit-backdrop-filter', 'blur(20px)');
        element.style.border = '1px solid rgba(255, 255, 255, 0.18)';
        element.style.borderRadius = '12px';
        element.style.color = 'rgba(255, 255, 255, 0.95)';
      });

      // Apply glassmorphism to tables
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const element = table as HTMLElement;
        element.style.background = 'rgba(30, 30, 30, 0.25)';
        element.style.backdropFilter = 'blur(20px)';
        // Вендорное свойство отсутствует в типах CSSStyleDeclaration,

        // поэтому задаётся штатным setProperty, а не присваиванием.

        element.style.setProperty('-webkit-backdrop-filter', 'blur(20px)');
        element.style.border = '1px solid rgba(255, 255, 255, 0.18)';
        element.style.borderRadius = '16px';
        element.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.37)';
      });

      // Apply glassmorphism to sidebar
      const sidebar = document.querySelector('.sidebar, aside');
      if (sidebar) {
        const element = sidebar as HTMLElement;
        element.style.background = 'rgba(30, 30, 30, 0.25)';
        element.style.backdropFilter = 'blur(25px)';
        // Вендорное свойство отсутствует в типах CSSStyleDeclaration,

        // поэтому задаётся штатным setProperty, а не присваиванием.

        element.style.setProperty('-webkit-backdrop-filter', 'blur(25px)');
        element.style.borderRight = '1px solid rgba(255, 255, 255, 0.18)';
        element.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.37)';
      }

      // Apply glassmorphism to header
      const header = document.querySelector('header, .top-bar');
      if (header) {
        const element = header as HTMLElement;
        element.style.background = 'rgba(30, 30, 30, 0.25)';
        element.style.backdropFilter = 'blur(25px)';
        // Вендорное свойство отсутствует в типах CSSStyleDeclaration,

        // поэтому задаётся штатным setProperty, а не присваиванием.

        element.style.setProperty('-webkit-backdrop-filter', 'blur(25px)');
        element.style.borderBottom = '1px solid rgba(255, 255, 255, 0.18)';
        element.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.37)';
      }

      // console.log('Glassmorphism styles applied programmatically');
    };

    // Apply styles immediately
    applyGlassmorphismStyles();

    // Set up observer to watch for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          setTimeout(applyGlassmorphismStyles, 100);
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Apply styles periodically to catch new elements (less frequent)
    const interval = setInterval(applyGlassmorphismStyles, 3000);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);
};
