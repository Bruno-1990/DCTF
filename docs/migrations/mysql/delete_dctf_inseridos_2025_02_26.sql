-- ============================================================================
-- EXCLUIR registros de dctf_declaracoes INSERIDOS em 26/02/2025
-- ============================================================================
-- Execute no MySQL (Workbench, phpMyAdmin ou linha de comando).
-- Banco: dctf_web (ajuste USE se o nome for outro)
-- ============================================================================

USE dctf_web;

-- Ver quantos serão excluídos (opcional)
SELECT COUNT(*) AS total_a_excluir
FROM dctf_declaracoes
WHERE DATE(created_at) = '2025-02-26';

-- Excluir os inseridos em 26/02/2025
DELETE FROM dctf_declaracoes
WHERE DATE(created_at) = '2025-02-26';
