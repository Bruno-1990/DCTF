const { app, Tray, Menu, nativeImage, Notification, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const axios = require('axios');
const notifier = require('node-notifier');
const fs = require('fs');
const { spawn, exec } = require('child_process');

// Caminho do arquivo de configuração
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

// Configurações padrão
// Backend DCTF MPC está em: src/ (raiz do projeto)
// - Ponto de entrada: src/index.ts
// - Servidor: src/server.ts
// - Porta padrão: 3000 (definida em src/config/index.ts)
// - Health check: /health (definido em src/server.ts)
// Frontend DCTF MPC está em: frontend/ (raiz do projeto)
// - Servidor: Vite dev server
// - Porta padrão: 5173 (definida em frontend/vite.config.ts)
// - URL: http://localhost:5173 ou http://127.0.0.1:5173
// NOTA: Usar 127.0.0.1 em vez de localhost para evitar problemas com IPv6
const DEFAULT_CONFIG = {
  apiUrl: 'http://127.0.0.1:3000',
  frontendUrl: 'http://127.0.0.1:5173',
  monitorFrontend: true, // Monitorar frontend também
  checkInterval: 30000, // 30 segundos quando online
  retryInterval: 5000,   // 5 segundos quando offline
  maxRetries: 3,
  enableNotifications: true,
  enableSound: true,
  autoStart: false
};

// Carregar configurações
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
  }
  return DEFAULT_CONFIG;
}

// Salvar configurações
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    return false;
  }
}

let config = loadConfig();
let tray = null;
let configWindow = null;
let isBackendOnline = false;
let isFrontendOnline = false;
let backendFailures = 0;
let frontendFailures = 0;
let lastBackendCheck = null;
let lastFrontendCheck = null;
let checkInterval = null;
let retryInterval = null;

// Criar ícone da bandeja
function createTrayIcon(status) {
  // Criar ícone simples baseado no status
  const size = 16;
  const img = nativeImage.createEmpty();
  
  // Em produção, você pode usar ícones PNG/ICO
  // Por enquanto, vamos usar um ícone padrão do sistema
  const iconPath = status === 'online' 
    ? path.join(__dirname, 'assets', 'icon-online.ico')
    : path.join(__dirname, 'assets', 'icon-offline.ico');
  
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  
  // Fallback: criar ícone simples
  return nativeImage.createEmpty();
}

// Normalizar URL para usar IPv4
function normalizeUrl(url) {
  if (url && url.includes('localhost')) {
    return url.replace('localhost', '127.0.0.1');
  }
  return url;
}

// Verificar status do backend
async function checkBackendStatus() {
  try {
    const apiUrl = normalizeUrl(config.apiUrl);
    
    const response = await axios.get(`${apiUrl}/health`, {
      timeout: 10000,
      validateStatus: (status) => status < 500,
      headers: {
        'Accept': 'application/json'
      },
      family: 4
    });

    if (response.status === 200 && response.data && response.data.status === 'OK') {
      if (!isBackendOnline) {
        isBackendOnline = true;
        backendFailures = 0;
        if (config.enableNotifications) {
          showNotification('✅ Backend Online', 'O backend DCTF MPC está funcionando normalmente.');
        }
        updateTrayStatus();
        restartMonitoring();
        // Fechar janela de reinício se estava aberta
        if (restartWindowShown) {
          closeRestartWindow();
        }
      }
      lastBackendCheck = new Date();
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ Backend Online - Uptime: ${response.data.uptime?.toFixed(0)}s`);
      return true;
    } else {
      throw new Error(`Status inválido: ${response.status}`);
    }
  } catch (error) {
    backendFailures++;
    const errorMsg = error.response 
      ? `HTTP ${error.response.status}: ${error.response.statusText}`
      : error.message || 'Erro desconhecido';
    
    console.error(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ Backend Offline (${backendFailures}): ${errorMsg}`);
    
    if (isBackendOnline || backendFailures >= config.maxRetries) {
      isBackendOnline = false;
      if (config.enableNotifications && (backendFailures === config.maxRetries || backendFailures % 5 === 0)) {
        showNotification(
          '⚠️ Backend Offline',
          `O backend DCTF MPC não está respondendo.\nTentativas: ${backendFailures}\nURL: ${config.apiUrl}\nErro: ${errorMsg}`,
          'error'
        );
      }
      updateTrayStatus();
      restartMonitoring();
    }
    
    lastBackendCheck = new Date();
    return false;
  }
}

