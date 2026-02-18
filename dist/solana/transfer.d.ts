import { PublicKey, TransactionSignature } from '@solana/web3.js';
import { SolanaClient } from './client.js';
import { WalletInfo } from '../identity/wallet.js';
export interface TransferResult {
    signature: TransactionSignature;
    success: boolean;
    error?: string;
    amount: number;
    recipient: PublicKey;
    timestamp: Date;
}
export declare class UsdcTransfer {
    private client;
    private balanceChecker;
    private usdcMint;
    constructor(client: SolanaClient);
    /**
     * Transfer USDC to another wallet
     */
    transferUsdc(fromWallet: WalletInfo, toAddress: string | PublicKey, amount: number, // Amount in micro-USDC
    memo?: string): Promise<TransferResult>;
    /**
     * Transfer SOL to another wallet
     */
    transferSol(fromWallet: WalletInfo, toAddress: string | PublicKey, amount: number): Promise<TransferResult>;
    /**
     * Estimate transfer fees
     */
    estimateTransferFee(fromWallet: WalletInfo, recipient: PublicKey, includeTokenAccountCreation?: boolean): Promise<number>;
    /**
     * Batch transfer to multiple recipients
     */
    batchTransfer(fromWallet: WalletInfo, transfers: Array<{
        recipient: PublicKey;
        amount: number;
    }>): Promise<TransferResult[]>;
}
