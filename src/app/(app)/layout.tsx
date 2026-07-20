import { StoreProvider } from "@/lib/store";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";

/** The signed-in app: sidebar, tooltips, and the store behind them. */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <StoreProvider>
      <TooltipProvider delay={200}>
        <AppShell>{children}</AppShell>
      </TooltipProvider>
    </StoreProvider>
  );
}
