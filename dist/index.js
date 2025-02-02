#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Default memory file path
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');
// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
    ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
        ? process.env.MEMORY_FILE_PATH
        : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH)
    : defaultMemoryPath;
// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
export class KnowledgeGraphManager {
    memoryFilePath;
    constructor() {
        this.memoryFilePath = MEMORY_FILE_PATH;
    }
    async loadGraph() {
        try {
            // Check if file exists first
            try {
                await fs.access(this.memoryFilePath);
            }
            catch (error) {
                console.error(`[Debug] File does not exist, creating empty file`);
                await fs.writeFile(this.memoryFilePath, '', 'utf-8');
                return { entities: [], relations: [] };
            }
            const data = await fs.readFile(this.memoryFilePath, "utf-8");
            console.error(`[Debug] Loading graph from: ${this.memoryFilePath}`);
            console.error(`[Debug] File contents: ${data}`);
            const lines = data.split("\n").filter(line => line.trim() !== "");
            console.error(`[Debug] Found ${lines.length} lines in the file`);
            const graph = { entities: [], relations: [] };
            for (const line of lines) {
                try {
                    console.error(`[Debug] Processing line: ${line}`);
                    const item = JSON.parse(line);
                    if (item.type === "entity") {
                        const entity = {
                            name: item.name,
                            entityType: item.entityType,
                            observations: item.observations,
                            subdomain: item.subdomain
                        };
                        console.error(`[Debug] Adding entity: ${JSON.stringify(entity, null, 2)}`);
                        graph.entities.push(entity);
                    }
                    else if (item.type === "relation") {
                        const { type, ...relation } = item;
                        graph.relations.push(relation);
                    }
                }
                catch (parseError) {
                    console.error(`[Debug] Error parsing line: ${parseError}`);
                    continue;
                }
            }
            console.error(`[Debug] Loaded ${graph.entities.length} entities and ${graph.relations.length} relations`);
            return graph;
        }
        catch (error) {
            console.error(`[Debug] Error loading graph:`, error);
            throw error;
        }
    }
    async saveGraph(graph) {
        console.error(`[Debug] Saving graph with ${graph.entities.length} entities`);
        const lines = [
            ...graph.entities.map(e => {
                const entityWithType = {
                    type: "entity",
                    name: e.name,
                    entityType: e.entityType,
                    observations: e.observations,
                    subdomain: e.subdomain
                };
                console.error(`[Debug] Saving entity: ${JSON.stringify(entityWithType, null, 2)}`);
                return JSON.stringify(entityWithType);
            }),
            ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
        ];
        await fs.writeFile(this.memoryFilePath, lines.join("\n") + "\n");
        console.error(`[Debug] Graph saved successfully`);
    }
    async createEntities(entities) {
        console.error(`[Debug] Creating entities:`, entities);
        const graph = await this.loadGraph();
        console.error(`[Debug] Current graph:`, graph);
        const newEntities = entities.filter(e => !graph.entities.some(existingEntity => existingEntity.name === e.name));
        console.error(`[Debug] New entities to add:`, newEntities);
        if (newEntities.length > 0) {
            graph.entities.push(...newEntities.map(e => ({
                name: e.name,
                entityType: e.entityType,
                observations: e.observations,
                subdomain: e.subdomain
            })));
            await this.saveGraph(graph);
        }
        console.error(`[Debug] Final graph:`, graph);
        return newEntities;
    }
    async createRelations(relations) {
        const graph = await this.loadGraph();
        const newRelations = relations.filter(r => !graph.relations.some(existingRelation => existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType));
        graph.relations.push(...newRelations);
        await this.saveGraph(graph);
        return newRelations;
    }
    async addObservations(observations) {
        const graph = await this.loadGraph();
        const results = observations.map(o => {
            const entity = graph.entities.find(e => e.name === o.entityName);
            if (!entity) {
                throw new Error(`Entity with name ${o.entityName} not found`);
            }
            const newObservations = o.contents.filter(content => !entity.observations.includes(content));
            entity.observations.push(...newObservations);
            return { entityName: o.entityName, addedObservations: newObservations };
        });
        await this.saveGraph(graph);
        return results;
    }
    async deleteEntities(entityNames) {
        const graph = await this.loadGraph();
        graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
        graph.relations = graph.relations.filter(r => !entityNames.includes(r.from) && !entityNames.includes(r.to));
        await this.saveGraph(graph);
    }
    async deleteObservations(deletions) {
        const graph = await this.loadGraph();
        deletions.forEach(d => {
            const entity = graph.entities.find(e => e.name === d.entityName);
            if (entity) {
                entity.observations = entity.observations.filter(o => !d.observations.includes(o));
            }
        });
        await this.saveGraph(graph);
    }
    async deleteRelations(relations) {
        const graph = await this.loadGraph();
        graph.relations = graph.relations.filter(r => !relations.some(delRelation => r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType));
        await this.saveGraph(graph);
    }
    async readGraph() {
        return this.loadGraph();
    }
    /**
     * Search for nodes in the knowledge graph based on one or more keywords. The search covers entity names, types, subdomains, and observation content. Multiple keywords are treated as OR conditions, where any keyword must match somewhere in the entity's fields.
     * @param query The search query string
     */
    async searchNodes(query) {
        const graph = await this.loadGraph();
        // Normalize query by converting to lowercase first
        const normalizedQuery = query.toLowerCase();
        console.error(`[Debug] Original query: "${query}"`);
        console.error(`[Debug] Normalized query: "${normalizedQuery}"`);
        // Split into keywords and filter out empty strings
        const keywords = normalizedQuery
            .split(/[\s,&+]+/) // Split on whitespace and common separators
            .filter(k => k.length > 0);
        if (keywords.length === 0) {
            console.error(`[Debug] No valid keywords found in query: "${query}"`);
            return { entities: [], relations: [] };
        }
        console.error(`[Debug] Keywords (${keywords.length}): ${JSON.stringify(keywords)}`);
        console.error(`[Debug] Total entities before filter: ${graph.entities.length}`);
        const filteredEntities = graph.entities.filter(e => {
            // Prepare searchable fields
            const searchableFields = {
                name: e.name.toLowerCase(),
                type: e.entityType.toLowerCase(),
                subdomain: e.subdomain?.toLowerCase() || '',
                observations: e.observations.map(o => o.toLowerCase())
            };
            console.error(`[Debug] Checking entity: ${e.name}`);
            console.error(`[Debug] Searchable fields:`, searchableFields);
            // Check each keyword against all fields (OR condition)
            const keywordMatches = keywords.map(keyword => {
                const nameMatch = searchableFields.name.includes(keyword);
                const typeMatch = searchableFields.type.includes(keyword);
                const subdomainMatch = searchableFields.subdomain.includes(keyword);
                const observationMatch = searchableFields.observations.some(o => o.includes(keyword));
                const matches = {
                    keyword,
                    nameMatch,
                    typeMatch,
                    subdomainMatch,
                    observationMatch,
                    anyMatch: nameMatch || typeMatch || subdomainMatch || observationMatch
                };
                if (matches.anyMatch) {
                    console.error(`[Debug] Keyword "${keyword}" matched:`, {
                        name: nameMatch ? searchableFields.name : false,
                        type: typeMatch ? searchableFields.type : false,
                        subdomain: subdomainMatch ? searchableFields.subdomain : false,
                        observations: observationMatch ? searchableFields.observations.filter(o => o.includes(keyword)) : false
                    });
                }
                else {
                    console.error(`[Debug] Keyword "${keyword}" did not match any fields`);
                }
                return matches.anyMatch;
            });
            // Entity matches if ANY keyword matches (OR condition)
            const hasMatch = keywordMatches.some(match => match);
            console.error(`[Debug] Entity "${e.name}" final result: ${hasMatch} (matched ${keywordMatches.filter(m => m).length}/${keywords.length} keywords)`);
            return hasMatch;
        });
        console.error(`[Debug] Total entities after filter: ${filteredEntities.length}`);
        if (filteredEntities.length > 0) {
            console.error(`[Debug] Matched entities:`, filteredEntities.map(e => ({
                name: e.name,
                type: e.entityType,
                subdomain: e.subdomain,
                observations: e.observations
            })));
        }
        else {
            console.error(`[Debug] No entities matched the search criteria`);
            console.error(`[Debug] Available entities:`, graph.entities.map(e => ({
                name: e.name,
                type: e.entityType,
                subdomain: e.subdomain,
                observations: e.observations
            })));
        }
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        return {
            entities: filteredEntities,
            relations: filteredRelations
        };
    }
    /**
     * Open specific nodes in the knowledge graph by their names. Returns the complete node information including subdomain and all metadata.
     * @param names Array of entity names to retrieve
     */
    async openNodes(names) {
        const graph = await this.loadGraph();
        const filteredEntities = graph.entities.filter(e => names.includes(e.name));
        const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
        const filteredRelations = graph.relations.filter(r => filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to));
        return {
            entities: filteredEntities,
            relations: filteredRelations,
        };
    }
}
const knowledgeGraphManager = new KnowledgeGraphManager();
// The server instance and tools exposed to Claude
const server = new Server({
    name: "memory-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "create_entities",
                description: "Create multiple new entities in the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        entities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "The name of the entity" },
                                    entityType: { type: "string", description: "The type of the entity" },
                                    subdomain: {
                                        type: "string",
                                        description: "The loglass subdomain this knowledge belongs to (e.g., 'allocation', 'report', 'accounts', 'plans', 'actual' etc.). Can be omitted if the knowledge spans multiple domains.",
                                    },
                                    observations: {
                                        type: "array",
                                        items: { type: "string" },
                                        description: "An array of observation contents associated with the entity"
                                    },
                                },
                                required: ["name", "entityType", "observations"],
                            },
                        },
                    },
                    required: ["entities"],
                },
            },
            {
                name: "create_relations",
                description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
                inputSchema: {
                    type: "object",
                    properties: {
                        relations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    from: { type: "string", description: "The name of the entity where the relation starts" },
                                    to: { type: "string", description: "The name of the entity where the relation ends" },
                                    relationType: { type: "string", description: "The type of the relation" },
                                },
                                required: ["from", "to", "relationType"],
                            },
                        },
                    },
                    required: ["relations"],
                },
            },
            {
                name: "add_observations",
                description: "Add new observations to existing entities in the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        observations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    entityName: { type: "string", description: "The name of the entity to add the observations to" },
                                    contents: {
                                        type: "array",
                                        items: { type: "string" },
                                        description: "An array of observation contents to add"
                                    },
                                },
                                required: ["entityName", "contents"],
                            },
                        },
                    },
                    required: ["observations"],
                },
            },
            {
                name: "delete_entities",
                description: "Delete multiple entities and their associated relations from the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        entityNames: {
                            type: "array",
                            items: { type: "string" },
                            description: "An array of entity names to delete"
                        },
                    },
                    required: ["entityNames"],
                },
            },
            {
                name: "delete_observations",
                description: "Delete specific observations from entities in the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        deletions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    entityName: { type: "string", description: "The name of the entity containing the observations" },
                                    observations: {
                                        type: "array",
                                        items: { type: "string" },
                                        description: "An array of observations to delete"
                                    },
                                },
                                required: ["entityName", "observations"],
                            },
                        },
                    },
                    required: ["deletions"],
                },
            },
            {
                name: "delete_relations",
                description: "Delete multiple relations from the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        relations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    from: { type: "string", description: "The name of the entity where the relation starts" },
                                    to: { type: "string", description: "The name of the entity where the relation ends" },
                                    relationType: { type: "string", description: "The type of the relation" },
                                },
                                required: ["from", "to", "relationType"],
                            },
                            description: "An array of relations to delete"
                        },
                    },
                    required: ["relations"],
                },
            },
            {
                name: "read_graph",
                description: "Read the entire knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "search_nodes",
                description: "Search for nodes in the knowledge graph based on one or more keywords. The search covers entity names, types, subdomains, and observation content. Multiple keywords are treated as OR conditions, where any keyword must match somewhere in the entity's fields.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Space-separated keywords to match against entity fields. Any keyword must match (OR condition). Example: 'budget management' will find entities where either 'budget' or 'management' appears in any field."
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "open_nodes",
                description: "Open specific nodes in the knowledge graph by their names. Returns the complete node information including subdomain and all metadata.",
                inputSchema: {
                    type: "object",
                    properties: {
                        names: {
                            type: "array",
                            items: { type: "string" },
                            description: "An array of entity names to retrieve, returning full entity information including subdomain",
                        },
                    },
                    required: ["names"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!args) {
        throw new Error(`No arguments provided for tool: ${name}`);
    }
    const createResponse = (text) => ({
        content: [{ type: "text", text }]
    });
    switch (name) {
        case "create_entities":
            return createResponse(JSON.stringify(await knowledgeGraphManager.createEntities(args.entities), null, 2));
        case "create_relations":
            return createResponse(JSON.stringify(await knowledgeGraphManager.createRelations(args.relations), null, 2));
        case "add_observations":
            return createResponse(JSON.stringify(await knowledgeGraphManager.addObservations(args.observations), null, 2));
        case "delete_entities":
            await knowledgeGraphManager.deleteEntities(args.entityNames);
            return createResponse("Entities deleted successfully");
        case "delete_observations":
            await knowledgeGraphManager.deleteObservations(args.deletions);
            return createResponse("Observations deleted successfully");
        case "delete_relations":
            await knowledgeGraphManager.deleteRelations(args.relations);
            return createResponse("Relations deleted successfully");
        case "read_graph":
            return createResponse(JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2));
        case "search_nodes":
            return createResponse(JSON.stringify(await knowledgeGraphManager.searchNodes(args.query), null, 2));
        case "open_nodes":
            return createResponse(JSON.stringify(await knowledgeGraphManager.openNodes(args.names), null, 2));
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Knowledge Graph MCP Server running on stdio");
}
// Only run main() if not in test environment
if (process.env.NODE_ENV !== 'test') {
    main().catch((error) => {
        console.error("Fatal error in main():", error);
        process.exit(1);
    });
}
