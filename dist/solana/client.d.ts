import { Connection, ConfirmOptions } from '@solana/web3.js';
import { RolyConfig } from '../config.js';
export declare class SolanaClient {
    private connection;
    private config;
    constructor(config: RolyConfig);
    /**
     * Get the underlying Solana connection
     */
    getConnection(): Connection;
    /**
     * Get current slot
     */
    getCurrentSlot(): Promise<number>;
    /**
     * Get network cluster info
     */
    getCluster(): string;
    /**
     * Check if connection is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Get current epoch info
     */
    getEpochInfo(): Promise<import("@solana/web3.js").EpochInfo>;
    /**
     * Get transaction confirmation options
     */
    getConfirmOptions(): ConfirmOptions;
    /**
     * Get recent blockhash with retry logic
     */
    getLatestBlockhash(maxRetries?: number): Promise<Readonly<{
        blockhash: import("@solana/web3.js").Blockhash;
        lastValidBlockHeight: number;
    }>>;
    /**
     * Get minimum rent exemption for an account
     */
    getMinimumBalanceForRentExemption(space: number): Promise<number>;
    /**
     * Estimate transaction fees
     */
    estimateTransactionFee(message: any): Promise<number>;
    /**
     * Check if we're connected to mainnet
     */
    isMainnet(): boolean;
    /**
     * Check if we're connected to devnet
     */
    isDevnet(): boolean;
    /**
     * Get the USDC mint address for current cluster
     */
    getUsdcMint(): string;
    /**
     * Close the connection
     */
    close(): void;
}
