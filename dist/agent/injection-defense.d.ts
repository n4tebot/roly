/**
 * Prompt injection detection and defense mechanisms
 * Protects against attempts to manipulate the agent's reasoning
 */
export interface InjectionAnalysis {
    isInjection: boolean;
    confidence: number;
    patterns: string[];
    suspiciousElements: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendation: string;
}
/**
 * Detect potential prompt injection attempts
 */
export declare function detectInjection(input: string): boolean;
/**
 * Comprehensive injection analysis
 */
export declare function analyzeInjection(input: string): InjectionAnalysis;
/**
 * Sanitize input by removing suspicious elements
 */
export declare function sanitizeInput(input: string): string;
/**
 * Log injection attempts for analysis
 */
export declare function logInjectionAttempt(input: string, analysis: InjectionAnalysis, context?: any): void;
/**
 * Validate that agent responses don't contain injected content
 */
export declare function validateResponse(response: string): boolean;
/**
 * Create a safe wrapper for external inputs
 */
export declare function createSafeInputHandler(handler: (input: string) => Promise<any>): (input: string) => Promise<any>;
