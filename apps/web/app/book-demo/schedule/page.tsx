import { redirect } from "next/navigation";
import { CALENDLY_DEMO_URL } from "../../../lib/marketing/demo-url";

export default function BookDemoScheduleRedirectPage() {
  redirect(CALENDLY_DEMO_URL);
}
