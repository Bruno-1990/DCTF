# Integração sistema ↔ n8n (webhook → email)

## Se aparecer "Webhook n8n não configurado" (503)

No **`.env` da raiz do sistema** (único .env do projeto), adicione:

```env
N8N_WEBHOOK_URL=https://primary-production-dfb3.up.railway.app/webhook-test/e214fde3-b959-4996-bf12-f836aeaadb5c
```

Reinicie o servidor Node depois de salvar o `.env`. No n8n, o nó Webhook deve estar em **POST** (não GET).

---

## Fluxo

1. **Botão no sistema** → chama `n8nWebhookService.sendToN8n(payload)`.
2. **Backend** → recebe em `POST /api/n8n/send` e repassa o body para a URL do webhook n8n.
3. **n8n** → nó "On form submission" recebe o payload; nós Code / Google Drive / Gmail processam e enviam o email.

## Configuração

### 1. Variável no .env da raiz

Use o **`.env` na raiz do projeto** (não crie outro em subpastas). Adicione a URL do webhook do nó **Webhook** do seu fluxo n8n:

```env
# Teste (Listening for test event no n8n):
N8N_WEBHOOK_URL=https://primary-production-dfb3.up.railway.app/webhook-test/e214fde3-b959-4996-bf12-f836aeaadb5c

# Produção (use a URL da aba "Production URL" no n8n):
# N8N_WEBHOOK_URL=https://primary-production-dfb3.up.railway.app/webhook/e214fde3-b959-4996-bf12-f836aeaadb5c
```

**URL que aciona o webhook (n8n) – Test:**

```
https://primary-production-dfb3.up.railway.app/webhook-test/e214fde3-b959-4996-bf12-f836aeaadb5c
```

Está em hardcode no frontend e no backend. Opcionalmente use no `.env` da raiz como `N8N_WEBHOOK_URL` para sobrescrever.

**Importante:** no nó Webhook do n8n, defina o **HTTP Method** como **POST** (não GET). O nosso sistema envia os dados do formulário no corpo da requisição (JSON); com GET o body não é recebido.

### 2. n8n – formato do body

O backend envia o body do `POST /api/n8n/send` **como está** para o n8n. Exemplo de payload que o frontend pode enviar:

```json
{
  "email": "destinatario@exemplo.com",
  "nome": "João",
  "assunto": "Dados do usuário",
  "mensagem": "Conteúdo opcional"
}
```

No nó **Code** do n8n, use `$input.first().json` para acessar esses campos e montar o que for necessário para o nó **Gmail** (por exemplo `to`, `subject`, `body`).

### 3. Frontend – exemplo de botão

```tsx
import { useState } from 'react';
import { n8nWebhookService } from '../services/n8nWebhook';
import { useToast } from '../hooks/useToast';

function MeuComponente() {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleEnviarParaN8n = async () => {
    setLoading(true);
    try {
      const result = await n8nWebhookService.sendToN8n({
        email: 'destino@email.com',
        nome: 'Nome do usuário',
        // Inclua aqui qualquer dado que o fluxo n8n precise (ex.: para o email)
      });
      if (result.success) {
        toast.success('Dados enviados. O email será processado pelo n8n.');
      } else {
        toast.error(result.error || 'Falha ao enviar para o n8n.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleEnviarParaN8n} disabled={loading}>
      {loading ? 'Enviando...' : 'Enviar dados e disparar email'}
    </button>
  );
}
```

## Resumo

| Onde        | O que fazer |
|------------|-------------|
| **.env (raiz)** | `N8N_WEBHOOK_URL=<URL do nó Webhook no n8n>` (único .env do sistema) |
| **n8n**    | Webhook recebe JSON; Code/Gmail usam os campos recebidos |
| **Frontend** | Botão chama `n8nWebhookService.sendToN8n({ ... })` com os dados desejados |

Se o webhook não estiver configurado (`N8N_WEBHOOK_URL` vazio), a API retorna 503 com mensagem explicativa.

---

## Conferir se a rota está ativa

- **GET** `http://SEU_BACKEND:PORTA/api/n8n/health`  
  - Resposta esperada: `{ "ok": true, "webhookConfigured": true, "message": "..." }`.  
  - Se der **404**, o backend não está com a rota n8n carregada (reinicie o servidor após alterações no código).

---

## Erro 404 ao enviar o formulário Acesso

1. **Reinicie o backend** após incluir ou alterar a rota n8n.
2. **Confira a URL da API no frontend** (variável `VITE_API_BASE_URL` ou `VITE_API_URL` no `.env` do frontend). Ela deve apontar para o mesmo host e porta em que o backend está rodando (ex.: `http://192.168.0.47:38572/api` ou a porta que você usa).
3. **Teste no navegador:** abra `http://SEU_BACKEND:PORTA/api/n8n/health`. Se retornar JSON com `ok: true`, a rota está ativa; se der 404, o backend em uso não é o que tem a rota `/api/n8n`.
4. **No n8n:** no nó Webhook, defina **HTTP Method** como **POST** (não GET), para receber o body JSON (nome, senha, maquinaLocal).

---

## Retorno do link: nó HTTP Request no n8n → backend (document-ready)

O n8n envia o link do documento para o backend pelo nó **HTTP Request** chamando **POST /api/n8n/document-ready**. O frontend consulta depois em **GET /api/n8n/result/:requestId**.

### Erro "The service refused the connection" (ECONNREFUSED)

Se o n8n está rodando **na nuvem** (ex.: Railway), **não use `http://localhost:3000`** no nó HTTP Request. Nesse caso `localhost` é o próprio servidor do n8n, não a sua máquina — por isso a conexão é recusada.

**Solução:** use a **URL pública do seu backend** no nó HTTP Request do n8n.

| Onde o n8n roda | URL a usar no nó HTTP Request |
|-----------------|-------------------------------|
| Na sua máquina (mesmo PC do backend) | `http://localhost:3000/api/n8n/document-ready` (backend precisa estar rodando) |
| Na nuvem (Railway, etc.) | URL pública do backend, ex.: `https://SEU-BACKEND.railway.app/api/n8n/document-ready` ou um túnel (ngrok, etc.) |

**Exemplo:** se o backend DCTF estiver deployado em `https://dctf-backend.railway.app`, no n8n configure:

- **URL:** `https://dctf-backend.railway.app/api/n8n/document-ready`
- **Method:** POST
- **Body (JSON):** `requestId`, `downloadLink`, `documentId` (como já configurado)

Se o backend ainda for só local, use **ngrok** (ou similar) para expor a porta 3000 e coloque no n8n a URL que o ngrok fornecer, ex.: `https://abc123.ngrok.io/api/n8n/document-ready`.
