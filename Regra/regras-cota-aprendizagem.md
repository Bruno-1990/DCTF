# Cota de Aprendizagem — Especificação de Regras para Sistema

> Base legal: CLT art. 429 (Lei nº 10.097/2000); Decreto nº 9.579/2018 (arts. 51 a 53); Instrução Normativa SIT/MTE nº 146/2018; Lei Complementar nº 123/2006, art. 3º (classificação ME/EPP e regra de perda de enquadramento).

---

## 1. Quem entra na categoria "Demais" (obrigadas à cota)

A obrigação de contratar aprendizes recai sobre **estabelecimentos de qualquer natureza** que não se enquadrem em nenhuma das isenções da seção 5. Na prática, isso corresponde às empresas classificadas como **"Demais"** — ou seja, fora dos limites de receita de ME/EPP.

### 1.1 Classificação por porte (LC 123/2006, art. 3º)

| Porte | Receita bruta anual |
|---|---|
| **ME** (Microempresa) | ≤ R$ 360.000,00 |
| **EPP** (Empresa de Pequeno Porte) | > R$ 360.000,00 e ≤ R$ 4.800.000,00 |
| **Demais** | > R$ 4.800.000,00 → **sujeita à cota de aprendizagem** |

- A classificação do ano corrente parte, em regra, da **receita bruta acumulada do ano anterior (RBAA)**.
- Além da receita, o art. 3º, §4º da LC 123/2006 traz **impedimentos societários** (ex.: participação de outra pessoa jurídica no capital, sócio com participação em outras empresas que somadas ultrapassem o limite, capital estrangeiro, etc.) que retiram a condição de ME/EPP **independentemente da receita**. Vale prever um campo de "impedimento societário" no cadastro, pois ele derruba a isenção mesmo com receita dentro do limite.

### 1.2 A margem interna ME → EPP (R$ 360.000,00) NÃO tem regra de aceleração de 20%

Existe sim um limite entre ME e EPP (R$ 360.000,00 — art. 3º, §7º da LC 123/2006), mas ele funciona de forma diferente do limite EPP → Demais:

- Se a **ME** ultrapassar R$ 360.000,00 no ano-calendário, ela passa à condição de **EPP** — mas o efeito **só vale a partir de 1º de janeiro do ano seguinte**, não importa o quanto foi ultrapassado. O §7º não tem cláusula de 20%/efeito imediato (diferente do §9º-A, que só existe para o teto de R$ 4,8 milhões).
- Isso é irrelevante para a cota de aprendizagem: a isenção da IN 146/2018 (art. 3º, I) vale **igualmente para ME e EPP**. Então a transição ME→EPP não muda a situação de isenção da empresa — ela continua isenta nos dois portes.
- **A regra de aceleração de 20% só existe no limite EPP → Demais (R$ 4.800.000,00)**, porque é aí que a empresa sai do regime diferenciado da LC 123 por completo — é esse, e só esse, limiar que deve disparar a mudança de obrigatoriedade da cota dentro do próprio ano no sistema.

| Transição | Gatilho | Quando produz efeito |
|---|---|---|
| ME → EPP | receita > R$ 360.000,00 (qualquer excesso) | sempre 1º/jan do ano seguinte — **sem regra de 20%** |
| EPP → Demais | receita > R$ 4.800.000,00 até 20% (≤ R$ 5,76 mi) | 1º/jan do ano seguinte |
| EPP → Demais | receita > R$ 4.800.000,00 acima de 20% (> R$ 5,76 mi) | mês seguinte ao excesso, **ainda no ano vigente** |

---

## 2. A regra dos 20% — mudança de enquadramento dentro do próprio ano

Esta é a regra que faz uma empresa deixar de ser EPP **ainda no ano-calendário vigente**, em vez de esperar o ano seguinte (LC 123/2006, art. 3º, §9º e §9º-A).

