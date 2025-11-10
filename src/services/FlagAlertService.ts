import { Flag } from '../models/Flag';
import { AuditTrailService } from './AuditTrailService';

export class FlagAlertService {
  async notifyCritical(flag: Flag): Promise<void> {
    console.warn(`⚠️ [FLAG CRÍTICA] ${flag.codigoFlag} - ${flag.descricao} (DCTF ${flag.declaracaoId})`);
    await AuditTrailService.record({
      event: 'flags.alert.critical',
      context: {
        declaracaoId: flag.declaracaoId,
        flagId: flag.id,
        codigo: flag.codigoFlag,
        severidade: flag.severidade,
      },
    });
  }

  async notifyHigh(flag: Flag): Promise<void> {
    console.info(`🔔 [FLAG ALTA] ${flag.codigoFlag} - ${flag.descricao}`);
    await AuditTrailService.record({
      event: 'flags.alert.high',
      context: {
        declaracaoId: flag.declaracaoId,
        flagId: flag.id,
        codigo: flag.codigoFlag,
        severidade: flag.severidade,
      },
    });
  }
}


