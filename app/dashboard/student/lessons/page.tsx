import { appRedirect } from "@/lib/serverRedirect";

export default function StudentLessonsRedirect() {
  appRedirect("/dashboard/student/assignments?type=LESSON");
}
