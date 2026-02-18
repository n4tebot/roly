import { PublicKey } from '@solana/web3.js';
import { SolanaClient } from './client.js';
import { WalletInfo } from '../identity/wallet.js';
export interface BalanceInfo {
    usdcBalance: number;
    solBalance: number;
    usdcBalanceFormatted: number;
    solBalanceFormatted: number;
    tokenAccount: PublicKey | null;
    lastUpdated: Date;
}
export declare class BalanceChecker {
    private client;
    private usdcMint;
    constructor(client: SolanaClient);
    /**
     * Get comprehensive balance information
     */
    getBalance(wallet: WalletInfo): Promise<BalanceInfo>;
    /**
     * Get just USDC balance (faster)
     */
    getUsdcBalance(wallet: WalletInfo): Promise<number>;
    /**
     * Get just SOL balance
     */
    getSolBalance(wallet: WalletInfo): Promise<number>;
    /**
     * Check if wallet has minimum SOL for transactions
     */
    hasMinimumSol(wallet: WalletInfo, minLamports?: number): Promise<boolean>;
    /**
     * Format USDC amount for display
     */
    static formatUsdc(microUsdc: number): string;
    /**
     * Format SOL amount for display
     */
    static formatSol(lamports: number): string;
    /**
     * Parse USDC amount from human input
     */
    static parseUsdc(usdcAmount: string | number): number;
    /**
     * Parse SOL amount from human input
     */
    static parseSol(solAmount: string | number): number;
    /**
     * Get token account address (create if needed)
     */
    getOrCreateTokenAccount(wallet: WalletInfo): Promise<PublicKey>;
    /**
     * Monitor balance changes (polling approach)
     */
    startBalanceMonitoring(wallet: WalletInfo, callback: (balance: BalanceInfo) => void, intervalMs?: number): Promise<() => void>;
}
