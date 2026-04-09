import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

const icons = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const Icon = icons[theme];

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center justify-center w-8 h-8 rounded-lg text-wo-text-secondary hover:bg-wo-bg-subtle transition-colors"
      title={`Theme: ${theme}`}
    >
      <Icon size={16} />
    </button>
  );
}
