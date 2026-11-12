import { permanentRedirect } from "next/navigation";

export default function RetiredPage() {
  permanentRedirect("/compare/cmp-vs-runtime-consent-scanner");
}
