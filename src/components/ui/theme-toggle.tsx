import * as React from "react"
import { Moon, Sun, Sparkles } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const applyGlass = React.useCallback((enable: boolean) => {
    const root = document.documentElement
    if (!root) return
    if (enable) {
      root.classList.add('glassmorphism-theme')
      root.style.setProperty('--background', 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)')
      root.style.setProperty('--foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--card', 'rgba(20, 20, 20, 0.8)')
      root.style.setProperty('--card-foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--popover', 'rgba(20, 20, 20, 0.9)')
      root.style.setProperty('--popover-foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--primary', 'rgba(99, 102, 241, 0.8)')
      root.style.setProperty('--primary-foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--secondary', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--secondary-foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--muted', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--muted-foreground', 'rgba(255, 255, 255, 0.6)')
      root.style.setProperty('--accent', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--accent-foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--destructive', 'rgba(239, 68, 68, 0.8)')
      root.style.setProperty('--destructive-foreground', 'rgba(255, 255, 255, 0.9)')
      root.style.setProperty('--border', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--input', 'rgba(255, 255, 255, 0.1)')
      root.style.setProperty('--ring', 'rgba(99, 102, 241, 0.5)')
    } else {
      root.classList.remove('glassmorphism-theme')
      root.style.removeProperty('--background')
      root.style.removeProperty('--foreground')
      root.style.removeProperty('--card')
      root.style.removeProperty('--card-foreground')
      root.style.removeProperty('--popover')
      root.style.removeProperty('--popover-foreground')
      root.style.removeProperty('--primary')
      root.style.removeProperty('--primary-foreground')
      root.style.removeProperty('--secondary')
      root.style.removeProperty('--secondary-foreground')
      root.style.removeProperty('--muted')
      root.style.removeProperty('--muted-foreground')
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-foreground')
      root.style.removeProperty('--destructive')
      root.style.removeProperty('--destructive-foreground')
      root.style.removeProperty('--border')
      root.style.removeProperty('--input')
      root.style.removeProperty('--ring')
    }
  }, [])

  React.useEffect(() => {
    applyGlass(theme === 'glass')
  }, [theme, applyGlass])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Переключить тему</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Светлая
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Темная
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("glass")}>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Glassmorphism</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
