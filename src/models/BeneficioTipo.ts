/**
 * Modelo BeneficioTipo - Tabela mestra de tipos de benefício fiscal.
 *
 * Catálogo/domínio dos tipos (ex.: SUBSTITUTO, FUNDAP, COMPETE), distinto da
 * coluna string clientes.beneficios_fiscais. Nomes sempre em MAIÚSCULO e únicos.
 */

import { executeQuery } from '../config/mysql';

const TABLE_NAME = 'beneficios';

export interface IBeneficioTipo {
  id: number;
  nome: string;
}

export class BeneficioTipo {
  constructor() {
    this.ensureTableExists().catch(() => {});
  }

  private async ensureTableExists(): Promise<void> {
    try {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          nome VARCHAR(120) NOT NULL,
          ativo TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_beneficios_nome (nome)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (err: any) {
      console.warn('[BENEFICIO_TIPO] ensureTable:', err.message);
    }
  }

  async listar(): Promise<IBeneficioTipo[]> {
    return executeQuery<IBeneficioTipo>(
      `SELECT id, nome FROM ${TABLE_NAME} WHERE ativo = 1 ORDER BY nome ASC`
    );
  }

  async upsert(nome: string): Promise<IBeneficioTipo> {
    const normalizado = (nome ?? '').trim().toUpperCase();
    if (!normalizado) {
      throw new Error('Nome do benefício é obrigatório.');
    }

    await executeQuery(
      `INSERT INTO ${TABLE_NAME} (nome) VALUES (?) ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
      [normalizado]
    );

    const rows = await executeQuery<IBeneficioTipo>(
      `SELECT id, nome FROM ${TABLE_NAME} WHERE nome = ?`,
      [normalizado]
    );
    return rows[0];
  }
}
