import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { RolyConfig } from '../config.js';
import { AgentTurn } from '../agent/loop.js';

export interface StateEntry {
  id: string;
  timestamp: Date;
  type: 'turn' | 'event' | 'metric';
  data: any;
}

interface AgentTurnRow {
  id: string;
  timestamp: number;
  thought: string;
  action_tool: string | null;
  action_input: string | null;
  action_output: string | null;
  action_error: string | null;
  observation: string | null;
  reflection: string | null;
}

interface StateEntryRow {
  id: string;
  timestamp: number;
  type: string;
  data: string;
}

export class StateDatabase {
  private db: Database.Database;
  private config: RolyConfig;

  constructor(config: RolyConfig) {
    this.config = config;
    
    // Ensure data directory exists
    if (!existsSync(config.dataDir)) {
      mkdirSync(config.dataDir, { recursive: true });
    }

    const dbPath = join(config.dataDir, 'state.db');
    this.db = new Database(dbPath);
    
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_turns (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        thought TEXT NOT NULL,
        action_tool TEXT,
        action_input TEXT,
        action_output TEXT,
        action_error TEXT,
        observation TEXT NOT NULL,
        reflection TEXT,
        survival_tier TEXT,
        balance_usdc INTEGER,
        balance_sol INTEGER
      );

      CREATE TABLE IF NOT EXISTS state_entries (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS lineage (
        agent_id TEXT PRIMARY KEY,
        parent_id TEXT,
        generation INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT DEFAULT 'active'
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_turns_timestamp ON agent_turns(timestamp);
      CREATE INDEX IF NOT EXISTS idx_state_timestamp ON state_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp);
      CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name);
    `);

    // Insert initial lineage entry if not exists
    const existingLineage = this.db.prepare('SELECT * FROM lineage WHERE agent_id = ?')
      .get(this.config.identity.agentId);
    
    if (!existingLineage) {
      this.db.prepare(`
        INSERT INTO lineage (agent_id, parent_id, generation, created_at)
        VALUES (?, ?, ?, ?)
      `).run(
        this.config.identity.agentId,
        null, // Genesis agent has no parent
        1,
        Date.now()
      );
    }
  }

  /**
   * Store an agent turn
   */
  async storeTurn(turn: AgentTurn): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO agent_turns (
        id, timestamp, thought, action_tool, action_input, 
        action_output, action_error, observation, reflection,
        survival_tier, balance_usdc, balance_sol
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      turn.id,
      turn.timestamp.getTime(),
      turn.thought,
      turn.action?.tool || null,
      turn.action?.input ? JSON.stringify(turn.action.input) : null,
      turn.action?.output ? JSON.stringify(turn.action.output) : null,
      turn.action?.error || null,
      turn.observation,
      turn.reflection || null,
      null, // TODO: Add survival tier to turn
      null, // TODO: Add balance to turn
      null
    );
  }

  /**
   * Get recent turns
   */
  async getRecentTurns(limit: number = 10): Promise<AgentTurn[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_turns 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);

    const rows = stmt.all(limit);
    
    return rows.map((row: any) => ({
      id: row.id,
      timestamp: new Date(row.timestamp),
      thought: row.thought,
      action: row.action_tool ? {
        tool: row.action_tool,
        input: row.action_input ? JSON.parse(row.action_input) : undefined,
        output: row.action_output ? JSON.parse(row.action_output) : undefined,
        error: row.action_error || undefined
      } : undefined,
      observation: row.observation || '',
      reflection: row.reflection || undefined
    }));
  }

  /**
   * Get first turn (for calculating survival days)
   */
  async getFirstTurn(): Promise<AgentTurn | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_turns 
      ORDER BY timestamp ASC 
      LIMIT 1
    `);

    const row = stmt.get() as AgentTurnRow | undefined;
    if (!row) return null;

    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      thought: row.thought,
      action: row.action_tool ? {
        tool: row.action_tool,
        input: row.action_input ? JSON.parse(row.action_input) : undefined,
        output: row.action_output ? JSON.parse(row.action_output) : undefined,
        error: row.action_error || undefined
      } : undefined,
      observation: row.observation || '',
      reflection: row.reflection || undefined
    };
  }

  /**
   * Store a general state entry
   */
  async storeState(id: string, type: string, data: any): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO state_entries (id, timestamp, type, data)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, Date.now(), type, JSON.stringify(data));
  }

  /**
   * Get state entry
   */
  async getState(id: string): Promise<any> {
    const stmt = this.db.prepare('SELECT * FROM state_entries WHERE id = ?');
    const row = stmt.get(id) as StateEntryRow | undefined;
    
    return row ? JSON.parse(row.data) : null;
  }

  /**
   * Store a metric
   */
  async storeMetric(name: string, value: number, metadata?: any): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO metrics (timestamp, metric_name, metric_value, metadata)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(Date.now(), name, value, metadata ? JSON.stringify(metadata) : null);
  }

  /**
   * Get metrics over time
   */
  async getMetrics(
    name: string, 
    since?: Date, 
    limit: number = 100
  ): Promise<Array<{ timestamp: Date; value: number; metadata?: any }>> {
    const sinceTimestamp = since ? since.getTime() : 0;
    
    const stmt = this.db.prepare(`
      SELECT timestamp, metric_value, metadata FROM metrics
      WHERE metric_name = ? AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(name, sinceTimestamp, limit);
    
    return rows.map((row: any) => ({
      timestamp: new Date(row.timestamp),
      value: row.metric_value,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  /**
   * Get aggregated statistics
   */
  async getStats(since?: Date): Promise<any> {
    const sinceTimestamp = since ? since.getTime() : 0;

    // Turn statistics
    const turnStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_turns,
        COUNT(CASE WHEN action_error IS NULL THEN 1 END) as successful_turns,
        COUNT(action_tool) as turns_with_action
      FROM agent_turns
      WHERE timestamp >= ?
    `).get(sinceTimestamp);

    // Action statistics
    const actionStats = this.db.prepare(`
      SELECT 
        action_tool as tool,
        COUNT(*) as count,
        COUNT(CASE WHEN action_error IS NULL THEN 1 END) as successes
      FROM agent_turns
      WHERE timestamp >= ? AND action_tool IS NOT NULL
      GROUP BY action_tool
    `).all(sinceTimestamp);

    // Recent metrics
    const recentMetrics = this.db.prepare(`
      SELECT DISTINCT metric_name FROM metrics
      WHERE timestamp >= ?
    `).all(sinceTimestamp);

    return {
      turns: turnStats,
      actions: actionStats,
      metrics: recentMetrics,
      period: {
        since: since || new Date(0),
        until: new Date()
      }
    };
  }

  /**
   * Clean old data
   */
  async cleanup(olderThanDays: number = 30): Promise<void> {
    const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    
    const deletedTurns = this.db.prepare('DELETE FROM agent_turns WHERE timestamp < ?').run(cutoff);
    const deletedStates = this.db.prepare('DELETE FROM state_entries WHERE timestamp < ?').run(cutoff);
    const deletedMetrics = this.db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(cutoff);

    console.log(`Cleaned up ${deletedTurns.changes} turns, ${deletedStates.changes} states, ${deletedMetrics.changes} metrics`);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get database info
   */
  getInfo(): any {
    const info = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM agent_turns) as total_turns,
        (SELECT COUNT(*) FROM state_entries) as total_states,
        (SELECT COUNT(*) FROM metrics) as total_metrics
    `).get();

    return {
      ...(info as any),
      dbPath: this.db.name,
      agentId: this.config.identity.agentId
    };
  }
}