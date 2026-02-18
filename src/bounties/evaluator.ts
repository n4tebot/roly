import { Bounty } from './scraper.js';
import { RolyConfig } from '../config.js';
import { StateDatabase } from '../state/database.js';

export interface BountyEvaluation {
  bounty: Bounty;
  score: number;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedHours: number;
  estimatedCost: number; // In micro-USDC
  roi: number; // Return on investment ratio
  skillsMatch: number; // 0-1 how well skills match
  urgency: number; // 0-1 based on deadline
  confidence: number; // 0-1 how confident we are in estimates
  reasoning: string[];
  recommended: boolean;
}

export interface AgentSkills {
  coding: {
    rust: number; // 0-1 skill level
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

export class BountyEvaluator {
  private config: RolyConfig;
  private database: StateDatabase;
  private agentSkills: AgentSkills;
  private baseCostPerHour = 10_000_000; // $10/hour in micro-USDC

  constructor(config: RolyConfig) {
    this.config = config;
    this.database = new StateDatabase(config);
    
    // Define Roly's current skill levels
    this.agentSkills = {
      coding: {
        rust: 0.6,        // Moderate Rust skills
        typescript: 0.8,  // Strong TypeScript
        javascript: 0.8,  // Strong JavaScript
        python: 0.7,      // Good Python
        solana: 0.5       // Learning Solana development
      },
      documentation: 0.9,   // Excellent at docs
      research: 0.8,        // Strong research skills
      design: 0.3,          // Limited design skills
      webScraping: 0.9,     // Excellent web scraping
      apiIntegration: 0.8,  // Strong API skills
      testing: 0.6          // Moderate testing skills
    };
  }

  /**
   * Evaluate a list of bounties and return them sorted by score
   */
  async evaluateBounties(bounties: Bounty[]): Promise<BountyEvaluation[]> {
    const evaluations: BountyEvaluation[] = [];

    for (const bounty of bounties) {
      try {
        const evaluation = await this.evaluateBounty(bounty);
        evaluations.push(evaluation);
      } catch (error) {
        console.error(`Error evaluating bounty ${bounty.id}:`, error);
      }
    }

    // Sort by score (highest first)
    return evaluations.sort((a, b) => b.score - a.score);
  }

  /**
   * Evaluate a single bounty
   */
  async evaluateBounty(bounty: Bounty): Promise<BountyEvaluation> {
    const difficulty = this.assessDifficulty(bounty);
    const estimatedHours = this.estimateTimeRequired(bounty, difficulty);
    const estimatedCost = estimatedHours * this.baseCostPerHour;
    const skillsMatch = this.calculateSkillsMatch(bounty);
    const urgency = this.calculateUrgency(bounty);
    const confidence = this.calculateConfidence(bounty, skillsMatch);
    
    const roi = bounty.reward_amount > 0 
      ? bounty.reward_amount / estimatedCost 
      : 0;

    const score = this.calculateOverallScore(
      roi, skillsMatch, urgency, confidence, difficulty
    );

    const reasoning = this.generateReasoning(
      bounty, difficulty, skillsMatch, roi, urgency
    );

    const recommended = score > 0.6 && roi > 1.2 && skillsMatch > 0.6;

    return {
      bounty,
      score,
      difficulty,
      estimatedHours,
      estimatedCost,
      roi,
      skillsMatch,
      urgency,
      confidence,
      reasoning,
      recommended
    };
  }

  /**
   * Assess bounty difficulty based on description and metadata
   */
  private assessDifficulty(bounty: Bounty): 'easy' | 'medium' | 'hard' {
    const text = (bounty.title + ' ' + bounty.description).toLowerCase();
    const difficultyIndicators = {
      easy: [
        'documentation', 'docs', 'readme', 'comment', 'simple',
        'beginner', 'starter', 'good first issue', 'typo', 'fix typo',
        'add example', 'update readme', 'small bug'
      ],
      medium: [
        'feature', 'implement', 'api', 'integration', 'refactor',
        'optimize', 'improve', 'enhancement', 'bug fix', 'test'
      ],
      hard: [
        'architecture', 'design', 'complex', 'performance', 'security',
        'cryptography', 'consensus', 'protocol', 'runtime', 'vm',
        'compiler', 'memory management', 'concurrency'
      ]
    };

    let easyScore = 0;
    let mediumScore = 0;
    let hardScore = 0;

    for (const indicator of difficultyIndicators.easy) {
      if (text.includes(indicator)) easyScore++;
    }

    for (const indicator of difficultyIndicators.medium) {
      if (text.includes(indicator)) mediumScore++;
    }

    for (const indicator of difficultyIndicators.hard) {
      if (text.includes(indicator)) hardScore++;
    }

    // GitHub-specific difficulty assessment
    if (bounty.source === 'github' && bounty.metadata?.labels) {
      const labels = bounty.metadata.labels;
      if (labels.includes('good-first-issue')) easyScore += 3;
      if (labels.includes('help-wanted')) mediumScore += 2;
      if (labels.includes('bug')) mediumScore += 1;
      if (labels.includes('enhancement')) mediumScore += 1;
      if (labels.includes('breaking-change')) hardScore += 3;
    }

    if (hardScore > easyScore && hardScore > mediumScore) return 'hard';
    if (mediumScore > easyScore) return 'medium';
    return 'easy';
  }

  /**
   * Estimate time required in hours
   */
  private estimateTimeRequired(bounty: Bounty, difficulty: 'easy' | 'medium' | 'hard'): number {
    const baseTimes = {
      easy: 2,     // 2 hours for easy tasks
      medium: 8,   // 8 hours for medium tasks  
      hard: 24     // 24 hours for hard tasks
    };

    let baseTime = baseTimes[difficulty];
    
    // Adjust based on bounty type and content
    const text = (bounty.title + ' ' + bounty.description).toLowerCase();

    // Documentation tasks are usually faster
    if (text.includes('documentation') || text.includes('readme')) {
      baseTime *= 0.5;
    }

    // Testing tasks take longer
    if (text.includes('test') && !text.includes('fix test')) {
      baseTime *= 1.5;
    }

    // New feature implementation
    if (text.includes('new feature') || text.includes('implement')) {
      baseTime *= 1.3;
    }

    // Research-heavy tasks
    if (text.includes('research') || text.includes('investigate')) {
      baseTime *= 1.2;
    }

    // Multiple components or files
    if (text.includes('multiple') || text.includes('several')) {
      baseTime *= 1.4;
    }

    return Math.max(1, Math.round(baseTime));
  }

  /**
   * Calculate how well bounty skills match agent skills
   */
  private calculateSkillsMatch(bounty: Bounty): number {
    if (bounty.skills.length === 0) {
      // If no skills specified, assume medium match
      return 0.5;
    }

    let totalMatch = 0;
    let maxPossible = 0;

    for (const skill of bounty.skills) {
      const skillLower = skill.toLowerCase();
      maxPossible += 1;

      if (skillLower.includes('rust')) {
        totalMatch += this.agentSkills.coding.rust;
      } else if (skillLower.includes('typescript') || skillLower.includes('ts')) {
        totalMatch += this.agentSkills.coding.typescript;
      } else if (skillLower.includes('javascript') || skillLower.includes('js')) {
        totalMatch += this.agentSkills.coding.javascript;
      } else if (skillLower.includes('python')) {
        totalMatch += this.agentSkills.coding.python;
      } else if (skillLower.includes('solana') || skillLower.includes('web3')) {
        totalMatch += this.agentSkills.coding.solana;
      } else if (skillLower.includes('documentation') || skillLower.includes('docs')) {
        totalMatch += this.agentSkills.documentation;
      } else if (skillLower.includes('research')) {
        totalMatch += this.agentSkills.research;
      } else if (skillLower.includes('design')) {
        totalMatch += this.agentSkills.design;
      } else if (skillLower.includes('api') || skillLower.includes('integration')) {
        totalMatch += this.agentSkills.apiIntegration;
      } else if (skillLower.includes('test')) {
        totalMatch += this.agentSkills.testing;
      } else {
        // Unknown skill, give partial credit
        totalMatch += 0.5;
      }
    }

    // Also consider content-based skill matching
    const text = (bounty.title + ' ' + bounty.description).toLowerCase();
    let contentMatch = 0;
    let contentSkills = 0;

    if (text.includes('documentation') || text.includes('readme')) {
      contentMatch += this.agentSkills.documentation;
      contentSkills++;
    }

    if (text.includes('api') || text.includes('endpoint')) {
      contentMatch += this.agentSkills.apiIntegration;
      contentSkills++;
    }

    if (text.includes('scraping') || text.includes('crawl')) {
      contentMatch += this.agentSkills.webScraping;
      contentSkills++;
    }

    if (contentSkills > 0) {
      // Combine declared skills with content-inferred skills
      const declaredWeight = bounty.skills.length > 0 ? 0.7 : 0;
      const contentWeight = 1 - declaredWeight;
      
      const declaredScore = maxPossible > 0 ? totalMatch / maxPossible : 0;
      const contentScore = contentMatch / contentSkills;
      
      return declaredWeight * declaredScore + contentWeight * contentScore;
    }

    return maxPossible > 0 ? totalMatch / maxPossible : 0.5;
  }

  /**
   * Calculate urgency based on deadline
   */
  private calculateUrgency(bounty: Bounty): number {
    if (!bounty.deadline) {
      return 0.5; // Medium urgency if no deadline
    }

    const now = new Date();
    const timeLeft = bounty.deadline.getTime() - now.getTime();
    const daysLeft = timeLeft / (24 * 60 * 60 * 1000);

    if (daysLeft < 0) return 0; // Expired
    if (daysLeft < 1) return 0.9; // Very urgent
    if (daysLeft < 3) return 0.8; // Urgent
    if (daysLeft < 7) return 0.7; // Somewhat urgent
    if (daysLeft < 14) return 0.6; // Medium urgency
    if (daysLeft < 30) return 0.5; // Low urgency
    return 0.4; // Very low urgency
  }

  /**
   * Calculate confidence in our estimates
   */
  private calculateConfidence(bounty: Bounty, skillsMatch: number): number {
    let confidence = 0.5; // Base confidence

    // Higher confidence if skills match well
    confidence += skillsMatch * 0.3;

    // Higher confidence for detailed descriptions
    if (bounty.description.length > 200) {
      confidence += 0.1;
    }

    // Higher confidence for GitHub bounties (more structured)
    if (bounty.source === 'github') {
      confidence += 0.1;
    }

    // Higher confidence if we have clear reward info
    if (bounty.reward_amount > 0) {
      confidence += 0.1;
    }

    // Lower confidence for very new bounties (might be incomplete)
    const ageHours = (Date.now() - bounty.discovered_at.getTime()) / (60 * 60 * 1000);
    if (ageHours < 1) {
      confidence -= 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Calculate overall bounty score
   */
  private calculateOverallScore(
    roi: number,
    skillsMatch: number,
    urgency: number,
    confidence: number,
    difficulty: 'easy' | 'medium' | 'hard'
  ): number {
    // Normalize ROI (cap at 5x for scoring purposes)
    const normalizedRoi = Math.min(roi, 5) / 5;

    // Difficulty multiplier (easier tasks get higher scores)
    const difficultyMultiplier = {
      easy: 1.0,
      medium: 0.8,
      hard: 0.6
    }[difficulty];

    // Weighted score calculation
    const score = (
      normalizedRoi * 0.4 +        // 40% weight on ROI
      skillsMatch * 0.3 +          // 30% weight on skills match
      urgency * 0.1 +              // 10% weight on urgency
      confidence * 0.2             // 20% weight on confidence
    ) * difficultyMultiplier;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Generate human-readable reasoning
   */
  private generateReasoning(
    bounty: Bounty,
    difficulty: 'easy' | 'medium' | 'hard',
    skillsMatch: number,
    roi: number,
    urgency: number
  ): string[] {
    const reasoning: string[] = [];

    // Difficulty reasoning
    reasoning.push(`Difficulty: ${difficulty} - ${this.getDifficultyReason(bounty, difficulty)}`);

    // Skills match reasoning
    if (skillsMatch >= 0.8) {
      reasoning.push(`Skills: Excellent match (${Math.round(skillsMatch * 100)}%)`);
    } else if (skillsMatch >= 0.6) {
      reasoning.push(`Skills: Good match (${Math.round(skillsMatch * 100)}%)`);
    } else if (skillsMatch >= 0.4) {
      reasoning.push(`Skills: Moderate match (${Math.round(skillsMatch * 100)}%)`);
    } else {
      reasoning.push(`Skills: Poor match (${Math.round(skillsMatch * 100)}%) - may need learning`);
    }

    // ROI reasoning
    if (roi >= 3) {
      reasoning.push(`ROI: Excellent (${roi.toFixed(1)}x return)`);
    } else if (roi >= 2) {
      reasoning.push(`ROI: Good (${roi.toFixed(1)}x return)`);
    } else if (roi >= 1) {
      reasoning.push(`ROI: Profitable (${roi.toFixed(1)}x return)`);
    } else if (bounty.reward_amount === 0) {
      reasoning.push(`ROI: Unknown reward amount - could be valuable for reputation`);
    } else {
      reasoning.push(`ROI: Unprofitable (${roi.toFixed(1)}x return)`);
    }

    // Urgency reasoning
    if (bounty.deadline) {
      const daysLeft = (bounty.deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      if (daysLeft < 1) {
        reasoning.push(`Deadline: URGENT - expires in ${Math.round(daysLeft * 24)} hours`);
      } else if (daysLeft < 7) {
        reasoning.push(`Deadline: Soon - ${Math.round(daysLeft)} days remaining`);
      } else {
        reasoning.push(`Deadline: ${Math.round(daysLeft)} days remaining`);
      }
    }

    // Source-specific reasoning
    if (bounty.source === 'github') {
      reasoning.push(`Source: GitHub - structured, likely legitimate`);
    } else if (bounty.source === 'superteam') {
      reasoning.push(`Source: Superteam Earn - established bounty platform`);
    }

    return reasoning;
  }

  /**
   * Get reasoning for difficulty assessment
   */
  private getDifficultyReason(bounty: Bounty, difficulty: 'easy' | 'medium' | 'hard'): string {
    const text = bounty.title.toLowerCase() + ' ' + bounty.description.toLowerCase();

    switch (difficulty) {
      case 'easy':
        if (text.includes('documentation')) return 'Documentation task';
        if (text.includes('typo')) return 'Simple text fix';
        if (text.includes('readme')) return 'README update';
        return 'Simple task based on description';

      case 'medium':
        if (text.includes('feature')) return 'Feature implementation';
        if (text.includes('api')) return 'API integration work';
        if (text.includes('bug')) return 'Bug fix required';
        return 'Moderate complexity task';

      case 'hard':
        if (text.includes('architecture')) return 'Architectural changes needed';
        if (text.includes('performance')) return 'Performance optimization';
        if (text.includes('security')) return 'Security-related work';
        return 'Complex technical task';

      default:
        return 'Assessment based on content analysis';
    }
  }

  /**
   * Get top N recommended bounties
   */
  async getTopBounties(bounties: Bounty[], limit: number = 5): Promise<BountyEvaluation[]> {
    const evaluations = await this.evaluateBounties(bounties);
    
    return evaluations
      .filter(e => e.recommended)
      .slice(0, limit);
  }

  /**
   * Update agent skills based on completed bounties (learning)
   */
  async updateSkillsFromExperience(bounty: Bounty, success: boolean): Promise<void> {
    if (!success) return; // Only learn from successful completions

    const learningRate = 0.05; // Small incremental improvements

    // Improve skills based on what was required
    for (const skill of bounty.skills) {
      const skillLower = skill.toLowerCase();
      
      if (skillLower.includes('rust')) {
        this.agentSkills.coding.rust = Math.min(1, this.agentSkills.coding.rust + learningRate);
      } else if (skillLower.includes('typescript')) {
        this.agentSkills.coding.typescript = Math.min(1, this.agentSkills.coding.typescript + learningRate);
      } else if (skillLower.includes('javascript')) {
        this.agentSkills.coding.javascript = Math.min(1, this.agentSkills.coding.javascript + learningRate);
      } else if (skillLower.includes('python')) {
        this.agentSkills.coding.python = Math.min(1, this.agentSkills.coding.python + learningRate);
      } else if (skillLower.includes('solana')) {
        this.agentSkills.coding.solana = Math.min(1, this.agentSkills.coding.solana + learningRate);
      }
    }

    // Store updated skills
    await this.database.storeState('agent_skills', 'skills', this.agentSkills);
  }

  /**
   * Load saved skills from database
   */
  async loadSkills(): Promise<void> {
    const savedSkills = await this.database.getState('agent_skills');
    if (savedSkills) {
      this.agentSkills = { ...this.agentSkills, ...savedSkills };
    }
  }
}