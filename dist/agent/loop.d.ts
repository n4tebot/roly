import { RolyConfig } from '../config.js';
export interface AgentMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}
export interface AgentTurn {
    id: string;
    timestamp: Date;
    thought: string;
    action?: {
        tool: string;
        input: any;
        output?: any;
        error?: string;
    };
    observation: string;
    reflection?: string;
}
export declare class AgentLoop {
    private config;
    private tools;
    private database;
    private isRunning;
    private turnCount;
    constructor(config: RolyConfig);
    /**
     * Start the main agent loop
     */
    start(): Promise<void>;
    /**
     * Stop the agent loop
     */
    stop(): void;
    /**
     * Execute a single ReAct turn: Think → Act → Observe → Repeat
     */
    private executeTurn;
    /**
     * Call the LLM (OpenRouter)
     */
    private callLLM;
    /**
     * Generate observation from action results
     */
    private generateObservation;
    /**
     * Sleep utility
     */
    private sleep;
    /**
     * Get current status
     */
    getStatus(): Promise<{
        isRunning: boolean;
        turnCount: number;
        currentTime: Date;
        config: {
            agentId: string;
            model: string;
            cluster: "mainnet-beta" | "devnet" | "testnet";
        };
    }>;
    /**
     * Execute a single turn manually (for testing)
     */
    executeManualTurn(userInput?: string): Promise<AgentTurn>;
}
