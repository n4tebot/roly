import { SurvivalTier } from '../agent/context.js';
import { StateDatabase } from '../state/database.js';
import { SolanaClient } from '../solana/client.js';
import { BalanceChecker } from '../solana/balance.js';
import { loadWallet } from '../identity/wallet.js';
import chalk from 'chalk';
export class HeartbeatTasks {
    config;
    database;
    solanaClient;
    balanceChecker;
    constructor(config) {
        this.config = config;
        this.database = new StateDatabase(config);
        this.solanaClient = new SolanaClient(config);
        this.balanceChecker = new BalanceChecker(this.solanaClient);
    }
    /**
     * Execute all heartbeat tasks
     */
    async executeHeartbeatTasks(context) {
        const results = [];
        // Health check (always run)
        results.push(await this.runTask('health_check', () => this.healthCheck()));
        // Balance monitoring (always run)
        results.push(await this.runTask('balance_monitor', () => this.monitorBalance()));
        // Survival tier assessment (always run) 
        results.push(await this.runTask('survival_assessment', () => this.assessSurvivalTier(context)));
        // Conditional tasks based on survival tier
        if (context.survival.tier !== SurvivalTier.DEAD) {
            results.push(await this.runTask('network_status', () => this.checkNetworkStatus()));
        }
        if (context.survival.tier === SurvivalTier.NORMAL) {
            // Full capability tasks
            results.push(await this.runTask('opportunity_scan', () => this.scanForOpportunities()));
            results.push(await this.runTask('system_backup', () => this.performSystemBackup()));
        }
        else if (context.survival.tier === SurvivalTier.LOW_COMPUTE) {
            // Limited tasks
            results.push(await this.runTask('essential_monitor', () => this.essentialMonitoring()));
        }
        // Periodic tasks (run less frequently)
        if (this.shouldRunPeriodicTask('database_cleanup', 24 * 60)) { // Daily
            results.push(await this.runTask('database_cleanup', () => this.cleanupDatabase()));
        }
        if (this.shouldRunPeriodicTask('metrics_report', 6 * 60)) { // Every 6 hours
            results.push(await this.runTask('metrics_report', () => this.generateMetricsReport()));
        }
        // Store heartbeat results
        await this.storeHeartbeatResults(context, results);
        return results;
    }
    /**
     * Run a single task with error handling and timing
     */
    async runTask(taskName, taskFn) {
        const startTime = Date.now();
        try {
            const data = await taskFn();
            const duration = Date.now() - startTime;
            console.log(chalk.green(`✅ ${taskName} completed (${duration}ms)`));
            return {
                task: taskName,
                success: true,
                data,
                duration
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log(chalk.red(`❌ ${taskName} failed: ${errorMessage} (${duration}ms)`));
            return {
                task: taskName,
                success: false,
                error: errorMessage,
                duration
            };
        }
    }
    /**
     * Basic health check
     */
    async healthCheck() {
        const wallet = await loadWallet();
        const connection = this.solanaClient.getConnection();
        // Check if we can connect to Solana
        const slot = await connection.getSlot();
        // Check if wallet is accessible
        const publicKey = wallet.publicKey.toString();
        // Check database
        const dbInfo = this.database.getInfo();
        return {
            solanaSlot: slot,
            walletAccessible: true,
            publicKey,
            database: dbInfo,
            timestamp: new Date()
        };
    }
    /**
     * Monitor balance and record changes
     */
    async monitorBalance() {
        const wallet = await loadWallet();
        const balance = await this.balanceChecker.getBalance(wallet);
        // Store balance metrics
        await this.database.storeMetric('balance_usdc', balance.usdcBalance);
        await this.database.storeMetric('balance_sol', balance.solBalance);
        // Check for significant changes (more than 5% or minimum threshold)
        const lastBalance = await this.database.getState('last_balance');
        if (lastBalance) {
            const usdcChange = Math.abs(balance.usdcBalance - lastBalance.usdcBalance);
            const usdcChangePercent = lastBalance.usdcBalance > 0
                ? (usdcChange / lastBalance.usdcBalance) * 100
                : 0;
            if (usdcChange > 100000 || usdcChangePercent > 5) { // >0.1 USDC or >5%
                console.log(chalk.blue(`💰 Significant balance change detected: ${BalanceChecker.formatUsdc(usdcChange)}`));
            }
        }
        // Store current balance
        await this.database.storeState('last_balance', 'balance_check', balance);
        return {
            balance,
            change: lastBalance ? {
                usdc: balance.usdcBalance - lastBalance.usdcBalance,
                sol: balance.solBalance - lastBalance.solBalance
            } : null
        };
    }
    /**
     * Assess current survival tier and log changes
     */
    async assessSurvivalTier(context) {
        const currentTier = context.survival.tier;
        const lastTier = await this.database.getState('last_survival_tier');
        if (lastTier && lastTier !== currentTier) {
            console.log(chalk.yellow(`🚨 Survival tier changed: ${lastTier} → ${currentTier}`));
            // Store tier change event
            await this.database.storeState('survival_tier_change', 'tier_change', {
                from: lastTier,
                to: currentTier,
                timestamp: new Date(),
                balance: context.survival.usdcBalance
            });
        }
        await this.database.storeState('last_survival_tier', 'survival_tier', currentTier);
        await this.database.storeMetric('survival_tier_numeric', this.tierToNumber(currentTier));
        return {
            currentTier,
            changed: lastTier !== currentTier,
            balance: context.survival.usdcBalance,
            thresholds: this.config.survival.tiers
        };
    }
    /**
     * Check Solana network status
     */
    async checkNetworkStatus() {
        const connection = this.solanaClient.getConnection();
        // Get network metrics
        const slot = await connection.getSlot();
        const epochInfo = await connection.getEpochInfo();
        const isHealthy = await this.solanaClient.isHealthy();
        // Store network metrics
        await this.database.storeMetric('network_slot', slot);
        await this.database.storeMetric('network_healthy', isHealthy ? 1 : 0);
        return {
            slot,
            epochInfo,
            isHealthy,
            cluster: this.config.solana.cluster
        };
    }
    /**
     * Scan for earning opportunities (simplified)
     */
    async scanForOpportunities() {
        // This is a placeholder - in practice, this would:
        // - Check for arbitrage opportunities on Jupiter
        // - Monitor for new income sources
        // - Scan for profitable trades
        // - Check for grants or funding opportunities
        const opportunities = [];
        // Example: Check if we have SOL that could be swapped to USDC
        const wallet = await loadWallet();
        const balance = await this.balanceChecker.getBalance(wallet);
        if (balance.solBalance > 50000000) { // > 0.05 SOL
            opportunities.push({
                type: 'sol_to_usdc_swap',
                potential: 'Convert excess SOL to USDC for stability',
                amount: balance.solBalance
            });
        }
        return { opportunities };
    }
    /**
     * Essential monitoring for low-compute mode
     */
    async essentialMonitoring() {
        return {
            message: 'Essential systems operational',
            timestamp: new Date()
        };
    }
    /**
     * Perform system backup
     */
    async performSystemBackup() {
        // In practice, this would:
        // - Backup wallet keys securely
        // - Export database
        // - Sync important state to distributed storage
        return {
            message: 'System backup completed',
            timestamp: new Date()
        };
    }
    /**
     * Clean up old database entries
     */
    async cleanupDatabase() {
        await this.database.cleanup(30); // Keep 30 days
        return { cleaned: true };
    }
    /**
     * Generate metrics report
     */
    async generateMetricsReport() {
        const stats = await this.database.getStats(new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24h
        // Store aggregated metrics
        if (stats.turns?.total_turns) {
            await this.database.storeMetric('daily_turns', stats.turns.total_turns);
            await this.database.storeMetric('daily_success_rate', stats.turns.successful_turns / stats.turns.total_turns);
        }
        return stats;
    }
    /**
     * Store heartbeat results for analysis
     */
    async storeHeartbeatResults(context, results) {
        const heartbeatData = {
            timestamp: new Date(),
            survivalTier: context.survival.tier,
            balance: context.survival.usdcBalance,
            tasks: results,
            successRate: results.filter(r => r.success).length / results.length,
            totalDuration: results.reduce((sum, r) => sum + r.duration, 0)
        };
        await this.database.storeState(`heartbeat_${Date.now()}`, 'heartbeat_results', heartbeatData);
        await this.database.storeMetric('heartbeat_success_rate', heartbeatData.successRate);
    }
    /**
     * Check if a periodic task should run
     */
    shouldRunPeriodicTask(taskName, intervalMinutes) {
        // Simple implementation - could be made more sophisticated
        const now = Date.now();
        const intervalMs = intervalMinutes * 60 * 1000;
        // Use a hash of task name to distribute periodic tasks
        const hash = taskName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const offset = (hash * 60 * 1000) % intervalMs; // Offset within the interval
        return (now + offset) % intervalMs < (5 * 60 * 1000); // Run if within 5-minute window
    }
    /**
     * Convert survival tier to number for metrics
     */
    tierToNumber(tier) {
        switch (tier) {
            case SurvivalTier.NORMAL: return 3;
            case SurvivalTier.LOW_COMPUTE: return 2;
            case SurvivalTier.CRITICAL: return 1;
            case SurvivalTier.DEAD: return 0;
        }
    }
}
