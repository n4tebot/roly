#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { setupWizard } from './setup/wizard.js';
import { loadConfig } from './config.js';
import { AgentLoop } from './agent/loop.js';
import { HeartbeatDaemon } from './heartbeat/daemon.js';
const program = new Command();
const CONFIG_DIR = join(homedir(), '.roly');
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml');
program
    .name('roly')
    .description('Self-funding autonomous AI agent on Solana')
    .version('0.1.0');
program
    .command('init')
    .description('Initialize Roly with interactive setup')
    .action(async () => {
    console.log(chalk.blue('🤖 Welcome to Roly - Autonomous AI Agent on Solana\n'));
    if (existsSync(CONFIG_FILE)) {
        console.log(chalk.yellow('⚠️  Roly is already initialized.'));
        console.log(chalk.gray(`Config found at: ${CONFIG_FILE}`));
        process.exit(0);
    }
    await setupWizard();
    console.log(chalk.green('\n✅ Roly initialized successfully!'));
    console.log(chalk.gray('Run `roly start` to begin autonomous operation.'));
});
program
    .command('start')
    .description('Start the autonomous agent')
    .option('-d, --daemon', 'Run in daemon mode')
    .action(async (options) => {
    if (!existsSync(CONFIG_FILE)) {
        console.log(chalk.red('❌ Roly not initialized. Run `roly init` first.'));
        process.exit(1);
    }
    const spinner = ora('Loading Roly configuration...').start();
    try {
        const config = await loadConfig();
        spinner.succeed('Configuration loaded');
        // Initialize heartbeat daemon
        const heartbeat = new HeartbeatDaemon(config);
        // Start main agent loop
        const agent = new AgentLoop(config);
        console.log(chalk.green('🚀 Starting Roly autonomous operation...'));
        console.log(chalk.gray(`Agent ID: ${config.identity.agentId}`));
        console.log(chalk.gray(`Wallet: ${config.identity.publicKey}`));
        // Start heartbeat in background
        await heartbeat.start();
        // Start main agent loop
        await agent.start();
    }
    catch (error) {
        spinner.fail('Failed to start Roly');
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
    }
});
program
    .command('status')
    .description('Check agent status and health')
    .action(async () => {
    if (!existsSync(CONFIG_FILE)) {
        console.log(chalk.red('❌ Roly not initialized. Run `roly init` first.'));
        process.exit(1);
    }
    try {
        const config = await loadConfig();
        console.log(chalk.blue('🤖 Roly Status Report\n'));
        console.log(chalk.gray(`Agent ID: ${config.identity.agentId}`));
        console.log(chalk.gray(`Public Key: ${config.identity.publicKey}`));
        console.log(chalk.gray(`Config Directory: ${CONFIG_DIR}`));
        // TODO: Add balance check, health status, etc.
    }
    catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
        process.exit(1);
    }
});
program
    .command('stop')
    .description('Stop the running agent')
    .action(async () => {
    console.log(chalk.yellow('⏹️  Stopping Roly...'));
    // TODO: Implement graceful shutdown
    console.log(chalk.green('✅ Roly stopped'));
});
// Handle errors gracefully
process.on('uncaughtException', (error) => {
    console.error(chalk.red('💥 Uncaught Exception:'), error);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error(chalk.red('💥 Unhandled Rejection:'), reason);
    process.exit(1);
});
// Graceful shutdown
process.on('SIGINT', () => {
    console.log(chalk.yellow('\n⏹️  Shutting down gracefully...'));
    process.exit(0);
});
program.parse();
