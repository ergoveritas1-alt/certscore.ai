export const SITE_INTEGRITY_REMEDIATION = {
  steps: [
    "Locate each listed destination hostname in the affected page's rendered DOM using browser developer tools (Elements search). Inspect the anchor and its ancestors against the retained excerpt and computed styles where available; the excerpt is not a CSS selector.",
    "Find the code that produces the link: search page content, CMS blocks, templates, theme/plugin files and tag-manager tags for that hostname. If it appears only after JavaScript runs, trace the inserting script with a DOM subtree-modification breakpoint on its parent.",
    "If the link is unintended, remove the anchor and the content or code that inserts it, rather than hiding it with different CSS. If it is intended navigation, remove the concealing rule from the responsible element and give the link visible, meaningful text in the normal layout. Preserve legitimate skip links and responsive controls after checking their intended behavior.",
    "If the owner cannot account for the insertion, review recent CMS, template, plugin and tag-manager changes and access logs; address any verified unauthorized change at its source. Concealment alone does not establish compromise.",
    "Publish the approved source change and clear any page/CDN caches. Check the rendered page again in a fresh browser session at desktop and mobile widths, including after scripts have run.",
  ],
  reTest: "On each listed source URL, search the rendered DOM again for the destination hostname. Confirm an unwanted link is absent and does not reappear after scripts run, or that intended navigation is visibly and meaningfully labelled and keyboard-operable. Re-scan the same URL and compare its hidden-link evidence. Do not visit the outbound destination to perform these checks.",
  whyThisMatters: "Concealed outbound links may differ from the page owner's intended content. The retained hostname, DOM excerpt and computed styles help locate the source, but do not by themselves establish compromise.",
} as const;

export const SITE_INTEGRITY_REMEDIATION_TEXT = [...SITE_INTEGRITY_REMEDIATION.steps, `Re-test: ${SITE_INTEGRITY_REMEDIATION.reTest}`].join("\n\n");