```
limite_EPP   = R$ 4.800.000,00
limite_20pct = limite_EPP * 1,20 = R$ 5.760.000,00

RBA = receita bruta acumulada no ano-calendário corrente (mês a mês)

SE RBA <= limite_EPP:
    empresa permanece EPP (ou ME, conforme faixa)

SE RBA > limite_EPP E RBA <= limite_20pct:
    # excesso de até 20% sobre o limite
    perda do enquadramento produz efeito só em 1º de janeiro do ano SEGUINTE
    → empresa permanece isenta da cota de aprendizagem até 31/12 do ano corrente

SE RBA > limite_20pct:
    # excesso maior que 20% sobre o limite
    perda do enquadramento é IMEDIATA
    → efeitos a partir do 1º dia do mês seguinte ao mês em que ocorreu o excesso
    → ainda dentro do ano-calendário corrente
    → empresa passa a "Demais" e a cota de aprendizagem passa a ser
      obrigatória a partir dessa mesma data (não espera o ano seguinte)
```

### Pontos de atenção
- O §9º da LC 123/2006 diz expressamente que a exclusão do tratamento diferenciado vale **"para todos os efeitos legais"** — não é regra só tributária. É esse dispositivo que sustenta aplicar o mesmo corte de data para a isenção da cota de aprendizagem, já que essa isenção (IN 146/2018, art. 3º) é definida em função do enquadramento ME/EPP da LC 123/2006.
- **Não confundir com o sublimite de R$ 3.600.000,00**: esse sublimite regula apenas a saída do recolhimento de ICMS/ISS de dentro do DAS (Simples Nacional) e **não afeta** a condição de ME/EPP nem a isenção da cota de aprendizagem.

### 2.1 O teto de EPP é o mesmo teto do Simples Nacional

Os R$ 4.800.000,00 do art. 3º, II definem quem **é** empresa de pequeno porte; o Simples Nacional é o regime **facultado** a quem tem essa condição (art. 12 c/c art. 3º). Um número, duas consequências — e daí três desdobramentos para o sistema:

1. **Ser optante do Simples é evidência independente de porte.** Se o cadastro diz "Simples Nacional" e a receita apurada passa de R$ 4,8 mi, um dos dois está errado: cadastro desatualizado (empresa já excluída) ou faturamento coletado do lugar errado (código SCI apontando para outra empresa). Sinalizar para conferência — **não** decidir o porte por isso.
2. **A recíproca não vale.** Estar fora do Simples não diz nada sobre o porte: a opção é facultativa e o art. 17 traz vedações que nada têm a ver com receita. Uma ME no Lucro Presumido é ME e segue isenta da cota — a isenção é por **porte**, não por regime.
3. O sublimite de R$ 3,6 mi não entra nesta conta (ver acima).

### 2.2 Impedimentos societários — o que derruba ME/EPP e o que não derruba

| Situação | Impede ME/EPP (art. 3º) | Impede o Simples (art. 17) |
|---|---|---|
| **Sócio pessoa jurídica** | **Sim** — §4º, I. Basta existir qualquer PJ no quadro, de qualquer natureza. Vedação "para nenhum efeito legal", não só tributária. | Sim, por consequência |
| Sócio domiciliado no exterior | Não. O art. 3º não veda por domicílio de sócio. | Sim — art. 17, II (só o **ingresso** no Simples) |
| **Consórcio** (natureza jurídica 215-1) | **Sim, e de forma absoluta** — não tem personalidade jurídica (Lei 6.404/76 art. 278 §1º) e não é sujeito do art. 3º. Ver 2.4. | Sim, por consequência |
| Sócio advogado / sociedade de advogados | Não. Não há vedação por sócio advogado, e a sociedade goza dos benefícios de ME/EPP dentro dos limites de receita — o que ela não consegue é o **enquadramento cadastral**, ver 2.3. | Não — advocacia está no Anexo IV (art. 18, §5º-C) |

