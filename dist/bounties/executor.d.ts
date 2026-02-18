import { Bounty } from './scraper.js';
import { BountyEvaluation } from './evaluator.js';
import { RolyConfig } from '../config.js';
export interface ExecutionPlan {
    bounty: Bounty;
    evaluation: BountyEvaluation;
    steps: ExecutionStep[];
    workingDirectory: string;
    estimatedDuration: number;
}
export interface ExecutionStep {
    id: string;
    name: string;
    description: string;
    type: 'research' | 'setup' | 'implementation' | 'testing' | 'submission';
    estimatedMinutes: number;
    dependencies: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    output?: string;
    error?: string;
}
export interface ExecutionResult {
    bounty: Bounty;
    success: boolean;
    submissionUrl?: string;
    submissionData?: any;
    completedSteps: ExecutionStep[];
    totalTime: number;
    cost: number;
    error?: string;
    learnings: string[];
}
export declare class BountyExecutor {
    private config;
    private database;
    private tools;
    private workspaceDir;
    constructor(config: RolyConfig);
    /**
     * Execute a bounty from start to finish
     */
    executeBounty(bounty: Bounty, evaluation: BountyEvaluation): Promise<ExecutionResult>;
    /**
     * Create an execution plan for a bounty
     */
    private createExecutionPlan;
    /**
     * Execute a single step
     */
    private executeStep;
    /**
     * Research bounty requirements
     */
    private researchBounty;
    /**
     * Clone GitHub repository
     */
    private cloneRepository;
    /**
     * Analyze codebase structure
     */
    private analyzeCodebase;
    /**
     * Create working branch
     */
    private createWorkingBranch;
    /**
     * Implement solution (simplified AI-assisted implementation)
     */
    private implementSolution;
    /**
     * Create implementation plan based on bounty description
     */
    private createImplementationPlan;
    /**
     * Execute a specific implementation task
     */
    private executeImplementationTask;
    /**
     * Update README file
     */
    private updateReadme;
    /**
     * Attempt simple bug fixes
     */
    private attemptBugFix;
    /**
     * Add simple feature
     */
    private addSimpleFeature;
    /**
     * Add tests
     */
    private addTests;
    /**
     * Make general improvements
     */
    private makeGeneralImprovements;
    /**
     * Run tests
     */
    private runTests;
    /**
     * Create pull request
     */
    private createPullRequest;
    /**
     * Download Superteam brief
     */
    private downloadSuperteamBrief;
    /**
     * Execute Superteam work
     */
    private executeSuperteamWork;
    /**
     * Prepare Superteam submission
     */
    private prepareSuperteamSubmission;
    /**
     * Extract submission URL from step result
     */
    private extractSubmissionUrl;
    /**
     * Generate learnings from execution
     */
    private generateLearnings;
    /**
     * Store execution result in database
     */
    private storeExecutionResult;
}
