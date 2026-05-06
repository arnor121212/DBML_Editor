import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "@/routes/Dashboard";
import { Login } from "@/routes/Login";
import { AuthCallback } from "@/routes/AuthCallback";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const SchemaEditor = lazy(() =>
  import("@/routes/SchemaEditor").then((m) => ({ default: m.SchemaEditor })),
);

function EditorFallback() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-primary/70" />
        Loading editor…
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route
                path="/s/:id"
                element={
                  <Suspense fallback={<EditorFallback />}>
                    <SchemaEditor />
                  </Suspense>
                }
              />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
            </Routes>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
