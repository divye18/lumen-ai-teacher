import "server-only";

import { ProviderNotConfiguredError } from "@/lib/errors";

import type { AvatarProvider } from "./types";

export type * from "./types";

let avatarProvider: AvatarProvider | null = null;

export function registerAvatarProvider(provider: AvatarProvider): void {
  avatarProvider = provider;
}

export function getAvatarProvider(): AvatarProvider {
  if (!avatarProvider) throw new ProviderNotConfiguredError("avatar");
  return avatarProvider;
}
