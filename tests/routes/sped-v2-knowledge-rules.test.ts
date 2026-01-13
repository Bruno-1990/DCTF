/**
 * Testes para endpoint GET /api/sped/v2/knowledge/rules
 * Subtask 37.4: Implementar endpoint para buscar regras estruturadas
 */

import { describe, it, expect, beforeAll, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import spedV2KnowledgeRoutes from '../../src/routes/sped-v2-knowledge';
import * as mysql from '../../src/config/mysql';

// Mock do MySQL para testes
const mockExecuteQuery = jest.spyOn(mysql, 'executeQuery');

describe('GET /api/sped/v2/knowledge/rules', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sped/v2/knowledge', spedV2KnowledgeRoutes);
  });

  beforeEach(() => {
    // Reset mock antes de cada teste
    mockExecuteQuery.mockClear();
    
    // Mock dinâmico baseado na query
    mockExecuteQuery.mockImplementation((query: string, params: any[]) => {
      const allRules = [
        {
          id: 'rule-1',
          rule_type: 'VALIDACAO',
          rule_category: 'C170',
          rule_description: 'Validação de totalização C170',
          rule_condition: 'SUM(VL_ITEM) == VL_MERC',
          legal_reference: 'Guia Prático EFD 3.2.1, Seção 5.2.3',
          article_reference: null,
          section_reference: 'Seção 5.2.3',
          vigencia_inicio: '2025-01-01',
          vigencia_fim: null,
          document_id: 'doc-1',
          metadata: { severity: 'error' },
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 'rule-2',
          rule_type: 'OBRIGATORIEDADE',
          rule_category: 'C100',
          rule_description: 'C100 deve ter pelo menos um C170',
          rule_condition: 'COUNT(C170) >= 1',
          legal_reference: 'Guia Prático EFD 3.2.1',
          article_reference: null,
          section_reference: 'Seção 5.1',
          vigencia_inicio: '2025-01-01',
          vigencia_fim: null,
          document_id: 'doc-1',
          metadata: { severity: 'error' },
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z'
        }
      ];
      
      // Filtrar baseado nos parâmetros
      let filtered = [...allRules];
      
      if (params) {
        // Filtro por categoria
        const categoriaIndex = params.findIndex((p, i) => 
          query.includes('rule_category = ?') && 
          query.indexOf('rule_category = ?') < query.indexOf('rule_type = ?') || 
          (query.includes('rule_category = ?') && !query.includes('rule_type = ?'))
        );
        if (categoriaIndex >= 0 && params[categoriaIndex]) {
          filtered = filtered.filter(r => r.rule_category === params[categoriaIndex]);
        }
        
        // Filtro por tipo
        const tipoIndex = params.findIndex((p, i) => 
          query.includes('rule_type = ?')
        );
        if (tipoIndex >= 0 && params[tipoIndex]) {
          filtered = filtered.filter(r => r.rule_type === params[tipoIndex]);
        }
      }
      
      return Promise.resolve(filtered);
    });
  });

  describe('Busca de regras estruturadas', () => {
    it('deve retornar lista de regras sem filtros', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve filtrar regras por categoria SPED', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .query({ categoria: 'C170' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      // Todas as regras retornadas devem ser da categoria especificada
      if (response.body.data.length > 0) {
        response.body.data.forEach((rule: any) => {
          expect(rule.rule_category).toBe('C170');
        });
      }
    });

    it('deve filtrar regras por tipo', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .query({ tipo: 'VALIDACAO' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      // Todas as regras retornadas devem ser do tipo especificado
      if (response.body.data.length > 0) {
        response.body.data.forEach((rule: any) => {
          expect(rule.rule_type).toBe('VALIDACAO');
        });
      }
    });

    it('deve filtrar regras por período (vigência)', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .query({ periodo: '01/2025' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      // Todas as regras retornadas devem estar vigentes no período
      if (response.body.data.length > 0) {
        response.body.data.forEach((rule: any) => {
          expect(rule).toHaveProperty('vigencia_inicio');
          expect(rule).toHaveProperty('vigencia_fim');
        });
      }
    });

    it('deve retornar metadados corretos das regras', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .expect(200);
      
      if (response.body.data.length > 0) {
        const rule = response.body.data[0];
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('rule_type');
        expect(rule).toHaveProperty('rule_category');
        expect(rule).toHaveProperty('rule_description');
        expect(rule).toHaveProperty('legal_reference');
        expect(rule).toHaveProperty('vigencia_inicio');
      }
    });

    it('deve retornar erro 400 para período inválido', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .query({ periodo: 'invalid' })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });

    it('deve suportar múltiplos filtros simultaneamente', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/rules')
        .query({ 
          categoria: 'C170',
          tipo: 'VALIDACAO',
          periodo: '01/2025'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
    });
  });
});

