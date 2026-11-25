"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const cls = `h-[22px] w-[22px] ${active ? "text-accent" : "text-gray-400"}`;
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.3V20h13V9.3" />
          <path d="M10 20v-5.5h4V20" />
        </svg>
      );
    case "car":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <path d="M5.5 11 7 7.2A2 2 0 0 1 8.9 6h6.2a2 2 0 0 1 1.9 1.2L18.5 11" />
          <path d="M4.5 11h15a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1Z" />
          <circle cx="7.8" cy="19" r="1.5" />
          <circle cx="16.2" cy="19" r="1.5" />
        </svg>
      );
    case "guide":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <path d="M2.5 4.5h6a3.5 3.5 0 0 1 3.5 3.5v11a3 3 0 0 0-3-3h-6.5Z" />
          <path d="M21.5 4.5h-6A3.5 3.5 0 0 0 12 8v11a3 3 0 0 1 3-3h6.5Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5" />
          <rect x="3" y="7.5" width="18" height="11.5" rx="2.5" />
          <path d="M15.5 13.5h.01" strokeWidth="2.6" />
        </svg>
      );
    case "agent":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <path d="m12 2.8 2 1.7 2.6.4 1 2.4 2.1 1.6-.8 2.5.8 2.5-2.1 1.6-1 2.4-2.6.4-2 1.7-2-1.7-2.6-.4-1-2.4-2.1-1.6.8-2.5-.8-2.5L6.4 7.3l1-2.4 2.6-.4Z" />
          <path d="m9.4 12 1.8 1.8 3.4-3.7" />
        </svg>
      );
    case "admin":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <path d="M12 2.8 19 5.3v5.5c0 4.4-2.9 7.8-7 9.7-4.1-1.9-7-5.3-7-9.7V5.3Z" />
          <path d="m9.2 11.8 1.9 1.9 3.6-3.9" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5.5 20a6.8 6.8 0 0 1 13 0" />
        </svg>
      );
  }
}

function iconFor(href: string): string {
  if (href === "/") return "home";
  if (href === "/vehicules") return "car";
  if (href === "/comment-ca-marche") return "guide";
  if (href === "/espace") return "wallet";
  if (href === "/agent") return "agent";
  if (href === "/admin") return "admin";
  return "user";
}

export function MobileTabBar({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const items = tabs.slice(0, 5);
  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/95 shadow-tab backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((t) => {
          const active = isActive(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 text-[11px] font-medium transition-colors ${active ? "text-accent" : "text-gray-500 hover:text-ink"}`}
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${active ? "bg-accent-soft" : ""}`}>
                  <TabIcon name={iconFor(t.href)} active={active} />
                </span>
                <span className="max-w-full truncate">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
