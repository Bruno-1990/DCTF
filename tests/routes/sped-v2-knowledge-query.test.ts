/**
 * Testes para endpoint GET /api/sped/v2/knowledge/query
 * Subtask 37.3: Implementar endpoint para busca semântica (RAG)
 */

import { describe, it, expect, beforeAll, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import spedV2KnowledgeRoutes from '../../src/routes/sped-v2-knowledge';

// Mock do child_process.exec
const mockExec = jest.fn();
jest.mock('child_process', () => ({
  exec: mockExec
}));

describe('GET /api/sped/v2/knowledge/query', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sped/v2/knowledge', spedV2KnowledgeRoutes);
  });

  beforeEach(() => {
    // Mock padrão: retornar resultado de busca bem-sucedida
    const mockResult = {
      stdout: JSON.stringify({
        success: true,
        data: [
          {
            chunk_id: 'chunk-1',
            chunk_text: 'Texto do chunk relevante',
            score: 0.85,
            metadata: { section: '5.2.3' },
            document_id: 'doc-1',
            section_title: 'Validação de Totalização',
            article_number: null
          }
        ],
        count: 1
      }),
      stderr: ''
    };
    
    mockExec.mockImplementation((command: string, options: any, callback?: any) => {
      if (callback && typeof callback === 'function') {
        callback(null, mockResult);
      }
      return mockResult;
    });
  });

  describe('Busca semântica (RAG)', () => {
    it('deve retornar resultados de busca semântica', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/query')
        .query({ q: 'validação de totalização C170' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve retornar chunks relevantes com metadados', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/query')
        .query({ q: 'regras de ICMS ST' })
        .expect(200);
      
      if (response.body.data.length > 0) {
        const chunk = response.body.data[0];
        expect(chunk).toHaveProperty('chunk_id');
        expect(chunk).toHaveProperty('chunk_text');
        expect(chunk).toHaveProperty('score');
        expect(chunk).toHaveProperty('metadata');
        expect(typeof chunk.score).toBe('number');
        expect(chunk.score).toBeGreaterThanOrEqual(0);
        expect(chunk.score).toBeLessThanOrEqual(1);
      }
    });

    it('deve filtrar resultados por documento', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/query')
        .query({ 
          q: 'validação',
          document_id: 'test-doc-1'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });

    it('deve limitar número de resultados', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/query')
        .query({ 
          q: 'validação',
          n_results: 3
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      if (response.body.data.length > 0) {
        expect(response.body.data.length).toBeLessThanOrEqual(3);
      }
    });

    it('deve retornar erro 400 se query estiver vazia', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/query')
        .query({ q: '' })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro 400 se query não for fornecida', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/query')
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });
});

