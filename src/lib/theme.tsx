import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "dark" | "light" | "system";

type ThemeContext = {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (theme: Theme) => void;
};

const Ctx = createContext<ThemeContext | null>(null);

const STORAGE_KEY = "schemasync.theme";

function getSystemTheme(): "dark" | "light" {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? defaultTheme;
  });

  const [resolved, setResolved] = useState<"dark" | "light">(() =>
    theme === "system" ? getSystemTheme() : theme,
  );

  useEffect(() => {
    const apply = (t: "dark" | "light") => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(t);
      root.style.colorScheme = t;
      setResolved(t);
    };
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const listener = (e: MediaQueryListEvent) =>
        apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
    apply(theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeContext {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
