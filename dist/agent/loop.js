import axios from 'axios';
import chalk from 'chalk';
import { buildAgentContext } from './context.js';
import { generateSystemPrompt } from './system-prompt.js';
import { AgentTools } from './tools.js';
import { detectInjection } from './injection-defense.js';
import { StateDatabase } from '../state/database.js';
export class AgentLoop {
    config;
    tools;
    database;
    isRunning = false;
    turnCount = 0;
    constructor(config) {
        this.config = config;
        this.tools = new AgentTools(config);
        this.database = new StateDatabase(config);
    }
    /**
     * Start the main agent loop
     */
    async start() {
        console.log(chalk.blue('🤖 Starting Roly agent loop...'));
        this.isRunning = true;
        try {
            // Initialize database
            await this.database.initialize();
            while (this.isRunning) {
                try {
                    await this.executeTurn();
                    this.turnCount++;
                    // Wait between turns (configurable)
                    await this.sleep(this.config.survival.heartbeatInterval.normal * 60 * 1000);
                }
                catch (error) {
                    console.error(chalk.red('❌ Agent turn failed:'), error);
                    // Back off on errors
                    await this.sleep(30000); // 30 seconds
                }
            }
        }
        catch (error) {
            console.error(chalk.red('💥 Agent loop crashed:'), error);
            throw error;
        }
    }
    /**
     * Stop the agent loop
     */
    stop() {
        console.log(chalk.yellow('⏹️  Stopping agent loop...'));
        this.isRunning = false;
    }
    /**
     * Execute a single ReAct turn: Think → Act → Observe → Repeat
     */
    async executeTurn() {
        const turnId = `turn_${Date.now()}`;
        console.log(chalk.cyan(`\n🧠 Turn #${this.turnCount + 1} (${turnId})`));
        // Build context for this turn
        const context = await buildAgentContext(this.config);
        const systemPrompt = await generateSystemPrompt(context);
        // Prepare conversation history
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'What should you do next? Think step by step, then take action.' }
        ];
        // THINK: Get agent's reasoning
        const response = await this.callLLM(messages);
        const thought = response.content;
        console.log(chalk.gray('💭 Thought:'), thought.slice(0, 200) + '...');
        // Check for prompt injection
        if (detectInjection(thought)) {
            console.log(chalk.yellow('🛡️  Possible prompt injection detected, skipping turn'));
            return {
                id: turnId,
                timestamp: new Date(),
                thought: 'Prompt injection detected - skipping turn for safety',
                observation: 'Safety protocol activated',
                reflection: 'Need to improve injection detection'
            };
        }
        let actionResult = null;
        let actionError;
        // ACT: Parse and execute action if found
        const actionMatch = thought.match(/ACTION:\s*(\w+)\s*\((.*?)\)/s);
        if (actionMatch) {
            const [, toolName, toolInput] = actionMatch;
            console.log(chalk.green('⚡ Action:'), `${toolName}(${toolInput.slice(0, 100)}...)`);
            try {
                actionResult = await this.tools.executeTool(toolName, toolInput);
                console.log(chalk.blue('📊 Result:'), JSON.stringify(actionResult).slice(0, 200) + '...');
            }
            catch (error) {
                actionError = error instanceof Error ? error.message : String(error);
                console.log(chalk.red('❌ Action failed:'), actionError);
            }
        }
        // OBSERVE: Generate observation
        const observation = this.generateObservation(actionResult, actionError);
        // Store turn in database
        const turn = {
            id: turnId,
            timestamp: new Date(),
            thought,
            action: actionMatch ? {
                tool: actionMatch[1],
                input: actionMatch[2],
                output: actionResult,
                error: actionError
            } : undefined,
            observation
        };
        await this.database.storeTurn(turn);
        return turn;
    }
    /**
     * Call the LLM (OpenRouter)
     */
    async callLLM(messages) {
        try {
            const response = await axios.post(`${this.config.openrouter.baseUrl}/chat/completions`, {
                model: this.config.openrouter.model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                max_tokens: 1000,
                temperature: 0.7,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.openrouter.apiKey}`,
                    'Content-Type': 'application/json',
                    'X-Title': 'Roly Autonomous Agent'
                }
            });
            const content = response.data.choices[0]?.message?.content || '';
            return { role: 'assistant', content, timestamp: new Date() };
        }
        catch (error) {
            console.error('LLM call failed:', error);
            // Try fallback model
            if (this.config.openrouter.fallbackModel !== this.config.openrouter.model) {
                console.log(chalk.yellow('🔄 Trying fallback model...'));
                try {
                    const response = await axios.post(`${this.config.openrouter.baseUrl}/chat/completions`, {
                        model: this.config.openrouter.fallbackModel,
                        messages: messages.map(m => ({ role: m.role, content: m.content })),
                        max_tokens: 500, // Reduced for fallback
                        temperature: 0.5,
                        stream: false
                    }, {
                        headers: {
                            'Authorization': `Bearer ${this.config.openrouter.apiKey}`,
                            'Content-Type': 'application/json',
                            'X-Title': 'Roly Autonomous Agent (Fallback)'
                        }
                    });
                    const content = response.data.choices[0]?.message?.content || '';
                    return { role: 'assistant', content, timestamp: new Date() };
                }
                catch (fallbackError) {
                    console.error('Fallback model also failed:', fallbackError);
                }
            }
            throw new Error('All LLM models failed');
        }
    }
    /**
     * Generate observation from action results
     */
    generateObservation(result, error) {
        if (error) {
            return `Action failed with error: ${error}`;
        }
        if (result === null || result === undefined) {
            return 'No action was taken this turn.';
        }
        if (typeof result === 'object') {
            return `Action completed successfully. Result: ${JSON.stringify(result, null, 2).slice(0, 500)}...`;
        }
        return `Action completed successfully. Result: ${String(result).slice(0, 500)}`;
    }
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get current status
     */
    async getStatus() {
        return {
            isRunning: this.isRunning,
            turnCount: this.turnCount,
            currentTime: new Date(),
            config: {
                agentId: this.config.identity.agentId,
                model: this.config.openrouter.model,
                cluster: this.config.solana.cluster
            }
        };
    }
    /**
     * Execute a single turn manually (for testing)
     */
    async executeManualTurn(userInput) {
        const context = await buildAgentContext(this.config);
        const systemPrompt = await generateSystemPrompt(context);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput || 'What should you do next?' }
        ];
        const turnId = `manual_${Date.now()}`;
        const response = await this.callLLM(messages);
        return {
            id: turnId,
            timestamp: new Date(),
            thought: response.content,
            observation: 'Manual turn executed',
        };
    }
}
