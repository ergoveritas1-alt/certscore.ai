import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../server/better-auth/auth";

export const { DELETE, GET, PATCH, POST, PUT } = toNextJsHandler(auth);
