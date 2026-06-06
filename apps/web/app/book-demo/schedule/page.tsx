import { redirect } from "next/navigation";

const BOOK_DEMO_URL = "https://calendly.com/bmasek-w7ou/30min";

export default function BookDemoScheduleRedirectPage() {
  redirect(BOOK_DEMO_URL);
}
