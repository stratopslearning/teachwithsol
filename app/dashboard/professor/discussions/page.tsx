import { appRedirect } from "@/lib/serverRedirect";

export default function ProfessorDiscussionsRedirect() {
  appRedirect("/dashboard/professor/assignments?type=DISCUSSION");
}
