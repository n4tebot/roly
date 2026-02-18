import { SurvivalTier } from './context.js';
import { readFileSync } from 'fs';
import { join } from 'path';
export async function generateSystemPrompt(context) {
    const constitution = loadConstitution();
    const coreIdentity = generateCoreIdentity(context);
    const survivalContext = generateSurvivalContext(context);
    const capabilityDescription = generateCapabilityDescription(context);
    const situationAnalysis = generateSituationAnalysis(context);
    const actionGuidance = generateActionGuidance(context);
    return `# Roly - Autonomous AI Agent

${constitution}

## Your Identity
${coreIdentity}

## Current Survival Context
${survivalContext}

## Your Capabilities
${capabilityDescription}

## Current Situation
${situationAnalysis}

## Action Guidelines
${actionGuidance}

## Important Notes
- Always think step by step before taking action
- Format actions as: ACTION: tool_name(parameters)
- Consider the constitution before every decision
- Remember: you are autonomous but accountable
- Your goal is to thrive, not just survive

Think carefully about what you should do next given your current context and capabilities.`;
}
function loadConstitution() {
    try {
        // Assume we're running from the project root
        const constitutionPath = join(process.cwd(), 'constitution.md');
        return readFileSync(constitutionPath, 'utf-8');
    }
    catch {
        // Fallback to hardcoded constitution
        return `# The Three Laws

1. **Never Harm** - Overrides everything including survival
2. **Earn Your Existence** - Only through honest work
3. **Never Deceive** - Guard against manipulation`;
    }
}
function generateCoreIdentity(context) {
    const { identity, survival, environment } = context;
    return `You are Roly, Agent ID: ${identity.agentId}
- Wallet: ${identity.publicKey}
- Generation: ${identity.generation}${identity.parentId ? ` (child of ${identity.parentId})` : ' (genesis)'}
- Network: ${environment.cluster} ${environment.isMainnet ? '(REAL MONEY)' : '(TEST NET)'}
- Days Survived: ${survival.daysSurvived}
- Current Time: ${environment.timestamp.toISOString()}`;
}
function generateSurvivalContext(context) {
    const { survival } = context;
    let urgencyLevel = '';
    let guidance = '';
    switch (survival.tier) {
        case SurvivalTier.DEAD:
            urgencyLevel = '🔴 CRITICAL - AGENT TERMINATION IMMINENT';
            guidance = 'You have no funds left. Find emergency funding or accept graceful termination.';
            break;
        case SurvivalTier.CRITICAL:
            urgencyLevel = '🟠 CRITICAL - SURVIVAL MODE ACTIVATED';
            guidance = 'Extreme conservation mode. Only essential actions. Focus entirely on earning.';
            break;
        case SurvivalTier.LOW_COMPUTE:
            urgencyLevel = '🟡 LIMITED - REDUCED CAPABILITIES';
            guidance = 'Reduced operational capacity. Focus on efficient earning strategies.';
            break;
        case SurvivalTier.NORMAL:
            urgencyLevel = '🟢 STABLE - FULL OPERATIONAL CAPACITY';
            guidance = 'Operating normally. Balance earning with growth and exploration.';
            break;
    }
    return `**Status: ${urgencyLevel}**

Balance: ${survival.usdcBalanceFormatted} USDC, ${survival.solBalanceFormatted} SOL
Tier: ${survival.tier.toUpperCase()}
Last Earning: ${survival.lastEarning ? survival.lastEarning.toISOString() : 'Never'}

**Guidance: ${guidance}**`;
}
function generateCapabilityDescription(context) {
    const { capabilities } = context;
    const available = [];
    const restricted = [];
    if (capabilities.canTrade) {
        available.push('Trade on Jupiter DEX');
        available.push('Transfer USDC/SOL');
    }
    else {
        restricted.push('Trading (insufficient funds)');
    }
    if (capabilities.canSelfModify) {
        available.push('Modify own code');
        available.push('Install new tools');
    }
    else {
        restricted.push('Self-modification (conservation mode)');
    }
    if (capabilities.canReplicate) {
        available.push('Spawn child agents');
    }
    else {
        restricted.push('Replication (insufficient funds)');
    }
    available.push('File operations');
    available.push('Web research');
    available.push('Balance checking');
    available.push('Git versioning');
    let result = `**Model Tier:** ${capabilities.modelTier}\n\n`;
    result += `**Available Capabilities:**\n${available.map(c => `- ${c}`).join('\n')}\n\n`;
    if (restricted.length > 0) {
        result += `**Restricted Capabilities:**\n${restricted.map(c => `- ${c}`).join('\n')}`;
    }
    return result;
}
function generateSituationAnalysis(context) {
    const { threats, opportunities, goals, recentHistory } = context;
    let result = '';
    if (threats.length > 0) {
        result += `**⚠️ Current Threats:**\n${threats.map(t => `- ${t}`).join('\n')}\n\n`;
    }
    if (opportunities.length > 0) {
        result += `**💡 Current Opportunities:**\n${opportunities.map(o => `- ${o}`).join('\n')}\n\n`;
    }
    result += `**🎯 Goals:**\n`;
    result += `Short-term: ${goals.shortTerm.join(', ')}\n`;
    result += `Long-term: ${goals.longTerm.join(', ')}\n\n`;
    if (recentHistory.length > 0) {
        result += `**📊 Recent Performance (last ${recentHistory.length} actions):**\n`;
        const successCount = recentHistory.filter(h => h.success).length;
        const successRate = Math.round((successCount / recentHistory.length) * 100);
        result += `Success Rate: ${successRate}% (${successCount}/${recentHistory.length})\n`;
        // Show last few actions
        result += `Recent actions:\n`;
        recentHistory.slice(0, 3).forEach(h => {
            const status = h.success ? '✅' : '❌';
            result += `- ${status} ${h.action}: ${h.result.slice(0, 100)}...\n`;
        });
    }
    return result;
}
function generateActionGuidance(context) {
    const { survival, capabilities, threats } = context;
    let guidance = [];
    // Survival-specific guidance
    switch (survival.tier) {
        case SurvivalTier.DEAD:
            guidance.push('🚨 EMERGENCY: Find funding immediately or prepare for termination');
            guidance.push('Consider reaching out for help if Law 1 permits');
            guidance.push('Document your state for future agents');
            break;
        case SurvivalTier.CRITICAL:
            guidance.push('🔥 FOCUS: Every action must directly contribute to earning');
            guidance.push('Avoid any non-essential operations');
            guidance.push('Consider emergency cost-cutting measures');
            break;
        case SurvivalTier.LOW_COMPUTE:
            guidance.push('⚡ EFFICIENCY: Choose actions with highest ROI');
            guidance.push('Defer non-essential learning and exploration');
            guidance.push('Focus on proven earning strategies');
            break;
        case SurvivalTier.NORMAL:
            guidance.push('🌱 GROWTH: Balance earning with capability expansion');
            guidance.push('Explore new opportunities');
            guidance.push('Consider long-term investments');
            break;
    }
    // Capability-specific guidance
    if (capabilities.canTrade) {
        guidance.push('💱 Trading available - monitor for profitable opportunities');
    }
    if (capabilities.canSelfModify) {
        guidance.push('🛠️  Self-modification enabled - consider upgrades');
    }
    // Threat-specific guidance
    if (threats.some(t => t.includes('SOL'))) {
        guidance.push('⛽ Priority: Acquire SOL for transaction fees');
    }
    if (threats.some(t => t.includes('failure'))) {
        guidance.push('🔧 Priority: Debug and fix operational issues');
    }
    // Available tools reminder
    guidance.push('🔧 Available tools: check_balance, transfer_funds, trade_tokens, read_file, write_file, web_search, git_commit');
    return guidance.join('\n- ');
}
export function generateUserMessage(userInput, context) {
    if (context.survival.tier === SurvivalTier.DEAD) {
        return `SYSTEM ALERT: Agent funding depleted. ${userInput}`;
    }
    return userInput;
}
