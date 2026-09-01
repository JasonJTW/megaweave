/**
 * Generic Payment Provider Abstraction Layer
 * Allows swapping between ECPay AIO, ECPay ECPG, Stripe, etc. without modifying Application / Domain logic.
 */

export type PaymentMethod = "Credit" | "ATM" | "CVS" | "TWQR" | "ALL";

export interface CreatePaymentSessionInput {
  merchantTradeNo: string; // Unique transaction order ID (Max 20 chars for ECPay)
  amount: number; // Total amount in TWD (Integer)
  itemDescription: string; // Brief description / items summary
  tradeDate?: Date; // Order creation date (defaults to now)
  clientBackUrl?: string; // Browser redirect URL when clicking back to store
  orderResultUrl?: string; // Browser auto-redirect URL with POST payment result
  returnUrl?: string; // Server-to-server webhook callback URL
  customParams?: Record<string, string>;
  simulatePaid?: boolean; // If true, sets SimulatePaid=1 (stage testing)
}

export interface PaymentSessionResult {
  provider: string; // e.g. "ECPAY_AIO", "ECPAY_ECPG"
  paymentMethod: PaymentMethod;
  checkoutActionUrl: string; // Form post target URL or gateway endpoint
  formData: Record<string, string>; // Key-value pairs for auto-submitting HTML form
  htmlForm?: string; // Optional auto-submitting HTML form string
  token?: string; // For ECPG tokenization if needed
}

export interface ParsedCallbackResult {
  isValid: boolean; // Whether the signature (CheckMacValue / AES) is valid
  isSuccess: boolean; // Whether the transaction succeeded (RtnCode === 1)
  merchantTradeNo: string; // Our internal order ID
  tradeNo: string; // ECPay's unique trade number
  amount: number; // Amount paid
  paymentDate?: Date; // When payment completed
  paymentMethod?: string; // Credit_CreditCard, ATM, etc.
  rtnCode: number; // Provider raw return code
  rtnMsg: string; // Provider raw return message
  simulatedPaid: boolean; // True if SimulatePaid was 1
  rawPayload: Record<string, string>; // Raw callback data
}

export interface QueryPaymentResult {
  merchantTradeNo: string;
  tradeNo?: string;
  isPaid: boolean;
  amount: number;
  tradeStatus?: string;
  rawResponse?: Record<string, string>;
}

export interface RefundPaymentInput {
  merchantTradeNo: string;
  tradeNo: string;
  amount: number;
  reason?: string;
}

export interface RefundPaymentResult {
  isSuccess: boolean;
  refundId?: string;
  rtnCode?: number;
  rtnMsg?: string;
  rawResponse?: Record<string, string>;
}

export interface IPaymentProvider {
  readonly providerName: string;

  /**
   * Generates checkout payload / form for the user's browser
   */
  createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult>;

  /**
   * Verifies incoming webhook signature and parses payload into standardized format
   */
  verifyAndParseCallback(
    payload: Record<string, string>
  ): Promise<ParsedCallbackResult>;

  /**
   * Queries real-time trade status from provider
   */
  queryPayment(merchantTradeNo: string): Promise<QueryPaymentResult>;

  /**
   * Triggers refund on provider
   */
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}
