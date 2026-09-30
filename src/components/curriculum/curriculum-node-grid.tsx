"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { staggerContainer, staggerItem } from "@/lib/ui/motion";

export interface CurriculumNodeCardData {
  id: string;
  title: string;
  href?: string;
  subtitle?: string;
  badge?: string;
}

export function CurriculumNodeGrid({
  items,
}: {
  items: CurriculumNodeCardData[];
}) {
  return (
    <div className="flex w-full flex-col border-t border-[var(--color-border)]">
      {items.map((item, index) => {
        const num = (index + 1).toString().padStart(2, "0");
        return (
          <div
            key={item.id}

            className="group relative flex flex-col gap-4 border-b border-[var(--color-border)] py-6 transition-colors hover:bg-[var(--color-subtle)] sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="pl-4 text-[length:var(--text-meta)] font-semibold text-[var(--color-ink-faint)] sm:w-8">
              {num}.
            </div>
            <div className="flex flex-1 flex-col px-4 sm:px-0">
              <p className="text-[length:var(--text-title)] font-medium tracking-tight text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-learning)]">
                {item.title}
              </p>
              {item.subtitle ? (
                <p className="mt-1 text-[length:var(--text-body)] text-[var(--color-ink-muted)]">
                  {item.subtitle}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-6 px-4 sm:justify-end sm:pr-6">
              {item.badge ? <Badge tone="neutral">{item.badge}</Badge> : null}
              {item.href ? (
                <span className="hidden text-[length:var(--text-meta)] font-medium text-[var(--color-learning)] opacity-0 transition-opacity group-hover:opacity-100 sm:block">
                  Explore ➔
                </span>
              ) : null}
            </div>

            {item.href ? (
              <Link href={item.href} className="absolute inset-0 z-10">
                <span className="sr-only">Explore {item.title}</span>
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
