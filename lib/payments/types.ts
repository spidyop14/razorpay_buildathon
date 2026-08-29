import type { PolicyConfig } from "../policy/types";

export type PaymentState =
  | "NOT_READY"
  | "AWAITING_APPROVAL"
  | "READY_FOR_PAYMENT"
  | "PAYMENT_INITIATED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED";

export type TrustedQuote = {
  transactionId: string;
  productId: string;
  extraIds: string[];
  amount: number;
  currency: "INR";
  state: PaymentState;
  createdAt: number;
  razorpayOrderId?: string;
  razorpayAmount?: number;
  razorpayCurrency?: string;
  policies?: PolicyConfig;
};
