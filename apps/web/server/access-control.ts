import "server-only";

export {
  getAccountCreationPausedMessage,
  getAllowedAuthEmails,
  getAuthAccessDeniedMessage,
  getSelfServePurchasingPausedMessage,
  isAllowedAuthEmail,
  isAuthAccessRestricted,
  isPublicAccountCreationEnabled,
  isSelfServePurchasingEnabled,
  normalizeAccessEmail
} from "./access-control-core";
