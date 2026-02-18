import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import axios from 'axios';
import { RolyConfig } from '../config.js';
import { SolanaClient } from '../solana/client.js';
import { BalanceChecker } from '../solana/balance.js';
import { UsdcTransfer } from '../solana/transfer.js';
import { JupiterSwap } from '../solana/jupiter.js';
import { loadWallet } from '../identity/wallet.js';
import { BountyScraper } from '../bounties/scraper.js';
import { BountyEvaluator } from '../bounties/evaluator.js';
import { BountyExecutor } from '../bounties/executor.js';
import { BountyMonitor } from '../bounties/monitor.js';

const execAsync = promisify(exec);

export class AgentTools {
  private config: RolyConfig;
  private solanaClient: SolanaClient;
  private balanceChecker: BalanceChecker;
  private usdcTransfer: UsdcTransfer;
  private jupiterSwap: JupiterSwap;
  private bountyScraper: BountyScraper;
  private bountyEvaluator: BountyEvaluator;
  private bountyExecutor: BountyExecutor;
  private bountyMonitor: BountyMonitor;

  constructor(config: RolyConfig) {
    this.config = config;
    this.solanaClient = new SolanaClient(config);
    this.balanceChecker = new BalanceChecker(this.solanaClient);
    this.usdcTransfer = new UsdcTransfer(this.solanaClient);
    this.jupiterSwap = new JupiterSwap(this.solanaClient);
    this.bountyScraper = new BountyScraper(config);
    this.bountyEvaluator = new BountyEvaluator(config);
    this.bountyExecutor = new BountyExecutor(config);
    this.bountyMonitor = new BountyMonitor(config);
  }

