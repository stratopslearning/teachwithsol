import { appRedirect } from "@/lib/serverRedirect";

export default function ProfessorQuizzesRedirect() {
  appRedirect("/dashboard/professor/assignments?type=QUIZ");
}
