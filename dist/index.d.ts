#!/usr/bin/env node
/**
 * Represents an entity in the knowledge graph.
 * An entity can be a business concept, feature, code component, or any other knowledge unit.
 */
interface Entity {
    name: string;
    entityType: string;
    observations: string[];
    /** The loglass subdomain this knowledge belongs to. Optional for knowledge spanning multiple domains. */
    subdomain?: string;
}
/**
 * Represents a relation between two entities in the knowledge graph.
 * Relations should be expressed in active voice (e.g., "implements", "depends_on").
 */
interface Relation {
    from: string;
    to: string;
    relationType: string;
}
/**
 * Represents the complete knowledge graph structure containing entities and their relations.
 */
interface KnowledgeGraph {
    entities: Entity[];
    relations: Relation[];
}
export declare class KnowledgeGraphManager {
    private memoryFilePath;
    constructor();
    private loadGraph;
    private saveGraph;
    createEntities(entities: Entity[]): Promise<Entity[]>;
    createRelations(relations: Relation[]): Promise<Relation[]>;
    addObservations(observations: {
        entityName: string;
        contents: string[];
    }[]): Promise<{
        entityName: string;
        addedObservations: string[];
    }[]>;
    deleteEntities(entityNames: string[]): Promise<void>;
    deleteObservations(deletions: {
        entityName: string;
        observations: string[];
    }[]): Promise<void>;
    deleteRelations(relations: Relation[]): Promise<void>;
    readGraph(): Promise<KnowledgeGraph>;
    /**
     * Search for nodes in the knowledge graph based on one or more keywords. The search covers entity names, types, subdomains, and observation content. Multiple keywords are treated as OR conditions, where any keyword must match somewhere in the entity's fields.
     * @param query The search query string
     */
    searchNodes(query: string): Promise<KnowledgeGraph>;
    /**
     * Open specific nodes in the knowledge graph by their names. Returns the complete node information including subdomain and all metadata.
     * @param names Array of entity names to retrieve
     */
    openNodes(names: string[]): Promise<KnowledgeGraph>;
}
export {};
