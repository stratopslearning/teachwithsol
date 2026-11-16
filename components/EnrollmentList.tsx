"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appPath } from "@/lib/basePath";

interface Enrollment {
  id: string;
  section: {
    id: string;
    name: string;
    course?: { title: string } | null;
  };
}

interface EnrollmentListProps {
  enrollments: Enrollment[];
}

export function EnrollmentList({ enrollments }: EnrollmentListProps) {
  const reduced = useReducedMotion();

  if (enrollments.length === 0) {
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
          No sections yet.
        </p>
        <p className="text-sm text-ink-muted max-w-sm leading-relaxed">
          Join a section using the enrollment code provided by your professor.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-rule">
      {enrollments.map((enrollment, index) => (
        <motion.li
          key={enrollment.id}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : index * 0.04, duration: 0.25 }}
          className="flex items-center justify-between gap-3 px-4 py-3.5"
        >
          <div className="min-w-0 flex-1">
            <Link
              href={appPath(
                `/dashboard/student/sections/${enrollment.section.id}`,
              )}
              className="block min-w-0"
            >
              <div className="truncate text-sm font-medium text-ink underline-offset-2 hover:underline">
                {enrollment.section.name}
              </div>
              <div className="mt-0.5 truncate text-xs text-ink-faint">
                {enrollment.section.course?.title || "Section"}
              </div>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="success">Enrolled</Badge>
            <Button asChild size="sm">
              <Link
                href={appPath(
                  `/dashboard/student/sections/${enrollment.section.id}`,
                )}
              >
                Open
              </Link>
            </Button>
          </div>
        </motion.li>
      ))}
    </ul>
  );
}
