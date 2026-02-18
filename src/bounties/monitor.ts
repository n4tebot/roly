import { Bounty, BountyScraper } from './scraper.js';
import { ExecutionResult } from './executor.js';
import { RolyConfig } from '../config.js';
import { StateDatabase } from '../state/database.js';
import { SolanaClient } from '../solana/client.js';
import { BalanceChecker } from '../solana/balance.js';
import { loadWallet } from '../identity/wallet.js';
import axios from 'axios';

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
  amount: number; // micro-USDC
  token: string;
  transaction_signature?: string;
  timestamp: Date;
  confidence: 'low' | 'medium' | 'high';
}

export class BountyMonitor {
  private config: RolyConfig;
  private database: StateDatabase;
  private scraper: BountyScraper;
  private solanaClient: SolanaClient;
  private balanceChecker: BalanceChecker;
  private lastBalanceCheck: Map<string, number> = new Map(); // Track balance changes

  constructor(config: RolyConfig) {
    this.config = config;
    this.database = new StateDatabase(config);
    this.scraper = new BountyScraper(config);
    this.solanaClient = new SolanaClient(config);
    this.balanceChecker = new BalanceChecker(this.solanaClient);
  }

  /**
   * Monitor all submitted bounties for status changes and payments
   */
  async monitorAllBounties(): Promise<BountyMonitorResult[]> {
    console.log('🔍 Monitoring bounty status and payments...');
    
    // Get all submitted or claimed bounties
    const activeBounties = await this.scraper.getBounties('submitted', undefined, 100);
    const claimedBounties = await this.scraper.getBounties('claimed', undefined, 100);
    
    const allBounties = [...activeBounties, ...claimedBounties];
    const results: BountyMonitorResult[] = [];

    // Check wallet balance for payments
    await this.checkForPayments();

    // Monitor each bounty individually
    for (const bounty of allBounties) {
      try {
        const result = await this.monitorBounty(bounty);
        results.push(result);
        
        if (result.changed) {
          console.log(`📈 Bounty status change: ${bounty.title} -> ${result.current_status}`);
          
          // Update bounty status in database
          await this.scraper.updateBountyStatus(bounty.id, result.current_status);
        }
        
        // Rate limiting
        await this.sleep(200);
      } catch (error) {
        console.error(`Error monitoring bounty ${bounty.id}:`, error);
        
        results.push({
          bounty_id: bounty.id,
          previous_status: bounty.status,
          current_status: bounty.status,
          changed: false,
          notes: [`Monitoring failed: ${error}`],
          last_checked: new Date()
        });
      }
    }

    // Store monitoring results
    await this.storeMonitoringResults(results);

    console.log(`✅ Monitored ${results.length} bounties`);
    return results;
  }

  /**
   * Monitor a specific bounty
   */
  async monitorBounty(bounty: Bounty): Promise<BountyMonitorResult> {
    const previousStatus = bounty.status;
    let currentStatus = bounty.status;
    let notes: string[] = [];
    
    try {
      if (bounty.source === 'github') {
        const githubResult = await this.monitorGitHubBounty(bounty);
        currentStatus = githubResult.status;
        notes = [...notes, ...githubResult.notes];
      } else if (bounty.source === 'superteam') {
        const superteamResult = await this.monitorSuperteamBounty(bounty);
        currentStatus = superteamResult.status;
        notes = [...notes, ...superteamResult.notes];
      }
    } catch (error) {
      notes.push(`Monitoring error: ${error instanceof Error ? error.message : error}`);
    }

    return {
      bounty_id: bounty.id,
      previous_status: previousStatus,
      current_status: currentStatus,
      changed: previousStatus !== currentStatus,
      notes,
      last_checked: new Date()
    };
  }

