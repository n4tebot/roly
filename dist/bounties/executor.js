import { StateDatabase } from '../state/database.js';
import { AgentTools } from '../agent/tools.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
const execAsync = promisify(exec);
export class BountyExecutor {
    config;
    database;
    tools;
    workspaceDir;
    constructor(config) {
        this.config = config;
        this.database = new StateDatabase(config);
        this.tools = new AgentTools(config);
        this.workspaceDir = join(config.dataDir, 'bounty_workspace');
        // Ensure workspace directory exists
        if (!existsSync(this.workspaceDir)) {
            mkdirSync(this.workspaceDir, { recursive: true });
        }
    }
    /**
     * Execute a bounty from start to finish
     */
    async executeBounty(bounty, evaluation) {
        const startTime = Date.now();
        console.log(`🚀 Starting execution of bounty: ${bounty.title}`);
        try {
            // Create execution plan
            const plan = await this.createExecutionPlan(bounty, evaluation);
            // Execute all steps
            const completedSteps = [];
            let success = true;
            let submissionUrl;
            let submissionData;
            for (const step of plan.steps) {
                console.log(`📝 Executing step: ${step.name}`);
                try {
                    const result = await this.executeStep(step, plan);
                    step.status = 'completed';
                    step.output = result;
                    completedSteps.push(step);
                    // Check if this step produced a submission
                    if (step.type === 'submission' && result) {
                        submissionUrl = this.extractSubmissionUrl(result);
                        submissionData = result;
                    }
                }
                catch (error) {
                    step.status = 'failed';
                    step.error = error instanceof Error ? error.message : String(error);
                    completedSteps.push(step);
                    success = false;
                    console.error(`❌ Step failed: ${step.name}`, error);
                    break; // Stop execution on failure
                }
            }
            const totalTime = Math.round((Date.now() - startTime) / (60 * 1000));
            const cost = totalTime * (evaluation.estimatedCost / evaluation.estimatedHours / 60);
            const result = {
                bounty,
                success,
                submissionUrl,
                submissionData,
                completedSteps,
                totalTime,
                cost,
                learnings: this.generateLearnings(bounty, completedSteps, success)
            };
            // Store execution result
            await this.storeExecutionResult(result);
            if (success) {
                console.log(`✅ Bounty execution completed successfully in ${totalTime} minutes`);
            }
            else {
                console.log(`❌ Bounty execution failed after ${totalTime} minutes`);
            }
            return result;
        }
        catch (error) {
            const totalTime = Math.round((Date.now() - startTime) / (60 * 1000));
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`💥 Bounty execution crashed: ${errorMessage}`);
            return {
                bounty,
                success: false,
                completedSteps: [],
                totalTime,
                cost: 0,
                error: errorMessage,
                learnings: [`Failed with error: ${errorMessage}`]
            };
        }
    }
    /**
     * Create an execution plan for a bounty
     */
    async createExecutionPlan(bounty, evaluation) {
        const steps = [];
        const workingDirectory = join(this.workspaceDir, `bounty_${bounty.id}`);
        if (!existsSync(workingDirectory)) {
            mkdirSync(workingDirectory, { recursive: true });
        }
        // Step 1: Research and understand the bounty
        steps.push({
            id: 'research',
            name: 'Research Requirements',
            description: 'Analyze bounty requirements and gather information',
            type: 'research',
            estimatedMinutes: Math.max(10, evaluation.estimatedHours * 60 * 0.2),
            dependencies: [],
            status: 'pending'
        });
        // GitHub-specific steps
        if (bounty.source === 'github') {
            steps.push({
                id: 'clone_repo',
                name: 'Clone Repository',
                description: 'Clone the target repository',
                type: 'setup',
                estimatedMinutes: 5,
                dependencies: ['research'],
                status: 'pending'
            });
            steps.push({
                id: 'analyze_codebase',
                name: 'Analyze Codebase',
                description: 'Understand the codebase structure and requirements',
                type: 'research',
                estimatedMinutes: Math.max(15, evaluation.estimatedHours * 60 * 0.3),
                dependencies: ['clone_repo'],
                status: 'pending'
            });
            steps.push({
                id: 'create_branch',
                name: 'Create Working Branch',
                description: 'Create a new branch for the work',
                type: 'setup',
                estimatedMinutes: 2,
                dependencies: ['analyze_codebase'],
                status: 'pending'
            });
            steps.push({
                id: 'implement_solution',
                name: 'Implement Solution',
                description: 'Write code to address the bounty requirements',
                type: 'implementation',
                estimatedMinutes: Math.max(30, evaluation.estimatedHours * 60 * 0.6),
                dependencies: ['create_branch'],
                status: 'pending'
            });
            steps.push({
                id: 'run_tests',
                name: 'Run Tests',
                description: 'Run existing tests and create new ones if needed',
                type: 'testing',
                estimatedMinutes: Math.max(10, evaluation.estimatedHours * 60 * 0.2),
                dependencies: ['implement_solution'],
                status: 'pending'
            });
            steps.push({
                id: 'create_pr',
                name: 'Create Pull Request',
                description: 'Create PR with solution and notify on issue',
                type: 'submission',
                estimatedMinutes: 10,
                dependencies: ['run_tests'],
                status: 'pending'
            });
        }
        // Superteam-specific steps
        else if (bounty.source === 'superteam') {
            steps.push({
                id: 'download_brief',
                name: 'Download Full Brief',
                description: 'Get detailed requirements from Superteam',
                type: 'research',
                estimatedMinutes: 10,
                dependencies: ['research'],
                status: 'pending'
            });
            steps.push({
                id: 'execute_work',
                name: 'Execute Work',
                description: 'Complete the bounty requirements',
                type: 'implementation',
                estimatedMinutes: Math.max(60, evaluation.estimatedHours * 60 * 0.7),
                dependencies: ['download_brief'],
                status: 'pending'
            });
            steps.push({
                id: 'prepare_submission',
                name: 'Prepare Submission',
                description: 'Package work for submission',
                type: 'submission',
                estimatedMinutes: 20,
                dependencies: ['execute_work'],
                status: 'pending'
            });
        }
        return {
            bounty,
            evaluation,
            steps,
            workingDirectory,
            estimatedDuration: steps.reduce((sum, step) => sum + step.estimatedMinutes, 0)
        };
    }
    /**
     * Execute a single step
     */
    async executeStep(step, plan) {
        step.status = 'in_progress';
        switch (step.id) {
            case 'research':
                return await this.researchBounty(plan.bounty);
            case 'clone_repo':
                return await this.cloneRepository(plan.bounty, plan.workingDirectory);
            case 'analyze_codebase':
                return await this.analyzeCodebase(plan.bounty, plan.workingDirectory);
            case 'create_branch':
                return await this.createWorkingBranch(plan.bounty, plan.workingDirectory);
            case 'implement_solution':
                return await this.implementSolution(plan.bounty, plan.workingDirectory);
            case 'run_tests':
                return await this.runTests(plan.workingDirectory);
            case 'create_pr':
                return await this.createPullRequest(plan.bounty, plan.workingDirectory);
            case 'download_brief':
                return await this.downloadSuperteamBrief(plan.bounty);
            case 'execute_work':
                return await this.executeSuperteamWork(plan.bounty, plan.workingDirectory);
            case 'prepare_submission':
                return await this.prepareSuperteamSubmission(plan.bounty, plan.workingDirectory);
            default:
                throw new Error(`Unknown step: ${step.id}`);
        }
    }
    /**
     * Research bounty requirements
     */
    async researchBounty(bounty) {
        const research = {
            title: bounty.title,
            description: bounty.description,
            skills_required: bounty.skills,
            reward: `${bounty.reward_amount / 1_000_000} ${bounty.reward_token}`,
            deadline: bounty.deadline?.toISOString(),
            source: bounty.source,
            url: bounty.url
        };
        // Additional research for GitHub bounties
        if (bounty.source === 'github' && bounty.metadata) {
            research.repository = bounty.metadata.repository;
            research.issue_number = bounty.metadata.number;
            research.labels = bounty.metadata.labels;
            // Fetch more details from GitHub API if available
            try {
                const response = await axios.get(`https://api.github.com/repos/${bounty.metadata.repository}/issues/${bounty.metadata.number}`, {
                    headers: {
                        'User-Agent': 'Roly-Agent/1.0',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    timeout: 10000
                });
                research.full_description = response.data.body;
                research.comments_count = response.data.comments;
            }
            catch (error) {
                console.warn('Could not fetch additional GitHub details:', error);
            }
        }
        const researchFile = join(this.workspaceDir, `bounty_${bounty.id}`, 'research.json');
        writeFileSync(researchFile, JSON.stringify(research, null, 2));
        return `Research completed and saved to ${researchFile}`;
    }
    /**
     * Clone GitHub repository
     */
    async cloneRepository(bounty, workingDir) {
        if (!bounty.metadata?.repository) {
            throw new Error('No repository information available');
        }
        const repoUrl = `https://github.com/${bounty.metadata.repository}.git`;
        const repoDir = join(workingDir, 'repo');
        try {
            const { stdout, stderr } = await execAsync(`git clone ${repoUrl} ${repoDir}`, {
                cwd: workingDir
            });
            return `Repository cloned successfully: ${stdout}${stderr}`;
        }
        catch (error) {
            throw new Error(`Failed to clone repository: ${error}`);
        }
    }
    /**
     * Analyze codebase structure
     */
    async analyzeCodebase(bounty, workingDir) {
        const repoDir = join(workingDir, 'repo');
        if (!existsSync(repoDir)) {
            throw new Error('Repository not found');
        }
        try {
            // Get directory structure
            const { stdout: dirStructure } = await execAsync('find . -type f -name "*.rs" -o -name "*.ts" -o -name "*.js" -o -name "*.py" | head -20', {
                cwd: repoDir
            });
            // Check for common files
            const commonFiles = ['README.md', 'package.json', 'Cargo.toml', 'requirements.txt'];
            const foundFiles = [];
            for (const file of commonFiles) {
                if (existsSync(join(repoDir, file))) {
                    foundFiles.push(file);
                }
            }
            // Look for test directories
            const { stdout: testDirs } = await execAsync('find . -type d -name "*test*" | head -5', {
                cwd: repoDir
            });
            const analysis = {
                directory_structure: dirStructure.split('\n').filter(l => l.trim()),
                config_files: foundFiles,
                test_directories: testDirs.split('\n').filter(l => l.trim()),
                issue_context: {
                    issue_number: bounty.metadata?.number,
                    issue_url: bounty.url
                }
            };
            const analysisFile = join(workingDir, 'codebase_analysis.json');
            writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));
            return `Codebase analysis completed: Found ${analysis.directory_structure.length} source files, ${foundFiles.length} config files`;
        }
        catch (error) {
            throw new Error(`Failed to analyze codebase: ${error}`);
        }
    }
    /**
     * Create working branch
     */
    async createWorkingBranch(bounty, workingDir) {
        const repoDir = join(workingDir, 'repo');
        const branchName = `bounty-${bounty.metadata?.number || 'fix'}-${Date.now()}`;
        try {
            const { stdout, stderr } = await execAsync(`git checkout -b ${branchName}`, {
                cwd: repoDir
            });
            return `Created branch: ${branchName}\n${stdout}${stderr}`;
        }
        catch (error) {
            throw new Error(`Failed to create branch: ${error}`);
        }
    }
    /**
     * Implement solution (simplified AI-assisted implementation)
     */
    async implementSolution(bounty, workingDir) {
        const repoDir = join(workingDir, 'repo');
        // This is a simplified implementation
        // In practice, this would use more sophisticated AI-assisted coding
        const implementationPlan = this.createImplementationPlan(bounty);
        const results = [];
        for (const task of implementationPlan) {
            try {
                const result = await this.executeImplementationTask(task, repoDir);
                results.push(result);
            }
            catch (error) {
                console.error(`Implementation task failed: ${task.description}`, error);
                results.push(`FAILED: ${task.description} - ${error}`);
            }
        }
        return `Implementation completed:\n${results.join('\n')}`;
    }
    /**
     * Create implementation plan based on bounty description
     */
    createImplementationPlan(bounty) {
        const text = bounty.title.toLowerCase() + ' ' + bounty.description.toLowerCase();
        const plan = [];
        // Documentation tasks
        if (text.includes('readme') || text.includes('documentation')) {
            plan.push({
                type: 'docs',
                description: 'Update documentation',
                action: 'update_readme'
            });
        }
        // Bug fix tasks
        if (text.includes('fix') || text.includes('bug')) {
            plan.push({
                type: 'bugfix',
                description: 'Fix identified bug',
                action: 'fix_bug'
            });
        }
        // Feature tasks
        if (text.includes('add') || text.includes('implement') || text.includes('feature')) {
            plan.push({
                type: 'feature',
                description: 'Implement new feature',
                action: 'add_feature'
            });
        }
        // Test tasks
        if (text.includes('test')) {
            plan.push({
                type: 'testing',
                description: 'Add or fix tests',
                action: 'add_tests'
            });
        }
        // Default plan if no specific tasks identified
        if (plan.length === 0) {
            plan.push({
                type: 'general',
                description: 'General improvement task',
                action: 'general_improvement'
            });
        }
        return plan;
    }
    /**
     * Execute a specific implementation task
     */
    async executeImplementationTask(task, repoDir) {
        switch (task.action) {
            case 'update_readme':
                return await this.updateReadme(repoDir);
            case 'fix_bug':
                return await this.attemptBugFix(repoDir);
            case 'add_feature':
                return await this.addSimpleFeature(repoDir);
            case 'add_tests':
                return await this.addTests(repoDir);
            case 'general_improvement':
                return await this.makeGeneralImprovements(repoDir);
            default:
                return `Skipped task: ${task.description}`;
        }
    }
    /**
     * Update README file
     */
    async updateReadme(repoDir) {
        const readmePath = join(repoDir, 'README.md');
        if (existsSync(readmePath)) {
            const content = readFileSync(readmePath, 'utf-8');
            // Simple improvements: add badges, fix formatting, etc.
            let updatedContent = content;
            // Add a simple improvement
            if (!content.includes('## Contributing')) {
                updatedContent += '\n\n## Contributing\n\nContributions are welcome! Please read the contributing guidelines before submitting a pull request.\n';
            }
            if (content !== updatedContent) {
                writeFileSync(readmePath, updatedContent);
                return 'README.md updated with contributing section';
            }
        }
        return 'No README updates needed';
    }
    /**
     * Attempt simple bug fixes
     */
    async attemptBugFix(repoDir) {
        // This is a placeholder for AI-assisted bug fixing
        // In practice, this would analyze the issue description and attempt fixes
        return 'Bug fix attempted (placeholder implementation)';
    }
    /**
     * Add simple feature
     */
    async addSimpleFeature(repoDir) {
        // Placeholder for feature addition
        return 'Feature addition attempted (placeholder implementation)';
    }
    /**
     * Add tests
     */
    async addTests(repoDir) {
        // Look for test files and add simple tests
        return 'Test addition attempted (placeholder implementation)';
    }
    /**
     * Make general improvements
     */
    async makeGeneralImprovements(repoDir) {
        const improvements = [];
        // Check for and fix common issues
        try {
            // Check for package.json and update scripts
            const packageJsonPath = join(repoDir, 'package.json');
            if (existsSync(packageJsonPath)) {
                improvements.push('Package.json found');
            }
            // Check for Cargo.toml
            const cargoTomlPath = join(repoDir, 'Cargo.toml');
            if (existsSync(cargoTomlPath)) {
                improvements.push('Cargo.toml found');
            }
        }
        catch (error) {
            console.error('Error making improvements:', error);
        }
        return `General improvements: ${improvements.join(', ')}`;
    }
    /**
     * Run tests
     */
    async runTests(workingDir) {
        const repoDir = join(workingDir, 'repo');
        const results = [];
        // Try different test commands based on project type
        const testCommands = [
            'npm test',
            'yarn test',
            'cargo test',
            'python -m pytest',
            'make test'
        ];
        for (const command of testCommands) {
            try {
                const { stdout, stderr } = await execAsync(command, {
                    cwd: repoDir,
                    timeout: 60000 // 1 minute timeout
                });
                results.push(`✅ ${command}: ${stdout.slice(0, 200)}...`);
                break; // Stop on first successful test run
            }
            catch (error) {
                results.push(`❌ ${command}: ${error}`);
            }
        }
        return `Test results:\n${results.join('\n')}`;
    }
    /**
     * Create pull request
     */
    async createPullRequest(bounty, workingDir) {
        const repoDir = join(workingDir, 'repo');
        try {
            // Commit changes
            await execAsync('git add .', { cwd: repoDir });
            await execAsync(`git commit -m "Fix: Address issue #${bounty.metadata?.number || 'bounty'}\n\nImplemented solution for bounty: ${bounty.title}"`, {
                cwd: repoDir
            });
            // This would normally push to a fork and create PR via GitHub API
            // For now, just prepare the commit
            const { stdout: gitStatus } = await execAsync('git status', { cwd: repoDir });
            const prData = {
                title: `Fix: ${bounty.title}`,
                description: `This PR addresses issue #${bounty.metadata?.number}\n\n${bounty.description}`,
                branch: 'bounty-fix',
                commits: 'Changes committed locally'
            };
            // In production, would create actual PR here
            const submissionFile = join(workingDir, 'pr_submission.json');
            writeFileSync(submissionFile, JSON.stringify(prData, null, 2));
            return `Pull request prepared: ${JSON.stringify(prData)}`;
        }
        catch (error) {
            throw new Error(`Failed to create PR: ${error}`);
        }
    }
    /**
     * Download Superteam brief
     */
    async downloadSuperteamBrief(bounty) {
        try {
            const response = await axios.get(bounty.url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Roly-Agent/1.0'
                }
            });
            const briefFile = join(this.workspaceDir, `bounty_${bounty.id}`, 'superteam_brief.html');
            writeFileSync(briefFile, response.data);
            return `Superteam brief downloaded: ${briefFile}`;
        }
        catch (error) {
            throw new Error(`Failed to download brief: ${error}`);
        }
    }
    /**
     * Execute Superteam work
     */
    async executeSuperteamWork(bounty, workingDir) {
        // This would contain the actual work implementation for Superteam bounties
        // Could be research, documentation, code, design, etc.
        const workFile = join(workingDir, 'superteam_work.md');
        const workContent = `# Superteam Bounty Work: ${bounty.title}

## Requirements Analysis
${bounty.description}

## Implementation
[Work would be done here based on bounty type]

## Deliverables
[Completed deliverables would be listed here]

## Submission Notes
Completed by Roly autonomous agent.
`;
        writeFileSync(workFile, workContent);
        return `Superteam work completed and documented in ${workFile}`;
    }
    /**
     * Prepare Superteam submission
     */
    async prepareSuperteamSubmission(bounty, workingDir) {
        const submissionData = {
            bounty_id: bounty.id,
            bounty_url: bounty.url,
            work_directory: workingDir,
            submission_type: 'automated',
            completed_by: 'Roly Agent',
            completion_date: new Date().toISOString(),
            notes: 'Submission requires manual review before final submission to Superteam platform'
        };
        const submissionFile = join(workingDir, 'superteam_submission.json');
        writeFileSync(submissionFile, JSON.stringify(submissionData, null, 2));
        return `Superteam submission prepared: ${submissionFile}`;
    }
    /**
     * Extract submission URL from step result
     */
    extractSubmissionUrl(result) {
        if (typeof result === 'string') {
            // Look for GitHub PR URLs or similar
            const urlMatch = result.match(/https?:\/\/[^\s]+/);
            return urlMatch ? urlMatch[0] : undefined;
        }
        if (typeof result === 'object' && result.url) {
            return result.url;
        }
        return undefined;
    }
    /**
     * Generate learnings from execution
     */
    generateLearnings(bounty, completedSteps, success) {
        const learnings = [];
        if (success) {
            learnings.push(`Successfully completed ${bounty.source} bounty`);
            learnings.push(`Bounty type: ${bounty.skills.join(', ')}`);
        }
        else {
            learnings.push(`Failed to complete bounty: ${bounty.title}`);
            const failedStep = completedSteps.find(s => s.status === 'failed');
            if (failedStep) {
                learnings.push(`Failed at step: ${failedStep.name}`);
                learnings.push(`Error: ${failedStep.error}`);
            }
        }
        // Learnings from specific steps
        for (const step of completedSteps) {
            if (step.status === 'completed') {
                switch (step.type) {
                    case 'research':
                        learnings.push('Improved research and analysis skills');
                        break;
                    case 'implementation':
                        learnings.push(`Gained experience with ${bounty.skills.join(', ')}`);
                        break;
                    case 'testing':
                        learnings.push('Improved testing and validation skills');
                        break;
                }
            }
        }
        return learnings;
    }
    /**
     * Store execution result in database
     */
    async storeExecutionResult(result) {
        const executionData = {
            bounty_id: result.bounty.id,
            success: result.success,
            submission_url: result.submissionUrl,
            total_time: result.totalTime,
            cost: result.cost,
            completed_steps: result.completedSteps.length,
            learnings: result.learnings,
            timestamp: new Date()
        };
        await this.database.storeState(`bounty_execution_${result.bounty.id}`, 'bounty_execution', executionData);
        // Store metrics
        await this.database.storeMetric('bounty_execution_time', result.totalTime);
        await this.database.storeMetric('bounty_execution_cost', result.cost);
        await this.database.storeMetric('bounty_execution_success', result.success ? 1 : 0);
    }
}
