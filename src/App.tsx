import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "@/routes/Dashboard";
import { Login } from "@/routes/Login";
import { AuthCallback } from "@/routes/AuthCallback";
import { AcceptInvite } from "@/routes/AcceptInvite";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { ThemeProvider } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const SchemaEditor = lazy(() =>
  import("@/routes/SchemaEditor").then((m) => ({ default: m.SchemaEditor })),
);
const ProjectView = lazy(() =>
  import("@/routes/ProjectView").then((m) => ({ default: m.ProjectView })),
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

function ProjectFallback() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-primary/70" />
        Loading project…
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
                path="/p/:projectId"
                element={
                  <Suspense fallback={<ProjectFallback />}>
                    <ProjectView />
                  </Suspense>
                }
              />
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
              <Route path="/invite/:token" element={<AcceptInvite />} />
            </Routes>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