  /**
   * Monitor GitHub bounty status
   */
  private async monitorGitHubBounty(bounty: Bounty): Promise<{status: 'open' | 'claimed' | 'submitted' | 'completed', notes: string[]}> {
    if (!bounty.metadata?.repository || !bounty.metadata?.number) {
      return { status: bounty.status, notes: ['Missing GitHub metadata'] };
    }

    const notes: string[] = [];
    let status: 'open' | 'claimed' | 'submitted' | 'completed' = bounty.status;

    try {
      // Check issue status
      const issueResponse = await axios.get(
        `https://api.github.com/repos/${bounty.metadata.repository}/issues/${bounty.metadata.number}`,
        {
          headers: this.getGitHubHeaders(),
          timeout: 10000
        }
      );

      const issue = issueResponse.data;
      notes.push(`Issue state: ${issue.state}`);

      if (issue.state === 'closed') {
        status = 'completed' as const;
        notes.push('Issue closed - bounty likely completed');
      }

      // Check for related PRs
      const prsResponse = await axios.get(
        `https://api.github.com/repos/${bounty.metadata.repository}/pulls`,
        {
          params: {
            state: 'all',
            per_page: 50
          },
          headers: this.getGitHubHeaders(),
          timeout: 10000
        }
      );

      const relatedPRs = prsResponse.data.filter((pr: any) => 
        pr.body?.includes(`#${bounty.metadata.number}`) || 
        pr.title.toLowerCase().includes('bounty') ||
        pr.head.ref.includes('bounty')
      );

      if (relatedPRs.length > 0) {
        notes.push(`Found ${relatedPRs.length} related PRs`);
        
        const mergedPRs = relatedPRs.filter((pr: any) => pr.merged_at);
        if (mergedPRs.length > 0) {
          status = 'completed' as const;
          notes.push(`${mergedPRs.length} PRs merged - bounty likely completed`);
        } else {
          const openPRs = relatedPRs.filter((pr: any) => pr.state === 'open');
          if (openPRs.length > 0) {
            status = 'submitted' as const;
            notes.push(`${openPRs.length} PRs pending review`);
          }
        }
      }

      // Check comments for payment confirmation
      const commentsResponse = await axios.get(
        `https://api.github.com/repos/${bounty.metadata.repository}/issues/${bounty.metadata.number}/comments`,
        {
          headers: this.getGitHubHeaders(),
          timeout: 10000
        }
      );

      const paymentComments = commentsResponse.data.filter((comment: any) => 
        comment.body.toLowerCase().includes('payment') ||
        comment.body.toLowerCase().includes('reward') ||
        comment.body.toLowerCase().includes('bounty paid')
      );

      if (paymentComments.length > 0) {
        notes.push('Payment-related comments found');
      }

    } catch (error) {
      notes.push(`GitHub API error: ${error}`);
    }

    return { status, notes };
  }

  /**
   * Monitor Superteam bounty status
   */
  private async monitorSuperteamBounty(bounty: Bounty): Promise<{status: 'open' | 'claimed' | 'submitted' | 'completed', notes: string[]}> {
    const notes: string[] = [];
    let status: 'open' | 'claimed' | 'submitted' | 'completed' = bounty.status;

    try {
      // Check Superteam API or scrape page for status updates
      const response = await axios.get(bounty.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Roly-Agent/1.0'
        }
      });

      const pageContent = response.data.toLowerCase();
      
      if (pageContent.includes('closed') || pageContent.includes('completed')) {
        status = 'completed' as const;
        notes.push('Bounty marked as completed on Superteam');
      } else if (pageContent.includes('in progress') || pageContent.includes('assigned')) {
        status = 'claimed' as const;
        notes.push('Bounty appears to be in progress');
      }

