import axios from 'axios';
import { FontePlanilhaService, PORTAL_PAGINA } from '../../src/services/FontePlanilhaService';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Este service raspa HTML de terceiro — é a peça mais frágil da feature. Os
 * testes fixam o contrato observado no portal em 07/2026 e, principalmente,
 * garantem que qualquer desvio degrada para o link da página em vez de
 * derrubar a tela de importação.
 */

/** Fragmento real devolvido por ObterFilhos/341 (conferido em 07/2026). */
const FRAGMENTO_COMPETE = `
        <li>
            <a target="_blank" href="/Comum/IncentivosFiscais/Download/547">
                Programa Compete - ES - Ativos em 07.2026
            </a>
        </li>
        <li>
            <a target="_blank" href="/Comum/IncentivosFiscais/Download/548">
                Programa Compete - ES - Excluidos_cancelados em 07.2026
            </a>
        </li>
`;

const FRAGMENTO_INVEST = `
        <li>
            <a target="_blank" href="/Comum/IncentivosFiscais/Download/550">
                Programa Invest - ES - Ativos em 07.2026
            </a>
        </li>
        <li>
            <a target="_blank" href="/Comum/IncentivosFiscais/Download/549">
                Programa Invest - ES - Excluidos_cancelados em 07.2026
            </a>
        </li>
`;

describe('FontePlanilhaService', () => {
  let service: FontePlanilhaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FontePlanilhaService();
  });

  describe('resolve o arquivo vigente', () => {
    it('Compete: pega o "Ativos" da seção 04 e monta a URL absoluta', async () => {
      mockedAxios.get.mockResolvedValue({ data: FRAGMENTO_COMPETE });

      const fonte = await service.obter('compete');

      expect(fonte.arquivoUrl).toBe('https://transparencia.es.gov.br/Comum/IncentivosFiscais/Download/547');
      expect(fonte.arquivoLabel).toBe('Programa Compete - ES - Ativos em 07.2026');
      expect(fonte.secao).toBe('04');
      expect(fonte.erro).toBeNull();
    });

    it('Invest: pega o "Ativos" da seção 05', async () => {
      mockedAxios.get.mockResolvedValue({ data: FRAGMENTO_INVEST });

      const fonte = await service.obter('invest');

      expect(fonte.arquivoUrl).toBe('https://transparencia.es.gov.br/Comum/IncentivosFiscais/Download/550');
      expect(fonte.arquivoLabel).toBe('Programa Invest - ES - Ativos em 07.2026');
      expect(fonte.secao).toBe('05');
    });

    it('consulta a seção certa de cada programa', async () => {
      mockedAxios.get.mockResolvedValue({ data: FRAGMENTO_COMPETE });
      await service.obter('compete');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${PORTAL_PAGINA}/ObterFilhos/341?NivelAnterior=0`,
        expect.objectContaining({ timeout: expect.any(Number) })
      );

      mockedAxios.get.mockResolvedValue({ data: FRAGMENTO_INVEST });
      await service.obter('invest');
      expect(mockedAxios.get).toHaveBeenLastCalledWith(
        `${PORTAL_PAGINA}/ObterFilhos/240?NivelAnterior=0`,
        expect.objectContaining({ timeout: expect.any(Number) })
      );
    });

    it('NUNCA devolve o arquivo de excluídos/cancelados', async () => {
      const fonte = await (async () => {
        mockedAxios.get.mockResolvedValue({ data: FRAGMENTO_COMPETE });
        return service.obter('compete');
      })();

      expect(fonte.arquivoUrl).not.toContain('548');
      expect(fonte.arquivoLabel).not.toMatch(/exclu|cancel/i);
    });

    it('casa por rótulo, não por posição — o portal pode inverter a ordem', async () => {
      const invertido = `
        <li><a href="/Comum/IncentivosFiscais/Download/548">Programa Compete - ES - Excluidos_cancelados em 07.2026</a></li>
        <li><a href="/Comum/IncentivosFiscais/Download/547">Programa Compete - ES - Ativos em 07.2026</a></li>
      `;
      mockedAxios.get.mockResolvedValue({ data: invertido });

      const fonte = await service.obter('compete');

      expect(fonte.arquivoUrl).toContain('547');
      expect(fonte.arquivoLabel).toBe('Programa Compete - ES - Ativos em 07.2026');
    });

    it('acompanha a virada do mês sem mudança de código', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<li><a href="/Comum/IncentivosFiscais/Download/612">Programa Compete - ES - Ativos em 08.2026</a></li>',
      });

      const fonte = await service.obter('compete');

      expect(fonte.arquivoUrl).toContain('612');
      expect(fonte.arquivoLabel).toContain('08.2026');
    });
  });

  describe('degrada sem quebrar', () => {
    it('portal fora do ar: devolve o link da página, não lança', async () => {
      mockedAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));

      const fonte = await service.obter('compete');

      expect(fonte.arquivoUrl).toBeNull();
      expect(fonte.portalUrl).toBe(PORTAL_PAGINA);
      expect(fonte.erro).toContain('ETIMEDOUT');
      expect(fonte.secao).toBe('04');
    });

    it('HTML mudou de forma: devolve o link da página com o motivo', async () => {
      mockedAxios.get.mockResolvedValue({ data: '<div>portal redesenhado, sem links</div>' });

      const fonte = await service.obter('compete');

      expect(fonte.arquivoUrl).toBeNull();
      expect(fonte.erro).toMatch(/não encontrei/i);
    });

    it('só sobrou o arquivo de excluídos: não serve, degrada', async () => {
      mockedAxios.get.mockResolvedValue({
        data: '<li><a href="/Comum/IncentivosFiscais/Download/548">Programa Compete - ES - Excluidos_cancelados em 07.2026</a></li>',
      });

      const fonte = await service.obter('compete');

      expect(fonte.arquivoUrl).toBeNull();
    });

    it('resposta vazia: degrada', async () => {
      mockedAxios.get.mockResolvedValue({ data: '' });

      const fonte = await service.obter('invest');

      expect(fonte.arquivoUrl).toBeNull();
      expect(fonte.portalUrl).toBe(PORTAL_PAGINA);
    });
  });
});