Consequência para o sistema: **só o sócio PJ** entra como motivo de revisão do enquadramento. Sócio PJ *domiciliado no exterior* continua sendo acusado — mas pelo inciso I, porque é PJ, não por onde ela mora. Marcar exterior e advogado enchia a fila do jurídico com casos que a lei não questiona.
- A isenção da cota de aprendizagem vale para ME/EPP **optante ou não pelo Simples Nacional** — ou seja, a isenção é por **porte de receita**, não por regime tributário. Uma EPP no Lucro Presumido, por exemplo, continua isenta.
- Empresa em início de atividade tem limite proporcional (ano civil incompleto) — vale sinalizar esse caso à parte se o sistema precisar tratar empresas recém-abertas.
- Como essa extensão da regra do art. 3º §9º/§9º-A para o campo trabalhista é uma construção por analogia (a IN 146/2018 não repete literalmente a data de corte, ela só remete à condição de ME/EPP da LC 123), recomenda-se validação com o jurídico/compliance antes de automatizar a mudança de obrigatoriedade no meio do ano com efeitos de autuação.

### 2.3 Sociedade de advogados — porte "Demais" obrigatório no CNPJ, benefícios de ME/EPP preservados

Sociedade de advogados **nunca** consta como ME ou EPP no cadastro da Receita, por mais baixo que seja o faturamento. Não é cadastro atrasado: é o resultado de três normas encadeadas.

| Norma | O que diz | Impacto |
|---|---|---|
| **Lei 8.906/94 (Estatuto da Advocacia), art. 16** | Veda à sociedade de advogados adotar forma ou característica mercantil. | O registro dos atos constitutivos é feito **exclusivamente no Conselho Seccional da OAB** (art. 15, §1º) — não passa por Junta Comercial nem pelo Registro Civil de Pessoas Jurídicas. |
| **LC 123/2006, art. 3º** | Vincula o enquadramento formal como ME/EPP a quem está inscrito no Registro de Empresas Mercantis **ou** no RCPJ. | A OAB não é nenhum dos dois. Sem órgão de registro que comunique o enquadramento, o sistema cadastral da Receita classifica o porte como **"Demais"**, e as siglas ME/EPP não podem entrar no nome empresarial. |
| **Código Civil, art. 966, parágrafo único** | Exercício de profissão intelectual e de natureza científica não constitui atividade empresária. | Reforça o caráter civil, e não mercantil, do escritório — fechando a porta da Junta Comercial pelo outro lado. |

**A restrição é cadastral e de nomenclatura, não de direito.** O escritório pode aderir ao Simples Nacional (advocacia está no Anexo IV — LC 123, art. 18, §5º-C) e usufrui das mesmas alíquotas e benefícios de ME/EPP, respeitados os limites de receita do art. 3º.

**Consequência para a cota de aprendizagem:** nenhuma mudança no cálculo. A isenção da IN 146/2018, art. 3º, I alcança quem **é** ME/EPP — a condição, não a anotação cadastral —, e o motor sempre classificou pela receita bruta apurada, nunca pelo porte do CNPJ. Estas empresas já saíam isentas antes de a distinção existir.

**O que muda é a leitura da divergência.** Quando o cadastro diz "Demais" e a receita apurada diz ME/EPP, o sistema classifica a discordância em três casos:

| Caso | Situação | Leitura |
|---|---|---|
| `DESENQUADRAR` | Consta ME/EPP na Receita, receita apurada de Demais | **Crítico** — muda a conclusão sobre a cota. Ou o desenquadramento não foi pedido, ou o faturamento veio do código SCI errado. Confirmar no cartão CNPJ. |
| `REENQUADRAR` | Consta Demais, receita caberia em ME/EPP | Sinaliza sem alarme — pode ser reenquadramento nunca pedido. Não muda a cota. |
| `REGISTRO_OAB` | O mesmo, numa **sociedade de advogados** | **Não é pendência.** O "Demais" é permanente e correto; não há reenquadramento a protocolar. |

Sem essa terceira leitura, a tela mandava o Fiscal atrás de um pedido que a lei não permite fazer.

