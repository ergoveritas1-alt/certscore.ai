/**
 * Maps axe-core rule IDs to user-friendly CertScore finding IDs.
 * Fallback: accessibility_violation_${axeRuleId}
 */

const AXE_RULE_TO_FINDING_ID: Record<string, string> = {
  "image-alt": "missing_image_alt_text",
  "color-contrast": "low_color_contrast",
  label: "form_label_missing",
  "button-name": "button_accessible_name_missing",
  "link-name": "link_accessible_name_missing",
  "html-has-lang": "document_language_missing",
  "document-title": "document_title_missing",
  "aria-valid-attr-value": "invalid_aria_attribute_value",
  "aria-required-children": "invalid_aria_structure",
  "landmark-one-main": "missing_or_invalid_main_landmark",
  "page-has-heading-one": "missing_h1_heading",
  "aria-hidden-focus": "aria_hidden_focusable_element",
  "aria-roles": "invalid_aria_role",
  "aria-required-attr": "missing_required_aria_attribute",
  "aria-allowed-attr": "invalid_aria_attribute",
  "duplicate-id-aria": "duplicate_aria_id",
  "empty-heading": "empty_heading",
  "heading-order": "incorrect_heading_order",
  "html-lang-valid": "invalid_document_language_code",
  "frame-title": "missing_frame_title",
  "input-button-name": "input_button_accessible_name_missing",
  "link-in-text-block": "link_indistinguishable_from_text",
  list: "invalid_list_structure",
  listitem: "invalid_listitem_structure",
  "meta-viewport": "meta_viewport_prevents_zoom",
  "object-alt": "missing_object_alternative_text",
  "scrollable-region-focusable": "scrollable_region_not_focusable",
  "select-name": "select_accessible_name_missing",
  "skip-link": "skip_link_target_missing",
  tabindex: "invalid_tabindex_value",
  "table-duplicate-name": "duplicate_table_name",
  "td-headers-attr": "invalid_table_headers_attribute",
  "th-has-data-cells": "table_header_without_data_cells",
  "valid-lang": "invalid_language_code",
  "video-caption": "missing_video_captions",
  "audio-caption": "missing_audio_captions",
  "autocomplete-valid": "invalid_autocomplete_value",
  "definition-list": "invalid_definition_list",
  "dlitem": "invalid_definition_list_item",
  "meta-refresh": "meta_refresh_redirects",
  "region": "missing_region_landmark",
  "aria-input-field-name": "aria_input_missing_name",
  "aria-toggle-field-name": "aria_toggle_missing_name",
  "form-field-multiple-labels": "multiple_form_labels",
  "label-title-only": "label_relies_only_on_title",
  "link-empty": "empty_link",
  "button-empty": "empty_button",
  "image-redundant-alt": "redundant_image_alt_text",
  "aria-command-name": "aria_command_missing_name",
  "aria-meter-name": "aria_meter_missing_name",
  "aria-progressbar-name": "aria_progressbar_missing_name",
  "aria-tooltip-name": "aria_tooltip_missing_name",
  "aria-treeitem-name": "aria_treeitem_missing_name",
  "identical-links-same-purpose": "identical_links_same_purpose",
  "aria-conditional-attr": "conditional_aria_attribute_misuse",
  "aria-deprecated-role": "deprecated_aria_role",
  "aria-prohibited-attr": "prohibited_aria_attribute",
  "aria-text": "aria_text_misuse",
  "nested-interactive": "nested_interactive_elements",
  "no-focusable-non-tabindex": "focusable_element_missing_tabindex",
  "p-as-heading": "paragraph_styled_as_heading",
  "presentation-role-conflict": "presentation_role_conflict"
};

export function mapAxeRuleIdToFindingId(axeRuleId: string): string {
  return AXE_RULE_TO_FINDING_ID[axeRuleId] ?? `accessibility_violation_${axeRuleId}`;
}

export function getAllMappedAxeRuleIds(): string[] {
  return Object.keys(AXE_RULE_TO_FINDING_ID);
}

export function getMappedFindingId(axeRuleId: string): string | null {
  return AXE_RULE_TO_FINDING_ID[axeRuleId] ?? null;
}
