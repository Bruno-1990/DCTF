-- Remove a tabela teste_png (funcionalidade de importação de imagens PNG via OCR descontinuada).
-- Migração 017 criou a tabela; esta migração a remove.
DROP TABLE IF EXISTS teste_png;
