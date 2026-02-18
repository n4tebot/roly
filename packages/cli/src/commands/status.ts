import chalk from 'chalk';
import { table } from 'table';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface StatusOptions {
  json?: boolean;
  watch?: boolean;
}

export async function checkStatus(options: StatusOptions = {}): Promise<void> {
  const configPath = join(homedir(), '.roly', 'config.yaml');
  
  if (!existsSync(configPath)) {
    console.log(chalk.red('❌ Roly not initialized. Run `roly init` first.'));
    return;
  }

  if (options.watch) {
    await watchStatus();
    return;
  }

  const status = await getAgentStatus();
  
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    displayStatus(status);
  }
}

async function getAgentStatus(): Promise<any> {
  const spinner = ora('Checking agent status...').start();
  
  try {
    // Import modules dynamically to avoid issues with module resolution
    const { loadConfig } = await import('../../../../src/config.js');
    const { SolanaClient } = await import('../../../../src/solana/client.js');
    const { BalanceChecker } = await import('../../../../src/solana/balance.js');
    const { StateDatabase } = await import('../../../../src/state/database.js');
    const { loadWallet } = await import('../../../../src/identity/wallet.js');
    const { buildAgentContext } = await import('../../../../src/agent/context.js');
    
    const config = await loadConfig();
    const client = new SolanaClient(config);
    const balanceChecker = new BalanceChecker(client);
    const database = new StateDatabase(config);
    const wallet = await loadWallet();
    
    // Initialize database to get stats
    await database.initialize();
    
    // Get current context
    const context = await buildAgentContext(config);
    
    // Get balance
    const balance = await balanceChecker.getBalance(wallet);
    
    // Get database stats
    const dbStats = await database.getStats(new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24h
    const dbInfo = database.getInfo();
    
    // Get recent turns
    const recentTurns = await database.getRecentTurns(5);
    
    // Get network status
    const networkHealthy = await client.isHealthy();
    const currentSlot = await client.getCurrentSlot();
    
    database.close();
    spinner.succeed('Status check completed');
    
    return {
      agent: {
        id: config.identity.agentId,
        publicKey: config.identity.publicKey,
        cluster: config.solana.cluster,
        daysSurvived: context.survival.daysSurvived
      },
      survival: {
        tier: context.survival.tier,
        balance: {
          usdc: balance.usdcBalanceFormatted,
          sol: balance.solBalanceFormatted,
          usdcRaw: balance.usdcBalance,
          solRaw: balance.solBalance
        },
        thresholds: config.survival.tiers,
        lastEarning: context.survival.lastEarning
      },
      network: {
        healthy: networkHealthy,
        cluster: config.solana.cluster,
        slot: currentSlot,
        rpcUrl: config.solana.rpcUrl.replace(/\/[\w-]+$/, '/***') // Hide API key
      },
      activity: {
        totalTurns: dbInfo.total_turns,
        recentTurns: dbStats.turns,
        successRate: dbStats.turns?.total_turns 
          ? (dbStats.turns.successful_turns / dbStats.turns.total_turns * 100).toFixed(1) + '%'
          : 'N/A',
        lastTurns: recentTurns.map(turn => ({
          timestamp: turn.timestamp,
          action: turn.action?.tool || 'think',
          success: !turn.action?.error,
          observation: turn.observation.slice(0, 100) + '...'
        }))
      },
      system: {
        configPath: configPath,
        dataDir: config.dataDir,
        logLevel: config.logLevel
      },
      timestamp: new Date()
    };
    
  } catch (error) {
    spinner.fail('Status check failed');
    throw error;
  }
}

function displayStatus(status: any): void {
  console.log(chalk.blue('🤖 Roly Agent Status Report\n'));
  
  // Agent Info
  console.log(chalk.cyan('📋 Agent Information'));
  const agentData = [
    ['Agent ID', status.agent.id],
    ['Public Key', status.agent.publicKey],
    ['Network', status.agent.cluster === 'mainnet-beta' ? chalk.green('Mainnet') : chalk.yellow('Devnet')],
    ['Days Survived', status.agent.daysSurvived.toString()]
  ];
  console.log(table(agentData, { header: false, singleLine: true }));
  
  // Survival Status
  console.log(chalk.cyan('💰 Survival Status'));
  const tierColor = getTierColor(status.survival.tier);
  const survivalData = [
    ['Tier', tierColor(status.survival.tier.toUpperCase())],
    ['USDC Balance', status.survival.balance.usdc],
    ['SOL Balance', status.survival.balance.sol],
    ['Last Earning', status.survival.lastEarning || 'Never']
  ];
  console.log(table(survivalData, { header: false, singleLine: true }));
  
  // Network Status
  console.log(chalk.cyan('🌐 Network Status'));
  const networkData = [
    ['Health', status.network.healthy ? chalk.green('✅ Healthy') : chalk.red('❌ Unhealthy')],
    ['Cluster', status.network.cluster],
    ['Current Slot', status.network.slot.toLocaleString()],
    ['RPC', status.network.rpcUrl]
  ];
  console.log(table(networkData, { header: false, singleLine: true }));
  
  // Activity Summary
  console.log(chalk.cyan('📊 Activity Summary (Last 24h)'));
  const activityData = [
    ['Total Turns', status.activity.totalTurns?.toString() || '0'],
    ['Recent Turns', status.activity.recentTurns?.total_turns?.toString() || '0'],
    ['Success Rate', status.activity.successRate],
    ['Actions with Tools', status.activity.recentTurns?.turns_with_action?.toString() || '0']
  ];
  console.log(table(activityData, { header: false, singleLine: true }));
  
  // Recent Activity
  if (status.activity.lastTurns?.length > 0) {
    console.log(chalk.cyan('🔄 Recent Turns'));
    status.activity.lastTurns.forEach((turn: any, i: number) => {
      const statusIcon = turn.success ? '✅' : '❌';
      const timeAgo = getTimeAgo(new Date(turn.timestamp));
      console.log(`  ${statusIcon} ${turn.action} (${timeAgo})`);
      console.log(chalk.gray(`    ${turn.observation}`));
    });
  }
  
  console.log(chalk.gray(`\nLast updated: ${status.timestamp.toLocaleString()}`));
}

async function watchStatus(): Promise<void> {
  console.log(chalk.blue('👁️  Watching agent status... (Press Ctrl+C to stop)\n'));
  
  const updateStatus = async () => {
    try {
      // Clear screen
      process.stdout.write('\x1b[2J\x1b[0f');
      
      const status = await getAgentStatus();
      displayStatus(status);
    } catch (error) {
      console.log(chalk.red('❌ Failed to get status:'), error instanceof Error ? error.message : error);
    }
  };
  
  // Initial update
  await updateStatus();
  
  // Update every 10 seconds
  const interval = setInterval(updateStatus, 10000);
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(chalk.yellow('\n👋 Stopped watching'));
    process.exit(0);
  });
}

function getTierColor(tier: string): (text: string) => string {
  switch (tier.toLowerCase()) {
    case 'normal': return chalk.green;
    case 'low_compute': return chalk.yellow;
    case 'critical': return chalk.red;
    case 'dead': return chalk.gray;
    default: return chalk.white;
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}