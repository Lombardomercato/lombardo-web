import { LocalCommerceProvider } from "./local-provider";
import { RuniaCommerceProvider } from "./runia-commerce-provider";
import {
  isRuniaDevMode,
  readRuniaDevConfiguration,
} from "../server/environment";

export type { CommerceProvider, ProductQuery } from "./provider";
export { LocalCommerceProvider } from "./local-provider";
export { RuniaCommerceProvider } from "./runia-commerce-provider";

export const commerceProvider = isRuniaDevMode()
  ? new RuniaCommerceProvider(readRuniaDevConfiguration())
  : new LocalCommerceProvider();
