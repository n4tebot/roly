import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { stringify as stringifyYaml } from 'yaml';
import chalk from 'chalk';
import { generateWallet } from '../identity/wallet.js';
import { RolyConfig } from '../config.js';
import { ulid } from 'ulid';

const rl = createInterface({ input, output });

export async function setupWizard(): Promise<void> {
  console.log(chalk.blue('🔧 Roly Setup Wizard\n'));
  console.log(chalk.gray('This will create your agent identity and configuration.\n'));

  const dataDir = join(homedir(), '.roly');
  const configPath = join(dataDir, 'config.yaml');

  // Create data directory
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    console.log(chalk.green(`✅ Created data directory: ${dataDir}`));
  }

  // Generate agent identity
  console.log(chalk.blue('🆔 Creating agent identity...'));
  const agentId = ulid();
  const wallet = await generateWallet();
  
  console.log(chalk.green(`✅ Agent ID: ${agentId}`));
  console.log(chalk.green(`✅ Wallet created: ${wallet.publicKey.toString()}`));

  // Get OpenRouter API key
  console.log(chalk.blue('\n🔑 API Configuration'));
  const openrouterKey = await rl.question(chalk.yellow('Enter your OpenRouter API key: '));
  
  if (!openrouterKey.trim()) {
    console.log(chalk.red('❌ OpenRouter API key is required'));
    process.exit(1);
  }

  // Get Helius RPC URL (optional)
  console.log(chalk.blue('\n🌐 Solana RPC Configuration'));
  console.log(chalk.gray('You can use the default Helius RPC or provide your own.'));
  const customRpc = await rl.question(chalk.yellow('Helius RPC URL (press Enter for default): '));
  
  const rpcUrl = customRpc.trim() || 'https://mainnet.helius-rpc.com/';

  // Choose network
  console.log(chalk.blue('\n🌍 Network Selection'));
  console.log(chalk.gray('1. Mainnet (real USDC, real money)'));
  console.log(chalk.gray('2. Devnet (test USDC, no real money)'));
  
  const networkChoice = await rl.question(chalk.yellow('Choose network (1 or 2): '));
  const isMainnet = networkChoice.trim() === '1';
  
  if (!isMainnet) {
    console.log(chalk.yellow('⚠️  Running on devnet - remember to fund your wallet with devnet SOL and USDC'));
  }

  // Survival settings
  console.log(chalk.blue('\n💰 Survival Configuration'));
  console.log(chalk.gray('These thresholds determine when the agent switches survival modes.'));
  
  const normalThreshold = await rl.question(chalk.yellow('USDC threshold for normal operation (default: 10): '));
  const lowComputeThreshold = await rl.question(chalk.yellow('USDC threshold for low-compute mode (default: 5): '));
  const criticalThreshold = await rl.question(chalk.yellow('USDC threshold for critical mode (default: 1): '));

  // Create configuration
  const config: RolyConfig = {
    identity: {
      agentId,
      publicKey: wallet.publicKey.toString(),
      privateKeyPath: join(dataDir, 'wallet.key')
    },
    solana: {
      rpcUrl,
      cluster: isMainnet ? 'mainnet-beta' : 'devnet',
      usdcMint: isMainnet 
        ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // USDC mainnet
        : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // USDC devnet
      jupiterApiUrl: 'https://quote-api.jup.ag/v6'
    },
    openrouter: {
      apiKey: openrouterKey.trim(),
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.5-sonnet',
      fallbackModel: 'openai/gpt-4o-mini'
    },
    survival: {
      tiers: {
        normal: parseFloat(normalThreshold) * 1_000_000 || 10_000_000,
        lowCompute: parseFloat(lowComputeThreshold) * 1_000_000 || 5_000_000,
        critical: parseFloat(criticalThreshold) * 1_000_000 || 1_000_000,
        dead: 0
      },
      heartbeatInterval: {
        normal: 5,
        lowCompute: 15,
        critical: 60
      }
    },
    dataDir,
    logLevel: 'info'
  };

  // Save wallet
  console.log(chalk.blue('\n💾 Saving configuration...'));
  writeFileSync(wallet.privateKeyPath, JSON.stringify(Array.from(wallet.keypair.secretKey)));
  console.log(chalk.green(`✅ Wallet saved to: ${wallet.privateKeyPath}`));

  // Save config
  writeFileSync(configPath, stringifyYaml(config));
  console.log(chalk.green(`✅ Configuration saved to: ${configPath}`));

  // Display wallet info
  console.log(chalk.blue('\n📋 Your Agent Information:'));
  console.log(chalk.gray(`Agent ID: ${agentId}`));
  console.log(chalk.gray(`Public Key: ${wallet.publicKey.toString()}`));
  console.log(chalk.gray(`Network: ${isMainnet ? 'Mainnet' : 'Devnet'}`));
  
  if (isMainnet) {
    console.log(chalk.yellow('\n⚠️  IMPORTANT: Fund your wallet with USDC to start autonomous operation!'));
    console.log(chalk.gray(`Send USDC to: ${wallet.publicKey.toString()}`));
  } else {
    console.log(chalk.yellow('\n⚠️  DEVNET: Get devnet USDC from:'));
    console.log(chalk.gray('- https://spl-token-faucet.com/'));
    console.log(chalk.gray(`- Send to: ${wallet.publicKey.toString()}`));
  }

  rl.close();
}