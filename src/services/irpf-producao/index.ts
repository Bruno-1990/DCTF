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
export {
  getOcrWebhookConfig,
  buildOcrWebhookPayload,
  notifyOcrWebhook,
  type OcrWebhookConfig,
  type OcrWebhookPayload,
} from './ocr-webhook';
export {
  populateDeclarationFromCase,
  type PopulateDeclarationResult,
} from './populate-declaration-from-case';
export {
  DEC_DECLARATION_TABLES,
  DEC_TABLE_ORIGINS,
  CAMPO_DESTINO_TO_TABLE,
  getDeclarationTableForCampoDestino,
} from './dec-mapping';
export {
  getLayoutForExercicio,
  getRecordTypeLayout,
  type DecLayout,
  type RecordTypeLayout,
  type CampoLayout,
  type FormatoCampo,
} from './dec-layout';
export {
  runWritersInOrder,
  generateDecBuffer,
  DEC_WRITER_ORDER,
  padFixed,
  toLatin1Buffer,
  linesToLatin1Buffer,
  type DecWriterContext,
  type DecWriterFn,
} from './dec-writers';
export {
  calculateTotals,
  getRendimentosFromDeclaration,
  recalculateAndSaveDeclarationTotals,
  type TotalsInput,
  type TotalsResult,
} from './declaration-totals-calculator';
export {
  validateDeclarationConsistency,
  validatePerfilVsBlocks,
  validateT9Totals,
  type ConsistencyError,
  type ConsistencyResult,
} from './declaration-consistency';
export {
  generateDecForCase,
  validatePreConditions,
  DEC_FILENAME_PATTERN,
  type GenerateDecPreCondition,
  type GenerateDecResult,
} from './generate-dec-orchestrator';
export {
  STATUS_LABELS,
  ERROR_MESSAGES,
  getStatusLabel,
  getErrorMessage,
} from './ux-copy';
