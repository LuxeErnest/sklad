import { useEffect, useState } from 'react';

const BackgroundImage = () => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isGlassmorphism, setIsGlassmorphism] = useState(false);

  useEffect(() => {
    // Check if glassmorphism theme is active
    const checkTheme = () => {
      const hasGlassmorphism = document.documentElement.classList.contains('glassmorphism-theme');
      setIsGlassmorphism(hasGlassmorphism);
    };

    // Check initially
    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Preload the image
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI4MDAiIHZpZXdCb3g9IjAgMCAxMjAwIDgwMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEyMDAiIGhlaWdodD0iODAwIiBmaWxsPSIjMDAwMDAwIi8+CjxyZWN0IHg9IjQwMCIgeT0iMjAwIiB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgcng9IjIwIiBmaWxsPSIjMTExMTExIi8+CjxyZWN0IHg9IjQ1MCIgeT0iMjUwIiB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgcng9IjE1IiBmaWxsPSIjMjIyMjIyIi8+CjxyZWN0IHg9IjUwMCIgeT0iMzAwIiB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgcng9IjEwIiBmaWxsPSIjMzMzMzMzIi8+CjxyZWN0IHg9IjUyNSIgeT0iMzI1IiB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgcng9IjgiIGZpbGw9IiM0NDQ0NDQiLz4KPHJlY3QgeD0iNTUwIiB5PSIzNTAiIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiByeD0iNSIgZmlsbD0iIzU1NTU1NSIvPgo8Y2lyY2xlIGN4PSI2MDAiIGN5PSI0MDAiIHI9IjMwIiBmaWxsPSIjNjY2NjY2Ii8+CjxjaXJjbGUgY3g9IjYwMCIgY3k9IjQwMCIgcj0iMjAiIGZpbGw9IiM3Nzc3NzciLz4KPHJlY3QgeD0iNTkwIiB5PSIzOTAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcng9IjMiIGZpbGw9IiM4ODg4ODgiLz4KPHJlY3QgeD0iNTkwIiB5PSIzOTAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgcng9IjMiIGZpbGw9IiM5OTk5OTkiLz4KPC9zdmc+';

    return () => observer.disconnect();
  }, []);

  // Only show drone background for glassmorphism theme
  if (!isGlassmorphism) {
    return null;
  }

  if (!imageLoaded) {
    return (
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-gray-900 via-gray-800 to-black" />
    );
  }

  return (
    <div className="absolute inset-0 -z-10">
      {/* Background image with dark overlay and blur */}
      <div className="absolute inset-0 bg-cover bg-center bg-no-repeat background-drone" />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-black/20 to-black/40" />
    </div>
  );
};

export default BackgroundImage;
