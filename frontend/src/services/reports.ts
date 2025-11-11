export interface ReportFilters {
  months?: number;
  period?: string;
  identification?: string;
  logoUrl?: string;
  responsible?: string;
  notes?: string;
}

export async function fetchGerencialReportPdf(filters: ReportFilters = {}): Promise<Blob> {
  const params = new URLSearchParams();
  if (filters.months && Number.isFinite(filters.months)) {
    params.set('months', String(filters.months));
  }
  if (filters.period) {
    params.set('period', filters.period);
  }
  if (filters.identification) {
    params.set('identification', filters.identification);
  }
  if (filters.logoUrl) {
    params.set('logoUrl', filters.logoUrl);
  }
  if (filters.responsible) {
    params.set('responsible', filters.responsible);
  }
  if (filters.notes) {
    params.set('notes', filters.notes);
  }

  const query = Array.from(params.keys()).length > 0 ? `?${params.toString()}` : '';
  const url = `/api/dashboard/admin/reports/gerencial.pdf${query}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/pdf',
    },
  });

  if (!response.ok) {
    throw new Error('Falha ao gerar relatório PDF.');
  }

  return response.blob();
}
