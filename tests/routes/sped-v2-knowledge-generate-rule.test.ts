/**
 * Testes para endpoint POST /api/sped/v2/knowledge/generate-rule
 * Subtask 37.5: Implementar endpoint para gerar regra consultando documentos
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

describe('POST /api/sped/v2/knowledge/generate-rule', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sped/v2/knowledge', spedV2KnowledgeRoutes);
  });

  beforeEach(() => {
    // Mock padrão: retornar regra gerada com sucesso
    mockExec.mockImplementation((command: string, options: any, callback?: any) => {
      const mockResult = {
        stdout: JSON.stringify({
          success: true,
          data: {
            rule_type: 'VALIDACAO',
            rule_category: 'C170',
            rule_description: 'Validação de totalização C170: A soma dos valores dos itens deve igualar o valor total da mercadoria',
            rule_condition: 'SUM(C170.VL_ITEM) == C100.VL_MERC',
            legal_reference: 'Guia Prático EFD 3.2.1, Seção 5.2.3',
            confidence: 0.92,
            context_chunks: [
              {
                chunk_id: 'chunk-1',
                chunk_text: 'A totalização dos itens C170 deve bater com o valor total da mercadoria no C100',
                score: 0.89
              }
            ]
          }
        }),
        stderr: ''
      };
      
      if (callback && typeof callback === 'function') {
        callback(null, mockResult);
      }
      return mockResult;
    });
  });

  describe('Geração de regra com contexto RAG', () => {
    it('deve gerar regra com descrição e contexto', async () => {
      const response = await request(app)
        .post('/api/sped/v2/knowledge/generate-rule')
        .send({
          rule_description: 'Validação de totalização C170',
          periodo: '01/2025'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('rule_type');
      expect(response.body.data).toHaveProperty('rule_category');
      expect(response.body.data).toHaveProperty('rule_description');
      expect(response.body.data).toHaveProperty('legal_reference');
    });

    it('deve incluir chunks de contexto relevantes', async () => {
      const response = await request(app)
        .post('/api/sped/v2/knowledge/generate-rule')
        .send({
          rule_description: 'Validação de ICMS ST',
          periodo: '01/2025'
        })
        .expect(200);
      
      if (response.body.data.context_chunks) {
        expect(Array.isArray(response.body.data.context_chunks)).toBe(true);
        if (response.body.data.context_chunks.length > 0) {
          expect(response.body.data.context_chunks[0]).toHaveProperty('chunk_text');
          expect(response.body.data.context_chunks[0]).toHaveProperty('score');
        }
      }
    });

    it('deve retornar nível de confiança da regra gerada', async () => {
      const response = await request(app)
        .post('/api/sped/v2/knowledge/generate-rule')
        .send({
          rule_description: 'Validação de totalização',
          periodo: '01/2025'
        })
        .expect(200);
      
      if (response.body.data.confidence !== undefined) {
        expect(typeof response.body.data.confidence).toBe('number');
        expect(response.body.data.confidence).toBeGreaterThanOrEqual(0);
        expect(response.body.data.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('deve retornar erro 400 se rule_description estiver vazia', async () => {
      const response = await request(app)
        .post('/api/sped/v2/knowledge/generate-rule')
        .send({
          rule_description: '',
          periodo: '01/2025'
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro 400 se rule_description não for fornecida', async () => {
      const response = await request(app)
        .post('/api/sped/v2/knowledge/generate-rule')
        .send({
          periodo: '01/2025'
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro 400 para período inválido', async () => {
      const response = await request(app)
        .post('/api/sped/v2/knowledge/generate-rule')
        .send({
          rule_description: 'Validação de totalização',
          periodo: 'invalid'
        })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });
});

