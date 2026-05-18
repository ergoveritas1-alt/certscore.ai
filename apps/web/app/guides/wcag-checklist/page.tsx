import { permanentRedirect } from "next/navigation";

export default function WcagChecklistRedirectPage() {
  permanentRedirect("/guides/wcag-website-checklist");
}
