import { appRedirect } from "@/lib/serverRedirect";

export default function StudentQuizzesRedirect() {
  appRedirect("/dashboard/student/assignments?type=QUIZ");
}
