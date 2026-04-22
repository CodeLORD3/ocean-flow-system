import type {
  CloudKontrollenhet,
  MakrilltradeErp,
  PaymentResult,
  PaymentTerminal,
  TerminalStatus,
} from "./types";
import { generateMockControlCode } from "../lib/control-code";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const stubPaymentTerminal: PaymentTerminal = {
  async initiatePayment(amountOre, txRef): Promise<PaymentResult> {
    await wait(2000);
    return { ok: true, method: "kort", amountOre, reference: `STUB-${txRef.slice(0, 6)}` };
  },
  async cancelPayment() {
    await wait(200);
  },
  async getStatus(): Promise<TerminalStatus> {
    return "idle";
  },
};

export const stubCloudKontrollenhet: CloudKontrollenhet = {
  async signTransaction() {
    await wait(150);
    return { controlCode: generateMockControlCode() };
  },
};

export const stubMakrilltradeErp: MakrilltradeErp = {
  async fetchProducts() {
    return [];
  },
  async pushSale() {
    return;
  },
  async fetchStock() {
    return 0;
  },
};
