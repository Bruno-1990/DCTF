# Proposta: Timeline de DCTF por Cliente

## 📊 Objetivo
Criar uma visualização moderna e intuitiva que mostre a linha do tempo de declarações DCTF de um cliente, exibindo:
- Períodos (meses)
- Valores (débito apurado, saldo a pagar)
- Status (zerado, sem movimento, não enviada, enviada, etc.)
- Tipo de declaração (Original, Retificadora, etc.)

## 🎨 Opções de Design

### Opção 1: Timeline Horizontal com Scroll (⭐ RECOMENDADA)
**Características:**
- Timeline horizontal com scroll suave
- Cada mês é um card/barra colorida
- Cores diferentes para cada status:
  - 🟢 Verde: Enviada e concluída
  - 🟡 Amarelo: Pendente/Processando
  - 🔴 Vermelho: Erro/Não enviada
  - ⚪ Cinza: Sem movimento
  - 🔵 Azul: Zerada
- Tooltip ao hover com detalhes completos
- Indicadores visuais (ícones) para tipo de declaração
- Valores exibidos dentro ou abaixo de cada card
- Filtros por status no topo
- Zoom in/out para ajustar período visualizado

**Vantagens:**
- Visual moderno e intuitivo
- Fácil de entender a sequência temporal
- Permite ver muitos períodos de uma vez
- Responsivo e acessível

### Opção 2: Timeline Vertical Estilo GitHub
**Características:**
- Linha vertical no centro
- Cards à esquerda e direita alternados
- Cada card mostra mês, valor e status
- Cores por status
- Scroll vertical

**Vantagens:**
- Visual elegante
- Boa para mobile
- Fácil de ler detalhes

**Desvantagens:**
- Ocupa mais espaço vertical
- Menos períodos visíveis de uma vez

### Opção 3: Grid/Calendário
**Características:**
- Grid de meses (ex: 12 meses por linha)
- Cada célula é um card colorido
- Hover mostra detalhes
- Filtros por ano

**Vantagens:**
- Visual compacto
- Fácil ver padrões anuais
- Boa para análise de tendências

**Desvantagens:**
- Menos intuitivo para sequência temporal
- Pode ficar apertado com muitos dados

### Opção 4: Gantt Chart Style
**Características:**
- Barras horizontais por período
- Cores por status
- Valores como labels nas barras
- Zoom e pan

**Vantagens:**
- Visual profissional
- Boa para análise de prazos
- Fácil comparar períodos

**Desvantagens:**
- Pode ser complexo para usuários não técnicos
- Requer mais espaço

## 🎯 Recomendação: Opção 1 (Timeline Horizontal)

### Implementação Proposta

#### Componente: `ClienteTimeline.tsx`

**Estrutura:**
```typescript
interface TimelineMonth {
  periodo: string; // "2024-01"
  mes: string; // "Jan/2024"
  dctf?: DCTFListItem;
  status: 'enviada' | 'pendente' | 'erro' | 'sem-movimento' | 'zerada' | 'nao-enviada';
  valor?: number;
  saldoAPagar?: number;
  tipoDeclaracao?: string;
  dataTransmissao?: string;
}

interface ClienteTimelineProps {
  clienteId: string;
  clienteNome: string;
  periodoInicio?: string; // "2024-01"
  periodoFim?: string; // "2024-12"
}
```

**Features:**
1. **Cards de Mês:**
   - Cor de fundo baseada no status
   - Ícone indicando tipo (Original, Retificadora, etc.)
   - Valor exibido em destaque
   - Badge de status
   - Hover mostra tooltip com detalhes completos

2. **Cores por Status:**
   - 🟢 `enviada`: Verde claro (#10B981)
   - 🟡 `pendente`: Amarelo (#F59E0B)
   - 🔴 `erro/nao-enviada`: Vermelho (#EF4444)
   - ⚪ `sem-movimento`: Cinza claro (#9CA3AF)
   - 🔵 `zerada`: Azul claro (#3B82F6)
   - ⚫ `processando`: Laranja (#F97316)

3. **Interatividade:**
   - Click no card abre modal com detalhes completos
   - Scroll horizontal suave
   - Botões de navegação (anterior/próximo)
   - Zoom in/out (6 meses, 12 meses, 24 meses)
   - Filtros por status

4. **Layout:**
   - Header com nome do cliente e período
   - Filtros no topo
   - Timeline scrollável horizontalmente
   - Legenda de cores no rodapé

#### API Endpoint Necessário

```typescript
GET /api/clientes/:clienteId/timeline
Query params:
  - periodoInicio?: string (YYYY-MM)
  - periodoFim?: string (YYYY-MM)

Response:
{
  cliente: { id, nome, cnpj },
  timeline: TimelineMonth[],
  estatisticas: {
    totalMeses: number,
    enviadas: number,
    pendentes: number,
    erros: number,
    semMovimento: number,
    zeradas: number,
    naoEnviadas: number,
    valorTotal: number
  }
}
```

## 🚀 Próximos Passos

1. Criar endpoint no backend para buscar timeline do cliente
2. Criar componente `ClienteTimeline.tsx`
3. Criar página ou modal para exibir timeline
4. Adicionar link para timeline na lista de clientes
5. Implementar filtros e interatividade

## 📱 Responsividade

- Desktop: Timeline horizontal completa
- Tablet: Timeline horizontal com scroll
- Mobile: Timeline vertical ou cards empilhados


