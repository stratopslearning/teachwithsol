import { appRedirect } from "@/lib/serverRedirect";

export default function StudentDiscussionsRedirect() {
  appRedirect("/dashboard/student/assignments?type=DISCUSSION");
}
