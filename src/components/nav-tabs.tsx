"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Variant = "pills" | "sidebar";

export function NavTabs({ links, ariaLabel, variant = "pills" }: { links: [string, string][]; ariaLabel: string; variant?: Variant }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "sidebar") {
    return (
      <nav aria-label={ariaLabel} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 py-1 lg:mx-0 lg:flex-col lg:gap-1.5 lg:px-0">
        {links.map(([href, label]) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-accent-soft text-ink ring-1 ring-inset ring-accent/25" : "text-gray-600 hover:bg-white hover:text-ink"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label={ariaLabel} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
      {links.map(([href, label]) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset transition ${active ? "bg-ink text-white shadow-sm ring-ink" : "bg-white text-gray-600 ring-line hover:bg-paper hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
