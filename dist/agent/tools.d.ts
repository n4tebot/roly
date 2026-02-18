import { RolyConfig } from '../config.js';
export declare class AgentTools {
    private config;
    private solanaClient;
    private balanceChecker;
    private usdcTransfer;
    private jupiterSwap;
    constructor(config: RolyConfig);
    /**
     * Execute a tool by name
     */
    executeTool(toolName: string, input: string): Promise<any>;
    /**
     * Parse tool input string into parameters
     */
    private parseToolInput;
    /**
     * Check wallet balance
     */
    checkBalance(): Promise<any>;
    /**
     * Transfer USDC
     */
    transferUsdc(recipient: string, amount: number): Promise<any>;
    /**
     * Transfer SOL
     */
    transferSol(recipient: string, amount: number): Promise<any>;
    /**
     * Trade tokens via Jupiter
     */
    tradeTokens(fromToken: string, toToken: string, amount: number): Promise<any>;
    /**
     * Read file
     */
    readFile(path: string): Promise<any>;
    /**
     * Write file
     */
    writeFile(path: string, content: string): Promise<any>;
    /**
     * Execute shell command
     */
    shellCommand(command: string): Promise<any>;
    /**
     * Web search
     */
    webSearch(query: string): Promise<any>;
    /**
     * Fetch web page content
     */
    webFetch(url: string): Promise<any>;
    /**
     * Git commit
     */
    gitCommit(message: string): Promise<any>;
    /**
     * Git status
     */
    gitStatus(): Promise<any>;
    /**
     * Get available tools list
     */
    getAvailableTools(): string[];
}
