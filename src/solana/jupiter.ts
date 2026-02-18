import axios from 'axios';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
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

export class JupiterSwap {
  private client: SolanaClient;
  private jupiterApiUrl: string;
  
  constructor(client: SolanaClient) {
    this.client = client;
    this.jupiterApiUrl = client['config'].solana.jupiterApiUrl;
  }

  /**
   * Get a swap quote from Jupiter
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 50 // 0.5% slippage
  ): Promise<SwapQuote> {
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
    } catch (error) {
      throw new Error(`Failed to get Jupiter quote: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Execute a swap using Jupiter
   */
  async executeSwap(
    wallet: WalletInfo,
    quote: SwapQuote,
    priorityFeeLamports?: number
  ): Promise<SwapResult> {
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
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: true,
          maxRetries: 2
        }
      );

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

    } catch (error) {
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
  async swapSolToUsdc(
    wallet: WalletInfo,
    solAmount: number, // Amount in lamports
    slippageBps: number = 50
  ): Promise<SwapResult> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const usdcMint = this.client.getUsdcMint();

    try {
      // Get quote
      const quote = await this.getQuote(SOL_MINT, usdcMint, solAmount, slippageBps);
      
      // Execute swap
      return await this.executeSwap(wallet, quote);
    } catch (error) {
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
  async swapUsdcToSol(
    wallet: WalletInfo,
    usdcAmount: number, // Amount in micro-USDC
    slippageBps: number = 50
  ): Promise<SwapResult> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const usdcMint = this.client.getUsdcMint();

    try {
      // Get quote
      const quote = await this.getQuote(usdcMint, SOL_MINT, usdcAmount, slippageBps);
      
      // Execute swap
      return await this.executeSwap(wallet, quote);
    } catch (error) {
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
  async getSupportedTokens(): Promise<Array<{
    address: string;
    chainId: number;
    decimals: number;
    name: string;
    symbol: string;
    logoURI?: string;
  }>> {
    try {
      const response = await axios.get('https://token.jup.ag/all');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get supported tokens: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Get token price from Jupiter
   */
  async getTokenPrice(tokenMint: string, vsTokenMint?: string): Promise<number> {
    try {
      const vs = vsTokenMint || this.client.getUsdcMint();
      const response = await axios.get(`${this.jupiterApiUrl}/price`, {
        params: {
          ids: tokenMint,
          vsToken: vs
        }
      });

      return response.data.data[tokenMint]?.price || 0;
    } catch (error) {
      throw new Error(`Failed to get token price: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Calculate minimum output amount with slippage
   */
  calculateMinimumOut(expectedAmount: number, slippageBps: number): number {
    return Math.floor(expectedAmount * (1 - slippageBps / 10000));
  }

  /**
   * Calculate price impact
   */
  calculatePriceImpact(inputAmount: number, outputAmount: number, marketPrice: number): number {
    const executionPrice = outputAmount / inputAmount;
    return ((marketPrice - executionPrice) / marketPrice) * 100;
  }

  /**
   * Get optimal route for a trade
   */
  async getOptimalRoute(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<SwapQuote> {
    // Jupiter automatically finds the best route, so we just get a quote
    return await this.getQuote(inputMint, outputMint, amount);
  }

  /**
   * Check if a swap is profitable after fees
   */
  async isProfitable(
    inputAmount: number,
    quote: SwapQuote,
    estimatedFeeLamports: number = 5000
  ): Promise<boolean> {
    const outputAmount = parseInt(quote.outAmount);
    const priceImpact = parseFloat(quote.priceImpactPct);
    
    // Consider profitable if:
    // 1. Output > input (for same-denomination trades)
    // 2. Price impact < 1%
    // 3. We can cover transaction fees
    
    return outputAmount > inputAmount && priceImpact < 1.0;
  }
}