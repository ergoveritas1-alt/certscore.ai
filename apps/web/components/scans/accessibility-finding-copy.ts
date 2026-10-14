import type { AccessibilityRuleObservation } from "@certscore/contracts";
import { accessibilityRuleTitle } from "../../lib/scans/accessibility-report";

/** Editorial guidance for existing axe rule identities; never assigns an assessment. */
const guidance: ReadonlyArray<readonly [readonly string[], string, string]> = [
  [["color-contrast"], "Text must have sufficient contrast against its background.", "Adjust the text or background colors to meet the required ratio shown in each example, then retest."],
  [["aria-hidden-focus"], "Keyboard focus should not enter content hidden from assistive technology.", "Remove hidden controls from keyboard navigation, or expose the content to assistive technology if it should be interactive. Retest the keyboard focus order."],
  [["image-alt"], "Images need a text alternative that conveys their purpose.", "Add meaningful alt text to informative images. Use an empty alt attribute for purely decorative images, then check how each image is announced."],
  [["input-image-alt", "area-alt"], "Image controls need a text alternative that describes their action or destination.", "Add alt text describing what each image control does or where it leads, then check its accessible name."],
  [["role-img-alt", "svg-img-alt"], "Meaningful graphics need a name that assistive technology can read.", "Give each informative graphic a meaningful accessible name using a supported label or labelled-by reference. Mark purely decorative graphics appropriately and retest."],
  [["object-alt"], "Embedded objects need an accessible text alternative.", "Provide fallback text or an accessible alternative for each flagged object, then verify it is available to assistive technology."],
  [["button-name", "input-button-name", "aria-command-name"], "Controls need an accessible name describing their action.", "Add meaningful button text or an accessible label to each flagged control. Check that the announced name describes its action."],
  [["link-name"], "Links need an accessible name describing their destination or purpose.", "Add descriptive link text or an accessible label, then check the name announced for each flagged link."],
  [["label", "aria-input-field-name", "select-name"], "Form controls need labels that identify the information requested.", "Associate a descriptive label with each flagged field, preferably using a visible label. Verify the label is announced when the field receives focus."],
  [["aria-toggle-field-name"], "Switches and checkboxes need names identifying the choice they control.", "Associate each flagged toggle with a descriptive label, then verify its name and state are announced."],
  [["aria-meter-name", "aria-progressbar-name"], "Value and progress indicators need names describing what they measure.", "Label each flagged indicator with visible text or an accessible label, then verify its name and value are announced."],
  [["aria-tooltip-name"], "Tooltips need text that assistive technology can read.", "Give each flagged tooltip meaningful text or an accessible label, then verify it is announced in context."],
  [["summary-name"], "Disclosure controls need a name describing the content they reveal.", "Add meaningful text to each summary element, then test its announced name and expand/collapse behavior."],
  [["label-content-name-mismatch"], "A control's accessible name should include its visible label.", "Update the accessible name to include the visible label, preferably at the start, then test speech input and the announced name."],
  [["form-field-multiple-labels"], "Each field needs a clear, unambiguous label.", "Review the labels attached to each flagged field. Remove unintended duplicates or combine the intended wording, then check the resulting accessible name."],
  [["autocomplete-valid"], "Autocomplete values should match the information a field collects.", "Correct the flagged autocomplete tokens to match the field's purpose and input type, then retest."],
  [["aria-allowed-attr", "aria-prohibited-attr", "aria-conditional-attr"], "ARIA properties must be supported by the element's role and configuration.", "Check the flagged attribute against the element's role. Remove or correct incompatible attributes without losing needed semantics, then retest."],
  [["aria-required-attr"], "Some roles require additional ARIA properties to describe their state.", "Add the required properties identified in the example, keep their values in sync with the control, and retest."],
  [["aria-valid-attr"], "ARIA attribute names must be valid.", "Correct misspelled ARIA attributes or remove unsupported ones, then verify the element's accessible properties."],
  [["aria-valid-attr-value"], "ARIA values and references must be valid for the property.", "Correct the flagged value or referenced element ID, then check the resulting accessible properties."],
  [["aria-roles", "aria-deprecated-role"], "Elements need valid, supported roles that match their behavior.", "Replace the invalid or deprecated role with appropriate native HTML or a supported role, then test the element's semantics and behavior."],
  [["aria-roledescription"], "A custom role description needs an underlying semantic role.", "Use an appropriate native element or supported role, or remove the unnecessary role description. Retest how the element is announced."],
  [["aria-required-children", "aria-required-parent"], "Structured widgets need the parent and child roles expected by their pattern.", "Correct the parent/child structure identified in each example using the linked role guidance, then retest keyboard behavior and announcements."],
  [["aria-braille-equivalent"], "Braille-specific labels need an equivalent name or description for other assistive technology.", "Provide the corresponding accessible name or role description and keep it consistent with the braille text, then retest."],
  [["aria-hidden-body"], "The page body must remain available to assistive technology.", "Remove aria-hidden from the body. Limit hiding to appropriate non-interactive content, then verify the page is exposed to assistive technology."],
  [["duplicate-id-aria"], "Labels and ARIA references need to identify one element unambiguously.", "Give the flagged elements unique IDs and update every affected label and ARIA reference, then retest."],
  [["nested-interactive"], "Interactive controls should have separate, predictable focus targets.", "Move the nested button or link outside its interactive parent. Retest each control's keyboard focus and activation."],
  [["scrollable-region-focusable"], "Scrollable content must be reachable and usable with a keyboard.", "Make the region or a suitable element within it keyboard-focusable, provide a visible focus indicator, and test keyboard scrolling."],
  [["frame-focusable-content"], "Keyboard users need to reach interactive content inside frames.", "Remove the frame's negative tabindex when it blocks access to interactive content, then test moving focus into and out of the frame."],
  [["frame-title", "frame-title-unique"], "Frames need descriptive names that distinguish their content.", "Add a meaningful, distinct title to each flagged frame, then check how the frames are announced."],
  [["bypass"], "Keyboard users need a way to skip repeated navigation.", "Provide a working skip-to-content link or another suitable bypass mechanism, and verify it reaches the main content with a keyboard."],
  [["document-title"], "The page title should identify its topic or purpose.", "Add a meaningful, non-empty title in the document head, then verify it in the browser tab and assistive technology."],
  [["html-has-lang", "html-lang-valid"], "The page language helps assistive technology pronounce content correctly.", "Set a valid lang value on the html element that matches the page's primary language, then retest."],
  [["valid-lang"], "Language annotations should use valid language codes.", "Correct the flagged lang values to match the content's language, then retest."],
  [["html-xml-lang-mismatch"], "HTML and XML language declarations should agree.", "Align the lang and xml:lang values with the document's language, then retest."],
  [["list", "listitem"], "List markup should expose the relationship between a list and its items.", "Place list items inside the appropriate list container and correct unexpected child elements, then check how the list is announced."],
  [["definition-list", "dlitem"], "Description lists should associate terms with their descriptions.", "Use a dl container with correctly grouped dt and dd elements, then verify the term/description relationships."],
  [["td-headers-attr", "td-has-header", "th-has-data-cells"], "Data cells need the correct row or column headers.", "Correct the flagged header associations using suitable th, scope, or headers references. Verify each header describes the intended data cells."],
  [["table-fake-caption"], "A table's title should be associated with the table as its caption.", "Move the table title into a caption element and verify it is announced with the table."],
  [["p-as-heading"], "Visual headings should also be exposed as headings to assistive technology.", "Replace paragraphs used as headings with appropriate heading elements, then check the document's heading structure."],
  [["meta-viewport"], "Visitors need to be able to zoom the page.", "Remove viewport settings that block or limit zoom, then test text enlargement and page usability on mobile."],
  [["target-size"], "Pointer targets need enough size or spacing to be selected reliably.", "Increase the flagged targets' size or spacing using the linked guidance, then retest the affected controls on a small screen."],
  [["avoid-inline-spacing"], "Visitors must be able to adjust text spacing.", "Remove or revise inline spacing rules that override user styles, then test custom spacing without clipping or overlapping text."],
  [["css-orientation-lock"], "Content should remain usable in portrait and landscape orientations.", "Remove orientation restrictions unless the orientation is essential, then test the content in both orientations."],
  [["link-in-text-block"], "Inline links need to be distinguishable from surrounding text.", "Add a clear non-color cue, such as an underline, and verify the links remain identifiable on focus and hover."],
  [["blink", "marquee"], "Blinking and automatically moving text can interfere with reading.", "Replace blink or marquee markup with static content. If motion is needed, provide appropriate pause controls and retest."],
  [["meta-refresh"], "Timed page refreshes can interrupt reading and interaction.", "Remove the timed meta refresh or replace it with a user-controlled update, then verify the page no longer changes unexpectedly."],
  [["no-autoplay-audio"], "Automatically playing audio needs a way to stop or control it.", "Disable audible autoplay or provide an accessible stop, pause, or independent volume control, then test it with a keyboard."],
  [["video-caption", "audio-caption"], "Media needs an appropriate accessible text alternative for its audio.", "Review the flagged media and provide the captions or text alternative required by the linked guidance. Check the text for accuracy and availability during playback."],
  [["server-side-image-map"], "Image-map destinations need to be accessible without pointer coordinates.", "Replace the server-side map with accessible client-side areas or equivalent text links, then test each destination with a keyboard."],
];

const byRule = new Map(guidance.flatMap(([ids, description, correction]) => ids.map(id => [id, { description, correction }] as const)));

export function accessibilityFindingCopy(rule: AccessibilityRuleObservation, review: boolean) {
  const copy = byRule.get(rule.ruleId);
  const description = copy?.description ?? rule.description;
  const correction = copy?.correction ?? "Inspect the flagged elements using the examples and linked guidance, correct the reported problem, and rerun the check.";
  const normalize = (text: string) => text.trim().replace(/[.!]+$/, "").toLowerCase();
  return {
    description: normalize(description) === normalize(accessibilityRuleTitle(rule)) ? undefined : description,
    correction: !review ? correction : rule.ruleId === "color-contrast"
      ? "Check the text against its actual background. If it falls below the required ratio, adjust the colors and retest."
      : rule.ruleId === "aria-hidden-focus"
        ? "Check whether keyboard focus enters hidden content. If it does, remove those controls from keyboard navigation or expose the content if it should be interactive, then retest."
        : `Verify the flagged elements first. If the issue is confirmed, ${correction[0]!.toLowerCase()}${correction.slice(1)}`,
  };
}
