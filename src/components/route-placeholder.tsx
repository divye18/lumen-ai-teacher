"use client";

import { motion } from "framer-motion";

/**
 * Minimal placeholder shown on the scaffolded routes during the foundation
 * phase. Real screens are built in later phases.
 */
export function RoutePlaceholder({
  route,
  description,
}: {
  route: string;
  description: string;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col items-center gap-3"
      >
        <span className="text-xs font-medium tracking-widest text-zinc-400 uppercase">
          Lumen
        </span>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {route}
        </h1>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </motion.div>
    </main>
  );
}
