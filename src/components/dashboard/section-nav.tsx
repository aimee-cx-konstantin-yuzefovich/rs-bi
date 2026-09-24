"use client";

// src/components/dashboard/section-nav.tsx
// Top-level «Сделки | Компании | Образцы» navigation — the three first-class
// analytical sections of the BI terminal. Rendered inside the main header
// on `/` and as a compact tab row on the /companies and /pages mini-headers.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake, Building2, FlaskConical } from "lucide-react";

const SECTIONS = [
  { href: "/", label: "Сделки", icon: Handshake },
  { href: "/companies", label: "Компании", icon: Building2 },
  { href: "/samples", label: "Образцы", icon: FlaskConical },
] as const;

export function SectionNav({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (variant === "dark") {
    return (
      <nav aria-label="Разделы" className="flex items-center gap-0.5 rounded-md bg-white/[0.07] p-0.5">
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Разделы" className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5">
      {SECTIONS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
