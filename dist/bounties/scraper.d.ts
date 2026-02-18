import { RolyConfig } from '../config.js';
export interface Bounty {
    id: string;
    source: 'superteam' | 'github';
    title: string;
    description: string;
    reward_amount: number;
    reward_token: string;
    deadline?: Date;
    url: string;
    skills: string[];
    status: 'open' | 'claimed' | 'submitted' | 'completed';
    discovered_at: Date;
    claimed_at?: Date;
    metadata?: any;
}
export interface SuperteamListing {
    id: string;
    title: string;
    description: string;
    rewards?: Array<{
        amount: number;
        token: string;
    }>;
    deadline?: string;
    skills?: string[];
    url?: string;
    status: string;
    type: string;
}
export interface GitHubIssue {
    id: number;
    number: number;
    title: string;
    body: string;
    html_url: string;
    repository_url: string;
    labels: Array<{
        name: string;
    }>;
    created_at: string;
    updated_at: string;
    state: string;
    user: {
        login: string;
    };
}
export declare class BountyScraper {
    private config;
    private database;
    private solanaOrgs;
    private bountyLabels;
    constructor(config: RolyConfig);
    /**
     * Initialize the bounty database schema
     */
    initialize(): Promise<void>;
    /**
     * Scrape all bounties from all sources
     */
    scrapeAllBounties(): Promise<Bounty[]>;
    /**
     * Scrape bounties from Superteam Earn
     */
    scrapeSuperteamEarn(): Promise<Bounty[]>;
    /**
     * Scrape bounties from GitHub repositories
     */
    scrapeGitHubBounties(): Promise<Bounty[]>;
    /**
     * Store bounties in database
     */
    storeBounties(bounties: Bounty[]): Promise<void>;
    /**
     * Get bounties from database
     */
    getBounties(status?: string, source?: string, limit?: number): Promise<Bounty[]>;
    /**
     * Update bounty status
     */
    updateBountyStatus(id: string, status: string, claimedAt?: Date): Promise<void>;
    /**
     * Validate Superteam listing
     */
    private isValidSuperteamListing;
    /**
     * Convert Superteam listing to Bounty
     */
    private convertSuperteamToBounty;
    /**
     * Validate GitHub issue as bounty
     */
    private isValidGitHubBounty;
    /**
     * Convert GitHub issue to Bounty
     */
    private convertGitHubToBounty;
    /**
     * Extract reward amount from GitHub issue
     */
    private extractRewardFromGitHub;
    /**
     * Extract skills from GitHub issue
     */
    private extractSkillsFromGitHub;
    /**
     * Sleep utility for rate limiting
     */
    private sleep;
}
