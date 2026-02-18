import { Connection } from '@solana/web3.js';
export class SolanaClient {
    connection;
    config;
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.solana.rpcUrl, {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 30000,
            wsEndpoint: config.solana.rpcUrl.replace('https://', 'wss://'),
        });
    }
    /**
     * Get the underlying Solana connection
     */
    getConnection() {
        return this.connection;
    }
    /**
     * Get current slot
     */
    async getCurrentSlot() {
        return await this.connection.getSlot();
    }
    /**
     * Get network cluster info
     */
    getCluster() {
        return this.config.solana.cluster;
    }
    /**
     * Check if connection is healthy
     */
    async isHealthy() {
        try {
            const version = await this.connection.getVersion();
            return version['solana-core'] !== undefined;
        }
        catch (error) {
            console.error('Connection health check failed:', error);
            return false;
        }
    }
    /**
     * Get current epoch info
     */
    async getEpochInfo() {
        return await this.connection.getEpochInfo();
    }
    /**
     * Get transaction confirmation options
     */
    getConfirmOptions() {
        return {
            commitment: 'confirmed',
            preflightCommitment: 'confirmed',
            skipPreflight: false,
            maxRetries: 3
        };
    }
    /**
     * Get recent blockhash with retry logic
     */
    async getLatestBlockhash(maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await this.connection.getLatestBlockhash('confirmed');
            }
            catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    // Wait before retry (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        }
        throw lastError;
    }
    /**
     * Get minimum rent exemption for an account
     */
    async getMinimumBalanceForRentExemption(space) {
        return await this.connection.getMinimumBalanceForRentExemption(space);
    }
    /**
     * Estimate transaction fees
     */
    async estimateTransactionFee(message) {
        try {
            const feeResponse = await this.connection.getFeeForMessage(message);
            return feeResponse.value || 5000;
        }
        catch (error) {
            console.warn('Fee estimation failed:', error);
            // Return a conservative estimate (5000 lamports = 0.000005 SOL)
            return 5000;
        }
    }
    /**
     * Check if we're connected to mainnet
     */
    isMainnet() {
        return this.config.solana.cluster === 'mainnet-beta';
    }
    /**
     * Check if we're connected to devnet
     */
    isDevnet() {
        return this.config.solana.cluster === 'devnet';
    }
    /**
     * Get the USDC mint address for current cluster
     */
    getUsdcMint() {
        return this.config.solana.usdcMint;
    }
    /**
     * Close the connection
     */
    close() {
        // Connection doesn't have explicit close method, but we can clear references
        // The WebSocket connections will be garbage collected
    }
}
