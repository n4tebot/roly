import { RolyConfig } from '../config.js';
import { AgentTurn } from '../agent/loop.js';
export interface StateEntry {
    id: string;
    timestamp: Date;
    type: 'turn' | 'event' | 'metric';
    data: any;
}
export declare class StateDatabase {
    private db;
    private config;
    constructor(config: RolyConfig);
    /**
     * Initialize database schema
     */
    initialize(): Promise<void>;
    /**
     * Store an agent turn
     */
    storeTurn(turn: AgentTurn): Promise<void>;
    /**
     * Get recent turns
     */
    getRecentTurns(limit?: number): Promise<AgentTurn[]>;
    /**
     * Get first turn (for calculating survival days)
     */
    getFirstTurn(): Promise<AgentTurn | null>;
    /**
     * Store a general state entry
     */
    storeState(id: string, type: string, data: any): Promise<void>;
    /**
     * Get state entry
     */
    getState(id: string): Promise<any>;
    /**
     * Store a metric
     */
    storeMetric(name: string, value: number, metadata?: any): Promise<void>;
    /**
     * Get metrics over time
     */
    getMetrics(name: string, since?: Date, limit?: number): Promise<Array<{
        timestamp: Date;
        value: number;
        metadata?: any;
    }>>;
    /**
     * Get aggregated statistics
     */
    getStats(since?: Date): Promise<any>;
    /**
     * Clean old data
     */
    cleanup(olderThanDays?: number): Promise<void>;
    /**
     * Close database connection
     */
    close(): void;
    /**
     * Get database info
     */
    getInfo(): any;
}
