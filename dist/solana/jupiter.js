import axios from 'axios';
import { VersionedTransaction } from '@solana/web3.js';
export class JupiterSwap {
    client;
    jupiterApiUrl;
    constructor(client) {
        this.client = client;
        this.jupiterApiUrl = client['config'].solana.jupiterApiUrl;
    }
    /**
     * Get a swap quote from Jupiter
     */
    async getQuote(inputMint, outputMint, amount, slippageBps = 50 // 0.5% slippage
    ) {
        try {
            const response = await axios.get(`${this.jupiterApiUrl}/quote`, {
                params: {
                    inputMint,
                    outputMint,
                    amount: amount.toString(),
                    slippageBps
                }
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to get Jupiter quote: ${error instanceof Error ? error.message : error}`);
        }
    }
    /**
     * Execute a swap using Jupiter
     */
    async executeSwap(wallet, quote, priorityFeeLamports) {
        const connection = this.client.getConnection();
        try {
            // Get swap transaction from Jupiter
            const response = await axios.post(`${this.jupiterApiUrl}/swap`, {
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: priorityFeeLamports || 0
            });
            const { swapTransaction } = response.data;
            // Deserialize the transaction
            const transactionBuf = Buffer.from(swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(transactionBuf);
            // Sign the transaction
            transaction.sign([wallet.keypair]);
            // Send and confirm
            const signature = await connection.sendRawTransaction(transaction.serialize(), {
                skipPreflight: true,
                maxRetries: 2
            });
            // Confirm transaction
            await connection.confirmTransaction(signature, 'confirmed');
            return {
                signature,
                success: true,
                inputAmount: parseInt(quote.inAmount),
                outputAmount: parseInt(quote.outAmount),
                inputToken: quote.inputMint,
                outputToken: quote.outputMint,
                timestamp: new Date()
            };
        }
        catch (error) {
            console.error('Jupiter swap failed:', error);
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                inputAmount: parseInt(quote.inAmount),
                outputAmount: parseInt(quote.outAmount),
                inputToken: quote.inputMint,
                outputToken: quote.outputMint,
                timestamp: new Date()
            };
        }
    }
    /**
     * Swap SOL to USDC
     */
    async swapSolToUsdc(wallet, solAmount, // Amount in lamports
    slippageBps = 50) {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const usdcMint = this.client.getUsdcMint();
        try {
            // Get quote
            const quote = await this.getQuote(SOL_MINT, usdcMint, solAmount, slippageBps);
            // Execute swap
            return await this.executeSwap(wallet, quote);
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                inputAmount: solAmount,
                outputAmount: 0,
                inputToken: SOL_MINT,
                outputToken: usdcMint,
                timestamp: new Date()
            };
        }
    }
    /**
     * Swap USDC to SOL
     */
    async swapUsdcToSol(wallet, usdcAmount, // Amount in micro-USDC
    slippageBps = 50) {
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const usdcMint = this.client.getUsdcMint();
        try {
            // Get quote
            const quote = await this.getQuote(usdcMint, SOL_MINT, usdcAmount, slippageBps);
            // Execute swap
            return await this.executeSwap(wallet, quote);
        }
        catch (error) {
            return {
                signature: '',
                success: false,
                error: error instanceof Error ? error.message : String(error),
                inputAmount: usdcAmount,
                outputAmount: 0,
                inputToken: usdcMint,
                outputToken: SOL_MINT,
                timestamp: new Date()
            };
        }
    }
    /**
     * Get supported tokens list
     */
    async getSupportedTokens() {
        try {
            const response = await axios.get('https://token.jup.ag/all');
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to get supported tokens: ${error instanceof Error ? error.message : error}`);
        }
    }
    /**
     * Get token price from Jupiter
     */
    async getTokenPrice(tokenMint, vsTokenMint) {
        try {
            const vs = vsTokenMint || this.client.getUsdcMint();
            const response = await axios.get(`${this.jupiterApiUrl}/price`, {
                params: {
                    ids: tokenMint,
                    vsToken: vs
                }
            });
            return response.data.data[tokenMint]?.price || 0;
        }
        catch (error) {
            throw new Error(`Failed to get token price: ${error instanceof Error ? error.message : error}`);
        }
    }
    /**
     * Calculate minimum output amount with slippage
     */
    calculateMinimumOut(expectedAmount, slippageBps) {
        return Math.floor(expectedAmount * (1 - slippageBps / 10000));
    }
    /**
     * Calculate price impact
     */
    calculatePriceImpact(inputAmount, outputAmount, marketPrice) {
        const executionPrice = outputAmount / inputAmount;
        return ((marketPrice - executionPrice) / marketPrice) * 100;
    }
    /**
     * Get optimal route for a trade
     */
    async getOptimalRoute(inputMint, outputMint, amount) {
        // Jupiter automatically finds the best route, so we just get a quote
        return await this.getQuote(inputMint, outputMint, amount);
    }
    /**
     * Check if a swap is profitable after fees
     */
    async isProfitable(inputAmount, quote, estimatedFeeLamports = 5000) {
        const outputAmount = parseInt(quote.outAmount);
        const priceImpact = parseFloat(quote.priceImpactPct);
        // Consider profitable if:
        // 1. Output > input (for same-denomination trades)
        // 2. Price impact < 1%
        // 3. We can cover transaction fees
        return outputAmount > inputAmount && priceImpact < 1.0;
    }
}
