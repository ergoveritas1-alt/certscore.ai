import { permanentRedirect } from "next/navigation";

export default function RetiredPage() {
  permanentRedirect("/guides/consent-enforcement-testing");
}