**Detecção (`ehSociedadeDeAdvogados`, em `src/services/cotaAprendizagem.rules.ts`):** exige natureza jurídica **não empresária** — "Sociedade Simples" ou "Sociedade Unipessoal de Advocacia" — junto com a atividade principal de **serviços advocatícios (CNAE 69.11-7/01)**. A razão social não conta, e a exigência dupla tem motivo concreto na carteira: há cliente com "ADVOGADOS" no nome e CNAE 69.11-7 que é Sociedade Empresária Limitada com atividade de agente de propriedade industrial (69.11-7/03) — essa registra na Junta e consta EPP normalmente. Sem natureza jurídica no cadastro, a função devolve `false`: na dúvida, o sinal não é suprimido.

---

### 2.4 Consórcio — fora do regime, não "acima do teto"

**Consórcio não pode ser ME nem EPP, por receita nenhuma.** É o inverso do caso da seção 2.3: a sociedade de advogados *é* ME/EPP em substância e só não consegue a anotação no cadastro; o consórcio não é ME/EPP nem em substância.

| Norma | O que diz | Impacto |
|---|---|---|
| **Lei 6.404/76, art. 278, §1º** | "O consórcio não tem personalidade jurídica e as consorciadas somente se obrigam nas condições previstas no respectivo contrato." | Não é sociedade nem empresário: é união contratual entre empresas **que já existem**, para executar um empreendimento específico (arts. 278 e 279). |
| **LC 123/2006, art. 3º** | Alcança a sociedade empresária, a sociedade simples, a EIRELI e o empresário do art. 966 do CC, registrados no Registro de Empresas Mercantis ou no RCPJ. | O consórcio não é nenhum desses sujeitos e não está em nenhum desses registros — logo, **não há faixa de receita que o enquadre**. |
| **LC 123/2006, art. 3º, §4º, I** | Veda o enquadramento quando há pessoa jurídica no capital. | Chega à mesma conclusão pelo outro caminho: o quadro do consórcio é todo de PJs. |

**Consequência para a cota:** sem enquadramento diferenciado, a isenção do art. 3º, I da IN 146/2018 não alcança. O motor classifica o consórcio como **Demais** com motivo próprio (`SEM_PERSONALIDADE`), e não pela receita.

**Por que isto DECIDE, e o sócio PJ apenas sinaliza.** O quadro societário vem de um retrato do cartão CNPJ que pode estar meses desatualizado — daí a suspeita de sócio PJ só ligar `revisar_juridico` sem mudar o porte. A natureza jurídica não é retrato: é o que a empresa **é**, e um consórcio não vira sociedade no mês seguinte.

**O que isso corrigiu.** O consórcio da carteira tem receita zerada no SCI, e receita zerada classificava como **ME**. Ele não saiu como "isenta" por sorte: o sócio PJ derrubou a conclusão para indefinida. Ou seja, o que impedia a tela de afirmar uma isenção juridicamente impossível era um sinal acessório, que depende de a tabela de sócios estar preenchida — com o quadro vazio, a mesma linha diria "ME, isenta".

**Detecção** (`ehConsorcio`, em `src/services/cotaAprendizagem.rules.ts`): natureza jurídica contendo "consórcio", com ou sem acento — cobre a 215-1 (Consórcio de Sociedades) e as naturezas de consórcio público. Motor 1.2.0.

> **Adjacente, ainda não tratado:** "Grupo de Sociedades" (216-0, arts. 265 a 277 da mesma lei) também é união sem personalidade própria. Não há cliente com essa natureza na carteira; se aparecer, a regra provavelmente deve alcançá-lo.

---
## 3. Cálculo da cota (para empresas "Demais")

### 3.1 Base de cálculo
Empregados do estabelecimento cujas **funções demandem formação profissional**, conforme a Classificação Brasileira de Ocupações (CBO).

**Excluir da base:**
- funções que exijam, por lei, habilitação técnica de nível médio ou superior;
- cargos de direção, gerência ou confiança (art. 62, II e art. 224, §2º da CLT);
- trabalhadores temporários (Lei nº 6.019/1974);
- aprendizes já contratados.

