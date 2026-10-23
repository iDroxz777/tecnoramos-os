export type SignOutSteps = {
  online: boolean;
  synchronize: () => Promise<void>;
  countUnsynced: () => Promise<number>;
  confirmKeepingUnsynced: (count: number) => boolean;
  endServerSession: () => Promise<boolean>;
  clearLocalSession: () => Promise<void>;
};

export type SignOutResult = "offline" | "cancelled" | "server_unreachable" | "signed_out";

// The session cookie is HttpOnly, so only the server can end it. Local data is
// cleared only after the server confirms; otherwise the old session would come
// back as soon as the phone reconnects.
export async function signOut(steps: SignOutSteps): Promise<SignOutResult> {
  if (!steps.online) return "offline";
  try {
    await steps.synchronize();
  } catch {
    // Whatever failed to sync is still stored and counted below.
  }
  const unsynced = await steps.countUnsynced();
  if (unsynced && !steps.confirmKeepingUnsynced(unsynced)) return "cancelled";
  if (!await steps.endServerSession()) return "server_unreachable";
  try {
    await steps.clearLocalSession();
  } catch {
    // The server session is already over, so the screen must close anyway.
    // Leftover cached copies are replaced on the next sign-in.
  }
  return "signed_out";
}
