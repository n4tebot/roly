import { RolyConfig } from '../config.js';
export declare enum SurvivalTier {
    NORMAL = "normal",
    LOW_COMPUTE = "low_compute",
    CRITICAL = "critical",
    DEAD = "dead"
}
export interface AgentContext {
    identity: {
        agentId: string;
        publicKey: string;
        generation: number;
        parentId?: string;
    };
    survival: {
        tier: SurvivalTier;
        usdcBalance: number;
        usdcBalanceFormatted: string;
        solBalance: number;
        solBalanceFormatted: string;
        daysSurvived: number;
        lastEarning?: Date;
    };
    environment: {
        cluster: string;
        blockHeight: number;
        timestamp: Date;
        isMainnet: boolean;
    };
    capabilities: {
        canTrade: boolean;
        canSelfModify: boolean;
        canReplicate: boolean;
        modelTier: 'frontier' | 'efficient' | 'minimal';
    };
    recentHistory: Array<{
        timestamp: Date;
        action: string;
        result: string;
        success: boolean;
    }>;
    goals: {
        shortTerm: string[];
        longTerm: string[];
        currentFocus?: string;
    };
    threats: string[];
    opportunities: string[];
}
export declare function buildAgentContext(config: RolyConfig): Promise<AgentContext>;
