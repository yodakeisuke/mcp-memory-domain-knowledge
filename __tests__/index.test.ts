import { promises as fs } from 'fs';
import path from 'path';
import { KnowledgeGraphManager } from '../index.js';

// Setup test environment
const TEST_MEMORY_FILE = path.join(process.cwd(), 'test-memory.json');
process.env.MEMORY_FILE_PATH = TEST_MEMORY_FILE;

describe('KnowledgeGraphManager', () => {
  let manager: KnowledgeGraphManager;

  beforeEach(async () => {
    // Clean up test file before each test
    try {
      await fs.unlink(TEST_MEMORY_FILE);
    } catch (error) {
      // Ignore if file doesn't exist
    }
    manager = new KnowledgeGraphManager();
  });

  afterAll(async () => {
    // Clean up test file after all tests
    try {
      await fs.unlink(TEST_MEMORY_FILE);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('Entity Operations', () => {
    it('should create and retrieve entities with subdomain', async () => {
      const entities = [
        {
          name: 'TestEntity1',
          entityType: 'TEST',
          subdomain: 'comparison_analysis',
          observations: ['Test observation 1']
        },
        {
          name: 'TestEntity2',
          entityType: 'TEST',
          subdomain: 'budget_management',
          observations: ['Test observation 2']
        }
      ];

      // Create entities
      const created = await manager.createEntities(entities);
      expect(created).toHaveLength(2);

      // Read graph
      const graph = await manager.readGraph();
      expect(graph.entities).toHaveLength(2);
      expect(graph.entities[0].subdomain).toBe('comparison_analysis');
      expect(graph.entities[1].subdomain).toBe('budget_management');
    });

    it('should search entities by subdomain', async () => {
      // Create test entities
      const entities = [
        {
          name: 'ComparisonComponent',
          entityType: 'COMPONENT',
          subdomain: 'comparison_analysis',
          observations: ['Comparison component']
        },
        {
          name: 'BudgetComponent',
          entityType: 'COMPONENT',
          subdomain: 'budget_management',
          observations: ['Budget component']
        }
      ];
      await manager.createEntities(entities);

      // Search by subdomain
      const result = await manager.searchNodes('comparison_analysis');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('ComparisonComponent');
    });

    it('should handle entities without subdomain', async () => {
      const entity = {
        name: 'GlobalEntity',
        entityType: 'GLOBAL',
        observations: ['Global entity']
      };

      await manager.createEntities([entity]);
      const graph = await manager.readGraph();
      expect(graph.entities[0].subdomain).toBeUndefined();
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      // Setup test data
      const entities = [
        {
          name: 'ComparisonV3Coordinator',
          entityType: 'CODE_COMPONENT',
          subdomain: 'comparison_analysis',
          observations: ['Core comparison component']
        },
        {
          name: 'BudgetCalculator',
          entityType: 'CODE_COMPONENT',
          subdomain: 'budget_management',
          observations: ['Budget calculation component']
        },
        {
          name: 'SharedUtil',
          entityType: 'UTILITY',
          observations: ['Shared utility component']
        },
        {
          name: 'BudgetUtility',
          entityType: 'UTILITY',
          subdomain: 'budget_management',
          observations: ['Budget utility functions', 'Handles common budget operations']
        }
      ];
      await manager.createEntities(entities);
    });

    it('should search by name', async () => {
      const result = await manager.searchNodes('Comparison');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('ComparisonV3Coordinator');
    });

    it('should search by subdomain', async () => {
      const result = await manager.searchNodes('budget_management');
      expect(result.entities).toHaveLength(2);  // Both entities in budget_management subdomain
      const names = result.entities.map(e => e.name);
      expect(names).toContain('BudgetCalculator');
      expect(names).toContain('BudgetUtility');
    });

    it('should search by observation', async () => {
      const result = await manager.searchNodes('calculation');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('BudgetCalculator');
    });

    it('should handle case-insensitive search', async () => {
      const result = await manager.searchNodes('COMPARISON');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('ComparisonV3Coordinator');
    });

    describe('Multiple Keyword Search', () => {
      it('should search with multiple keywords (OR condition)', async () => {
        const result = await manager.searchNodes('budget management');
        expect(result.entities).toHaveLength(2);
        expect(result.entities.map(e => e.name)).toContain('BudgetCalculator');
        expect(result.entities.map(e => e.name)).toContain('BudgetUtility');
      });

      it('should match partial words in multiple keyword search', async () => {
        const result = await manager.searchNodes('comp util');
        expect(result.entities).toHaveLength(4);  // Matches both 'comp' and 'util' in names, types, and observations
        const names = result.entities.map(e => e.name);
        expect(names).toContain('ComparisonV3Coordinator');  // Contains 'comp' in name
        expect(names).toContain('BudgetCalculator');        // Contains 'comp' in observation
        expect(names).toContain('SharedUtil');              // Contains 'util' in name and type
        expect(names).toContain('BudgetUtility');           // Contains 'util' in name and type
      });

      it('should match keywords across different fields', async () => {
        const result = await manager.searchNodes('budget utility');
        expect(result.entities).toHaveLength(3);  // BudgetCalculator, SharedUtil, BudgetUtility
        const names = result.entities.map(e => e.name);
        expect(names).toContain('BudgetCalculator');
        expect(names).toContain('SharedUtil');
        expect(names).toContain('BudgetUtility');
      });

      it('should handle empty or whitespace-only queries', async () => {
        const result = await manager.searchNodes('   ');
        expect(result.entities).toHaveLength(0);
      });

      it('should handle special characters in search', async () => {
        const result = await manager.searchNodes('budget & utility');
        expect(result.entities).toHaveLength(3);  // BudgetCalculator, SharedUtil, BudgetUtility
        const names = result.entities.map(e => e.name);
        expect(names).toContain('BudgetCalculator');
        expect(names).toContain('SharedUtil');
        expect(names).toContain('BudgetUtility');
      });
    });
  });
}); 