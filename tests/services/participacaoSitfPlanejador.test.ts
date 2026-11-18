import {
  limparNomeSocio,
  planejarParticipacao,
  type SocioCadastro,
  type SocioSitf,
} from '../../src/services/participacaoSitf/planejador';

const cad = (p: Partial<SocioCadastro> & { id: string; nome: string }): SocioCadastro => ({
  cpf: null,
  qual: null,
  participacao_percentual: null,
  ...p,
});

describe('limparNomeSocio', () => {
  it('corta o resto do relatório que a extração cola no último sócio', () => {
    const sujo =
      'MAURICIO EXEMPLO FRAGA Certid�o Emitida ______________ CNPJ: 12.345.678/0001-95 Certid�o Positiva';
    expect(limparNomeSocio(sujo)).toBe('MAURICIO EXEMPLO FRAGA');
  });

  it('corta em sublinhados, "CNPJ:" ou "Diagnóstico" mesmo sem a palavra Certidão', () => {
    expect(limparNomeSocio('ANA EXEMPLO ____ Final do Relatório')).toBe('ANA EXEMPLO');
    expect(limparNomeSocio('ANA EXEMPLO CNPJ: 12.345.678/0001-95')).toBe('ANA EXEMPLO');
    expect(limparNomeSocio('ANA EXEMPLO Diagnóstico Fiscal')).toBe('ANA EXEMPLO');
  });

  it('tira o "SOCIEDADE CONSORCIADA <situação>" que a extração mete no nome da consorciada', () => {
    expect(limparNomeSocio('CINCO EXEMPLO CONSTRUTORA E SOCIEDADE CONSORCIADA ATIVA INCORPORADORA LTDA')).toBe(
      'CINCO EXEMPLO CONSTRUTORA E INCORPORADORA LTDA',
    );
    expect(limparNomeSocio('RR EXEMPLO ENGENHARIA LTDA SOCIEDADE CONSORCIADA ATIVA')).toBe('RR EXEMPLO ENGENHARIA LTDA');
  });

  it('tira a qualificação/situação que a extração cola no fim do nome', () => {
    expect(limparNomeSocio('EXEMPLO CORP. PESSOA JURÍDICA ATIVA DOMICILIADO NO EXTERIOR')).toBe('EXEMPLO CORP.');
    expect(limparNomeSocio('FULANO EXEMPLO PESSOA F�SICA RESIDENTE OU DOMICILIADO NO EXTERIOR')).toBe('FULANO EXEMPLO');
    expect(limparNomeSocio('FULANO EXEMPLO SEM CAPITAL')).toBe('FULANO EXEMPLO');
    expect(limparNomeSocio('FULANO EXEMPLO TITULAR FALECIDO')).toBe('FULANO EXEMPLO');
    expect(limparNomeSocio('FULANO EXEMPLO DIRETOR')).toBe('FULANO EXEMPLO');
    expect(limparNomeSocio('FULANO EXEMPLO PRESIDENTE')).toBe('FULANO EXEMPLO');
  });

  it('junta espaços e mantém o nome limpo como está', () => {
    expect(limparNomeSocio('  JOSE   DA  SILVA ')).toBe('JOSE DA SILVA');
    expect(limparNomeSocio('')).toBe('');
    expect(limparNomeSocio(null)).toBe('');
  });
});

