import { Keypair, PublicKey } from '@solana/web3.js';
export interface WalletInfo {
    keypair: Keypair;
    publicKey: PublicKey;
    privateKeyPath: string;
}
/**
 * Generate a new Solana wallet keypair
 */
export declare function generateWallet(): Promise<WalletInfo>;
/**
 * Load wallet from encrypted private key file
 */
export declare function loadWallet(privateKeyPath?: string, password?: string): Promise<WalletInfo>;
/**
 * Save wallet with optional encryption
 */
export declare function saveWallet(wallet: WalletInfo, password?: string): Promise<void>;
/**
 * Export wallet in Phantom-compatible format
 */
export declare function exportForPhantom(wallet: WalletInfo): string;
/**
 * Import wallet from Phantom private key
 */
export declare function importFromPhantom(privateKeyBase58: string): WalletInfo;
/**
 * Get wallet info from configuration
 */
export declare function getWalletFromConfig(): Promise<WalletInfo>;
/**
 * Validate wallet and ensure it's accessible
 */
export declare function validateWallet(wallet: WalletInfo): Promise<boolean>;
/**
 * Create a backup of the wallet
 */
export declare function backupWallet(wallet: WalletInfo, backupPath: string): Promise<void>;
