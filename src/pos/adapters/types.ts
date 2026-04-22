// Adapter contracts. Real implementations are wired later via a local bridge
// service. Keep these stable — UI code depends on them.

export type TerminalStatus = "idle" | "connecting" | "waiting" | "approved" | "declined" | "error";

export interface PaymentResult {
  ok: boolean;
  method: "kort" | "kontant" | "swish";
  amountOre: number;
  reference?: string;
  error?: string;
}

export interface PaymentTerminal {
  initiatePayment(amountOre: number, txRef: string): Promise<PaymentResult>;
  cancelPayment(): Promise<void>;
  getStatus(): Promise<TerminalStatus>;
}

export interface SignableTransaction {
  receiptNo: number;
  totalOre: number;
  occurredAt: string;
  items: Array<{ sku?: string; name: string; qty: number; lineTotalOre: number; vatRate: number }>;
}

export interface CloudKontrollenhet {
  signTransaction(tx: SignableTransaction): Promise<{ controlCode: string }>;
}

export interface ErpProduct {
  sku: string;
  name: string;
  category: string;
  vatRate: number;
  unitType: "piece" | "kg" | "custom";
  priceOre: number;
  barcode?: string;
}

export interface MakrilltradeErp {
  fetchProducts(): Promise<ErpProduct[]>;
  pushSale(payload: unknown): Promise<void>;
  fetchStock(sku: string): Promise<number>;
}