describe('planejarParticipacao', () => {
  it('casa pelo CPF e atualiza o percentual que mudou', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '111.111.111-11', participacao_percentual: 50 })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 60 }],
    );
    expect(plano.mudancas).toEqual([
      expect.objectContaining({ socioId: 'a', percentual: { de: 50, para: 60 } }),
    ]);
    expect(plano.mudancas[0].cpf).toBeUndefined();
  });

  it('não gera mudança quando tudo já bate', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 50 })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 50.0 }],
    );
    expect(plano.mudancas).toEqual([]);
  });

  it('casa pelo nome quando o cadastro não tem CPF e preenche o CPF', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'José Exemplo', participacao_percentual: null })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100 }],
    );
    expect(plano.mudancas).toEqual([
      expect.objectContaining({
        socioId: 'a',
        cpf: { de: null, para: '11111111111' },
        percentual: { de: null, para: 100 },
      }),
    ]);
  });

  it('não confunde pai e filho ("FULANO" e "FULANO FILHO")', () => {
    const plano = planejarParticipacao(
      [
        cad({ id: 'pai', nome: 'SILVESTRE EXEMPLO COUTO' }),
        cad({ id: 'filho', nome: 'SILVESTRE EXEMPLO COUTO FILHO' }),
      ],
      [
        { nome: 'SILVESTRE EXEMPLO COUTO FILHO', cpf: null, participacao_percentual: 2.4 },
        { nome: 'SILVESTRE EXEMPLO COUTO', cpf: null, participacao_percentual: 1 },
      ],
    );
    const porId = Object.fromEntries(plano.mudancas.map((m) => [m.socioId, m.percentual?.para]));
    expect(porId).toEqual({ pai: 1, filho: 2.4 });
  });

  it('nome sem CPF que casa com mais de um sócio fica de fora, como ambíguo', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'MARIA EXEMPLO' }), cad({ id: 'b', nome: 'MARIA  EXEMPLO' })],
      [{ nome: 'MARIA EXEMPLO', cpf: null, participacao_percentual: 50 }],
    );
    expect(plano.mudancas).toEqual([]);
    expect(plano.ambiguos).toEqual(['MARIA EXEMPLO']);
  });

  it('CPF diferente do cadastro, casado pelo nome, não sobrescreve: vira conflito', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '22222222222', participacao_percentual: 50 })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 60 }],
    );
    expect(plano.mudancas).toEqual([]);
    expect(plano.conflitos).toEqual([
      expect.objectContaining({ socioId: 'a', cpfCadastro: '22222222222', cpfSitf: '11111111111' }),
    ]);
  });

  it('percentual ausente na SITF preserva o do cadastro', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 30 })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: null }],
    );
    expect(plano.mudancas).toEqual([]);
  });

  it('quadro da SITF completo (100%): quem entrou vira entrada e quem saiu vira saída', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 50 }), cad({ id: 'b', nome: 'SAIU EXEMPLO' })],
      [
        { nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 50 },
        { nome: 'ENTROU EXEMPLO', cpf: '33333333333', participacao_percentual: 50 },
      ],
    );
    expect(plano.entradas).toEqual([{ nome: 'ENTROU EXEMPLO', cpf: '33333333333', participacao_percentual: 50, qual: 'Sócio' }]);
    expect(plano.saidas).toEqual([{ socioId: 'b', nome: 'SAIU EXEMPLO' }]);
    expect(plano.soNaSitf).toEqual([]);
    expect(plano.soNoCadastro).toEqual([]);
  });

  it('caso real: sócio saiu e a que ficou passou a 100% (somava 150%)', () => {
    const plano = planejarParticipacao(
      [
        cad({ id: 'i', nome: 'PAI EXEMPLO', cpf: '01233172662', participacao_percentual: 50 }),
        cad({ id: 's', nome: 'MAE EXEMPLO', cpf: '04487717647', participacao_percentual: 100 }),
      ],
      [{ nome: 'MAE EXEMPLO Certidão Emitida ____ CNPJ: 12.345.678/0001-95', cpf: '04487717647', participacao_percentual: 100 }],
    );
    expect(plano.saidas).toEqual([{ socioId: 'i', nome: 'PAI EXEMPLO' }]);
    expect(plano.mudancas).toEqual([]);
  });

  it('quadro incompleto (soma diferente de 100%): não cria nem marca saída, só lista', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'b', nome: 'SAIU EXEMPLO' })],
      [{ nome: 'ENTROU EXEMPLO', cpf: '33333333333', participacao_percentual: 60 }],
    );
    expect(plano.entradas).toEqual([]);
    expect(plano.saidas).toEqual([]);
    expect(plano.soNaSitf).toHaveLength(1);
    expect(plano.soNoCadastro).toEqual([{ socioId: 'b', nome: 'SAIU EXEMPLO' }]);
  });

  it('com nome ambíguo ou conflito de CPF, nada entra nem sai', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '99999999999' }), cad({ id: 'b', nome: 'SAIU EXEMPLO' })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100 }],
    );
    expect(plano.conflitos).toHaveLength(1);
    expect(plano.saidas).toEqual([]);
    expect(plano.soNoCadastro).toEqual([{ socioId: 'b', nome: 'SAIU EXEMPLO' }]);
  });

  it('sócio da SITF sem CPF/CNPJ válido não é criado (fica só listado)', () => {
    const plano = planejarParticipacao(
      [],
      [
        { nome: 'COM DOC EXEMPLO', cpf: '33333333333', participacao_percentual: 100 },
        { nome: 'SEM DOC EXEMPLO', cpf: null, participacao_percentual: null },
      ],
    );
    expect(plano.entradas.map((e) => e.nome)).toEqual(['COM DOC EXEMPLO']);
    expect(plano.soNaSitf.map((e) => e.nome)).toEqual(['SEM DOC EXEMPLO']);
  });

  it('administrador sem capital entra com participação vazia', () => {
    const plano = planejarParticipacao(
      [],
      [
        { nome: 'DONA EXEMPLO', cpf: '33333333333', participacao_percentual: 100 },
        { nome: 'ADMIN EXEMPLO', cpf: '44444444444', participacao_percentual: null },
      ],
    );
    expect(plano.entradas).toContainEqual({ nome: 'ADMIN EXEMPLO', cpf: '44444444444', participacao_percentual: null, qual: 'Sem capital' });
  });

  it('usa a qualificação da SITF quando ela vem', () => {
    const plano = planejarParticipacao([], [{ nome: 'ANA EXEMPLO', cpf: '44444444444', participacao_percentual: 100, qualificacao: 'SÓCIO-ADMINISTRADOR' }]);
    expect(plano.entradas[0].qual).toBe('SÓCIO-ADMINISTRADOR');
  });

  it('quem já está marcado como fora do quadro não vira saída de novo', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100 }), cad({ id: 'b', nome: 'SAIU EXEMPLO', ausente_no_cartao: 1 })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100 }],
    );
    expect(plano.saidas).toEqual([]);
    expect(plano.soNoCadastro).toEqual([]);
    expect(plano.mudancas).toEqual([]);
  });

  it('sócio marcado como fora do quadro que voltou na SITF é reativado', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100, ausente_no_cartao: 1 })],
      [{ nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100 }],
    );
    expect(plano.mudancas).toEqual([{ socioId: 'a', nome: 'JOSE EXEMPLO', casadoPor: 'cpf', volta: true }]);
  });

  it('ignora as linhas do responsável/contratante que a extração às vezes traz como sócio', () => {
    const plano = planejarParticipacao(
      [cad({ id: 'a', nome: 'JOSE EXEMPLO', cpf: '11111111111' })],
      [
        { nome: 'JOSE EXEMPLO', cpf: '11111111111', participacao_percentual: 100 },
        { nome: 'Qualif. Resp.: ADMINISTRADOR', cpf: null, participacao_percentual: null },
        { nome: 'CONTRATANTE: 32.401.481/0001-33', cpf: null, participacao_percentual: null },
        { nome: 'QUADRO SOCIETÁRIO NÃO OBRIGATÓRIO POR SUA NATUREZA JURÍDICA', cpf: null, participacao_percentual: null },
      ],
    );
    expect(plano.soNaSitf).toEqual([]);
  });

  it('avisa quando a soma dos percentuais da SITF não fecha 100%', () => {
    const sitf: SocioSitf[] = [
      { nome: 'A EXEMPLO', cpf: '11111111111', participacao_percentual: 50 },
      { nome: 'B EXEMPLO', cpf: '22222222222', participacao_percentual: 30 },
    ];
    expect(planejarParticipacao([], sitf).somaSitf).toBe(80);
    expect(planejarParticipacao([], sitf).alertas).toContain('A soma dos percentuais na Situação Fiscal é 80%, não 100%.');
  });

  it('usa o nome limpo nas listas (sem o lixo do relatório)', () => {
    const plano = planejarParticipacao([], [
      { nome: 'ANA EXEMPLO Certidão Emitida ____ CNPJ: 12.345.678/0001-95', cpf: '44444444444', participacao_percentual: 100 },
    ]);
    expect(plano.entradas[0].nome).toBe('ANA EXEMPLO');
  });
});