// Verificar status do frontend
async function checkFrontendStatus() {
  if (!config.monitorFrontend) return true;
  
  try {
    const frontendUrl = normalizeUrl(config.frontendUrl);
    
    const response = await axios.get(frontendUrl, {
      timeout: 5000,
      validateStatus: (status) => status < 500,
      family: 4
    });

    if (response.status === 200 || response.status === 304) {
      if (!isFrontendOnline) {
        isFrontendOnline = true;
        frontendFailures = 0;
        if (config.enableNotifications && isBackendOnline) {
          // Só notificar frontend se backend também estiver online (evitar spam)
          showNotification('✅ Frontend Online', 'O frontend DCTF MPC está funcionando normalmente.');
        }
        updateTrayStatus();
        // Fechar janela de reinício se estava aberta
        if (restartWindowShown) {
          closeRestartWindow();
        }
      }
      lastFrontendCheck = new Date();
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ✅ Frontend Online`);
      return true;
    } else {
      throw new Error(`Status inválido: ${response.status}`);
    }
  } catch (error) {
    frontendFailures++;
    const errorMsg = error.response 
      ? `HTTP ${error.response.status}: ${error.response.statusText}`
      : error.message || 'Erro desconhecido';
    
    console.error(`[${new Date().toLocaleTimeString('pt-BR')}] ❌ Frontend Offline (${frontendFailures}): ${errorMsg}`);
    
    if (isFrontendOnline || frontendFailures >= config.maxRetries) {
      isFrontendOnline = false;
      if (config.enableNotifications && (frontendFailures === config.maxRetries || frontendFailures % 5 === 0)) {
        showNotification(
          '⚠️ Frontend Offline',
          `O frontend DCTF MPC não está respondendo.\nTentativas: ${frontendFailures}\nURL: ${config.frontendUrl}`,
          'error'
        );
      }
      updateTrayStatus();
    }
    
    lastFrontendCheck = new Date();
    return false;
  }
}

// Verificar ambos os serviços
async function checkServiceStatus() {
  await Promise.all([
    checkBackendStatus(),
    checkFrontendStatus()
  ]);
  
  // Verificar se ambos estão offline e mostrar janela de reinício
  if (!isBackendOnline && (!config.monitorFrontend || !isFrontendOnline)) {
    if (!restartWindowShown && !restartingServices) {
      showRestartWindow();
    }
  } else {
    // Se pelo menos um voltou online, fechar janela de reinício
    if (restartWindowShown) {
      closeRestartWindow();
    }
  }
}

// Mostrar notificação
function showNotification(title, message, type = 'info') {
  // Notificação nativa do Electron
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body: message,
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      silent: !config.enableSound
    });
    notification.show();
  }
  
  // Fallback com node-notifier
  notifier.notify({
    title,
    message,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    sound: config.enableSound && type === 'error',
    wait: false
  });
}

// Determinar status geral
function getOverallStatus() {
  if (isBackendOnline && (!config.monitorFrontend || isFrontendOnline)) {
    return 'online';
  }
  return 'offline';
}

// Atualizar ícone e status da bandeja
function updateTrayStatus() {
  if (!tray) return;
  
  const status = getOverallStatus();
  const icon = createTrayIcon(status);
  if (icon && !icon.isEmpty()) {
    tray.setImage(icon);
  }
  
  let tooltip = 'DCTF MPC Monitor\n';
  tooltip += `Backend: ${isBackendOnline ? '🟢 Online' : '🔴 Offline'}\n`;
  if (config.monitorFrontend) {
    tooltip += `Frontend: ${isFrontendOnline ? '🟢 Online' : '🔴 Offline'}\n`;
  }
  if (lastBackendCheck) {
    tooltip += `Última verificação: ${lastBackendCheck.toLocaleTimeString('pt-BR')}`;
  }
  
  tray.setToolTip(tooltip);
  updateTrayMenu();
}

// Atualizar menu da bandeja
function updateTrayMenu() {
  if (!tray) return;
  
  const backendStatus = isBackendOnline ? '🟢 Online' : '🔴 Offline';
  const frontendStatus = config.monitorFrontend 
    ? (isFrontendOnline ? '🟢 Online' : '🔴 Offline')
    : '⚪ Não monitorado';
  
  const lastBackendCheckText = lastBackendCheck 
    ? `Backend: ${lastBackendCheck.toLocaleTimeString('pt-BR')}`
    : 'Backend: Nunca verificado';
  
  const lastFrontendCheckText = config.monitorFrontend
    ? (lastFrontendCheck 
        ? `Frontend: ${lastFrontendCheck.toLocaleTimeString('pt-BR')}`
        : 'Frontend: Nunca verificado')
    : null;
  
  const menuItems = [
    {
      label: `Backend: ${backendStatus}`,
      enabled: false
    },
    {
      label: lastBackendCheckText,
      enabled: false
    }
  ];
  
  if (config.monitorFrontend) {
    menuItems.push(
      {
        label: `Frontend: ${frontendStatus}`,
        enabled: false
      },
      {
        label: lastFrontendCheckText,
        enabled: false
      }
    );
  }
  
  menuItems.push(
    { type: 'separator' },
    {
      label: '🔄 Verificar Agora',
      click: () => {
        checkServiceStatus();
      }
    },
    {
      label: '🌐 Abrir Backend',
      click: () => {
        require('electron').shell.openExternal(config.apiUrl);
      }
    }
  );
  
  if (config.monitorFrontend) {
    menuItems.push({
      label: '🌐 Abrir Frontend',
      click: () => {
        require('electron').shell.openExternal(config.frontendUrl);
      }
    });
  }
  
  menuItems.push(
    {
      label: '⚙️ Configurações',
      click: () => {
        showConfigWindow();
      }
    },
    { type: 'separator' },
    {
      label: '📊 Ver Logs',
      click: () => {
        showLogsWindow();
      }
    },
    {
      label: '🔄 Reiniciar Monitor',
      click: () => {
        restartMonitoring();
        showNotification('Monitor Reiniciado', 'O monitor foi reiniciado com sucesso.');
      }
    },
    { type: 'separator' },
    {
      label: '❌ Sair',
      click: () => {
        app.quit();
      }
    }
  );
  
  const menu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(menu);
}

// Mostrar janela de configurações
function showConfigWindow() {
  if (configWindow) {
    configWindow.focus();
    return;
  }
  
  configWindow = new BrowserWindow({
    width: 500,
    height: 450,
    resizable: false,
    title: 'Configurações - DCTF MPC Monitor',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  
  configWindow.loadFile('config.html');
  
  configWindow.on('closed', () => {
    configWindow = null;
  });
  
  // IPC para comunicação com a janela
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('save-config', (event, newConfig) => {
    config = { ...config, ...newConfig };
    if (saveConfig(config)) {
      restartMonitoring();
      return { success: true };
    }
    return { success: false, error: 'Erro ao salvar configurações' };
  });
}

// Mostrar janela de logs
function showLogsWindow() {
  const logsWindow = new BrowserWindow({
    width: 600,
    height: 400,
    title: 'Logs - DCTF MPC Monitor',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  logsWindow.loadFile('logs.html');
}

// Mostrar janela de reinício quando ambos serviços estiverem offline
function showRestartWindow() {
  if (restartWindow) {
    restartWindow.focus();
    return;
  }
  
  restartWindowShown = true;
  
  restartWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    title: '⚠️ Serviços Offline - DCTF MPC Monitor',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    alwaysOnTop: true, // Manter janela sempre visível
    modal: true
  });
  
  restartWindow.loadFile('restart.html');
  
  restartWindow.on('closed', () => {
    restartWindow = null;
    restartWindowShown = false;
  });
  
  // IPC para reiniciar serviços
  ipcMain.handle('restart-services', async () => {
    return await restartServices();
  });
}

// Fechar janela de reinício
function closeRestartWindow() {
  if (restartWindow) {
    restartWindow.close();
    restartWindow = null;
    restartWindowShown = false;
  }
}

// Parar todos os processos Node.js (backend e frontend)
function stopNodeProcesses() {
  return new Promise((resolve) => {
    console.log('🛑 Parando processos Node.js existentes...');
    
    // Comando PowerShell para parar processos Node
    const stopCommand = 'Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue';
    
    exec(`powershell -Command "${stopCommand}"`, {
      windowsHide: true,
      shell: true
    }, (error, stdout, stderr) => {
      // Não tratar erro como falha, pois pode não haver processos rodando
      if (stdout || stderr) {
        console.log('📋 Processos Node.js parados');
      }
      
      // Aguardar 3 segundos para garantir que os processos foram finalizados
      setTimeout(() => {
        console.log('✅ Processos finalizados, aguardando estabilização...');
        resolve();
      }, 3000);
    });
  });
}

// Reiniciar serviços (backend e frontend)
async function restartServices() {
  if (restartingServices) {
    return { success: false, message: 'Reinício já em andamento...' };
  }
  
  restartingServices = true;
  
  try {
    // Primeiro, parar todos os processos Node.js existentes
    await stopNodeProcesses();
    
    // Caminho do projeto raiz (subir um nível do monitor-tray)
    const projectRoot = path.resolve(__dirname, '..');
    const backendScript = path.join(projectRoot, '1run.bat');
    
    console.log('🔄 Reiniciando serviços...');
    console.log(`📁 Diretório do projeto: ${projectRoot}`);
    
    // Verificar se o script existe
    if (fs.existsSync(backendScript)) {
      // Usar o script batch para reiniciar
      return new Promise((resolve) => {
        exec(`"${backendScript}"`, {
          cwd: projectRoot,
          windowsHide: true
        }, (error, stdout, stderr) => {
          if (error) {
            console.error('Erro ao executar script:', error);
            restartingServices = false;
            resolve({ 
              success: false, 
              message: `Erro ao reiniciar: ${error.message}` 
            });
          } else {
            console.log('✅ Serviços reiniciados com sucesso');
            restartingServices = false;
            // Aguardar alguns segundos antes de verificar novamente
            setTimeout(() => {
              checkServiceStatus();
            }, 5000);
            resolve({ 
              success: true, 
              message: 'Serviços reiniciados! Aguarde alguns segundos...' 
            });
          }
        });
      });
    } else {
      // Se não tiver o script, tentar iniciar manualmente
      return await restartServicesManually(projectRoot);
    }
  } catch (error) {
    console.error('Erro ao reiniciar serviços:', error);
    restartingServices = false;
    return { 
      success: false, 
      message: `Erro: ${error.message}` 
    };
  }
}

// Reiniciar serviços manualmente (sem script)
async function restartServicesManually(projectRoot) {
  // Primeiro, parar todos os processos Node.js existentes
  await stopNodeProcesses();
  
  return new Promise((resolve) => {
    // Iniciar backend
    const backendProcess = exec('npm run dev', {
      cwd: projectRoot,
      windowsHide: true,
      shell: true
    });
    
    // Iniciar frontend
    const frontendProcess = exec('npm run dev', {
      cwd: path.join(projectRoot, 'frontend'),
      windowsHide: true,
      shell: true
    });
    
    backendProcess.on('error', (error) => {
      console.error('Erro ao iniciar backend:', error);
    });
    
    frontendProcess.on('error', (error) => {
      console.error('Erro ao iniciar frontend:', error);
    });
    
    // Aguardar um pouco para os processos iniciarem
    setTimeout(() => {
      restartingServices = false;
      setTimeout(() => {
        checkServiceStatus();
      }, 5000);
      resolve({ 
        success: true, 
        message: 'Serviços sendo reiniciados... Aguarde alguns segundos.' 
      });
    }, 2000);
  });
}

// Reiniciar monitoramento
function restartMonitoring() {
  // Limpar intervalos existentes
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  if (retryInterval) {
    clearInterval(retryInterval);
    retryInterval = null;
  }
  
  // Configurar novos intervalos baseado no status geral
  const overallOnline = getOverallStatus() === 'online';
  if (overallOnline) {
    checkInterval = setInterval(() => {
      checkServiceStatus();
    }, config.checkInterval);
  } else {
    retryInterval = setInterval(() => {
      checkServiceStatus();
    }, config.retryInterval);
  }
}

// Inicializar aplicativo
app.whenReady().then(() => {
  // Criar ícone na bandeja
  const icon = createTrayIcon('offline');
  if (icon && !icon.isEmpty()) {
    tray = new Tray(icon);
  } else {
    // Usar ícone padrão do sistema se não houver ícone customizado
    tray = new Tray(nativeImage.createEmpty());
  }
  
  updateTrayMenu();
  
  // Normalizar URLs para IPv4
  if (config.apiUrl.includes('localhost')) {
    config.apiUrl = config.apiUrl.replace('localhost', '127.0.0.1');
  }
  if (config.frontendUrl && config.frontendUrl.includes('localhost')) {
    config.frontendUrl = config.frontendUrl.replace('localhost', '127.0.0.1');
  }
  
  // Verificação inicial (aguardar um pouco para garantir que está tudo pronto)
  setTimeout(() => {
    checkServiceStatus();
    // Iniciar monitoramento após primeira verificação
    restartMonitoring();
  }, 2000);
  
  // Prevenir que o app feche quando todas as janelas fecham
  app.on('window-all-closed', (e) => {
    e.preventDefault();
  });
  
  console.log('✅ DCTF MPC Monitor iniciado');
  console.log(`📡 Backend: ${config.apiUrl}/health`);
  if (config.monitorFrontend) {
    console.log(`📡 Frontend: ${config.frontendUrl}`);
  } else {
    console.log(`📡 Frontend: Não monitorado`);
  }
  console.log(`⏱️  Intervalo Online: ${config.checkInterval}ms`);
  console.log(`⏱️  Intervalo Offline: ${config.retryInterval}ms`);
  console.log(`🌐 Usando IPv4 (127.0.0.1) para evitar problemas com IPv6`);
});

// Fechar quando necessário
app.on('before-quit', () => {
  if (checkInterval) clearInterval(checkInterval);
  if (retryInterval) clearInterval(retryInterval);
  if (tray) {
    tray.destroy();
  }
  // Salvar estado final
  saveConfig(config);
});

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error);
  showNotification('Erro no Monitor', `Ocorreu um erro: ${error.message}`);
});

