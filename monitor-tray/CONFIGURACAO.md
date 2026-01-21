# Configuração do Monitor - DCTF MPC

## 📍 Localização do Backend

Baseado no mapeamento do projeto (`docs/MAPEO_PROJETO.md`):

### Estrutura do Backend

```
DCTF_MPC/
├── src/                    # Backend Node.js/TypeScript
│   ├── index.ts           # Ponto de entrada principal
│   ├── server.ts          # Servidor Express
│   ├── config/            # Configurações
│   │   └── index.ts       # Configuração principal (porta padrão: 3000)
│   ├── controllers/       # Controllers
│   ├── models/            # Models
│   ├── routes/            # Rotas da API
│   └── services/          # Services
```

### Informações Importantes

- **Pasta do Backend**: `src/` (na raiz do projeto)
- **Ponto de Entrada**: `src/index.ts`
- **Servidor**: `src/server.ts`
- **Porta Padrão**: `3000` (definida em `src/config/index.ts`)
- **Health Check Endpoint**: `/health` (definido em `src/server.ts`)
- **URL Padrão**: `http://localhost:3000`

### Endpoints de Health Check

O backend possui dois endpoints de health check:

1. **`GET /health`** - Health check básico
   - Retorna: `{ status: 'OK', timestamp, uptime, environment }`
   - Status: 200 quando online

2. **`GET /ws/health`** - Health check do WebSocket
   - Retorna: Status do WebSocket Gateway
   - Status: 200 quando online

## ⚙️ Configuração do Monitor

### Configuração Padrão

O monitor vem pré-configurado para:
- **URL da API**: `http://localhost:3000`
- **Endpoint de Verificação**: `http://localhost:3000/health`
- **Intervalo de Verificação**: 30 segundos (quando online)
- **Intervalo de Retry**: 5 segundos (quando offline)

### Se o Backend Estiver em Outra Porta

Se você iniciar o backend em outra porta (ex: `npm run dev -- --port 3001`):

1. Abra as configurações do monitor
2. Altere a URL da API para: `http://localhost:3001`
3. Salve as configurações

### Se o Backend Estiver em Outro Servidor

Se o backend estiver rodando em outro computador na rede:

1. Descubra o IP do servidor (ex: `192.168.0.100`)
2. Abra as configurações do monitor
3. Altere a URL da API para: `http://192.168.0.100:3000`
4. Salve as configurações

### Se o Backend Estiver em Produção (HTTPS)

Se o backend estiver em produção com HTTPS:

1. Abra as configurações do monitor
2. Altere a URL da API para: `https://seu-dominio.com`
3. Salve as configurações

## 🔍 Verificando se o Backend Está Rodando

### Método 1: Navegador

Abra no navegador:
```
http://localhost:3000/health
```

Deve retornar:
```json
{
  "status": "OK",
  "timestamp": "2026-01-15T...",
  "uptime": 123.456,
  "environment": "development"
}
```

### Método 2: Terminal

```bash
curl http://localhost:3000/health
```

### Método 3: Monitor

1. Clique com botão direito no ícone do monitor
2. Clique em "🔄 Verificar Agora"
3. Verifique o status no menu

## 🚀 Como Iniciar o Backend

### Desenvolvimento

```bash
# Na raiz do projeto DCTF_MPC
npm run dev
```

O backend iniciará em `http://localhost:3000`

### Produção

```bash
# Build primeiro
npm run build

# Depois iniciar
npm start
```

## 📝 Notas Importantes

1. **Porta Padrão**: O backend usa porta `3000` por padrão, mas pode ser alterada via variável de ambiente `PORT` ou argumento `--port`

2. **Health Check**: O monitor verifica o endpoint `/health` que está definido em `src/server.ts`

3. **CORS**: O backend aceita requisições de `http://localhost:5173` (frontend) por padrão. O monitor faz requisições diretas, então não há problema de CORS.

4. **Timeout**: O monitor usa timeout de 5 segundos para as requisições de health check.

5. **Configuração Persistente**: As configurações do monitor são salvas em:
   - Windows: `%APPDATA%\dctf-mpc-monitor\config.json`

## 🔧 Solução de Problemas

### Monitor não detecta o backend

1. Verifique se o backend está rodando:
   ```bash
   # No terminal, na pasta do projeto
   npm run dev
   ```

2. Teste o health check manualmente:
   ```
   http://localhost:3000/health
   ```

3. Verifique a URL nas configurações do monitor

4. Verifique se não há firewall bloqueando a porta 3000

### Backend em outra porta

Se você iniciou o backend com `--port 3001`, atualize a URL no monitor para `http://localhost:3001`

### Backend em outro computador

1. Descubra o IP do servidor
2. Certifique-se de que a porta 3000 está aberta no firewall
3. Configure o monitor com o IP correto: `http://192.168.x.x:3000`






