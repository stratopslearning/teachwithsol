import { appRedirect } from "@/lib/serverRedirect";

/** Admin assignments hub: reuse professor-style listing via quiz library for now. */
export default function AdminAssignmentsPage() {
  appRedirect("/dashboard/admin/quizzes");
}
