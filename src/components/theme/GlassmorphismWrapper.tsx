import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassmorphismWrapperProps {
  children: ReactNode;
  className?: string;
  variant?: 'card' | 'button' | 'input' | 'dialog' | 'table' | 'sidebar' | 'topbar';
  hover?: boolean;
  glow?: boolean;
  shimmer?: boolean;
}

const GlassmorphismWrapper = ({ 
  children, 
  className, 
  variant = 'card',
  hover = false,
  glow = false,
  shimmer = false
}: GlassmorphismWrapperProps) => {
  const baseClasses = 'glassmorphism-theme';
  
  const variantClasses = {
    card: 'glass-card',
    button: 'glass-button',
    input: 'glass-input',
    dialog: 'glass-dialog',
    table: 'glass-table',
    sidebar: 'glass-sidebar',
    topbar: 'glass-topbar',
  };

  const effectClasses = [
    hover && 'glass-hover',
    glow && 'glass-glow',
    shimmer && 'glass-shimmer',
  ].filter(Boolean);

  return (
    <div className={cn(
      baseClasses,
      variantClasses[variant],
      effectClasses,
      className
    )}>
      {children}
    </div>
  );
};

export default GlassmorphismWrapper;
