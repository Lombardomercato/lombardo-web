import "server-only";

export class OrderNotificationProviderError extends Error {
  readonly code: string;
  readonly outcome: "rejected" | "unknown";

  constructor(
    code: string,
    message: string,
    outcome: "rejected" | "unknown",
  ) {
    super(message);
    this.code = code;
    this.outcome = outcome;
  }
}
