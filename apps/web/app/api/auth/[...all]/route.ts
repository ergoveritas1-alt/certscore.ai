import { getAuth } from "../../../../server/better-auth/auth";

function handleAuth(request: Request) {
  return getAuth().handler(request);
}

export { handleAuth as DELETE, handleAuth as GET, handleAuth as PATCH, handleAuth as POST, handleAuth as PUT };
