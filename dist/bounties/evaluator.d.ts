import { Bounty } from './scraper.js';
import { RolyConfig } from '../config.js';
export interface BountyEvaluation {
    bounty: Bounty;
    score: number;
    difficulty: 'easy' | 'medium' | 'hard';
    estimatedHours: number;
    estimatedCost: number;
    roi: number;
    skillsMatch: number;
    urgency: number;
    confidence: number;
    reasoning: string[];
    recommended: boolean;
}
export interface AgentSkills {
    coding: {
        rust: number;
        typescript: number;
        javascript: number;
        python: number;
        solana: number;
    };
    documentation: number;
    research: number;
    design: number;
    webScraping: number;
    apiIntegration: number;
    testing: number;
}
export declare class BountyEvaluator {
    private config;
    private database;
    private agentSkills;
    private baseCostPerHour;
    constructor(config: RolyConfig);
    /**
     * Evaluate a list of bounties and return them sorted by score
     */
    evaluateBounties(bounties: Bounty[]): Promise<BountyEvaluation[]>;
    /**
     * Evaluate a single bounty
     */
    evaluateBounty(bounty: Bounty): Promise<BountyEvaluation>;
    /**
     * Assess bounty difficulty based on description and metadata
     */
    private assessDifficulty;
    /**
     * Estimate time required in hours
     */
    private estimateTimeRequired;
    /**
     * Calculate how well bounty skills match agent skills
     */
    private calculateSkillsMatch;
    /**
     * Calculate urgency based on deadline
     */
    private calculateUrgency;
    /**
     * Calculate confidence in our estimates
     */
    private calculateConfidence;
    /**
     * Calculate overall bounty score
     */
    private calculateOverallScore;
    /**
     * Generate human-readable reasoning
     */
    private generateReasoning;
    /**
     * Get reasoning for difficulty assessment
     */
    private getDifficultyReason;
    /**
     * Get top N recommended bounties
     */
    getTopBounties(bounties: Bounty[], limit?: number): Promise<BountyEvaluation[]>;
    /**
     * Update agent skills based on completed bounties (learning)
     */
    updateSkillsFromExperience(bounty: Bounty, success: boolean): Promise<void>;
    /**
     * Load saved skills from database
     */
    loadSkills(): Promise<void>;
}
