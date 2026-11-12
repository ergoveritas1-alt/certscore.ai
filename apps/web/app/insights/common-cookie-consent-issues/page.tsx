import { permanentRedirect } from "next/navigation";

export default function RetiredPage() {
  permanentRedirect("/solutions/cookie-consent-scanner");
}
