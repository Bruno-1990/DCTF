# Guia de Instalação - DCTF MPC Monitor

## 📋 Pré-requisitos

- Windows 10 ou superior
- Node.js 20.x ou superior (apenas para desenvolvimento)
- npm 10.x ou superior (apenas para desenvolvimento)

## 🚀 Instalação Rápida (Executável)

### Opção 1: Executável Portátil (Recomendado)

1. Baixe o arquivo `DCTF-MPC-Monitor-Portable.exe`
2. Execute o arquivo - **não precisa instalar!**
3. O ícone aparecerá na bandeja do sistema

### Opção 2: Instalador

1. Execute o instalador `DCTF-MPC-Monitor-Setup.exe`
2. Siga o assistente de instalação
3. O monitor será instalado e iniciado automaticamente

## 🛠️ Instalação para Desenvolvimento

### 1. Instalar Dependências

```bash
cd monitor-tray
npm install
```

### 2. Executar em Modo de Desenvolvimento

```bash
npm start
```

### 3. Gerar Executável

```bash
# Gerar executável portátil
npm run build:portable

# Gerar instalador
npm run build:win

# Gerar ambos
npm run build
```

Os arquivos serão gerados na pasta `dist/`

## ⚙️ Configuração Inicial

### Primeira Execução

1. Ao executar pela primeira vez, o monitor usará:
   - URL padrão: `http://localhost:3000`
   - Verificação a cada 30 segundos
   - Retry a cada 5 segundos quando offline

2. Para alterar as configurações:
   - Clique com botão direito no ícone da bandeja
   - Selecione "⚙️ Configurações"
   - Ajuste conforme necessário
   - Clique em "Salvar"

### Configuração da URL

Se o seu serviço DCTF MPC estiver em outro endereço:

1. Abra as configurações
2. Altere o campo "URL da API" para o endereço correto
   - Exemplo: `http://192.168.1.100:3000`
   - Exemplo: `https://seu-dominio.com`
3. Salve as configurações

## 🔄 Iniciar Automaticamente com Windows

### Método 1: Pasta de Inicialização

1. Pressione `Win + R`
2. Digite: `shell:startup`
3. Crie um atalho do executável nesta pasta

### Método 2: Task Scheduler (Recomendado)

1. Abra o "Agendador de Tarefas" do Windows
2. Clique em "Criar Tarefa Básica"
3. Nome: "DCTF MPC Monitor"
4. Gatilho: "Quando o computador iniciar"
5. Ação: "Iniciar um programa"
6. Programa: Selecione o executável do monitor
7. Marque "Executar com os mais altos privilégios" (se necessário)
8. Conclua o assistente

## ✅ Verificação

Após a instalação:

1. Verifique se o ícone aparece na bandeja do sistema
2. Clique com botão direito no ícone
3. Verifique o status (deve mostrar "🟢 Online" se o serviço estiver rodando)
4. Teste clicando em "🔄 Verificar Agora"

## 🐛 Solução de Problemas

### O monitor não inicia

- Verifique se o Node.js está instalado (apenas para desenvolvimento)
- Verifique se todas as dependências foram instaladas (`npm install`)
- Verifique os logs do Windows Event Viewer

### O ícone não aparece

- Verifique a área de notificações ocultas (seta para cima)
- Reinicie o aplicativo
- Verifique se o Windows não está bloqueando notificações

### Notificações não funcionam

- Verifique as configurações de notificação do Windows
- Certifique-se de que o modo "Não Perturbe" está desativado
- Verifique as configurações do monitor (Ativar Notificações)

## 📞 Suporte

Para problemas ou dúvidas, consulte o README.md principal ou verifique os logs do aplicativo.






