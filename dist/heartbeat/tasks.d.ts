import { RolyConfig } from '../config.js';
import { AgentContext } from '../agent/context.js';
export interface HeartbeatTaskResult {
    task: string;
    success: boolean;
    data?: any;
    error?: string;
    duration: number;
}
export declare class HeartbeatTasks {
    private config;
    private database;
    private solanaClient;
    private balanceChecker;
    constructor(config: RolyConfig);
    /**
     * Execute all heartbeat tasks
     */
    executeHeartbeatTasks(context: AgentContext): Promise<HeartbeatTaskResult[]>;
    /**
     * Run a single task with error handling and timing
     */
    private runTask;
    /**
     * Basic health check
     */
    private healthCheck;
    /**
     * Monitor balance and record changes
     */
    private monitorBalance;
    /**
     * Assess current survival tier and log changes
     */
    private assessSurvivalTier;
    /**
     * Check Solana network status
     */
    private checkNetworkStatus;
    /**
     * Scan for earning opportunities (simplified)
     */
    private scanForOpportunities;
    /**
     * Essential monitoring for low-compute mode
     */
    private essentialMonitoring;
    /**
     * Perform system backup
     */
    private performSystemBackup;
    /**
     * Clean up old database entries
     */
    private cleanupDatabase;
    /**
     * Generate metrics report
     */
    private generateMetricsReport;
    /**
     * Store heartbeat results for analysis
     */
    private storeHeartbeatResults;
    /**
     * Check if a periodic task should run
     */
    private shouldRunPeriodicTask;
    /**
     * Convert survival tier to number for metrics
     */
    private tierToNumber;
}
