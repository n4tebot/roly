import { SolanaClient } from './client.js';
import { WalletInfo } from '../identity/wallet.js';
export interface SwapQuote {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    platformFee?: {
        amount: string;
        feeBps: number;
    };
    priceImpactPct: string;
    routePlan: Array<{
        swapInfo: {
            ammKey: string;
            label: string;
            inputMint: string;
            outputMint: string;
            inAmount: string;
            outAmount: string;
            feeAmount: string;
            feeMint: string;
        };
        percent: number;
    }>;
}
export interface SwapResult {
    signature: string;
    success: boolean;
    error?: string;
    inputAmount: number;
    outputAmount: number;
    inputToken: string;
    outputToken: string;
    timestamp: Date;
}
export declare class JupiterSwap {
    private client;
    private jupiterApiUrl;
    constructor(client: SolanaClient);
    /**
     * Get a swap quote from Jupiter
     */
    getQuote(inputMint: string, outputMint: string, amount: number, slippageBps?: number): Promise<SwapQuote>;
    /**
     * Execute a swap using Jupiter
     */
    executeSwap(wallet: WalletInfo, quote: SwapQuote, priorityFeeLamports?: number): Promise<SwapResult>;
    /**
     * Swap SOL to USDC
     */
    swapSolToUsdc(wallet: WalletInfo, solAmount: number, // Amount in lamports
    slippageBps?: number): Promise<SwapResult>;
    /**
     * Swap USDC to SOL
     */
    swapUsdcToSol(wallet: WalletInfo, usdcAmount: number, // Amount in micro-USDC
    slippageBps?: number): Promise<SwapResult>;
    /**
     * Get supported tokens list
     */
    getSupportedTokens(): Promise<Array<{
        address: string;
        chainId: number;
        decimals: number;
        name: string;
        symbol: string;
        logoURI?: string;
    }>>;
    /**
     * Get token price from Jupiter
     */
    getTokenPrice(tokenMint: string, vsTokenMint?: string): Promise<number>;
    /**
     * Calculate minimum output amount with slippage
     */
    calculateMinimumOut(expectedAmount: number, slippageBps: number): number;
    /**
     * Calculate price impact
     */
    calculatePriceImpact(inputAmount: number, outputAmount: number, marketPrice: number): number;
    /**
     * Get optimal route for a trade
     */
    getOptimalRoute(inputMint: string, outputMint: string, amount: number): Promise<SwapQuote>;
    /**
     * Check if a swap is profitable after fees
     */
    isProfitable(inputAmount: number, quote: SwapQuote, estimatedFeeLamports?: number): Promise<boolean>;
}
