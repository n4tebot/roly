import { SurvivalTier, buildAgentContext } from '../agent/context.js';
import { HeartbeatTasks } from './tasks.js';
import chalk from 'chalk';
export class HeartbeatDaemon {
    config;
    tasks;
    isRunning = false;
    beatCount = 0;
    lastBeat;
    currentTier = SurvivalTier.NORMAL;
    errors = [];
    intervalId;
    constructor(config) {
        this.config = config;
        this.tasks = new HeartbeatTasks(config);
    }
    /**
     * Start the heartbeat daemon
     */
    async start() {
        if (this.isRunning) {
            console.log(chalk.yellow('🔄 Heartbeat daemon already running'));
            return;
        }
        console.log(chalk.blue('💓 Starting heartbeat daemon...'));
        this.isRunning = true;
        // Initial heartbeat
        await this.performHeartbeat();
        // Schedule recurring heartbeats
        this.scheduleNextHeartbeat();
    }
    /**
     * Stop the heartbeat daemon
     */
    stop() {
        if (!this.isRunning)
            return;
        console.log(chalk.yellow('⏹️  Stopping heartbeat daemon...'));
        this.isRunning = false;
        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = undefined;
        }
    }
    /**
     * Perform a single heartbeat cycle
     */
    async performHeartbeat() {
        if (!this.isRunning)
            return;
        console.log(chalk.cyan(`💓 Heartbeat #${this.beatCount + 1}`));
        this.lastBeat = new Date();
        this.beatCount++;
        try {
            // Build current context to assess survival tier
            const context = await buildAgentContext(this.config);
            this.currentTier = context.survival.tier;
            console.log(chalk.gray(`Status: ${this.currentTier.toUpperCase()}, Balance: ${context.survival.usdcBalanceFormatted}`));
            // Execute heartbeat tasks
            await this.tasks.executeHeartbeatTasks(context);
            // Clear errors on successful heartbeat
            this.errors = [];
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(chalk.red('💥 Heartbeat failed:'), errorMessage);
            this.errors.push(errorMessage);
            // Keep only last 10 errors
            if (this.errors.length > 10) {
                this.errors = this.errors.slice(-10);
            }
        }
        // Schedule next heartbeat
        this.scheduleNextHeartbeat();
    }
    /**
     * Schedule the next heartbeat based on current survival tier
     */
    scheduleNextHeartbeat() {
        if (!this.isRunning)
            return;
        const intervalMinutes = this.getHeartbeatInterval();
        const intervalMs = intervalMinutes * 60 * 1000;
        console.log(chalk.gray(`⏰ Next heartbeat in ${intervalMinutes} minutes`));
        this.intervalId = setTimeout(() => {
            this.performHeartbeat();
        }, intervalMs);
    }
    /**
     * Get heartbeat interval based on survival tier
     */
    getHeartbeatInterval() {
        switch (this.currentTier) {
            case SurvivalTier.NORMAL:
                return this.config.survival.heartbeatInterval.normal;
            case SurvivalTier.LOW_COMPUTE:
                return this.config.survival.heartbeatInterval.lowCompute;
            case SurvivalTier.CRITICAL:
            case SurvivalTier.DEAD:
                return this.config.survival.heartbeatInterval.critical;
            default:
                return this.config.survival.heartbeatInterval.normal;
        }
    }
    /**
     * Force a heartbeat (for testing or manual trigger)
     */
    async forceHeartbeat() {
        console.log(chalk.blue('🫀 Forcing manual heartbeat...'));
        await this.performHeartbeat();
    }
    /**
     * Get current status
     */
    getStatus() {
        const nextBeatIn = this.intervalId
            ? this.getHeartbeatInterval() * 60 * 1000 // Approximate
            : 0;
        return {
            isRunning: this.isRunning,
            lastBeat: this.lastBeat || new Date(0),
            beatCount: this.beatCount,
            currentTier: this.currentTier,
            nextBeatIn,
            errors: [...this.errors]
        };
    }
    /**
     * Update configuration (for tier thresholds changes)
     */
    updateConfig(newConfig) {
        console.log(chalk.blue('🔧 Updating heartbeat configuration...'));
        this.config = newConfig;
        this.tasks = new HeartbeatTasks(newConfig);
        // Reschedule with new intervals
        if (this.isRunning && this.intervalId) {
            clearTimeout(this.intervalId);
            this.scheduleNextHeartbeat();
        }
    }
    /**
     * Get heartbeat history/stats
     */
    getStats() {
        return {
            totalBeats: this.beatCount,
            uptime: this.lastBeat
                ? Date.now() - this.lastBeat.getTime() + (this.beatCount * this.getHeartbeatInterval() * 60 * 1000)
                : 0,
            errorRate: this.errors.length > 0 ? this.errors.length / Math.max(this.beatCount, 1) : 0,
            currentInterval: this.getHeartbeatInterval(),
            lastError: this.errors[this.errors.length - 1]
        };
    }
    /**
     * Handle emergency shutdown
     */
    emergencyShutdown(reason) {
        console.log(chalk.red(`🚨 Emergency heartbeat shutdown: ${reason}`));
        this.stop();
        // Log the emergency
        this.errors.push(`EMERGENCY_SHUTDOWN: ${reason}`);
        // Could send alerts, save state, etc.
    }
    /**
     * Check if daemon is healthy
     */
    isHealthy() {
        // Consider unhealthy if:
        // 1. Not running when it should be
        // 2. Too many recent errors
        // 3. Last heartbeat was too long ago
        if (!this.isRunning)
            return false;
        if (this.errors.length > 5)
            return false;
        if (this.lastBeat) {
            const expectedInterval = this.getHeartbeatInterval() * 60 * 1000;
            const timeSinceLastBeat = Date.now() - this.lastBeat.getTime();
            if (timeSinceLastBeat > expectedInterval * 2)
                return false;
        }
        return true;
    }
}
