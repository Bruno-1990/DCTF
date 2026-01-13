/**
 * Testes de integração para rotas SPED v2.0 Knowledge
 * Subtask 37.6: Verificar integração no app principal
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('SPED v2.0 Knowledge API - Integração', () => {
  describe('Rotas registradas no servidor', () => {
    it('deve ter arquivo de rotas src/routes/sped-v2-knowledge.ts', () => {
      const routesPath = path.join(__dirname, '../../src/routes/sped-v2-knowledge.ts');
      expect(fs.existsSync(routesPath)).toBe(true);
    });

    it('deve ter rotas importadas no server.ts', () => {
      const serverPath = path.join(__dirname, '../../src/server.ts');
      const serverContent = fs.readFileSync(serverPath, 'utf-8');
      
      expect(serverContent).toContain('sped-v2-knowledge');
      expect(serverContent).toContain('/api/sped/v2/knowledge');
    });

    it('deve ter controller SpedV2KnowledgeController.ts', () => {
      const controllerPath = path.join(__dirname, '../../src/controllers/SpedV2KnowledgeController.ts');
      expect(fs.existsSync(controllerPath)).toBe(true);
    });

    it('deve ter service SpedV2KnowledgeService.ts', () => {
      const servicePath = path.join(__dirname, '../../src/services/SpedV2KnowledgeService.ts');
      expect(fs.existsSync(servicePath)).toBe(true);
    });
  });

  describe('Scripts Python', () => {
    it('deve ter script query_rag.py', () => {
      const scriptPath = path.join(__dirname, '../../python/sped/v2/knowledge/query_rag.py');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it('deve ter script generate_rule.py', () => {
      const scriptPath = path.join(__dirname, '../../python/sped/v2/knowledge/generate_rule.py');
      expect(fs.existsSync(scriptPath)).toBe(true);
    });
  });
});