  /**
   * Initialize bounty system
   */
  async initializeBountySystem(): Promise<void> {
    await this.bountyScraper.initialize();
    await this.bountyEvaluator.loadSkills();
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, input: string): Promise<any> {
    const parsedInput = this.parseToolInput(input);

    switch (toolName.toLowerCase()) {
      case 'check_balance':
        return await this.checkBalance();
      
      case 'transfer_usdc':
        return await this.transferUsdc(parsedInput.recipient, parsedInput.amount);
      
      case 'transfer_sol':
        return await this.transferSol(parsedInput.recipient, parsedInput.amount);
      
      case 'trade_tokens':
        return await this.tradeTokens(parsedInput.from, parsedInput.to, parsedInput.amount);
      
      case 'read_file':
        return await this.readFile(parsedInput.path);
      
      case 'write_file':
        return await this.writeFile(parsedInput.path, parsedInput.content);
      
      case 'shell_command':
        return await this.shellCommand(parsedInput.command);
      
      case 'web_search':
        return await this.webSearch(parsedInput.query);
      
      case 'web_fetch':
        return await this.webFetch(parsedInput.url);
      
      case 'git_commit':
        return await this.gitCommit(parsedInput.message);
      
      case 'git_status':
        return await this.gitStatus();
      
      case 'scan_bounties':
        return await this.scanBounties();
      
      case 'evaluate_bounties':
        return await this.evaluateBounties(parsedInput.limit);
      
      case 'claim_bounty':
        return await this.claimBounty(parsedInput.bounty_id);
      
      case 'execute_bounty':
        return await this.executeBounty(parsedInput.bounty_id);
      
      case 'check_bounty_status':
        return await this.checkBountyStatus(parsedInput.bounty_id);
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Parse tool input string into parameters
   */
  private parseToolInput(input: string): any {
    try {
      // Try parsing as JSON first
      return JSON.parse(input);
    } catch {
      // Fallback to simple parameter parsing
      const params: any = {};
      
      // Handle common patterns
      if (input.includes('=')) {
        input.split(',').forEach(param => {
          const [key, value] = param.split('=').map(s => s.trim());
          params[key] = value?.replace(/['"]/g, '');
        });
      } else {
        // Single parameter
        params.value = input.trim();
      }
      
      return params;
    }
  }

  /**
   * Check wallet balance
   */
  async checkBalance(): Promise<any> {
    const wallet = await loadWallet();
    const balance = await this.balanceChecker.getBalance(wallet);
    
    return {
      publicKey: wallet.publicKey.toString(),
      usdc: {
        balance: balance.usdcBalance,
        formatted: balance.usdcBalanceFormatted
      },
      sol: {
        balance: balance.solBalance,
        formatted: balance.solBalanceFormatted
      },
      tokenAccount: balance.tokenAccount?.toString(),
      lastUpdated: balance.lastUpdated
    };
  }

  /**
   * Transfer USDC
   */
  async transferUsdc(recipient: string, amount: number): Promise<any> {
    const wallet = await loadWallet();
    
    // Convert amount if it's in USDC (not micro-USDC)
    const amountMicroUsdc = amount < 1000 ? amount * 1_000_000 : amount;
    
    const result = await this.usdcTransfer.transferUsdc(
      wallet,
      recipient,
      amountMicroUsdc
    );
    
    return result;
  }

  /**
   * Transfer SOL
   */
  async transferSol(recipient: string, amount: number): Promise<any> {
    const wallet = await loadWallet();
    
    // Convert amount if it's in SOL (not lamports)
    const amountLamports = amount < 1000 ? amount * 1_000_000_000 : amount;
    
    const result = await this.usdcTransfer.transferSol(
      wallet,
      recipient,
      amountLamports
    );
    
    return result;
  }

  /**
   * Trade tokens via Jupiter
   */
  async tradeTokens(fromToken: string, toToken: string, amount: number): Promise<any> {
    const wallet = await loadWallet();
    
    // Handle common token names
    const tokenMap: { [key: string]: string } = {
      'sol': 'So11111111111111111111111111111111111111112',
      'usdc': this.config.solana.usdcMint,
    };
    
    const fromMint = tokenMap[fromToken.toLowerCase()] || fromToken;
    const toMint = tokenMap[toToken.toLowerCase()] || toToken;
    
    // Get quote first
    const quote = await this.jupiterSwap.getQuote(fromMint, toMint, amount);
    
    // Execute swap
    const result = await this.jupiterSwap.executeSwap(wallet, quote);
    
    return {
      quote,
      result
    };
  }

  /**
   * Read file
   */
  async readFile(path: string): Promise<any> {
    try {
      if (!existsSync(path)) {
        return { error: `File not found: ${path}` };
      }
      
      const content = readFileSync(path, 'utf-8');
      
      return {
        path,
        size: content.length,
        content: content.slice(0, 5000), // Limit content size
        truncated: content.length > 5000
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Write file
   */
  async writeFile(path: string, content: string): Promise<any> {
    try {
      writeFileSync(path, content);
      
      return {
        path,
        size: content.length,
        success: true
      };
    } catch (error) {
      return { 
        path,
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * Execute shell command
   */
  async shellCommand(command: string): Promise<any> {
    try {
      // Safety check - don't allow dangerous commands
      const dangerousCommands = ['rm -rf', 'sudo', 'format', 'del /f'];
      if (dangerousCommands.some(cmd => command.toLowerCase().includes(cmd))) {
        return { error: 'Dangerous command blocked for safety' };
      }
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      
      return {
        command,
        stdout: stdout.slice(0, 2000), // Limit output
        stderr: stderr.slice(0, 1000),
        success: !stderr
      };
    } catch (error) {
      return {
        command,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Web search
   */
  async webSearch(query: string): Promise<any> {
    try {
      // Using a free search API (you might want to use a better one)
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        },
        timeout: 10000
      });
      
      return {
        query,
        results: response.data.RelatedTopics?.slice(0, 5) || [],
        abstract: response.data.Abstract,
        abstractUrl: response.data.AbstractURL
      };
    } catch (error) {
      return {
        query,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Fetch web page content
   */
  async webFetch(url: string): Promise<any> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxContentLength: 100000, // Limit to 100KB
        headers: {
          'User-Agent': 'Roly-Agent/1.0'
        }
      });
      
      return {
        url,
        status: response.status,
        contentType: response.headers['content-type'],
        content: response.data.toString().slice(0, 5000), // Limit content
        truncated: response.data.toString().length > 5000
      };
    } catch (error) {
      return {
        url,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Git commit
   */
  async gitCommit(message: string): Promise<any> {
    try {
      // Add all changes
      await execAsync('git add .');
      
      // Commit with message
      const { stdout, stderr } = await execAsync(`git commit -m "${message}"`);
      
      return {
        message,
        stdout,
        stderr,
        success: !stderr.includes('error')
      };
    } catch (error) {
      return {
        message,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Git status
   */
  async gitStatus(): Promise<any> {
    try {
      const { stdout, stderr } = await execAsync('git status --porcelain');
      
      const changes = stdout.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const status = line.slice(0, 2);
          const file = line.slice(3);
          return { status: status.trim(), file };
        });
      
      return {
        changes,
        hasChanges: changes.length > 0,
        summary: `${changes.length} files changed`
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Scan for new bounties from all sources
   */
  async scanBounties(): Promise<any> {
    try {
      const bounties = await this.bountyScraper.scrapeAllBounties();
      
      return {
        success: true,
        bounties_found: bounties.length,
        bounties: bounties.slice(0, 10), // Return first 10 for overview
        sources: {
          superteam: bounties.filter(b => b.source === 'superteam').length,
          github: bounties.filter(b => b.source === 'github').length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Evaluate and rank available bounties
   */
  async evaluateBounties(limit: number = 10): Promise<any> {
    try {
      const openBounties = await this.bountyScraper.getBounties('open', undefined, 50);
      const evaluations = await this.bountyEvaluator.evaluateBounties(openBounties);
      
      const topBounties = evaluations.slice(0, limit);
      
      return {
        success: true,
        total_evaluated: evaluations.length,
        top_bounties: topBounties.map(e => ({
          id: e.bounty.id,
          title: e.bounty.title,
          source: e.bounty.source,
          score: e.score,
          difficulty: e.difficulty,
          roi: e.roi,
          skills_match: e.skillsMatch,
          estimated_hours: e.estimatedHours,
          reward: `${e.bounty.reward_amount / 1_000_000} ${e.bounty.reward_token}`,
          recommended: e.recommended,
          reasoning: e.reasoning.slice(0, 3) // Top 3 reasons
        })),
        summary: {
          recommended_count: topBounties.filter(e => e.recommended).length,
          avg_score: topBounties.reduce((sum, e) => sum + e.score, 0) / topBounties.length,
          avg_roi: topBounties.reduce((sum, e) => sum + e.roi, 0) / topBounties.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Claim a specific bounty
   */
  async claimBounty(bountyId: string): Promise<any> {
    try {
      if (!bountyId) {
        return { success: false, error: 'Bounty ID is required' };
      }

      // Get bounty details
      const bounties = await this.bountyScraper.getBounties('open');
      const bounty = bounties.find(b => b.id === bountyId);
      
      if (!bounty) {
        return { success: false, error: 'Bounty not found or not available' };
      }

      // Update status to claimed
      await this.bountyScraper.updateBountyStatus(bountyId, 'claimed', new Date());
      
      return {
        success: true,
        bounty_id: bountyId,
        title: bounty.title,
        source: bounty.source,
        reward: `${bounty.reward_amount / 1_000_000} ${bounty.reward_token}`,
        claimed_at: new Date().toISOString(),
        next_step: 'Use execute_bounty to begin work'
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Execute work on a claimed bounty
   */
  async executeBounty(bountyId: string): Promise<any> {
    try {
      if (!bountyId) {
        return { success: false, error: 'Bounty ID is required' };
      }

      // Get bounty details
      const bounties = await this.bountyScraper.getBounties('claimed');
      const bounty = bounties.find(b => b.id === bountyId);
      
      if (!bounty) {
        return { success: false, error: 'Bounty not found or not claimed' };
      }

      // Evaluate the bounty
      const evaluation = await this.bountyEvaluator.evaluateBounty(bounty);
      
      if (!evaluation.recommended) {
        return {
          success: false,
          error: 'Bounty evaluation suggests not to proceed',
          evaluation: {
            score: evaluation.score,
            reasons: evaluation.reasoning
          }
        };
      }

      // Execute the bounty
      console.log(`🎯 Starting bounty execution: ${bounty.title}`);
      const result = await this.bountyExecutor.executeBounty(bounty, evaluation);
      
      // Update bounty status based on execution result
      if (result.success) {
        await this.bountyScraper.updateBountyStatus(bountyId, 'submitted');
        
        // Update agent skills based on successful completion
        await this.bountyEvaluator.updateSkillsFromExperience(bounty, true);
      }

      return {
        success: result.success,
        bounty_id: bountyId,
        title: bounty.title,
        execution_time: result.totalTime,
        cost: result.cost,
        submission_url: result.submissionUrl,
        learnings: result.learnings,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check status of bounties and payments
   */
  async checkBountyStatus(bountyId?: string): Promise<any> {
    try {
      if (bountyId) {
        // Check specific bounty
        const bounties = await this.bountyScraper.getBounties(undefined, undefined, 100);
        const bounty = bounties.find(b => b.id === bountyId);
        
        if (!bounty) {
          return { success: false, error: 'Bounty not found' };
        }

        const monitorResult = await this.bountyMonitor.monitorBounty(bounty);
        
        return {
          success: true,
          bounty_id: bountyId,
          title: bounty.title,
          previous_status: monitorResult.previous_status,
          current_status: monitorResult.current_status,
          changed: monitorResult.changed,
          notes: monitorResult.notes,
          last_checked: monitorResult.last_checked
        };
      } else {
        // Check all active bounties and payments
        const monitorResults = await this.bountyMonitor.monitorAllBounties();
        const payments = await this.bountyMonitor.checkForPayments();
        const report = await this.bountyMonitor.generateMonitoringReport();
        
        return {
          success: true,
          summary: report.summary,
          status_changes: monitorResults.filter(r => r.changed),
          recent_payments: payments,
          earnings: report.earnings
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get available tools list
   */
  getAvailableTools(): string[] {
    return [
      'check_balance',
      'transfer_usdc', 
      'transfer_sol',
      'trade_tokens',
      'read_file',
      'write_file', 
      'shell_command',
      'web_search',
      'web_fetch',
      'git_commit',
      'git_status',
      'scan_bounties',
      'evaluate_bounties',
      'claim_bounty',
      'execute_bounty',
      'check_bounty_status'
    ];
  }
}