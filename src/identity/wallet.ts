import { Keypair, PublicKey } from '@solana/web3.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import CryptoJS from 'crypto-js';

export interface WalletInfo {
  keypair: Keypair;
  publicKey: PublicKey;
  privateKeyPath: string;
}

/**
 * Generate a new Solana wallet keypair
 */
export async function generateWallet(): Promise<WalletInfo> {
  const keypair = Keypair.generate();
  const privateKeyPath = join(homedir(), '.roly', 'wallet.key');
  
  return {
    keypair,
    publicKey: keypair.publicKey,
    privateKeyPath
  };
}

/**
 * Load wallet from encrypted private key file
 */
export async function loadWallet(privateKeyPath?: string, password?: string): Promise<WalletInfo> {
  const keyPath = privateKeyPath || join(homedir(), '.roly', 'wallet.key');
  
  if (!existsSync(keyPath)) {
    throw new Error(`Wallet file not found at ${keyPath}`);
  }

  try {
    const keyFileContent = readFileSync(keyPath, 'utf-8');
    let secretKeyArray: number[];

    // Try to decrypt if password provided
    if (password) {
      try {
        const decrypted = CryptoJS.AES.decrypt(keyFileContent, password).toString(CryptoJS.enc.Utf8);
        secretKeyArray = JSON.parse(decrypted);
      } catch {
        throw new Error('Failed to decrypt wallet - incorrect password');
      }
    } else {
      // Assume plain JSON array
      secretKeyArray = JSON.parse(keyFileContent);
    }

    const keypair = Keypair.fromSecretKey(new Uint8Array(secretKeyArray));
    
    return {
      keypair,
      publicKey: keypair.publicKey,
      privateKeyPath: keyPath
    };
  } catch (error) {
    throw new Error(`Failed to load wallet: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Save wallet with optional encryption
 */
export async function saveWallet(wallet: WalletInfo, password?: string): Promise<void> {
  const secretKeyArray = Array.from(wallet.keypair.secretKey);
  let content: string;

  if (password) {
    // Encrypt the private key
    content = CryptoJS.AES.encrypt(JSON.stringify(secretKeyArray), password).toString();
  } else {
    // Store as plain JSON array
    content = JSON.stringify(secretKeyArray);
  }

  writeFileSync(wallet.privateKeyPath, content);
}

/**
 * Export wallet in Phantom-compatible format
 */
export function exportForPhantom(wallet: WalletInfo): string {
  // Phantom expects base58-encoded private key
  const bs58 = require('bs58');
  return bs58.encode(wallet.keypair.secretKey);
}

/**
 * Import wallet from Phantom private key
 */
export function importFromPhantom(privateKeyBase58: string): WalletInfo {
  const bs58 = require('bs58');
  const secretKey = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKey);
  
  return {
    keypair,
    publicKey: keypair.publicKey,
    privateKeyPath: join(homedir(), '.roly', 'wallet.key')
  };
}

/**
 * Get wallet info from configuration
 */
export async function getWalletFromConfig(): Promise<WalletInfo> {
  return loadWallet();
}

/**
 * Validate wallet and ensure it's accessible
 */
export async function validateWallet(wallet: WalletInfo): Promise<boolean> {
  try {
    // Basic validation - can we access the public key?
    const pubkey = wallet.publicKey.toString();
    return pubkey.length === 44 && pubkey.match(/^[A-Za-z0-9]+$/) !== null;
  } catch {
    return false;
  }
}

/**
 * Create a backup of the wallet
 */
export async function backupWallet(wallet: WalletInfo, backupPath: string): Promise<void> {
  const secretKeyArray = Array.from(wallet.keypair.secretKey);
  const backup = {
    publicKey: wallet.publicKey.toString(),
    secretKey: secretKeyArray,
    createdAt: new Date().toISOString(),
    version: '1.0'
  };
  
  writeFileSync(backupPath, JSON.stringify(backup, null, 2));
}