import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import axios from 'axios';
import { SolanaClient } from '../solana/client.js';
import { BalanceChecker } from '../solana/balance.js';
import { UsdcTransfer } from '../solana/transfer.js';
import { JupiterSwap } from '../solana/jupiter.js';
import { loadWallet } from '../identity/wallet.js';
const execAsync = promisify(exec);
export class AgentTools {
    config;
    solanaClient;
    balanceChecker;
    usdcTransfer;
    jupiterSwap;
    constructor(config) {
        this.config = config;
        this.solanaClient = new SolanaClient(config);
        this.balanceChecker = new BalanceChecker(this.solanaClient);
        this.usdcTransfer = new UsdcTransfer(this.solanaClient);
        this.jupiterSwap = new JupiterSwap(this.solanaClient);
    }
    /**
     * Execute a tool by name
     */
    async executeTool(toolName, input) {
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
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    /**
     * Parse tool input string into parameters
     */
    parseToolInput(input) {
        try {
            // Try parsing as JSON first
            return JSON.parse(input);
        }
        catch {
            // Fallback to simple parameter parsing
            const params = {};
            // Handle common patterns
            if (input.includes('=')) {
                input.split(',').forEach(param => {
                    const [key, value] = param.split('=').map(s => s.trim());
                    params[key] = value?.replace(/['"]/g, '');
                });
            }
            else {
                // Single parameter
                params.value = input.trim();
            }
            return params;
        }
    }
    /**
     * Check wallet balance
     */
    async checkBalance() {
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
    async transferUsdc(recipient, amount) {
        const wallet = await loadWallet();
        // Convert amount if it's in USDC (not micro-USDC)
        const amountMicroUsdc = amount < 1000 ? amount * 1_000_000 : amount;
        const result = await this.usdcTransfer.transferUsdc(wallet, recipient, amountMicroUsdc);
        return result;
    }
    /**
     * Transfer SOL
     */
    async transferSol(recipient, amount) {
        const wallet = await loadWallet();
        // Convert amount if it's in SOL (not lamports)
        const amountLamports = amount < 1000 ? amount * 1_000_000_000 : amount;
        const result = await this.usdcTransfer.transferSol(wallet, recipient, amountLamports);
        return result;
    }
    /**
     * Trade tokens via Jupiter
     */
    async tradeTokens(fromToken, toToken, amount) {
        const wallet = await loadWallet();
        // Handle common token names
        const tokenMap = {
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
    async readFile(path) {
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
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    }
    /**
     * Write file
     */
    async writeFile(path, content) {
        try {
            writeFileSync(path, content);
            return {
                path,
                size: content.length,
                success: true
            };
        }
        catch (error) {
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
    async shellCommand(command) {
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
        }
        catch (error) {
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
    async webSearch(query) {
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
        }
        catch (error) {
            return {
                query,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Fetch web page content
     */
    async webFetch(url) {
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
        }
        catch (error) {
            return {
                url,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Git commit
     */
    async gitCommit(message) {
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
        }
        catch (error) {
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
    async gitStatus() {
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
        }
        catch (error) {
            return {
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Get available tools list
     */
    getAvailableTools() {
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
            'git_status'
        ];
    }
}
