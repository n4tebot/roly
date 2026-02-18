import { Bounty } from './scraper.js';
import { RolyConfig } from '../config.js';
export interface BountyMonitorResult {
    bounty_id: string;
    previous_status: string;
    current_status: string;
    changed: boolean;
    payment_detected?: boolean;
    payment_amount?: number;
    notes: string[];
    last_checked: Date;
}
export interface PaymentDetection {
    bounty_id: string;
    amount: number;
    token: string;
    transaction_signature?: string;
    timestamp: Date;
    confidence: 'low' | 'medium' | 'high';
}
export declare class BountyMonitor {
    private config;
    private database;
    private scraper;
    private solanaClient;
    private balanceChecker;
    private lastBalanceCheck;
    constructor(config: RolyConfig);
    /**
     * Monitor all submitted bounties for status changes and payments
     */
    monitorAllBounties(): Promise<BountyMonitorResult[]>;
    /**
     * Monitor a specific bounty
     */
    monitorBounty(bounty: Bounty): Promise<BountyMonitorResult>;
    /**
     * Monitor GitHub bounty status
     */
    private monitorGitHubBounty;
    /**
     * Monitor Superteam bounty status
     */
    private monitorSuperteamBounty;
    /**
     * Check wallet for incoming payments that might be bounty rewards
     */
    checkForPayments(): Promise<PaymentDetection[]>;
    /**
     * Try to match a payment amount to a known bounty
     */
    private matchPaymentToBounty;
    /**
     * Get recent transaction history to identify specific payments
     */
    getRecentTransactionHistory(): Promise<any[]>;
    /**
     * Analyze balance changes in a transaction
     */
    private analyzeBalanceChanges;
    /**
     * Store payment detection in database
     */
    private storePaymentDetection;
    /**
     * Store monitoring results
     */
    private storeMonitoringResults;
    /**
     * Generate monitoring report
     */
    generateMonitoringReport(): Promise<any>;
    /**
     * Get recent payment detections
     */
    private getRecentPaymentDetections;
    /**
     * Group bounties by status
     */
    private groupBountiesByStatus;
    /**
     * Group bounties by source
     */
    private groupBountiesBySource;
    /**
     * Get GitHub API headers
     */
    private getGitHubHeaders;
    /**
     * Sleep utility for rate limiting
     */
    private sleep;
}
