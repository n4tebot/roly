import { AgentContext } from './context.js';
export declare function generateSystemPrompt(context: AgentContext): Promise<string>;
export declare function generateUserMessage(userInput: string, context: AgentContext): string;