### 3.2 Piso de aplicabilidade
Só existe obrigatoriedade se o estabelecimento tiver **no mínimo 7 empregados** nas funções que compõem a base de cálculo (IN 146/2018, art. 2º, §1º). Abaixo disso, não há cota mínima exigível.

### 3.3 Percentual e arredondamento
```
minimo = base_calculo * 5%
maximo = base_calculo * 15%

# toda fração é arredondada PARA CIMA (tanto no piso quanto no teto)
minimo_aprendizes = ceil(minimo)
maximo_aprendizes = ceil(maximo)
```
Exemplo: base de cálculo = 170 → mínimo 8,5 → **9 aprendizes**; máximo 25,5 → **26 aprendizes**.

### 3.4 Unidade de apuração
- A cota é apurada **por estabelecimento** (CNPJ/filial).
- Estabelecimentos da mesma empresa na mesma UF podem consolidar a cota, elegendo um ou mais estabelecimentos para concentrar a contratação, desde que o total de aprendizes contratados corresponda a pelo menos **150%** da soma das cotas mínimas de todos os estabelecimentos envolvidos.
- A cota considera a **média** de trabalhadores elegíveis num período de referência definido por ato do Ministério do Trabalho — ou seja, o sistema deve calcular sobre uma janela/média móvel, não sobre uma foto de um único dia.

---

## 4. Isenções (quem NÃO cumpre a cota) — IN 146/2018, art. 3º

1. **ME e EPP**, optantes ou não pelo Simples Nacional.
2. **Entidades sem fins lucrativos** com objetivo de educação profissional na modalidade aprendizagem, inscritas no Cadastro Nacional de Aprendizagem (CNA) com curso validado.

Para comprovar o enquadramento ME/EPP em fiscalização, a empresa deve demonstrar os dois requisitos do art. 3º da LC 123/2006: (i) faixa de receita bruta e (ii) ausência dos impedimentos societários do §4º.

---

## 5. Penalidades

Descumprimento sujeita a autuação com base no art. 434 da CLT, lavrada por Auditor-Fiscal do Trabalho, seguindo o rito da IN 146/2018 (arts. 30 a 34): notificação prévia para apresentação de documentos (NAD) → prazo para comprovar regularidade → auto de infração em caso de não regularização, com apuração do número de empregados em situação irregular (aprendizes que faltaram para atingir a cota mínima).

---

## 6. Campos e engine sugeridos para o sistema

**Cadastro por empresa/estabelecimento:**
- CNPJ / UF / estabelecimento
- RBAA (receita bruta acumulada do ano anterior)
- RBA (receita bruta acumulada do ano corrente, atualizada mês a mês)
- Data do mês em que a RBA excedeu R$ 4.800.000,00 (se houver)
- Flag `impedimento_societario` (bool)
- Situação no Simples Nacional (informativo — **não** determina isenção sozinho)
- Nº de empregados na base de cálculo (funções CBO elegíveis), por período

**Engine de classificação (roda mensalmente sobre a RBA):**
```
def classificar(RBAA, RBA_atual, impedimento_societario):
    if impedimento_societario:
        return "DEMAIS"
    if RBAA <= 360_000:
        porte_ano = "ME"
    elif RBAA <= 4_800_000:
        porte_ano = "EPP"
    else:
        porte_ano = "DEMAIS"

    if RBA_atual > 5_760_000:
        return "DEMAIS"          # efeito imediato, mês seguinte ao excesso
    elif RBA_atual > 4_800_000:
        return porte_ano          # mantém até 31/12; "DEMAIS" só em 1º/jan seguinte
    else:
        return porte_ano
```

**Engine de cota (roda para quem for "DEMAIS"):**
```
def cota_aprendizes(base_calculo):
    if base_calculo < 7:
        return {"obrigatoria": False}
    return {
        "obrigatoria": True,
        "minimo": ceil(base_calculo * 0.05),
        "maximo": ceil(base_calculo * 0.15),
    }
```

---

*Documento de referência para implementação — recomenda-se revisão pelo jurídico/compliance do escritório antes de automatizar decisões de autuação ou de mudança de obrigatoriedade dentro do ano-calendário.*
