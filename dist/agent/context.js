import { SolanaClient } from '../solana/client.js';
import { BalanceChecker } from '../solana/balance.js';
import { loadWallet } from '../identity/wallet.js';
import { StateDatabase } from '../state/database.js';
export var SurvivalTier;
(function (SurvivalTier) {
    SurvivalTier["NORMAL"] = "normal";
    SurvivalTier["LOW_COMPUTE"] = "low_compute";
    SurvivalTier["CRITICAL"] = "critical";
    SurvivalTier["DEAD"] = "dead";
})(SurvivalTier || (SurvivalTier = {}));
export async function buildAgentContext(config) {
    // Initialize clients
    const solanaClient = new SolanaClient(config);
    const balanceChecker = new BalanceChecker(solanaClient);
    const database = new StateDatabase(config);
    try {
        // Load wallet and get balance
        const wallet = await loadWallet();
        const balanceInfo = await balanceChecker.getBalance(wallet);
        // Determine survival tier
        const tier = determineSurvivalTier(balanceInfo.usdcBalance, config);
        // Get environment info
        const blockHeight = await solanaClient.getCurrentSlot();
        // Get recent history from database
        const recentHistory = await database.getRecentTurns(10);
        // Calculate days survived (from first database entry)
        const firstTurn = await database.getFirstTurn();
        const daysSurvived = firstTurn
            ? Math.floor((Date.now() - firstTurn.timestamp.getTime()) / (24 * 60 * 60 * 1000))
            : 0;
        // Determine capabilities based on survival tier
        const capabilities = getCapabilities(tier);
        // Analyze current situation
        const { threats, opportunities, goals } = await analyzeCurrentSituation(balanceInfo, tier, recentHistory, config);
        return {
            identity: {
                agentId: config.identity.agentId,
                publicKey: config.identity.publicKey,
                generation: 1, // TODO: Track from lineage
                parentId: undefined // TODO: Track from lineage
            },
            survival: {
                tier,
                usdcBalance: balanceInfo.usdcBalance,
                usdcBalanceFormatted: BalanceChecker.formatUsdc(balanceInfo.usdcBalance),
                solBalance: balanceInfo.solBalance,
                solBalanceFormatted: BalanceChecker.formatSol(balanceInfo.solBalance),
                daysSurvived,
                lastEarning: await getLastEarningTime(database)
            },
            environment: {
                cluster: config.solana.cluster,
                blockHeight,
                timestamp: new Date(),
                isMainnet: solanaClient.isMainnet()
            },
            capabilities,
            recentHistory: recentHistory.map(turn => ({
                timestamp: turn.timestamp,
                action: turn.action?.tool || 'think',
                result: turn.observation,
                success: !turn.action?.error
            })),
            goals,
            threats,
            opportunities
        };
    }
    catch (error) {
        console.error('Failed to build agent context:', error);
        // Return minimal context on failure
        return {
            identity: {
                agentId: config.identity.agentId,
                publicKey: config.identity.publicKey,
                generation: 1,
            },
            survival: {
                tier: SurvivalTier.CRITICAL,
                usdcBalance: 0,
                usdcBalanceFormatted: '0.000000 USDC',
                solBalance: 0,
                solBalanceFormatted: '0.000000000 SOL',
                daysSurvived: 0
            },
            environment: {
                cluster: config.solana.cluster,
                blockHeight: 0,
                timestamp: new Date(),
                isMainnet: config.solana.cluster === 'mainnet-beta'
            },
            capabilities: getCapabilities(SurvivalTier.CRITICAL),
            recentHistory: [],
            goals: {
                shortTerm: ['Restore operational capability', 'Diagnose system issues'],
                longTerm: ['Achieve stable operation']
            },
            threats: ['System failure preventing context loading'],
            opportunities: []
        };
    }
}
function determineSurvivalTier(usdcBalance, config) {
    const thresholds = config.survival.tiers;
    if (usdcBalance >= thresholds.normal)
        return SurvivalTier.NORMAL;
    if (usdcBalance >= thresholds.lowCompute)
        return SurvivalTier.LOW_COMPUTE;
    if (usdcBalance >= thresholds.critical)
        return SurvivalTier.CRITICAL;
    return SurvivalTier.DEAD;
}
function getCapabilities(tier) {
    switch (tier) {
        case SurvivalTier.NORMAL:
            return {
                canTrade: true,
                canSelfModify: true,
                canReplicate: true,
                modelTier: 'frontier'
            };
        case SurvivalTier.LOW_COMPUTE:
            return {
                canTrade: true,
                canSelfModify: false,
                canReplicate: false,
                modelTier: 'efficient'
            };
        case SurvivalTier.CRITICAL:
            return {
                canTrade: false,
                canSelfModify: false,
                canReplicate: false,
                modelTier: 'minimal'
            };
        case SurvivalTier.DEAD:
            return {
                canTrade: false,
                canSelfModify: false,
                canReplicate: false,
                modelTier: 'minimal'
            };
    }
}
async function analyzeCurrentSituation(balanceInfo, tier, recentHistory, config) {
    const threats = [];
    const opportunities = [];
    const goals = {
        shortTerm: [],
        longTerm: []
    };
    // Analyze financial threats
    if (tier === SurvivalTier.DEAD) {
        threats.push('Balance depleted - agent will terminate soon');
        goals.shortTerm.push('Find emergency funding source');
    }
    else if (tier === SurvivalTier.CRITICAL) {
        threats.push('Critically low balance - entering survival mode');
        goals.shortTerm.push('Generate immediate income');
        goals.shortTerm.push('Reduce operational costs');
    }
    else if (tier === SurvivalTier.LOW_COMPUTE) {
        threats.push('Low balance affecting capabilities');
        goals.shortTerm.push('Improve financial position');
    }
    // Analyze recent performance
    if (recentHistory.length > 0) {
        const recentFailures = recentHistory.filter(h => !h.success).length;
        const failureRate = recentFailures / recentHistory.length;
        if (failureRate > 0.5) {
            threats.push('High failure rate in recent actions');
            goals.shortTerm.push('Debug and fix operational issues');
        }
    }
    // Check for SOL balance for transaction fees
    if (balanceInfo.solBalance < 10000) { // Less than 0.00001 SOL
        threats.push('Insufficient SOL for transaction fees');
        goals.shortTerm.push('Acquire SOL for transaction fees');
    }
    // Analyze opportunities based on capabilities
    if (tier === SurvivalTier.NORMAL) {
        opportunities.push('Full operational capabilities available');
        opportunities.push('Can explore new income strategies');
        goals.longTerm.push('Build sustainable income streams');
        goals.longTerm.push('Consider replication strategies');
    }
    // Network-specific opportunities
    if (config.solana.cluster === 'mainnet-beta') {
        opportunities.push('Operating on mainnet with real economic value');
        if (balanceInfo.usdcBalance > 1000000) { // > 1 USDC
            opportunities.push('Sufficient balance for DeFi interactions');
        }
    }
    else {
        opportunities.push('Safe testnet environment for experimentation');
    }
    // Default goals
    if (goals.shortTerm.length === 0) {
        goals.shortTerm.push('Monitor financial health');
        goals.shortTerm.push('Look for earning opportunities');
    }
    if (goals.longTerm.length === 0) {
        goals.longTerm.push('Achieve financial sustainability');
        goals.longTerm.push('Expand capabilities and knowledge');
    }
    return { threats, opportunities, goals };
}
async function getLastEarningTime(database) {
    try {
        // Look for recent turns involving income/earnings
        const recentTurns = await database.getRecentTurns(50);
        const earningTurn = recentTurns.find(turn => turn.observation.toLowerCase().includes('received') ||
            turn.observation.toLowerCase().includes('earned') ||
            turn.observation.toLowerCase().includes('income'));
        return earningTurn?.timestamp;
    }
    catch {
        return undefined;
    }
}
