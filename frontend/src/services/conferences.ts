export type ConferenceIssueSeverity = 'low' | 'medium' | 'high';

export interface ConferenceIssue {
  id: string;
  rule: 'due_date';
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
}

export interface ConferenceSummary {
  generatedAt: string;
  rules: {
    dueDate: ConferenceIssue[];
  };
}

export async function fetchConferenceSummary(months?: number): Promise<ConferenceSummary> {
  const params = new URLSearchParams();
  if (months && Number.isFinite(months)) {
    params.set('months', String(months));
  }

  const query = params.toString();
  const url = query ? `/api/dashboard/admin/conferences/summary?${query}` : '/api/dashboard/admin/conferences/summary';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Não foi possível carregar a conferência.');
  }
  return response.json();
}
