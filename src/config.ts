import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

export interface SolanaConfig {
  rpcUrl: string;
  cluster: 'mainnet-beta' | 'devnet' | 'testnet';
  usdcMint: string;
  jupiterApiUrl: string;
}

export interface IdentityConfig {
  agentId: string;
  publicKey: string;
  privateKeyPath: string;
}

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel: string;
}

export interface SurvivalConfig {
  tiers: {
    normal: number;      // USDC threshold for normal operation
    lowCompute: number;  // USDC threshold for low compute mode
    critical: number;    // USDC threshold for critical mode
    dead: number;        // Below this = agent stops
  };
  heartbeatInterval: {
    normal: number;      // Minutes between heartbeats
    lowCompute: number;
    critical: number;
  };
}

export interface RolyConfig {
  identity: IdentityConfig;
  solana: SolanaConfig;
  openrouter: OpenRouterConfig;
  survival: SurvivalConfig;
  dataDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const DEFAULT_CONFIG: Partial<RolyConfig> = {
  solana: {
    rpcUrl: 'https://mainnet.helius-rpc.com/',
    cluster: 'mainnet-beta',
    usdcMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
    jupiterApiUrl: 'https://quote-api.jup.ag/v6'
  },
  openrouter: {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.5-sonnet',
    fallbackModel: 'openai/gpt-4o-mini'
  },
  survival: {
    tiers: {
      normal: 10_000_000,    // 10 USDC (in micro-USDC)
      lowCompute: 5_000_000, // 5 USDC
      critical: 1_000_000,   // 1 USDC
      dead: 0
    },
    heartbeatInterval: {
      normal: 5,       // 5 minutes
      lowCompute: 15,  // 15 minutes
      critical: 60     // 1 hour
    }
  },
  logLevel: 'info'
};

export async function loadConfig(configPath?: string): Promise<RolyConfig> {
  const configFile = configPath || join(homedir(), '.roly', 'config.yaml');
  
  if (!existsSync(configFile)) {
    throw new Error(`Configuration file not found at ${configFile}. Run 'roly init' first.`);
  }

  try {
    const configContent = readFileSync(configFile, 'utf-8');
    const userConfig = parseYaml(configContent) as Partial<RolyConfig>;
    
    // Merge with defaults
    const config: RolyConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      dataDir: join(homedir(), '.roly')
    } as RolyConfig;

    // Validate required fields
    if (!config.identity?.agentId || !config.identity?.publicKey) {
      throw new Error('Invalid configuration: missing identity information');
    }

    if (!config.openrouter?.apiKey) {
      throw new Error('Invalid configuration: missing OpenRouter API key');
    }

    return config;
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : error}`);
  }
}

export function getConfigPath(): string {
  return join(homedir(), '.roly', 'config.yaml');
}

export function getDataDir(): string {
  return join(homedir(), '.roly');
}