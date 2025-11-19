import { randomUUID } from 'crypto';
import { DashboardConferenceIssue, DashboardConferenceSummary, DashboardDCTFRecord } from '../types';
import { fetchAdminDashboardRecords } from './AdminDashboardService';

const DAYS_BEFORE_DEADLINE_MEDIUM = 5;

function parsePeriod(period: string): { year: number; month: number } | null {
  const trimmed = period.trim();
  const match = /^([0-9]{2})\/([0-9]{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return {
    month: Number.parseInt(match[1], 10),
    year: Number.parseInt(match[2], 10),
  };
}

/**
 * Calcula o vencimento legal conforme IN RFB 2.248/2025:
 * Último dia útil do mês seguinte ao fato gerador
 * 
 * Exemplo: Fato gerador de janeiro/2025 -> Vencimento: último dia útil de fevereiro/2025
 */
function computeDueDate(year: number, month: number): Date {
  // Mês seguinte ao fato gerador
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  
  // Último dia do mês seguinte
  const lastDayOfMonth = new Date(nextYear, nextMonth, 0).getDate();
  let dueDate = new Date(Date.UTC(nextYear, nextMonth - 1, lastDayOfMonth, 12, 0, 0, 0));
  
  // Ajustar para o último dia útil (não pode ser sábado ou domingo)
  let dayOfWeek = dueDate.getUTCDay(); // 0 = domingo, 6 = sábado
  
  // Retroceder até encontrar um dia útil (segunda a sexta)
  while (dayOfWeek === 0 || dayOfWeek === 6) {
    dueDate.setUTCDate(dueDate.getUTCDate() - 1);
    dayOfWeek = dueDate.getUTCDay();
  }
  
  return dueDate;
}

function parseDate(date?: string): Date | undefined {
  if (!date) return undefined;
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Verifica se uma declaração é "sem movimento" ou "zerada"
 * Baseado na IN RFB 2.237/2024 e 2.248/2025
 */
/**
 * Detecta se uma declaração é "sem movimento"
 * Critérios rigorosos conforme IN RFB 2.237/2024:
 * - Deve ter texto "sem movimento" no tipo ou situação
 * - OU débito apurado e saldo a pagar devem ser exatamente 0 ou null (sem fatos geradores)
 */
function isSemMovimento(record: DashboardDCTFRecord): boolean {
  const declarationType = (record.declarationType ?? '').toLowerCase();
  const situation = (record.situation ?? '').toLowerCase();
  
  // Verificação por texto (mais confiável)
  const hasTextIndicator = declarationType.includes('sem movimento') || 
                          declarationType.includes('sem movimentação') ||
                          situation.includes('sem movimento') ||
                          situation.includes('sem movimentação');
  
  if (hasTextIndicator) return true;
  
  // Verificação por valores (fallback) - verdadeiro "sem movimento" não tem valores
  const debit = record.debitAmount;
  const balance = record.balanceDue;
  
  // Se ambos são 0 ou null/undefined, pode ser sem movimento
  const debitIsZeroOrNull = debit === null || debit === undefined || debit === 0 || debit === '0';
  const balanceIsZeroOrNull = balance === null || balance === undefined || balance === 0 || balance === '0';
  
  // Só considera sem movimento se AMBOS forem zero/null
  return debitIsZeroOrNull && balanceIsZeroOrNull;
}

/**
 * Detecta se uma declaração é "zerada"
 * Critérios rigorosos conforme IN RFB 2.237/2024:
 * - Deve ter texto "zerada" no tipo ou situação
 * - E/OU débito apurado é 0 mas NÃO é "sem movimento" (houve fatos geradores)
 * "Zerada" significa que houve movimento mas o resultado final foi zero
 */
function isZerada(record: DashboardDCTFRecord): boolean {
  const declarationType = (record.declarationType ?? '').toLowerCase();
  const situation = (record.situation ?? '').toLowerCase();
  
  // Se já é identificada como "sem movimento", NÃO pode ser "zerada"
  if (isSemMovimento(record)) return false;
  
  // Verifica se é explicitamente "zerada" ou "zerado" no tipo ou situação
  // Não verifica valores numéricos para evitar falsos positivos
  return declarationType.includes('zerada') ||
         declarationType.includes('zerado') ||
         situation.includes('zerada') ||
         situation.includes('zerado');
}

function isOriginal(record: DashboardDCTFRecord): boolean {
  const declarationType = (record.declarationType ?? '').toLowerCase();
  const result = declarationType.includes('original');
  
  // Log para debug
  if (declarationType.includes('ativa') || declarationType.includes('sem movimento')) {
    console.log('[Conference] isOriginal check:', {
      declarationType: record.declarationType,
      isOriginal: result,
      period: record.period,
      situation: record.situation
    });
  }
  
  return result;
}

function buildDueDateIssue(record: DashboardDCTFRecord, today: Date): DashboardConferenceIssue | null {
  const periodInfo = parsePeriod(record.period);
  if (!periodInfo) {
    return null;
  }

  const dueDate = computeDueDate(periodInfo.year, periodInfo.month);
  const transmittedAt = parseDate(record.transmissionDate);
  const status = (record.status ?? '').toLowerCase();
  const situation = (record.situation ?? '').toLowerCase();
  const isDelivered = status === 'concluido';
  const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue = Math.floor((dueDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
  const severity: DashboardConferenceIssue['severity'] = daysUntilDue < 0 ? 'high' : daysUntilDue <= DAYS_BEFORE_DEADLINE_MEDIUM ? 'medium' : 'low';

  // Se já foi entregue, não criar issue de prazo
  if (isDelivered) {
    return null;
  }

  const stillProcessing = situation.includes('andamento');
  
  // Criar issue para declarações "em andamento" mesmo com severity 'low',
  // pois elas precisam ser monitoradas na seção "Declarações em aberto com prazo vigente"
  // Mas só se ainda estiverem dentro do prazo (daysUntilDue >= 0)
  if (severity === 'low' && !stillProcessing) {
    // Se não está em andamento e tem muito tempo (severity 'low'), não precisa criar issue
    return null;
  }

  // Se está vencida (severity 'high'), sempre criar issue
  // Se está próxima do vencimento (severity 'medium'), sempre criar issue
  // Se está em andamento mesmo com severity 'low', criar issue para monitoramento
  const message = severity === 'high'
    ? 'Competência vencida sem entrega registrada.'
    : severity === 'medium'
    ? `Prazo final em ${daysUntilDue} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'} (necessário transmitir).`
    : stillProcessing
    ? `Declaração em andamento - Prazo final em ${daysUntilDue} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'}.`
    : `Prazo final em ${daysUntilDue} dia${Math.abs(daysUntilDue) === 1 ? '' : 's'} (necessário transmitir).`;

  return {
    id: randomUUID(),
    rule: 'due_date',
    identification: record.identification,
    businessName: record.businessName,
    period: record.period,
    dueDate: dueDate.toISOString(),
    transmissionDate: transmittedAt?.toISOString(),
    status: record.status,
    severity,
    message,
    details: {
      situation: record.situation,
      stillProcessing,
      daysUntilDue,
    },
    actionPlan:
      severity === 'high'
        ? 'Transmitir a DCTF correspondente imediatamente e preparar o pagamento da multa por atraso (DARF 2170) se aplicável.'
        : severity === 'medium'
        ? stillProcessing
          ? 'Acompanhar o processamento da transmissão já enviada e confirmar o protocolo assim que o status for atualizado.'
          : 'Priorizar o fechamento da competência e protocolar a DCTF antes do vencimento legal, alinhando o time fiscal.'
        : stillProcessing
        ? 'Acompanhar o processamento da transmissão já enviada. Monitorar o status e confirmar quando concluída.'
        : 'Monitorar e preparar a transmissão da DCTF antes do vencimento legal.',
  };
}

/**
 * Identifica clientes que NÃO têm DCTF emitida na competência vigente
 * Útil para monitorar quais clientes precisam ser verificados no mês seguinte
 */
async function buildClientesSemDCTFVigente(
  records: DashboardDCTFRecord[],
  today: Date
): Promise<DashboardConferenceIssue[]> {
  try {
    // Calcular competência vigente (mês anterior)
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const competenciaMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const competenciaYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const competenciaVigente = `${String(competenciaMonth).padStart(2, '0')}/${competenciaYear}`;
    
    console.log('[Conference] 🔍 Buscando clientes sem DCTF na competência:', competenciaVigente);
    
    // Importar modelo de clientes
    const { Cliente } = await import('../models/Cliente');
    const clienteModel = new Cliente();
    
    // Buscar TODOS os clientes ativos
    const resultClientes = await clienteModel.findAll();
    if (!resultClientes.success || !resultClientes.data) {
      console.log('[Conference] ⚠️ Nenhum cliente encontrado ou erro ao buscar');
      return [];
    }
    
    const todosClientes = resultClientes.data;
    console.log('[Conference] 📊 Total de clientes cadastrados:', todosClientes.length);
    
    // Extrair CNPJs que TÊM DCTF na competência vigente
    const cnpjsComDCTF = new Set(
      records
        .filter(r => r.period === competenciaVigente)
        .map(r => r.identification?.replace(/\D/g, ''))
        .filter(Boolean)
    );
    
    console.log('[Conference] ✅ Clientes COM DCTF na competência vigente:', cnpjsComDCTF.size);
    
    // Filtrar clientes SEM DCTF
    const clientesSemDCTF = todosClientes.filter(cliente => {
      const cnpjLimpo = cliente.cnpj_limpo?.replace(/\D/g, '');
      return cnpjLimpo && !cnpjsComDCTF.has(cnpjLimpo);
    });
    
    console.log('[Conference] ⚠️ Clientes SEM DCTF na competência vigente:', clientesSemDCTF.length);
    
    // Converter para DashboardConferenceIssue
    const issues: DashboardConferenceIssue[] = clientesSemDCTF.map(cliente => {
      const dueDate = computeDueDate(competenciaYear, competenciaMonth);
      
      return {
        id: randomUUID(),
        rule: 'missing_declaration' as const,
        identification: cliente.cnpj_limpo || '',
        businessName: cliente.razao_social,
        period: competenciaVigente,
        dueDate: dueDate.toISOString(),
        transmissionDate: undefined,
        status: undefined,
        severity: 'medium' as const,
        message: `Cliente sem DCTF na competência ${competenciaVigente}. Verificar se houve movimento para o mês seguinte.`,
        details: {
          competenciaVigente,
          monitorarProximoMes: true,
        },
        actionPlan: `⚠️ Atenção necessária:\n\n1. Verificar se a empresa teve movimento em ${competenciaVigente}\n2. Se teve movimento: OBRIGAÇÃO de enviar DCTF\n3. Se não teve movimento: Enviar "Original sem movimento"\n\n💡 Este cliente não consta na base de DCTFs para esta competência.`,
      };
    });
    
    return issues;
  } catch (error) {
    console.error('[Conference] ❌ Erro ao buscar clientes sem DCTF:', error);
    return [];
  }
}

/**
 * Analisa a obrigatoriedade de transmissão baseado na legislação:
 * - IN RFB 2.237/2024: Disciplina a DCTFWeb
 * - IN RFB 2.248/2025: Altera prazos de entrega
 * 
 * Regras:
 * 1. "Original sem movimento": Se aparecer um mês sem movimento, no mês seguinte não tem obrigação até que tenha movimento novamente
 * 2. "Original zerada": Precisa transmitir mesmo zerada
 */
function buildTransmissionObligationIssues(
  records: DashboardDCTFRecord[],
  today: Date
): DashboardConferenceIssue[] {
  const issues: DashboardConferenceIssue[] = [];
  
  console.log('[Conference] ========================================');
  console.log('[Conference] buildTransmissionObligationIssues - INÍCIO');
  console.log('[Conference] Total registros recebidos:', records.length);
  console.log('[Conference] Data de hoje:', today.toISOString());
  
  // Log dos primeiros 3 registros para análise
  if (records.length > 0) {
    console.log('[Conference] Primeiros 3 registros:', records.slice(0, 3).map(r => ({
      identification: r.identification,
      period: r.period,
      declarationType: r.declarationType,
      situation: r.situation,
      status: r.status,
      debitAmount: r.debitAmount,
      balanceDue: r.balanceDue,
      transmissionDate: r.transmissionDate
    })));
  }
  
  // Agrupar registros por CNPJ
  const recordsByCnpj = new Map<string, DashboardDCTFRecord[]>();
  for (const record of records) {
    if (!record.identification) continue;
    if (!recordsByCnpj.has(record.identification)) {
      recordsByCnpj.set(record.identification, []);
    }
    recordsByCnpj.get(record.identification)!.push(record);
  }
  
  console.log('[Conference] Total CNPJs agrupados:', recordsByCnpj.size);
  
  // Analisar cada CNPJ
  for (const [cnpj, cnpjRecords] of recordsByCnpj.entries()) {
    // Ordenar registros por período (mais antigo primeiro)
    const sortedRecords = [...cnpjRecords].sort((a, b) => {
      const periodA = parsePeriod(a.period);
      const periodB = parsePeriod(b.period);
      if (!periodA || !periodB) return 0;
      const valueA = periodA.year * 12 + periodA.month;
      const valueB = periodB.year * 12 + periodB.month;
      return valueA - valueB;
    });
    
    // Verificar cada registro
    for (let i = 0; i < sortedRecords.length; i++) {
      const record = sortedRecords[i];
      const periodInfo = parsePeriod(record.period);
      if (!periodInfo) continue;
      
      const isOriginalRecord = isOriginal(record);
      const isSemMovimentoRecord = isSemMovimento(record);
      const isZeradaRecord = isZerada(record);
      const status = (record.status ?? '').toLowerCase();
      const transmittedAt = parseDate(record.transmissionDate);
      // Considera "entregue" se tem data de transmissão OU status indica conclusão
      const isDelivered = !!transmittedAt || status === 'concluido' || status === 'ativa' || status.includes('ativa');
      
      if (isSemMovimentoRecord || isZeradaRecord) {
        console.log('[Conference] ⭐ Registro interessante encontrado:', {
          cnpj,
          period: record.period,
          businessName: record.businessName,
          isOriginal: isOriginalRecord,
          isSemMovimento: isSemMovimentoRecord,
          isZerada: isZeradaRecord,
          status: record.status,
          isDelivered,
          transmissionDate: record.transmissionDate,
          declarationType: record.declarationType,
          situation: record.situation,
          debitAmount: record.debitAmount,
          balanceDue: record.balanceDue
        });
      }
      
      // Regra 1: APENAS "Original sem movimento" dispensa meses seguintes
      // Conforme IN RFB 2.237/2024, Art. 3º, § 3º: apenas a declaração ORIGINAL sem movimento
      // dispensa as competências seguintes até que haja movimento novamente.
      // Retificadoras, substitutas e outros tipos NÃO têm essa dispensa.
      if (isOriginalRecord && isSemMovimentoRecord) {
        console.log('[Conference] 🎯 Processando "Original sem movimento" (apenas Original!):', {
          cnpj,
          period: record.period,
          declarationType: record.declarationType,
          status: record.status,
          isSemMovimento: isSemMovimentoRecord
        });
        // Verificar se há registro do mês anterior
        const previousMonth = periodInfo.month === 1 ? 12 : periodInfo.month - 1;
        const previousYear = periodInfo.month === 1 ? periodInfo.year - 1 : periodInfo.year;
        
        const previousRecord = sortedRecords.find(r => {
          const prevPeriod = parsePeriod(r.period);
          return prevPeriod && prevPeriod.year === previousYear && prevPeriod.month === previousMonth;
        });
        
        // Se o mês anterior também foi sem movimento, não há obrigação de transmitir
        if (previousRecord && isSemMovimento(previousRecord)) {
          // Criar alerta informativo se JÁ foi transmitida (baixa prioridade)
          if (isDelivered && transmittedAt) {
            const dueDate = computeDueDate(periodInfo.year, periodInfo.month);
            
            issues.push({
              id: randomUUID(),
              rule: 'transmission_obligation',
              identification: cnpj,
              businessName: record.businessName,
              period: record.period,
              dueDate: dueDate.toISOString(),
              transmissionDate: transmittedAt.toISOString(),
              status: record.status,
              severity: 'low',
              message: `✅ Declaração "sem movimento" já enviada. Próximos meses SEM obrigação (mês anterior também foi sem movimento).`,
              details: {
                declarationType: record.declarationType,
                situation: record.situation,
                isSemMovimento: true,
                isConsecutiveSemMovimento: true,
                previousPeriod: previousRecord.period,
              },
              actionPlan: `📌 Informação importante:\n\n✓ Você JÁ enviou esta declaração "sem movimento"\n✓ Como o mês anterior (${previousRecord.period}) também foi sem movimento, os próximos meses NÃO precisam ser enviados\n✓ Só precisa enviar novamente quando a empresa voltar a ter movimento\n\n📖 Base legal: IN RFB 2.237/2024, Art. 3º`,
            });
            console.log('[Conference] ✅ Criado alerta consecutivo sem movimento para:', cnpj, record.period);
          }
          // Não há obrigação - não precisa criar issue de pendência
          continue;
        }
        
        // Se não há registro anterior ou o anterior não era sem movimento
        const dueDate = computeDueDate(periodInfo.year, periodInfo.month);
        const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysUntilDue = Math.floor((dueDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        
        // Se JÁ foi transmitida, criar alerta informativo (baixa prioridade)
        if (isDelivered && transmittedAt) {
          const isFirstSemMovimento = !previousRecord || !isSemMovimento(previousRecord);
          
          issues.push({
            id: randomUUID(),
            rule: 'transmission_obligation',
            identification: cnpj,
            businessName: record.businessName,
            period: record.period,
            dueDate: dueDate.toISOString(),
            transmissionDate: transmittedAt.toISOString(),
            status: record.status,
            severity: 'low',
            message: isFirstSemMovimento
              ? `✅ Declaração "sem movimento" enviada (1ª vez). Próximos meses SEM obrigação.`
              : `✅ Declaração "sem movimento" enviada. Próximos meses SEM obrigação.`,
            details: {
              declarationType: record.declarationType,
              situation: record.situation,
              isSemMovimento: true,
              isFirstSemMovimento,
            },
            actionPlan: isFirstSemMovimento
              ? `📌 Informação importante:\n\n✓ Você JÁ enviou esta declaração "sem movimento" pela primeira vez\n✓ Os próximos meses NÃO precisam ser enviados enquanto não tiver movimento\n✓ ⚠️ ATENÇÃO: Quando a empresa voltar a ter movimento, a declaração volta a ser OBRIGATÓRIA!\n\n💡 Dica: Fique atento ao mês que voltar a ter movimento para não esquecer de enviar.\n\n📖 Base legal: IN RFB 2.237/2024, Art. 3º`
              : `📌 Informação importante:\n\n✓ Você JÁ enviou esta declaração "sem movimento"\n✓ Os próximos meses NÃO precisam ser enviados enquanto não tiver movimento\n✓ ⚠️ ATENÇÃO: Quando a empresa voltar a ter movimento, a declaração volta a ser OBRIGATÓRIA!\n\n📖 Base legal: IN RFB 2.237/2024, Art. 3º`,
          });
          console.log('[Conference] ✅ Criado alerta primeiro sem movimento para:', cnpj, record.period);
          continue;
        }
        
        // Se NÃO foi transmitida ainda, criar issue de pendência
        // Só criar issue se ainda não venceu ou está próximo do vencimento
        if (daysUntilDue >= -5) { // Considerar até 5 dias após o vencimento
          const severity: DashboardConferenceIssue['severity'] = 
            daysUntilDue < 0 ? 'high' : daysUntilDue <= DAYS_BEFORE_DEADLINE_MEDIUM ? 'medium' : 'low';
          
          const isFirstSemMovimento = !previousRecord || !isSemMovimento(previousRecord);
          
          issues.push({
            id: randomUUID(),
            rule: 'transmission_obligation',
            identification: cnpj,
            businessName: record.businessName,
            period: record.period,
            dueDate: dueDate.toISOString(),
            transmissionDate: transmittedAt?.toISOString(),
            status: record.status,
            severity,
            message: daysUntilDue < 0
              ? isFirstSemMovimento
                ? 'Original sem movimento não transmitida (primeira ocorrência) - obrigatória mesmo sem movimento (vencida).'
                : 'Original sem movimento não transmitida - obrigatória mesmo sem movimento (vencida).'
              : isFirstSemMovimento
                ? `Original sem movimento não transmitida (primeira ocorrência) - obrigatória mesmo sem movimento (vencimento em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}).`
                : `Original sem movimento não transmitida - obrigatória mesmo sem movimento (vencimento em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}).`,
            details: {
              declarationType: record.declarationType,
              situation: record.situation,
              isSemMovimento: true,
              isFirstSemMovimento,
              daysUntilDue,
            },
            actionPlan: daysUntilDue < 0
              ? 'Transmitir a DCTF "Original sem movimento" imediatamente. Conforme IN RFB 2.237/2024, Art. 3º, mesmo sem movimento é obrigatória a transmissão na primeira ocorrência. Após transmitir, os meses seguintes não terão obrigação até retomar movimento.'
              : 'Transmitir a DCTF "Original sem movimento" antes do vencimento. Conforme IN RFB 2.237/2024, Art. 3º, mesmo sem movimento é obrigatória a transmissão na primeira ocorrência. Após transmitir, os meses seguintes não terão obrigação até retomar movimento.',
          });
        }
      }
      
      // Regra 2: "Original zerada" - sempre obrigatória
      if (isOriginalRecord && isZeradaRecord && !isSemMovimentoRecord) {
        const dueDate = computeDueDate(periodInfo.year, periodInfo.month);
        const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysUntilDue = Math.floor((dueDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        
        // Se JÁ foi transmitida, criar alerta informativo (baixa prioridade)
        if (isDelivered && transmittedAt) {
          issues.push({
            id: randomUUID(),
            rule: 'transmission_obligation',
            identification: cnpj,
            businessName: record.businessName,
            period: record.period,
            dueDate: dueDate.toISOString(),
            transmissionDate: transmittedAt.toISOString(),
            status: record.status,
            severity: 'low',
            message: `✅ Declaração "zerada" enviada (R$ 0,00). Obrigação cumprida!`,
            details: {
              declarationType: record.declarationType,
              situation: record.situation,
              isZerada: true,
              debitAmount: record.debitAmount,
              balanceDue: record.balanceDue,
            },
            actionPlan: `📌 Informação importante:\n\n✓ Você JÁ enviou esta declaração "zerada"\n✓ Mesmo sem valor a pagar (R$ 0,00), o envio ERA obrigatório\n✓ Obrigação cumprida com sucesso!\n\n💡 Atenção: Declarações "zeradas" são SEMPRE obrigatórias, mesmo sem débito.\n\n📖 Base legal: IN RFB 2.237/2024, Art. 3º, § 1º`,
          });
          continue;
        }
        
        // Se NÃO foi transmitida ainda, criar issue de pendência
        // Só criar issue se ainda não venceu ou está próximo do vencimento
        if (daysUntilDue >= -5) {
          const severity: DashboardConferenceIssue['severity'] = 
            daysUntilDue < 0 ? 'high' : daysUntilDue <= DAYS_BEFORE_DEADLINE_MEDIUM ? 'medium' : 'low';
          
          issues.push({
            id: randomUUID(),
            rule: 'transmission_obligation',
            identification: cnpj,
            businessName: record.businessName,
            period: record.period,
            dueDate: dueDate.toISOString(),
            transmissionDate: transmittedAt?.toISOString(),
            status: record.status,
            severity,
            message: daysUntilDue < 0
              ? 'Original zerada não transmitida - obrigatória mesmo com valores zerados (vencida).'
              : `Original zerada não transmitida - obrigatória mesmo com valores zerados (vencimento em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}).`,
            details: {
              declarationType: record.declarationType,
              situation: record.situation,
              isZerada: true,
              debitAmount: record.debitAmount,
              balanceDue: record.balanceDue,
              daysUntilDue,
            },
            actionPlan: daysUntilDue < 0
              ? 'Transmitir a DCTF "Original zerada" imediatamente. Conforme IN RFB 2.237/2024, Art. 3º, § 1º, mesmo com valores zerados é obrigatória a transmissão.'
              : 'Transmitir a DCTF "Original zerada" antes do vencimento. Conforme IN RFB 2.237/2024, Art. 3º, § 1º, mesmo com valores zerados é obrigatória a transmissão.',
          });
        }
      }
    }
  }
  
  const semMovimento = issues.filter(i => i.details?.isSemMovimento);
  const zerada = issues.filter(i => i.details?.isZerada);
  
  console.log('[Conference] ✅ Total de alertas de obrigatoriedade criados:', issues.length);
  console.log('[Conference] Alertas "sem movimento":', semMovimento.length);
  console.log('[Conference] Alertas "zerada":', zerada.length);
  
  if (semMovimento.length > 0) {
    console.log('[Conference] 📋 Exemplos de alertas "sem movimento":', semMovimento.slice(0, 3).map(i => ({
      period: i.period,
      businessName: i.businessName,
      severity: i.severity,
      message: i.message,
      transmissionDate: i.transmissionDate,
      isSemMovimento: i.details?.isSemMovimento,
      declarationType: i.details?.declarationType
    })));
  }
  
  // Log detalhado dos períodos encontrados
  const periodos = new Set(semMovimento.map(i => i.period));
  console.log('[Conference] 📅 Períodos com "sem movimento":', Array.from(periodos).sort());
  
  return issues;
}

/**
 * Detecta lacunas de períodos entre declarações
 * Conforme IN RFB 2.237/2024, todas as competências devem ser declaradas sequencialmente
 */
function buildMissingPeriodIssues(
  records: DashboardDCTFRecord[],
  today: Date
): DashboardConferenceIssue[] {
  const issues: DashboardConferenceIssue[] = [];
  
  // Agrupar por CNPJ
  const recordsByCnpj = new Map<string, DashboardDCTFRecord[]>();
  for (const record of records) {
    if (!record.identification) continue;
    if (!recordsByCnpj.has(record.identification)) {
      recordsByCnpj.set(record.identification, []);
    }
    recordsByCnpj.get(record.identification)!.push(record);
  }
  
  for (const [cnpj, cnpjRecords] of recordsByCnpj.entries()) {
    // Filtrar apenas originais e ordenar por período
    const originalRecords = cnpjRecords
      .filter(r => isOriginal(r))
      .map(r => ({ record: r, period: parsePeriod(r.period) }))
      .filter((entry): entry is { record: DashboardDCTFRecord; period: { year: number; month: number } } => 
        entry.period !== null
      )
      .sort((a, b) => {
        const valueA = a.period.year * 12 + a.period.month;
        const valueB = b.period.year * 12 + b.period.month;
        return valueA - valueB;
      });
    
    if (originalRecords.length < 2) continue;
    
    // Verificar lacunas entre períodos consecutivos
    for (let i = 0; i < originalRecords.length - 1; i++) {
      const current = originalRecords[i].period;
      const next = originalRecords[i + 1].period;
      
      // Calcular período esperado seguinte
      let expectedMonth = current.month + 1;
      let expectedYear = current.year;
      if (expectedMonth > 12) {
        expectedMonth = 1;
        expectedYear++;
      }
      
      // Se o próximo período não é o esperado, há uma lacuna
      if (next.month !== expectedMonth || next.year !== expectedYear) {
        // Verificar se a lacuna está dentro do período analisado (últimos 12 meses)
        const gapPeriod = { month: expectedMonth, year: expectedYear };
        const gapValue = gapPeriod.year * 12 + gapPeriod.month;
        const todayValue = today.getFullYear() * 12 + (today.getMonth() + 1);
        
        // Só criar issue se a lacuna for recente (últimos 12 meses)
        if (gapValue >= todayValue - 12) {
          const dueDate = computeDueDate(gapPeriod.year, gapPeriod.month);
          const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const daysUntilDue = Math.floor((dueDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
          
          // Só criar issue se ainda não passou muito tempo (até 30 dias após vencimento)
          if (daysUntilDue >= -30) {
            const severity: DashboardConferenceIssue['severity'] = 
              daysUntilDue < 0 ? 'high' : daysUntilDue <= DAYS_BEFORE_DEADLINE_MEDIUM ? 'medium' : 'low';
            
            const periodStr = `${String(gapPeriod.month).padStart(2, '0')}/${gapPeriod.year}`;
            issues.push({
              id: randomUUID(),
              rule: 'missing_period',
              identification: cnpj,
              businessName: originalRecords[i].record.businessName,
              period: periodStr,
              dueDate: dueDate.toISOString(),
              status: 'Pendente',
              severity,
              message: daysUntilDue < 0
                ? `Lacuna detectada: período ${periodStr} não declarado (vencido).`
                : `Lacuna detectada: período ${periodStr} não declarado (vencimento em ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}).`,
              details: {
                missingPeriod: periodStr,
                previousPeriod: originalRecords[i].record.period,
                nextPeriod: originalRecords[i + 1].record.period,
                daysUntilDue,
              },
              actionPlan: daysUntilDue < 0
                ? 'Verificar se o período realmente não teve fatos geradores. Se houver fatos geradores, transmitir a DCTF imediatamente para evitar multa por omissão.'
                : 'Verificar se o período realmente não teve fatos geradores. Se houver fatos geradores, transmitir a DCTF antes do vencimento para evitar multa por omissão.',
            });
          }
        }
      }
    }
  }
  
  return issues;
}

/**
 * Detecta retificadoras sem declaração original correspondente
 * Conforme legislação, retificadoras devem ter uma declaração original base
 */
function buildRetificadoraWithoutOriginalIssues(
  records: DashboardDCTFRecord[],
  today: Date
): DashboardConferenceIssue[] {
  const issues: DashboardConferenceIssue[] = [];
  
  // Agrupar por CNPJ
  const recordsByCnpj = new Map<string, DashboardDCTFRecord[]>();
  for (const record of records) {
    if (!record.identification) continue;
    if (!recordsByCnpj.has(record.identification)) {
      recordsByCnpj.set(record.identification, []);
    }
    recordsByCnpj.get(record.identification)!.push(record);
  }
  
  for (const [cnpj, cnpjRecords] of recordsByCnpj.entries()) {
    // Separar retificadoras e originais
    const retificadoras = cnpjRecords.filter(r => 
      (r.declarationType ?? '').toLowerCase().includes('retificadora')
    );
    const originais = cnpjRecords.filter(r => isOriginal(r));
    
    // Criar set de períodos com originais
    const periodosComOriginal = new Set<string>();
    for (const original of originais) {
      const period = parsePeriod(original.period);
      if (period) {
        periodosComOriginal.add(`${period.year}-${period.month}`);
      }
    }
    
    // Verificar cada retificadora
    for (const retificadora of retificadoras) {
      const period = parsePeriod(retificadora.period);
      if (!period) continue;
      
      const periodKey = `${period.year}-${period.month}`;
      
      // Se não há original para este período, criar issue
      if (!periodosComOriginal.has(periodKey)) {
        const dueDate = computeDueDate(period.year, period.month);
        const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysUntilDue = Math.floor((dueDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue >= -30) {
          const severity: DashboardConferenceIssue['severity'] = 'high'; // Sempre alta, pois é inconsistência grave
          
          issues.push({
            id: randomUUID(),
            rule: 'retificadora_without_original',
            identification: cnpj,
            businessName: retificadora.businessName,
            period: retificadora.period,
            dueDate: dueDate.toISOString(),
            transmissionDate: parseDate(retificadora.transmissionDate)?.toISOString(),
            status: retificadora.status,
            severity,
            message: `Retificadora encontrada sem declaração original correspondente para o período ${retificadora.period}.`,
            details: {
              declarationType: retificadora.declarationType,
              situation: retificadora.situation,
              daysUntilDue,
            },
            actionPlan: 'Verificar se a declaração original foi transmitida. Se não foi, transmitir a original primeiro. Se foi, verificar se há erro no cadastro ou se a retificadora foi criada incorretamente.',
          });
        }
      }
    }
  }
  
  return issues;
}

/**
 * Detecta declarações duplicadas para o mesmo período e CNPJ
 * Conforme legislação, não deve haver múltiplas declarações originais para o mesmo período
 */
function buildDuplicateDeclarationIssues(
  records: DashboardDCTFRecord[],
  today: Date
): DashboardConferenceIssue[] {
  const issues: DashboardConferenceIssue[] = [];
  
  // Agrupar por CNPJ e período
  const recordsByKey = new Map<string, DashboardDCTFRecord[]>();
  for (const record of records) {
    if (!record.identification) continue;
    const period = parsePeriod(record.period);
    if (!period) continue;
    
    const key = `${record.identification}-${period.year}-${period.month}`;
    if (!recordsByKey.has(key)) {
      recordsByKey.set(key, []);
    }
    recordsByKey.get(key)!.push(record);
  }
  
  for (const [key, duplicateRecords] of recordsByKey.entries()) {
    // Se há mais de uma declaração original para o mesmo período, é duplicata
    const originais = duplicateRecords.filter(r => isOriginal(r));
    
    if (originais.length > 1) {
      // Filtrar apenas declarações que NÃO são da origem "SERO"
      // Declarações com origem "SERO" podem ter múltiplas originais no mesmo período
      // Conforme legislação, declarações SERO (Sistema Eletrônico de Retenção na Origem) 
      // podem ter múltiplas originais para a mesma competência
      const originaisNaoSero = originais.filter(r => {
        const origin = (r.origin || '').toUpperCase().trim();
        return origin !== 'SERO';
      });
      
      // Se após filtrar SERO ainda há mais de uma original, então é duplicata
      if (originaisNaoSero.length > 1) {
        // Ordenar por data de transmissão (mais recente primeiro)
        originaisNaoSero.sort((a, b) => {
          const dateA = parseDate(a.transmissionDate);
          const dateB = parseDate(b.transmissionDate);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateB.getTime() - dateA.getTime();
        });
        
        // A primeira é a mais recente, as outras são duplicatas
        for (let i = 1; i < originaisNaoSero.length; i++) {
          const duplicate = originaisNaoSero[i];
          const period = parsePeriod(duplicate.period);
          if (!period) continue;
          
          const dueDate = computeDueDate(period.year, period.month);
          const severity: DashboardConferenceIssue['severity'] = 'medium';
          
          issues.push({
            id: randomUUID(),
            rule: 'duplicate_declaration',
            identification: duplicate.identification,
            businessName: duplicate.businessName,
            period: duplicate.period,
            dueDate: dueDate.toISOString(),
            transmissionDate: parseDate(duplicate.transmissionDate)?.toISOString(),
            status: duplicate.status,
            severity,
            message: `Declaração original duplicada para o período ${duplicate.period}. Existe ${originaisNaoSero.length} declaração(ões) original(is) para este período.`,
            details: {
              declarationType: duplicate.declarationType,
              situation: duplicate.situation,
              origin: duplicate.origin,
              totalDuplicates: originaisNaoSero.length,
              isMostRecent: i === 0,
            },
            actionPlan: 'Verificar qual declaração está correta. Se houver duplicidade real, cancelar ou retificar a declaração incorreta. Se for erro de cadastro, corrigir os dados.',
          });
        }
      }
    }
  }
  
  return issues;
}

/**
 * Detecta declarações com períodos futuros (erro de digitação)
 * Períodos futuros indicam erro de cadastro
 */
function buildFuturePeriodIssues(
  records: DashboardDCTFRecord[],
  today: Date
): DashboardConferenceIssue[] {
  const issues: DashboardConferenceIssue[] = [];
  
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  
  for (const record of records) {
    const period = parsePeriod(record.period);
    if (!period) continue;
    
    // Verificar se o período é futuro
    const periodValue = period.year * 12 + period.month;
    const todayValue = todayYear * 12 + todayMonth;
    
    if (periodValue > todayValue) {
      const dueDate = computeDueDate(period.year, period.month);
      const severity: DashboardConferenceIssue['severity'] = 'high';
      
      issues.push({
        id: randomUUID(),
        rule: 'future_period',
        identification: record.identification,
        businessName: record.businessName,
        period: record.period,
        dueDate: dueDate.toISOString(),
        transmissionDate: parseDate(record.transmissionDate)?.toISOString(),
        status: record.status,
        severity,
        message: `Período futuro detectado: ${record.period}. Possível erro de digitação ou cadastro incorreto.`,
        details: {
          declarationType: record.declarationType,
          situation: record.situation,
          periodYear: period.year,
          periodMonth: period.month,
          todayYear,
          todayMonth,
        },
        actionPlan: 'Verificar se o período está correto. Se for erro de digitação, corrigir o cadastro. Se for período futuro válido (improvável), confirmar com a Receita Federal.',
      });
    }
  }
  
  return issues;
}

/**
 * Detecta problemas na sequência de retificadoras
 * Verifica se há múltiplas retificadoras sem ordem lógica ou sem original
 */
function buildRetificadoraSequenceIssues(
  records: DashboardDCTFRecord[],
  today: Date
): DashboardConferenceIssue[] {
  const issues: DashboardConferenceIssue[] = [];
  
  // Agrupar por CNPJ
  const recordsByCnpj = new Map<string, DashboardDCTFRecord[]>();
  for (const record of records) {
    if (!record.identification) continue;
    if (!recordsByCnpj.has(record.identification)) {
      recordsByCnpj.set(record.identification, []);
    }
    recordsByCnpj.get(record.identification)!.push(record);
  }
  
  for (const [cnpj, cnpjRecords] of recordsByCnpj.entries()) {
    // Agrupar por período
    const recordsByPeriod = new Map<string, DashboardDCTFRecord[]>();
    for (const record of cnpjRecords) {
      const period = parsePeriod(record.period);
      if (!period) continue;
      const periodKey = `${period.year}-${period.month}`;
      if (!recordsByPeriod.has(periodKey)) {
        recordsByPeriod.set(periodKey, []);
      }
      recordsByPeriod.get(periodKey)!.push(record);
    }
    
    // Verificar cada período
    for (const [periodKey, periodRecords] of recordsByPeriod.entries()) {
      const retificadoras = periodRecords.filter(r => 
        (r.declarationType ?? '').toLowerCase().includes('retificadora')
      );
      
      // Se há mais de 3 retificadoras para o mesmo período, pode indicar problema
      if (retificadoras.length > 3) {
        const firstRetificadora = retificadoras[0];
        const period = parsePeriod(firstRetificadora.period);
        if (!period) continue;
        
        const dueDate = computeDueDate(period.year, period.month);
        const severity: DashboardConferenceIssue['severity'] = 'medium';
        
        issues.push({
          id: randomUUID(),
          rule: 'retificadora_sequence',
          identification: cnpj,
          businessName: firstRetificadora.businessName,
          period: firstRetificadora.period,
          dueDate: dueDate.toISOString(),
          status: firstRetificadora.status,
          severity,
          message: `Múltiplas retificadoras (${retificadoras.length}) detectadas para o período ${firstRetificadora.period}. Verificar se há necessidade de todas ou se há erro na sequência.`,
          details: {
            totalRetificadoras: retificadoras.length,
            periodRecords: periodRecords.map(r => ({
              type: r.declarationType,
              status: r.status,
              transmissionDate: r.transmissionDate,
            })),
          },
          actionPlan: 'Revisar a sequência de retificadoras. Verificar se todas são necessárias ou se há retificadoras desnecessárias que podem ser canceladas. Confirmar se a última retificadora está correta.',
        });
      }
    }
  }
  
  return issues;
}

export async function getConferenceSummary(months = 12): Promise<DashboardConferenceSummary> {
  const records = await fetchAdminDashboardRecords(months);
  const today = new Date();
  
  // Análise de prazos (removida lógica de entrega fora do prazo)
  const dueDateIssues = records
    .map(record => buildDueDateIssue(record, today))
    .filter((issue): issue is DashboardConferenceIssue => issue !== null)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Análise de obrigatoriedade de transmissão
  const transmissionObligationIssues = buildTransmissionObligationIssues(records, today)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Análise de lacunas de períodos
  const missingPeriodIssues = buildMissingPeriodIssues(records, today)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Análise de retificadoras sem original
  const retificadoraWithoutOriginalIssues = buildRetificadoraWithoutOriginalIssues(records, today)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Análise de duplicidades
  const duplicateDeclarationIssues = buildDuplicateDeclarationIssues(records, today)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Análise de períodos futuros
  const futurePeriodIssues = buildFuturePeriodIssues(records, today)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Análise de sequência de retificadoras
  const retificadoraSequenceIssues = buildRetificadoraSequenceIssues(records, today)
    .sort((a, b) => {
      if (a.severity === b.severity) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const severityRank = { high: 0, medium: 1, low: 2 };
      return severityRank[a.severity] - severityRank[b.severity];
    });

  // Lista SIMPLES de todas as declarações "sem movimento" (para o card informativo)
  // Filtro: tipo LIKE "sem movimento" (Original sem movimento, Retificadora sem movimento, etc.)
  const allSemMovimentoRecords: DashboardConferenceIssue[] = records
    .filter(record => {
      const declarationType = (record.declarationType ?? '').toLowerCase();
      return declarationType.includes('sem movimento');
    })
    .map(record => {
      const periodInfo = parsePeriod(record.period);
      const dueDate = periodInfo ? computeDueDate(periodInfo.year, periodInfo.month) : new Date();
      
      return {
        id: randomUUID(),
        rule: 'transmission_obligation' as const,
        identification: record.identification,
        businessName: record.businessName,
        period: record.period,
        dueDate: dueDate.toISOString(),
        transmissionDate: record.transmissionDate,
        status: record.status,
        severity: 'low' as const,
        message: `Declaração "${record.declarationType}" transmitida`,
        details: {
          declarationType: record.declarationType,
          situation: record.situation,
          isSemMovimento: true,
        },
      };
    });
  
  console.log('[Conference] 📋 Total de DCTFs "sem movimento" (todas):', allSemMovimentoRecords.length);
  console.log('[Conference] 📅 Períodos encontrados:', [...new Set(allSemMovimentoRecords.map(r => r.period))].sort());

  // Clientes sem DCTF na competência vigente (para monitoramento de obrigatoriedade futura)
  const clientesSemDCTF = await buildClientesSemDCTFVigente(records, today);

  return {
    generatedAt: new Date().toISOString(),
    rules: {
      dueDate: dueDateIssues,
      transmissionObligation: transmissionObligationIssues,
      missingPeriod: missingPeriodIssues,
      retificadoraWithoutOriginal: retificadoraWithoutOriginalIssues,
      duplicateDeclaration: duplicateDeclarationIssues,
      futurePeriod: futurePeriodIssues,
      retificadoraSequence: retificadoraSequenceIssues,
      allSemMovimento: allSemMovimentoRecords,  // ✅ Nova lista simples
      clientesSemDCTF: clientesSemDCTF,  // ✅ Clientes sem declaração na competência vigente
    },
  };
}
