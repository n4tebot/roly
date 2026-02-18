import { PublicKey, AccountInfo } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError } from '@solana/spl-token';
import { SolanaClient } from './client.js';
import { WalletInfo } from '../identity/wallet.js';

export interface BalanceInfo {
  usdcBalance: number;        // USDC balance in smallest units (micro-USDC)
  solBalance: number;         // SOL balance in lamports
  usdcBalanceFormatted: number;   // USDC in human-readable format (6 decimals)
  solBalanceFormatted: number;    // SOL in human-readable format (9 decimals)
  tokenAccount: PublicKey | null;
  lastUpdated: Date;
}

export class BalanceChecker {
  private client: SolanaClient;
  private usdcMint: PublicKey;
  
  constructor(client: SolanaClient) {
    this.client = client;
    this.usdcMint = new PublicKey(client.getUsdcMint());
  }

  /**
   * Get comprehensive balance information
   */
  async getBalance(wallet: WalletInfo): Promise<BalanceInfo> {
    const connection = this.client.getConnection();
    
    // Get SOL balance
    const solBalance = await connection.getBalance(wallet.publicKey);
    
    // Get USDC token account
    let usdcBalance = 0;
    let tokenAccount: PublicKey | null = null;
    
    try {
      tokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        wallet.publicKey
      );
      
      const accountInfo = await getAccount(connection, tokenAccount);
      usdcBalance = Number(accountInfo.amount);
      
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError || 
          error instanceof TokenInvalidAccountOwnerError) {
        // Token account doesn't exist yet - balance is 0
        usdcBalance = 0;
        tokenAccount = null;
      } else {
        console.error('Error getting USDC balance:', error);
        throw error;
      }
    }

    return {
      usdcBalance,
      solBalance,
      usdcBalanceFormatted: usdcBalance / 1_000_000, // USDC has 6 decimals
      solBalanceFormatted: solBalance / 1_000_000_000, // SOL has 9 decimals
      tokenAccount,
      lastUpdated: new Date()
    };
  }

  /**
   * Get just USDC balance (faster)
   */
  async getUsdcBalance(wallet: WalletInfo): Promise<number> {
    const balance = await this.getBalance(wallet);
    return balance.usdcBalance;
  }

  /**
   * Get just SOL balance
   */
  async getSolBalance(wallet: WalletInfo): Promise<number> {
    const connection = this.client.getConnection();
    return await connection.getBalance(wallet.publicKey);
  }

  /**
   * Check if wallet has minimum SOL for transactions
   */
  async hasMinimumSol(wallet: WalletInfo, minLamports = 10_000): Promise<boolean> {
    const balance = await this.getSolBalance(wallet);
    return balance >= minLamports;
  }

  /**
   * Format USDC amount for display
   */
  static formatUsdc(microUsdc: number): string {
    const usdc = microUsdc / 1_000_000;
    return usdc.toFixed(6) + ' USDC';
  }

  /**
   * Format SOL amount for display
   */
  static formatSol(lamports: number): string {
    const sol = lamports / 1_000_000_000;
    return sol.toFixed(9) + ' SOL';
  }

  /**
   * Parse USDC amount from human input
   */
  static parseUsdc(usdcAmount: string | number): number {
    const amount = typeof usdcAmount === 'string' ? parseFloat(usdcAmount) : usdcAmount;
    return Math.floor(amount * 1_000_000); // Convert to micro-USDC
  }

  /**
   * Parse SOL amount from human input
   */
  static parseSol(solAmount: string | number): number {
    const amount = typeof solAmount === 'string' ? parseFloat(solAmount) : solAmount;
    return Math.floor(amount * 1_000_000_000); // Convert to lamports
  }

  /**
   * Get token account address (create if needed)
   */
  async getOrCreateTokenAccount(wallet: WalletInfo): Promise<PublicKey> {
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        wallet.publicKey
      );
      
      // Check if account exists
      const connection = this.client.getConnection();
      const accountInfo = await connection.getAccountInfo(tokenAccount);
      
      if (!accountInfo) {
        throw new TokenAccountNotFoundError();
      }
      
      return tokenAccount;
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        // Account doesn't exist - return the address anyway
        // The caller can decide whether to create it
        return await getAssociatedTokenAddress(
          this.usdcMint,
          wallet.publicKey
        );
      }
      throw error;
    }
  }

  /**
   * Monitor balance changes (polling approach)
   */
  async startBalanceMonitoring(
    wallet: WalletInfo, 
    callback: (balance: BalanceInfo) => void,
    intervalMs = 30000
  ): Promise<() => void> {
    let isMonitoring = true;
    let lastBalance = await this.getBalance(wallet);
    
    const monitor = async () => {
      while (isMonitoring) {
        try {
          const currentBalance = await this.getBalance(wallet);
          
          // Check if balance changed
          if (currentBalance.usdcBalance !== lastBalance.usdcBalance || 
              currentBalance.solBalance !== lastBalance.solBalance) {
            callback(currentBalance);
            lastBalance = currentBalance;
          }
          
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        } catch (error) {
          console.error('Balance monitoring error:', error);
          await new Promise(resolve => setTimeout(resolve, intervalMs * 2)); // Back off on error
        }
      }
    };

    // Start monitoring
    monitor();

    // Return stop function
    return () => {
      isMonitoring = false;
    };
  }
}