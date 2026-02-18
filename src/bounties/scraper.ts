import axios, { AxiosResponse } from 'axios';
import { StateDatabase } from '../state/database.js';
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
  metadata?: any; // Additional source-specific data
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

export class BountyScraper {
  private config: RolyConfig;
  private database: StateDatabase;
  private solanaOrgs = [
    'solana-labs',
    'helius-labs', 
    'jup-ag',
    'metaplex-foundation',
    'coral-xyz',
    'anza-xyz'
  ];
  private bountyLabels = [
    'bounty',
    'reward',
    'paid',
    'good-first-issue',
    'bug-bounty',
    'help-wanted'
  ];

  constructor(config: RolyConfig) {
    this.config = config;
    this.database = new StateDatabase(config);
  }

  /**
   * Initialize the bounty database schema
   */
  async initialize(): Promise<void> {
    // Create bounties table
    const sql = `
      CREATE TABLE IF NOT EXISTS bounties (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        reward_amount REAL DEFAULT 0,
        reward_token TEXT DEFAULT 'USDC',
        deadline INTEGER,
        url TEXT NOT NULL,
        skills TEXT, -- JSON array
        status TEXT DEFAULT 'open',
        discovered_at INTEGER NOT NULL,
        claimed_at INTEGER,
        metadata TEXT -- JSON object
      );

      CREATE INDEX IF NOT EXISTS idx_bounties_source ON bounties(source);
      CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
      CREATE INDEX IF NOT EXISTS idx_bounties_discovered ON bounties(discovered_at);
      CREATE INDEX IF NOT EXISTS idx_bounties_reward ON bounties(reward_amount);
    `;

    const db = (this.database as any).db; // Access underlying SQLite database
    db.exec(sql);
  }

  /**
   * Scrape all bounties from all sources
   */
  async scrapeAllBounties(): Promise<Bounty[]> {
    const bounties: Bounty[] = [];

    try {
      // Scrape Superteam Earn
      const superteamBounties = await this.scrapeSuperteamEarn();
      bounties.push(...superteamBounties);
      
      console.log(`Found ${superteamBounties.length} bounties from Superteam Earn`);
    } catch (error) {
      console.error('Failed to scrape Superteam Earn:', error);
    }

    try {
      // Scrape GitHub bounties
      const githubBounties = await this.scrapeGitHubBounties();
      bounties.push(...githubBounties);
      
      console.log(`Found ${githubBounties.length} bounties from GitHub`);
    } catch (error) {
      console.error('Failed to scrape GitHub bounties:', error);
    }

    // Store new bounties in database
    await this.storeBounties(bounties);

    return bounties;
  }

  /**
   * Scrape bounties from Superteam Earn
   */
  async scrapeSuperteamEarn(): Promise<Bounty[]> {
    const bounties: Bounty[] = [];
    
    try {
      // Try the API endpoint first
      let response: AxiosResponse;
      try {
        response = await axios.get('https://earn.superteam.fun/api/listings/', {
          params: {
            status: 'open',
            type: 'bounty'
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'Roly-Agent/1.0'
          }
        });
      } catch (apiError) {
        // If API doesn't exist, try alternative endpoints
        console.warn('Superteam API not available, trying alternative endpoints...');
        
        try {
          // Try GraphQL endpoint
          response = await axios.post('https://earn.superteam.fun/api/graphql', {
            query: `
              query GetBounties {
                listings(where: { type: "bounty", status: "open" }) {
                  id
                  title
                  description
                  rewards
                  deadline
                  skills
                  url
                  status
                  type
                }
              }
            `
          }, {
            timeout: 10000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Roly-Agent/1.0'
            }
          });
        } catch (graphqlError) {
          // If GraphQL fails, try scraping the main page
          console.warn('GraphQL endpoint failed, scraping webpage...');
          response = await axios.get('https://earn.superteam.fun/bounties', {
            timeout: 15000,
            headers: {
              'User-Agent': 'Roly-Agent/1.0'
            }
          });
          
          // Parse HTML to extract bounty data (simplified)
          const htmlContent = response.data;
          if (typeof htmlContent === 'string') {
            // This would need proper HTML parsing in production
            // For now, just log that we got the page
            console.log('Retrieved Superteam Earn page for scraping');
            return []; // Return empty for now since HTML parsing is complex
          }
        }
      }

      const listings = response.data?.data?.listings || response.data?.listings || response.data || [];
      
      for (const listing of listings) {
        if (this.isValidSuperteamListing(listing)) {
          const bounty = this.convertSuperteamToBounty(listing);
          if (bounty) {
            bounties.push(bounty);
          }
        }
      }
    } catch (error) {
      console.error('Error scraping Superteam Earn:', error);
    }

