import { permanentRedirect } from "next/navigation";

export default function RetiredPage() {
  permanentRedirect("/guides/website-consent-audit-checklist");
}
