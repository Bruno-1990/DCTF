export type ConferenceIssueSeverity = 'low' | 'medium' | 'high';

export interface ConferenceIssue {
  id: string;
  rule: 'due_date' | 'transmission_obligation' | 'missing_period' | 'retificadora_without_original' | 'duplicate_declaration' | 'future_period' | 'retificadora_sequence' | 'missing_declaration';
  identification: string;
  businessName?: string;
  period: string;
  dueDate: string;
  transmissionDate?: string;
  status?: string;
  severity: ConferenceIssueSeverity;
  daysLate?: number;
  message: string;
  details?: Record<string, any>;
  actionPlan?: string;
}

export interface ConferenceSummary {
  generatedAt: string;
  rules: {
    dueDate: ConferenceIssue[];
    transmissionObligation?: ConferenceIssue[];
    allSemMovimento?: ConferenceIssue[];
    missingPeriod?: ConferenceIssue[];
    duplicateDeclaration?: ConferenceIssue[];
    futurePeriod?: ConferenceIssue[];
    retificadoraSequence?: ConferenceIssue[];
    clientesSemDCTF?: ConferenceIssue[];  // ✅ Clientes sem DCTF na competência vigente
  };
}

export async function fetchConferenceSummary(months?: number): Promise<ConferenceSummary> {
  const params = new URLSearchParams();
  if (months && Number.isFinite(months)) {
    params.set('months', String(months));
  }

  const query = params.toString();
  const url = query ? `/api/dashboard/admin/conferences/summary?${query}` : '/api/dashboard/admin/conferences/summary';
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error || errorData.message || `Erro ${response.status}: ${response.statusText}`;
      throw new Error(errorMessage);
    }
    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Erro ao conectar com o servidor. Verifique se o backend está rodando.');
  }
}

