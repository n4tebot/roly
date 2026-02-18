#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { checkStatus } from './commands/status.js';
import { fundAgent } from './commands/fund.js';
import { viewLogs } from './commands/logs.js';
import { sendMessage } from './commands/send.js';

const program = new Command();

program
  .name('roly-cli')
  .description('CLI for monitoring and interacting with Roly agents')
  .version('0.1.0');

// Status command
program
  .command('status')
  .description('Check agent status and health')
  .option('-j, --json', 'Output as JSON')
  .option('-w, --watch', 'Watch mode (refresh every 10 seconds)')
  .action(async (options) => {
    await checkStatus(options);
  });

// Fund command
program
  .command('fund')
  .description('Fund the agent wallet')
  .option('-a, --amount <amount>', 'Amount to fund (USDC)', '1.0')
  .option('-t, --token <token>', 'Token to fund (usdc|sol)', 'usdc')
  .option('--from <address>', 'Source wallet address')
  .action(async (options) => {
    await fundAgent(options);
  });

// Logs command
program
  .command('logs')
  .description('View agent logs and activity')
  .option('-n, --lines <count>', 'Number of lines to show', '50')
  .option('-f, --follow', 'Follow log output')
  .option('-t, --type <type>', 'Log type (turns|heartbeat|errors|all)', 'all')
  .action(async (options) => {
    await viewLogs(options);
  });

// Send message command
program
  .command('send')
  .description('Send a message to the agent')
  .argument('<message>', 'Message to send')
  .option('-p, --priority', 'High priority message')
  .action(async (message, options) => {
    await sendMessage(message, options);
  });

// Interactive command
program
  .command('interactive')
  .alias('i')
  .description('Enter interactive mode')
  .action(async () => {
    console.log(chalk.blue('🤖 Roly Interactive CLI'));
    console.log(chalk.gray('Type "help" for available commands, "exit" to quit'));
    
    // Simple REPL implementation
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('roly> ')
    });

    rl.prompt();

    rl.on('line', async (input) => {
      const cmd = input.trim();
      
      if (cmd === 'exit' || cmd === 'quit') {
        rl.close();
        return;
      }
      
      if (cmd === 'help') {
        console.log(chalk.blue('Available commands:'));
        console.log('  status     - Show agent status');
        console.log('  balance    - Show wallet balance');
        console.log('  health     - Show system health');
        console.log('  send <msg> - Send message to agent');
        console.log('  help       - Show this help');
        console.log('  exit       - Exit interactive mode');
      } else if (cmd === 'status') {
        await checkStatus({ json: false, watch: false });
      } else if (cmd === 'balance') {
        // Quick balance check
        try {
          const { loadConfig } = await import('../../../src/config.js');
          const { SolanaClient } = await import('../../../src/solana/client.js');
          const { BalanceChecker } = await import('../../../src/solana/balance.js');
          const { loadWallet } = await import('../../../src/identity/wallet.js');
          
          const config = await loadConfig();
          const client = new SolanaClient(config);
          const balanceChecker = new BalanceChecker(client);
          const wallet = await loadWallet();
          const balance = await balanceChecker.getBalance(wallet);
          
          console.log(chalk.green('💰 Balance:'));
          console.log(`  USDC: ${balance.usdcBalanceFormatted}`);
          console.log(`  SOL:  ${balance.solBalanceFormatted}`);
        } catch (error) {
          console.log(chalk.red('❌ Failed to get balance:'), error instanceof Error ? error.message : error);
        }
      } else if (cmd.startsWith('send ')) {
        const message = cmd.slice(5);
        await sendMessage(message, {});
      } else if (cmd) {
        console.log(chalk.red(`Unknown command: ${cmd}. Type "help" for available commands.`));
      }
      
      rl.prompt();
    });

    rl.on('close', () => {
      console.log(chalk.yellow('\n👋 Goodbye!'));
      process.exit(0);
    });
  });

// Error handling
program.configureOutput({
  writeOut: (str) => process.stdout.write(str),
  writeErr: (str) => process.stderr.write(chalk.red(str)),
  outputError: (str, write) => write(chalk.red(`Error: ${str}`))
});

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
  process.exit(1);
});

// Parse arguments
program.parse();