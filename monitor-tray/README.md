# DCTF MPC Monitor

Aplicativo de monitoramento para Windows que fica na bandeja do sistema e alerta quando o serviço DCTF MPC cair.

## 🚀 Funcionalidades

- ✅ Monitora o serviço DCTF MPC automaticamente
- 🔔 Notificações quando o serviço cai ou volta online
- 📊 Status visual na bandeja do sistema (ícone verde/vermelho)
- ⚙️ Configurações personalizáveis
- 🌐 Acesso rápido ao serviço via menu
- 📝 Logs de monitoramento

## 📦 Instalação

### Opção 1: Executável Portátil (Recomendado)

1. Execute o build:
```bash
npm run build:portable
```

2. O arquivo `DCTF-MPC-Monitor-Portable.exe` será gerado na pasta `dist/`

3. Execute o arquivo `.exe` - não precisa instalar!

### Opção 2: Instalador

1. Execute o build:
```bash
npm run build:win
```

2. Execute o instalador gerado em `dist/`

3. Siga o assistente de instalação

## 🛠️ Desenvolvimento

### Pré-requisitos

- Node.js 20.x ou superior
- npm 10.x ou superior

### Instalação de Dependências

```bash
npm install
```

### Executar em Modo de Desenvolvimento

```bash
npm start
```

### Build para Produção

```bash
# Build completo (instalador + portátil)
npm run build

# Apenas instalador
npm run build:win

# Apenas executável portátil
npm run build:portable
```

## ⚙️ Configuração

### Configuração Inicial

Ao executar pela primeira vez, o monitor usará as configurações padrão:
- **URL da API**: `http://localhost:3000`
- **Intervalo de Verificação**: 30 segundos (quando online)
- **Intervalo de Retry**: 5 segundos (quando offline)
- **Máximo de Tentativas**: 3

### Alterar Configurações

1. Clique com o botão direito no ícone na bandeja do sistema
2. Selecione "⚙️ Configurações"
3. Ajuste as configurações desejadas
4. Clique em "Salvar"

### Configurações Disponíveis

- **URL da API**: Endereço completo do servidor DCTF MPC
- **Intervalo de Verificação**: Tempo entre verificações quando online (mínimo: 5000ms)
- **Intervalo de Retry**: Tempo entre tentativas quando offline (mínimo: 1000ms)
- **Máximo de Tentativas**: Número de falhas antes de alertar
- **Ativar Notificações**: Habilitar/desabilitar notificações
- **Ativar Som**: Habilitar som nas notificações de erro

## 📱 Como Usar

### Menu da Bandeja

Clique com o botão direito no ícone na bandeja do sistema para acessar:

- **Status**: Mostra se o serviço está online ou offline
- **Última verificação**: Timestamp da última verificação
- **🔄 Verificar Agora**: Força uma verificação imediata
- **🌐 Abrir no Navegador**: Abre a URL do serviço no navegador
- **⚙️ Configurações**: Abre janela de configurações
- **📊 Ver Logs**: Abre janela de logs
- **🔄 Reiniciar Monitor**: Reinicia o monitoramento
- **❌ Sair**: Fecha o aplicativo

### Status Visual

- **🟢 Verde**: Serviço online e funcionando
- **🔴 Vermelho**: Serviço offline ou não respondendo

### Notificações

O monitor exibe notificações do Windows quando:
- O serviço volta online após estar offline
- O serviço cai ou não responde após várias tentativas

## 🔧 Solução de Problemas

### O monitor não detecta o serviço

1. Verifique se a URL da API está correta nas configurações
2. Verifique se o serviço DCTF MPC está rodando
3. Teste acessando `/health` manualmente no navegador
4. Verifique se não há firewall bloqueando a conexão

### Notificações não aparecem

1. Verifique as configurações de notificação do Windows
2. Certifique-se de que "Ativar Notificações" está marcado nas configurações
3. Verifique se o Windows não está em modo "Não Perturbe"

### O ícone não aparece na bandeja

1. Verifique se o ícone está oculto na área de notificações do Windows
2. Clique na seta para cima na bandeja do sistema para ver ícones ocultos
3. Arraste o ícone para a área visível

## 📝 Estrutura do Projeto

```
monitor-tray/
├── main.js           # Processo principal do Electron
├── preload.js        # Script de pré-carregamento seguro
├── config.html       # Interface de configurações
├── logs.html         # Interface de logs
├── package.json      # Dependências e scripts
├── assets/           # Ícones e recursos
│   ├── icon.ico
│   ├── icon-online.ico
│   └── icon-offline.ico
└── README.md         # Este arquivo
```

## 🎯 Próximas Melhorias

- [ ] Histórico de logs persistente
- [ ] Gráficos de uptime
- [ ] Integração com serviços de monitoramento externos
- [ ] Suporte para múltiplos serviços
- [ ] Autostart automático com Windows

## 📄 Licença

MIT

## 👤 Autor

Bruno

---

**Dica**: Para iniciar automaticamente com o Windows, adicione o executável à pasta de inicialização do Windows ou use o Task Scheduler.