      // Look for payment indicators
      if (pageContent.includes('paid') || pageContent.includes('reward sent')) {
        notes.push('Payment indicators found on page');
      }

    } catch (error) {
      notes.push(`Superteam monitoring error: ${error}`);
    }

    return { status, notes };
  }

  /**
   * Check wallet for incoming payments that might be bounty rewards
   */
  async checkForPayments(): Promise<PaymentDetection[]> {
    const payments: PaymentDetection[] = [];
    
    try {
      const wallet = await loadWallet();
      const currentBalance = await this.balanceChecker.getBalance(wallet);
      
      // Get previous balance from last check
      const lastUsdcBalance = this.lastBalanceCheck.get('usdc') || 0;
      const lastSolBalance = this.lastBalanceCheck.get('sol') || 0;
      
      // Check for USDC increases
      if (currentBalance.usdcBalance > lastUsdcBalance) {
        const increase = currentBalance.usdcBalance - lastUsdcBalance;
        
        // Try to match increase to active bounties
        const matchingBounty = await this.matchPaymentToBounty(increase, 'USDC');
        
        payments.push({
          bounty_id: matchingBounty?.id || 'unknown',
          amount: increase,
          token: 'USDC',
          timestamp: new Date(),
          confidence: matchingBounty ? 'high' : 'medium'
        });
        
        console.log(`💰 USDC payment detected: ${BalanceChecker.formatUsdc(increase)}`);
      }
      
      // Check for SOL increases
      if (currentBalance.solBalance > lastSolBalance) {
        const increase = currentBalance.solBalance - lastSolBalance;
        
        payments.push({
          bounty_id: 'unknown',
          amount: increase,
          token: 'SOL',
          timestamp: new Date(),
          confidence: 'low' // SOL payments are less common for bounties
        });
        
        console.log(`💰 SOL payment detected: ${BalanceChecker.formatSol(increase)}`);
      }
      
      // Store current balances for next check
      this.lastBalanceCheck.set('usdc', currentBalance.usdcBalance);
      this.lastBalanceCheck.set('sol', currentBalance.solBalance);
      
      // Store payment detections
      for (const payment of payments) {
        await this.storePaymentDetection(payment);
      }
      
    } catch (error) {
      console.error('Error checking for payments:', error);
    }
    
    return payments;
  }

  /**
   * Try to match a payment amount to a known bounty
   */
  private async matchPaymentToBounty(amount: number, token: string): Promise<Bounty | null> {
    const activeBounties = await this.scraper.getBounties('submitted');
    
    // Look for bounties with matching reward amounts
    for (const bounty of activeBounties) {
      if (bounty.reward_token === token && Math.abs(bounty.reward_amount - amount) < 100000) { // Within 0.1 USDC
        return bounty;
      }
    }
    
    return null;
  }

  /**
   * Get recent transaction history to identify specific payments
   */
  async getRecentTransactionHistory(): Promise<any[]> {
    try {
      const wallet = await loadWallet();
      const connection = this.solanaClient.getConnection();
      
      // Get recent signatures
      const signatures = await connection.getSignaturesForAddress(
        wallet.publicKey,
        { limit: 20 } // Last 20 transactions
      );
      
      const transactions = [];
      
      for (const sigInfo of signatures.slice(0, 10)) { // Only check last 10 to avoid rate limits
        try {
          const tx = await connection.getTransaction(sigInfo.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });
          
          if (tx && !tx.meta?.err) {
            transactions.push({
              signature: sigInfo.signature,
              slot: sigInfo.slot,
              blockTime: tx.blockTime,
              fee: tx.meta?.fee,
              balanceChanges: this.analyzeBalanceChanges(tx, wallet.publicKey.toString())
            });
          }
        } catch (error) {
          console.warn(`Error fetching transaction ${sigInfo.signature}:`, error);
        }
        
        // Rate limiting
        await this.sleep(100);
      }
      
      return transactions;
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }

  /**
   * Analyze balance changes in a transaction
   */
  private analyzeBalanceChanges(transaction: any, walletAddress: string): any {
    const changes = {
      sol: 0,
      tokens: {}
    };
    
    try {
      if (transaction.meta?.preBalances && transaction.meta?.postBalances) {
        // Find our account index
        const accountIndex = transaction.transaction.message.accountKeys.findIndex(
          (key: any) => key.toString() === walletAddress
        );
        
        if (accountIndex !== -1) {
          changes.sol = transaction.meta.postBalances[accountIndex] - transaction.meta.preBalances[accountIndex];
        }
      }
      
      // Analyze token changes (more complex, would need to parse instruction data)
      // This is simplified for now
      
    } catch (error) {
      console.warn('Error analyzing balance changes:', error);
    }
    
    return changes;
  }

  /**
   * Store payment detection in database
   */
  private async storePaymentDetection(payment: PaymentDetection): Promise<void> {
    const paymentData = {
      bounty_id: payment.bounty_id,
      amount: payment.amount,
      token: payment.token,
      transaction_signature: payment.transaction_signature,
      confidence: payment.confidence,
      detected_at: payment.timestamp.toISOString()
    };
    
    await this.database.storeState(
      `payment_${payment.timestamp.getTime()}`,
      'payment_detection',
      paymentData
    );
    
    // Store as metric for tracking
    await this.database.storeMetric(
      `payment_received_${payment.token.toLowerCase()}`,
      payment.amount
    );
  }

  /**
   * Store monitoring results
   */
  private async storeMonitoringResults(results: BountyMonitorResult[]): Promise<void> {
    const monitoringData = {
      timestamp: new Date().toISOString(),
      bounties_monitored: results.length,
      status_changes: results.filter(r => r.changed).length,
      results: results
    };
    
    await this.database.storeState(
      `bounty_monitoring_${Date.now()}`,
      'bounty_monitoring',
      monitoringData
    );
    
    // Store metrics
    await this.database.storeMetric('bounties_monitored', results.length);
    await this.database.storeMetric('bounty_status_changes', monitoringData.status_changes);
  }

  /**
   * Generate monitoring report
   */
  async generateMonitoringReport(): Promise<any> {
    const activeBounties = await this.scraper.getBounties();
    const recentPayments = await this.getRecentPaymentDetections();
    const recentTransactions = await this.getRecentTransactionHistory();
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_bounties: activeBounties.length,
        by_status: this.groupBountiesByStatus(activeBounties),
        by_source: this.groupBountiesBySource(activeBounties)
      },
      recent_payments: recentPayments,
      recent_activity: recentTransactions.slice(0, 5),
      earnings: {
        total_detected: recentPayments.reduce((sum, p) => sum + p.amount, 0),
        currency: 'micro-USDC'
      }
    };
    
    return report;
  }

  /**
   * Get recent payment detections
   */
  private async getRecentPaymentDetections(days: number = 7): Promise<PaymentDetection[]> {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    // This would need to be implemented to query the database for payment detections
    // For now, return empty array
    return [];
  }

  /**
   * Group bounties by status
   */
  private groupBountiesByStatus(bounties: Bounty[]): {[key: string]: number} {
    const groups: {[key: string]: number} = {};
    
    for (const bounty of bounties) {
      groups[bounty.status] = (groups[bounty.status] || 0) + 1;
    }
    
    return groups;
  }

  /**
   * Group bounties by source
   */
  private groupBountiesBySource(bounties: Bounty[]): {[key: string]: number} {
    const groups: {[key: string]: number} = {};
    
    for (const bounty of bounties) {
      groups[bounty.source] = (groups[bounty.source] || 0) + 1;
    }
    
    return groups;
  }

  /**
   * Get GitHub API headers
   */
  private getGitHubHeaders(): any {
    const headers: any = {
      'User-Agent': 'Roly-Agent/1.0',
      'Accept': 'application/vnd.github.v3+json'
    };
    
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers.Authorization = `token ${githubToken}`;
    }
    
    return headers;
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}