    return bounties;
  }

  /**
   * Scrape bounties from GitHub repositories
   */
  async scrapeGitHubBounties(): Promise<Bounty[]> {
    const bounties: Bounty[] = [];
    const githubToken = process.env.GITHUB_TOKEN; // Should be added to config

    const headers: any = {
      'User-Agent': 'Roly-Agent/1.0',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (githubToken) {
      headers.Authorization = `token ${githubToken}`;
    }

    try {
      // Search across all Solana ecosystem orgs
      for (const org of this.solanaOrgs) {
        for (const label of this.bountyLabels) {
          try {
            const query = `label:"${label}" org:"${org}" state:open`;
            
            const response = await axios.get('https://api.github.com/search/issues', {
              params: {
                q: query,
                sort: 'updated',
                order: 'desc',
                per_page: 30
              },
              headers,
              timeout: 10000
            });

            const issues = response.data.items || [];
            
            for (const issue of issues) {
              if (this.isValidGitHubBounty(issue)) {
                const bounty = this.convertGitHubToBounty(issue);
                if (bounty && !bounties.find(b => b.id === bounty.id)) {
                  bounties.push(bounty);
                }
              }
            }

            // Rate limiting: wait between requests
            await this.sleep(100);
          } catch (error) {
            console.error(`Error searching GitHub for ${org}/${label}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error scraping GitHub bounties:', error);
    }

    return bounties;
  }

  /**
   * Store bounties in database
   */
  async storeBounties(bounties: Bounty[]): Promise<void> {
    if (bounties.length === 0) return;

    const db = (this.database as any).db;
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO bounties (
        id, source, title, description, reward_amount, reward_token,
        deadline, url, skills, status, discovered_at, claimed_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const bounty of bounties) {
      stmt.run(
        bounty.id,
        bounty.source,
        bounty.title,
        bounty.description,
        bounty.reward_amount,
        bounty.reward_token,
        bounty.deadline?.getTime() || null,
        bounty.url,
        JSON.stringify(bounty.skills),
        bounty.status,
        bounty.discovered_at.getTime(),
        bounty.claimed_at?.getTime() || null,
        bounty.metadata ? JSON.stringify(bounty.metadata) : null
      );
    }

    console.log(`Stored ${bounties.length} bounties in database`);
  }

  /**
   * Get bounties from database
   */
  async getBounties(
    status?: string,
    source?: string,
    limit: number = 50
  ): Promise<Bounty[]> {
    const db = (this.database as any).db;
    
    let sql = 'SELECT * FROM bounties';
    const params: any[] = [];
    const conditions: string[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (source) {
      conditions.push('source = ?');
      params.push(source);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY discovered_at DESC LIMIT ?';
    params.push(limit);

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);

    return rows.map((row: any) => ({
      id: row.id,
      source: row.source,
      title: row.title,
      description: row.description,
      reward_amount: row.reward_amount,
      reward_token: row.reward_token,
      deadline: row.deadline ? new Date(row.deadline) : undefined,
      url: row.url,
      skills: JSON.parse(row.skills || '[]'),
      status: row.status,
      discovered_at: new Date(row.discovered_at),
      claimed_at: row.claimed_at ? new Date(row.claimed_at) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  /**
   * Update bounty status
   */
  async updateBountyStatus(id: string, status: string, claimedAt?: Date): Promise<void> {
    const db = (this.database as any).db;
    const stmt = db.prepare(`
      UPDATE bounties 
      SET status = ?, claimed_at = ?
      WHERE id = ?
    `);

    stmt.run(status, claimedAt?.getTime() || null, id);
  }

  /**
   * Validate Superteam listing
   */
  private isValidSuperteamListing(listing: any): boolean {
    return (
      listing &&
      listing.id &&
      listing.title &&
      (listing.type === 'bounty' || listing.type === 'project') &&
      listing.status === 'open'
    );
  }

  /**
   * Convert Superteam listing to Bounty
   */
  private convertSuperteamToBounty(listing: SuperteamListing): Bounty | null {
    try {
      const rewards = listing.rewards || [];
      const usdcReward = rewards.find(r => r.token === 'USDC' || r.token === 'USD');
      const rewardAmount = usdcReward?.amount || 0;

      return {
        id: `superteam_${listing.id}`,
        source: 'superteam',
        title: listing.title,
        description: listing.description || '',
        reward_amount: rewardAmount * 1_000_000, // Convert to micro-USDC
        reward_token: 'USDC',
        deadline: listing.deadline ? new Date(listing.deadline) : undefined,
        url: listing.url || `https://earn.superteam.fun/bounties/${listing.id}`,
        skills: listing.skills || [],
        status: 'open',
        discovered_at: new Date(),
        metadata: {
          originalType: listing.type,
          originalRewards: rewards
        }
      };
    } catch (error) {
      console.error('Error converting Superteam listing:', error);
      return null;
    }
  }

  /**
   * Validate GitHub issue as bounty
   */
  private isValidGitHubBounty(issue: GitHubIssue): boolean {
    return (
      !!issue &&
      issue.state === 'open' &&
      !!issue.html_url &&
      !issue.html_url.includes('/pull/')
    );
  }

  /**
   * Convert GitHub issue to Bounty
   */
  private convertGitHubToBounty(issue: GitHubIssue): Bounty | null {
    try {
      const rewardAmount = this.extractRewardFromGitHub(issue);
      const skills = this.extractSkillsFromGitHub(issue);

      return {
        id: `github_${issue.id}`,
        source: 'github',
        title: issue.title,
        description: issue.body || '',
        reward_amount: rewardAmount,
        reward_token: 'USDC',
        url: issue.html_url,
        skills,
        status: 'open',
        discovered_at: new Date(),
        metadata: {
          repository: issue.repository_url.replace('https://api.github.com/repos/', ''),
          number: issue.number,
          author: issue.user.login,
          labels: issue.labels.map(l => l.name),
          created_at: issue.created_at,
          updated_at: issue.updated_at
        }
      };
    } catch (error) {
      console.error('Error converting GitHub issue:', error);
      return null;
    }
  }

  /**
   * Extract reward amount from GitHub issue
   */
  private extractRewardFromGitHub(issue: GitHubIssue): number {
    const text = (issue.title + ' ' + (issue.body || '')).toLowerCase();
    
    // Look for common reward patterns
    const patterns = [
      /\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g,  // $100, $1,000, $50.00
      /(\d+(?:,\d{3})*(?:\.\d{2})?) ?usdc/g,  // 100 USDC, 1,000 USDC
      /reward[:\s]+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/g,  // reward: $100
      /bounty[:\s]+\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/g   // bounty: $100
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (amount > 0 && amount < 100000) { // Reasonable bounty range
          return amount * 1_000_000; // Convert to micro-USDC
        }
      }
    }

    // Default estimates based on labels
    const labels = issue.labels.map(l => l.name.toLowerCase());
    if (labels.includes('good-first-issue')) return 50 * 1_000_000; // $50
    if (labels.includes('help-wanted')) return 100 * 1_000_000; // $100
    if (labels.includes('bounty')) return 250 * 1_000_000; // $250
    if (labels.includes('bug-bounty')) return 500 * 1_000_000; // $500

    return 0; // Unknown reward
  }

  /**
   * Extract skills from GitHub issue
   */
  private extractSkillsFromGitHub(issue: GitHubIssue): string[] {
    const skills = new Set<string>();
    const text = (issue.title + ' ' + (issue.body || '')).toLowerCase();
    const labels = issue.labels.map(l => l.name.toLowerCase());

    // Extract from labels
    for (const label of labels) {
      if (label.includes('rust')) skills.add('Rust');
      if (label.includes('typescript') || label.includes('ts')) skills.add('TypeScript');
      if (label.includes('javascript') || label.includes('js')) skills.add('JavaScript');
      if (label.includes('python')) skills.add('Python');
      if (label.includes('solana')) skills.add('Solana');
      if (label.includes('web3')) skills.add('Web3');
      if (label.includes('smart-contract')) skills.add('Smart Contracts');
      if (label.includes('frontend')) skills.add('Frontend');
      if (label.includes('backend')) skills.add('Backend');
      if (label.includes('docs') || label.includes('documentation')) skills.add('Documentation');
    }

    // Extract from text content
    if (text.includes('rust')) skills.add('Rust');
    if (text.includes('typescript') || text.includes('ts')) skills.add('TypeScript');
    if (text.includes('react')) skills.add('React');
    if (text.includes('solana') || text.includes('web3')) skills.add('Solana');
    if (text.includes('documentation') || text.includes('docs')) skills.add('Documentation');

    return Array.from(skills);
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}