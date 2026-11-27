import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Deployment } from "@hand-peys/stellar";
import { api, ApiError, tokenStore, type Me } from "./api";
import { getProfile, setProfile } from "./profile";
import { useWallet } from "./wallet";

export type AppConfig = Deployment & { demo: boolean };

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api<AppConfig>("/config"), staleTime: Infinity });
}

// Estado compartido entre todas las instancias del hook.
let inflight: { address: string; promise: Promise<void> } | null = null;
let attemptedFor: string | null = null;

/** Sesión de Hand Peys: wallet conectada + reto SEP-53 firmado → token. */
export function useSession() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);
  const token = useSyncExternalStore(tokenStore.subscribe, tokenStore.get, () => null);

  const me = useQuery({
    queryKey: ["me", token],
    queryFn: () => api<Me>("/auth/me"),
    enabled: Boolean(token),
    retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 2,
  });

  const signIn = useCallback(async () => {
    if (!wallet.address) return;
    setSigningIn(true);
    setError(null);
    try {
      // Un solo inicio de sesión a la vez para toda la app (varios componentes usan este hook).
      const address = wallet.address;
      if (inflight?.address !== address) {
        inflight = {
          address,
          promise: (async () => {
            const ch = await api<{ nonce: string; message: string }>("/auth/challenge", { body: { wallet: address } });
            const signature = await wallet.signMessage(ch.message);
            const email = getProfile()?.email;
            const res = await api<{ token: string }>("/auth/session", { body: { wallet: address, nonce: ch.nonce, signature, ...(email ? { email } : {}) } });
            tokenStore.set(res.token);
          })().finally(() => {
            if (inflight?.address === address) inflight = null;
          }),
        };
      }
      await inflight.promise;
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) {
      console.error("[HandPeys] signIn", e);
      setError((e as Error).message);
    } finally {
      setSigningIn(false);
    }
  }, [wallet, qc]);

  // Al conectar la wallet, inicia sesión automáticamente (una vez por dirección en toda la app).
  useEffect(() => {
    const tokenWallet = me.data?.user.wallet;
    if (wallet.ready && wallet.address && tokenWallet !== wallet.address && attemptedFor !== wallet.address && !me.isFetching) {
      attemptedFor = wallet.address;
      attempted.current = wallet.address;
      void signIn();
    }
  }, [wallet.ready, wallet.address, me.data, me.isFetching, signIn]);

  // Token inválido → límpialo.
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) tokenStore.set(null);
  }, [me.error]);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    tokenStore.set(null);
    attempted.current = null;
    attemptedFor = null;
    setProfile(null);
    wallet.disconnect();
    qc.clear();
  }, [wallet, qc]);

  const loggedIn = Boolean(me.data && wallet.address && me.data.user.wallet === wallet.address);
  return { me: me.data, loading: me.isLoading || signingIn, loggedIn, error, signIn, signOut, refetch: me.refetch };
}
