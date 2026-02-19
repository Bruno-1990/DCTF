/**
 * Serviços do módulo IRPF Produção (PRD-IRPF-001)
 * Reutiliza getConnection/executeQuery (MySQL) do config.
 */

export { getConnection } from '../../config/mysql';
export { executeQuery } from '../../config/mysql';
export {
  runExtractionPipeline,
  normalizeText,
  type ExtractionConfigRow,
  type DocumentInfo,
} from './extraction-pipeline';
export { classifyExtractionFlow, type ExtractionFlowType } from './extraction-flow';
