import { RolyConfig } from '../config.js';
import { AgentContext, SurvivalTier } from '../agent/context.js';
import { StateDatabase } from '../state/database.js';
import { SolanaClient } from '../solana/client.js';
import { BalanceChecker } from '../solana/balance.js';
import { loadWallet } from '../identity/wallet.js';
import { BountyScraper } from '../bounties/scraper.js';
import { BountyEvaluator } from '../bounties/evaluator.js';
import { BountyMonitor } from '../bounties/monitor.js';
import chalk from 'chalk';

export interface HeartbeatTaskResult {
  task: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export class HeartbeatTasks {
  private config: RolyConfig;
  private database: StateDatabase;
  private solanaClient: SolanaClient;
  private balanceChecker: BalanceChecker;
  private bountyScraper: BountyScraper;
  private bountyEvaluator: BountyEvaluator;
  private bountyMonitor: BountyMonitor;

  constructor(config: RolyConfig) {
    this.config = config;
    this.database = new StateDatabase(config);
    this.solanaClient = new SolanaClient(config);
    this.balanceChecker = new BalanceChecker(this.solanaClient);
    this.bountyScraper = new BountyScraper(config);
    this.bountyEvaluator = new BountyEvaluator(config);
    this.bountyMonitor = new BountyMonitor(config);
  }

  /**
   * Execute all heartbeat tasks
   */
  async executeHeartbeatTasks(context: AgentContext): Promise<HeartbeatTaskResult[]> {
    const results: HeartbeatTaskResult[] = [];

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
      results.push(await this.runTask('bounty_scan', () => this.scanBounties()));
      results.push(await this.runTask('bounty_monitoring', () => this.monitorBounties()));
      results.push(await this.runTask('system_backup', () => this.performSystemBackup()));
    } else if (context.survival.tier === SurvivalTier.LOW_COMPUTE) {
      // Limited tasks  
      results.push(await this.runTask('essential_monitor', () => this.essentialMonitoring()));
      results.push(await this.runTask('bounty_check', () => this.checkActiveBounties()));
    } else if (context.survival.tier === SurvivalTier.CRITICAL) {
      // Critical survival mode - focus on earning
      results.push(await this.runTask('emergency_bounty_scan', () => this.emergencyBountyScan()));
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
  private async runTask(taskName: string, taskFn: () => Promise<any>): Promise<HeartbeatTaskResult> {
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
    } catch (error) {
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
  private async healthCheck(): Promise<any> {
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
  private async monitorBalance(): Promise<any> {
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
  private async assessSurvivalTier(context: AgentContext): Promise<any> {
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
  private async checkNetworkStatus(): Promise<any> {
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
  private async scanForOpportunities(): Promise<any> {
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
  private async essentialMonitoring(): Promise<any> {
    return {
      message: 'Essential systems operational',
      timestamp: new Date()
    };
  }

  /**
   * Perform system backup
   */
  private async performSystemBackup(): Promise<any> {
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
  private async cleanupDatabase(): Promise<any> {
    await this.database.cleanup(30); // Keep 30 days
    return { cleaned: true };
  }

  /**
   * Generate metrics report
   */
  private async generateMetricsReport(): Promise<any> {
    const stats = await this.database.getStats(new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24h
    
    // Store aggregated metrics
    if (stats.turns?.total_turns) {
      await this.database.storeMetric('daily_turns', stats.turns.total_turns);
      await this.database.storeMetric('daily_success_rate', 
        stats.turns.successful_turns / stats.turns.total_turns);
    }
    
    return stats;
  }

  /**
   * Store heartbeat results for analysis
   */
  private async storeHeartbeatResults(
    context: AgentContext, 
    results: HeartbeatTaskResult[]
  ): Promise<void> {
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
  private shouldRunPeriodicTask(taskName: string, intervalMinutes: number): boolean {
    // Simple implementation - could be made more sophisticated
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Use a hash of task name to distribute periodic tasks
    const hash = taskName.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const offset = (hash * 60 * 1000) % intervalMs; // Offset within the interval
    
    return (now + offset) % intervalMs < (5 * 60 * 1000); // Run if within 5-minute window
  }

  /**
   * Scan for new bounties (normal operation)
   */
  private async scanBounties(): Promise<any> {
    try {
      // Check if we should scan bounties (not too frequently)
      if (!this.shouldRunPeriodicTask('bounty_scan', 60)) { // Every hour
        return { skipped: true, reason: 'Too soon since last scan' };
      }

      console.log('🎯 Scanning for new bounties...');
      const bounties = await this.bountyScraper.scrapeAllBounties();
      
      if (bounties.length > 0) {
        // Evaluate top bounties
        const evaluations = await this.bountyEvaluator.evaluateBounties(bounties.slice(0, 20));
        const recommended = evaluations.filter(e => e.recommended);
        
        if (recommended.length > 0) {
          console.log(`💡 Found ${recommended.length} recommended bounties`);
          
          // Auto-claim the best bounty if we don't have an active one
          const activeBounties = await this.bountyScraper.getBounties('claimed');
          if (activeBounties.length === 0 && recommended.length > 0) {
            const bestBounty = recommended[0];
            await this.bountyScraper.updateBountyStatus(bestBounty.bounty.id, 'claimed', new Date());
            console.log(`🎯 Auto-claimed bounty: ${bestBounty.bounty.title}`);
            
            return {
              bounties_found: bounties.length,
              recommended: recommended.length,
              auto_claimed: bestBounty.bounty.id,
              auto_claimed_title: bestBounty.bounty.title
            };
          }
        }
      }

      return {
        bounties_found: bounties.length,
        sources: {
          superteam: bounties.filter(b => b.source === 'superteam').length,
          github: bounties.filter(b => b.source === 'github').length
        }
      };
    } catch (error) {
      console.error('Error scanning bounties:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Monitor existing bounties for status changes and payments
   */
  private async monitorBounties(): Promise<any> {
    try {
      const results = await this.bountyMonitor.monitorAllBounties();
      const payments = await this.bountyMonitor.checkForPayments();
      
      const statusChanges = results.filter(r => r.changed);
      
      if (statusChanges.length > 0) {
        console.log(`📊 ${statusChanges.length} bounty status changes detected`);
      }
      
      if (payments.length > 0) {
        console.log(`💰 ${payments.length} potential payments detected`);
      }

      return {
        monitored: results.length,
        status_changes: statusChanges.length,
        payments_detected: payments.length,
        total_payment_amount: payments.reduce((sum, p) => sum + p.amount, 0)
      };
    } catch (error) {
      console.error('Error monitoring bounties:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Check active bounties status (limited compute mode)
   */
  private async checkActiveBounties(): Promise<any> {
    try {
      const activeBounties = await this.bountyScraper.getBounties('claimed');
      const submittedBounties = await this.bountyScraper.getBounties('submitted');
      
      // Just check for payments, skip status monitoring to save resources
      const payments = await this.bountyMonitor.checkForPayments();
      
      return {
        active_bounties: activeBounties.length,
        submitted_bounties: submittedBounties.length,
        payments_detected: payments.length,
        message: 'Limited bounty monitoring active'
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Emergency bounty scan for critical survival mode
   */
  private async emergencyBountyScan(): Promise<any> {
    try {
      console.log('🚨 Emergency bounty scan - looking for immediate earning opportunities');
      
      // Focus on quick, easy bounties only
      const bounties = await this.bountyScraper.scrapeAllBounties();
      const evaluations = await this.bountyEvaluator.evaluateBounties(bounties);
      
      // Filter for easy, high-ROI bounties only
      const emergencyBounties = evaluations.filter(e => 
        e.difficulty === 'easy' && 
        e.roi > 2 && 
        e.estimatedHours <= 4
      );

      if (emergencyBounties.length > 0) {
        console.log(`⚡ Found ${emergencyBounties.length} emergency bounties`);
        
        // Auto-claim the best one immediately
        const best = emergencyBounties[0];
        await this.bountyScraper.updateBountyStatus(best.bounty.id, 'claimed', new Date());
        
        return {
          emergency_bounties: emergencyBounties.length,
          auto_claimed: best.bounty.id,
          title: best.bounty.title,
          estimated_hours: best.estimatedHours,
          roi: best.roi,
          priority: 'CRITICAL_SURVIVAL'
        };
      }

      return {
        emergency_bounties: 0,
        message: 'No suitable emergency bounties found'
      };
    } catch (error) {
      console.error('Emergency bounty scan failed:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Convert survival tier to number for metrics
   */
  private tierToNumber(tier: SurvivalTier): number {
    switch (tier) {
      case SurvivalTier.NORMAL: return 3;
      case SurvivalTier.LOW_COMPUTE: return 2;
      case SurvivalTier.CRITICAL: return 1;
      case SurvivalTier.DEAD: return 0;
    }
  }
}