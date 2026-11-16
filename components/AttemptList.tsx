"use client";

import { motion, useReducedMotion } from "framer-motion";

import { PassFailBadge } from "@/components/status/badges";

interface Attempt {
  id: string;
  quiz: {
    title: string;
  };
  section: {
    name: string;
  };
  percentage: number | null;
  passed?: boolean | null;
}

interface AttemptListProps {
  attempts: Attempt[];
}

export function AttemptList({ attempts }: AttemptListProps) {
  const reduced = useReducedMotion();

  if (attempts.length === 0) {
    return (
      <div className="text-center py-10 px-4 flex flex-col gap-2 items-center">
        <span className="eyebrow text-ink-faint">Empty</span>
        <p
          className="font-display text-ink"
          style={{
            fontSize: "1.25rem",
            lineHeight: 1.25,
            fontVariationSettings: '"opsz" 36',
          }}
        >
          No attempts yet.
        </p>
        <p className="text-sm text-ink-muted max-w-sm leading-relaxed">
          Complete a quiz from one of your sections: every attempt will appear
          here, with the most recent first.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {attempts.map((attempt, index) => (
        <motion.li
          key={attempt.id}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : index * 0.04, duration: 0.25 }}
          className="flex items-center justify-between gap-3 px-4 py-3.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-ink truncate">
              {attempt.quiz.title}
            </div>
            <div className="text-xs text-ink-muted truncate mt-0.5">
              {attempt.section.name}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono tnum text-sm text-ink">
              {attempt.percentage ?? 0}%
            </span>
            <PassFailBadge passed={attempt.passed === true} />
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
