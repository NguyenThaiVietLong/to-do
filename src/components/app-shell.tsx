"use client";

import { createContext, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useTheme } from "@/components/theme-provider";
import { SMART_LISTS } from "@/lib/selectors";
import type { ViewId } from "@/lib/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/* -------------------------------------------------------------------------- */
/* Which list the task page is showing. Lives in the layout so it survives a    */
/* trip to the dashboard and back.                                             */
/* -------------------------------------------------------------------------- */

interface ViewValue {
  view: ViewId;
  setView: (v: ViewId) => void;
  query: string;
  setQuery: (q: string) => void;
}

const ViewContext = createContext<ViewValue | null>(null);

export function useView(): ViewValue {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useView must be used inside <AppShell>");
  return ctx;
}

/* -------------------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<ViewId>("myday");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false); // mobile drawer
  const value = useMemo(() => ({ view, setView, query, setQuery }), [view, query]);

  return (
    <ViewContext.Provider value={value}>
      <div className="flex h-full">
        {/* Scrim — only on small screens, only when the drawer is open. */}
        {open && (
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
          />
        )}

        <Sidebar open={open} onClose={() => setOpen(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="m-2 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
    </ViewContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lists, tasks, addList, deleteList, ready } = useStore();
  const { view, setView, query, setQuery } = useView();
  const { resolved, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Counts mirror what each view actually renders: open tasks, except for
  // Completed, where the whole point is the finished ones.
  const countFor = (id: ViewId): number => {
    switch (id) {
      case "myday":
        return tasks.filter((t) => t.myDay && !t.completed).length;
      case "important":
        return tasks.filter((t) => t.important && !t.completed).length;
      case "planned":
        return tasks.filter((t) => t.dueDate && !t.completed).length;
      case "all":
        return tasks.filter((t) => !t.completed).length;
      case "completed":
        return tasks.filter((t) => t.completed).length;
      default:
        return tasks.filter((t) => t.listId === id && !t.completed).length;
    }
  };

  const go = (id: ViewId) => {
    setView(id);
    if (pathname !== "/") router.push("/");
    onClose();
  };

  const submitList = () => {
    const name = newName.trim();
    if (name) go(addList(name));
    setNewName("");
    setAdding(false);
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      {/* Account row */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          H
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Hoang</p>
          <p className="truncate text-xs text-muted-foreground">
            hoang@example.com
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent md:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => pathname !== "/" && router.push("/")}
            placeholder="Search"
            aria-label="Search tasks"
            className="h-9 w-full rounded-md border border-transparent bg-sidebar-accent/60 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>
      </div>

      <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <ul className="space-y-0.5">
          {SMART_LISTS.map((s) => (
            <SidebarRow
              key={s.id}
              icon={<span aria-hidden>{s.icon}</span>}
              label={s.name}
              count={ready ? countFor(s.id) : 0}
              active={pathname === "/" && view === s.id}
              onClick={() => go(s.id)}
            />
          ))}
        </ul>

        <hr className="my-2 border-sidebar-border" />

        <ul className="space-y-0.5">
          {lists.map((l) => (
            <SidebarRow
              key={l.id}
              icon={<span aria-hidden>{l.icon}</span>}
              label={l.name}
              count={ready ? countFor(l.id) : 0}
              active={pathname === "/" && view === l.id}
              onClick={() => go(l.id)}
              onDelete={
                lists.length > 1
                  ? () => {
                      deleteList(l.id);
                      if (view === l.id) setView("myday");
                    }
                  : undefined
              }
            />
          ))}
        </ul>

        {adding ? (
          <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5">
            <Plus className="size-4 shrink-0 text-primary" />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={submitList}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitList();
                if (e.key === "Escape") {
                  setNewName("");
                  setAdding(false);
                }
              }}
              placeholder="List name"
              aria-label="New list name"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="mt-1 flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Plus className="size-4" />
            New list
          </button>
        )}
      </nav>

      {/* Footer: roadmap + dashboard + theme */}
      <div className="flex items-center gap-1 border-t border-sidebar-border p-2">
        <Link
          href="/roadmap"
          onClick={onClose}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
            pathname === "/roadmap"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <Target className="size-4" />
          Roadmap
        </Link>
        <Link
          href="/dashboard"
          onClick={onClose}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
            pathname === "/dashboard"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <BarChart3 className="size-4" />
          Dashboard
        </Link>
        <Tooltip>
          <TooltipTrigger
            onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
            aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </TooltipTrigger>
          <TooltipContent>
            {resolved === "dark" ? "Light theme" : "Dark theme"}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

function SidebarRow({
  icon,
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className="group/row relative">
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-3 rounded-md py-2 pr-2 pl-2 text-left text-sm transition-colors",
          active
            ? "bg-accent font-medium text-accent-foreground"
            : "hover:bg-sidebar-accent",
        )}
      >
        <span className="grid size-4 shrink-0 place-items-center text-[13px] leading-none">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums group-hover/row:opacity-0">
            {count}
          </span>
        )}
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Delete list ${label}`}
          className="absolute top-1/2 right-1 hidden -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover/row:block"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </li>
  );
}
