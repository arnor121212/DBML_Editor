import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/lib/theme";

export function Toaster() {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      offset={20}
      toastOptions={{
        classNames: {
          toast:
            "group toast border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
    />
  );
}
