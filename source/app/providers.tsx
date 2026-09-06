"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: ReactNode }) {
  // Without a configured Privy App ID (see README -> "Get a Privy App ID"),
  // render children unwrapped so the landing page still loads and explains
  // what to do, instead of crashing the whole app.
  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#0b5c46",
        },
        loginMethods: ["email"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export const isPrivyClientConfigured = Boolean(privyAppId);
