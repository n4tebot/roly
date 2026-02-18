import { RolyConfig } from '../config.js';
import { SurvivalTier } from '../agent/context.js';
export interface HeartbeatStatus {
    isRunning: boolean;
    lastBeat: Date;
    beatCount: number;
    currentTier: SurvivalTier;
    nextBeatIn: number;
    errors: string[];
}
export declare class HeartbeatDaemon {
    private config;
    private tasks;
    private isRunning;
    private beatCount;
    private lastBeat?;
    private currentTier;
    private errors;
    private intervalId?;
    constructor(config: RolyConfig);
    /**
     * Start the heartbeat daemon
     */
    start(): Promise<void>;
    /**
     * Stop the heartbeat daemon
     */
    stop(): void;
    /**
     * Perform a single heartbeat cycle
     */
    private performHeartbeat;
    /**
     * Schedule the next heartbeat based on current survival tier
     */
    private scheduleNextHeartbeat;
    /**
     * Get heartbeat interval based on survival tier
     */
    private getHeartbeatInterval;
    /**
     * Force a heartbeat (for testing or manual trigger)
     */
    forceHeartbeat(): Promise<void>;
    /**
     * Get current status
     */
    getStatus(): HeartbeatStatus;
    /**
     * Update configuration (for tier thresholds changes)
     */
    updateConfig(newConfig: RolyConfig): void;
    /**
     * Get heartbeat history/stats
     */
    getStats(): any;
    /**
     * Handle emergency shutdown
     */
    emergencyShutdown(reason: string): void;
    /**
     * Check if daemon is healthy
     */
    isHealthy(): boolean;
}
