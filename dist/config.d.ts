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
        normal: number;
        lowCompute: number;
        critical: number;
        dead: number;
    };
    heartbeatInterval: {
        normal: number;
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
export declare function loadConfig(configPath?: string): Promise<RolyConfig>;
export declare function getConfigPath(): string;
export declare function getDataDir(): string;
