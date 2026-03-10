import type { Page } from "playwright";
import type { RobotsPolicy } from "../robots/policy";
import { isUrlAllowedByRobots, waitForDomainRequestSlot } from "../robots/policy";

type NavigationResult = {
  blockedByPolicy: boolean;
  response: Awaited<ReturnType<Page["goto"]>> | null;
};

export async function navigateWithPolicy(input: {
  page: Page;
  robotsPolicy?: RobotsPolicy | null;
  url: string;
}) : Promise<NavigationResult> {
  if (!isUrlAllowedByRobots(input.url, input.robotsPolicy)) {
    return {
      blockedByPolicy: true,
      response: null
    };
  }

  await waitForDomainRequestSlot(input.url);

  const response = await input.page.goto(input.url, {
    waitUntil: "domcontentloaded",
    timeout: 20_000
  });

  return {
    blockedByPolicy: false,
    response
  };
}
