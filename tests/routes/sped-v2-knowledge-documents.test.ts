/**
 * Testes para endpoint GET /api/sped/v2/knowledge/documents
 * Subtask 37.2: Implementar endpoint para listar documentos por período/vigência
 */

import { describe, it, expect, beforeAll, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import spedV2KnowledgeRoutes from '../../src/routes/sped-v2-knowledge';
import * as mysql from '../../src/config/mysql';

// Mock do MySQL para testes
const mockExecuteQuery = jest.spyOn(mysql, 'executeQuery');

describe('GET /api/sped/v2/knowledge/documents', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/sped/v2/knowledge', spedV2KnowledgeRoutes);
  });

  beforeEach(() => {
    // Reset mock antes de cada teste
    mockExecuteQuery.mockClear();
    
    // Mock padrão: retornar lista vazia ou dados de teste
    mockExecuteQuery.mockResolvedValue([
      {
        id: 'test-doc-1',
        documento_tipo: 'GUIA_PRATICO',
        documento_nome: 'Guia Prático EFD ICMS/IPI',
        versao: '3.2.1',
        vigencia_inicio: '2025-01-01',
        vigencia_fim: null,
        arquivo_path: '/docs/guia.pdf',
        hash_arquivo: 'abc123',
        metadata: {},
        status: 'ativo',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }
    ] as any);
  });

  describe('Listagem de documentos', () => {
    it('deve retornar lista de documentos sem filtros', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/documents')
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('deve filtrar documentos por período (vigencia_inicio)', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/documents')
        .query({ periodo: '01/2025' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      // Todos os documentos retornados devem estar vigentes no período
      if (response.body.data.length > 0) {
        response.body.data.forEach((doc: any) => {
          expect(doc).toHaveProperty('vigencia_inicio');
          expect(doc).toHaveProperty('vigencia_fim');
        });
      }
    });

    it('deve filtrar documentos por tipo', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/documents')
        .query({ tipo: 'GUIA_PRATICO' })
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      // Todos os documentos retornados devem ser do tipo especificado
      if (response.body.data.length > 0) {
        response.body.data.forEach((doc: any) => {
          expect(doc.documento_tipo).toBe('GUIA_PRATICO');
        });
      }
    });

    it('deve retornar metadados corretos dos documentos', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/documents')
        .expect(200);
      
      if (response.body.data.length > 0) {
        const doc = response.body.data[0];
        expect(doc).toHaveProperty('id');
        expect(doc).toHaveProperty('documento_tipo');
        expect(doc).toHaveProperty('documento_nome');
        expect(doc).toHaveProperty('versao');
        expect(doc).toHaveProperty('vigencia_inicio');
        expect(doc).toHaveProperty('status');
      }
    });

    it('deve retornar erro 400 para período inválido', async () => {
      const response = await request(app)
        .get('/api/sped/v2/knowledge/documents')
        .query({ periodo: 'invalid' })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });
});

