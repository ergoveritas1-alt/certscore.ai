export type PageType = "homepage" | "about" | "contact" | "services" | "commerce" | "policy" | "review" | "blog" | "other";

export function classifyPage(url: string): PageType {
  const pathname = new URL(url).pathname.toLowerCase();

  if (pathname === "/") {
    return "homepage";
  }

  if (
    pathname.includes("about") ||
    pathname.includes("team") ||
    pathname.includes("leadership") ||
    pathname.includes("founder") ||
    pathname.includes("management")
  ) {
    return "about";
  }

  if (pathname.includes("contact")) {
    return "contact";
  }

  if (pathname.includes("service")) {
    return "services";
  }

  if (
    pathname.includes("shop") ||
    pathname.includes("product") ||
    pathname.includes("category") ||
    pathname.includes("cart") ||
    pathname.includes("checkout")
  ) {
    return "commerce";
  }

  if (
    pathname.includes("privacy") ||
    pathname.includes("terms") ||
    pathname.includes("cookie") ||
    pathname.includes("legal") ||
    pathname.includes("refund")
  ) {
    return "policy";
  }

  if (pathname.includes("review") || pathname.includes("testimonial")) {
    return "review";
  }

  if (pathname.includes("blog") || pathname.includes("article")) {
    return "blog";
  }

  return "other";
}
