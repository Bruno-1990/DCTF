# ⚡ Deploy Rápido - DCTF MPC

## 🎯 Opção Mais Simples: Railway (Tudo em um lugar)

### Backend + Frontend no Railway

1. **Acesse:** https://railway.app e faça login com GitHub

2. **Deploy do Backend:**
   - New Project → Deploy from GitHub repo
   - Selecione `CentralContabil/DCTF`
   - Railway detecta automaticamente
   - Adicione variáveis:
     ```
     PORT=3000
     NODE_ENV=production
     SUPABASE_URL=sua_url
     SUPABASE_ANON_KEY=sua_chave
     FRONTEND_URL=https://seu-frontend.railway.app
     ```
   - Deploy automático! URL: `https://seu-backend.railway.app`

3. **Deploy do Frontend:**
   - New Project → Deploy from GitHub repo (mesmo repositório)
   - Configure:
     - Root Directory: `frontend`
     - Build Command: `npm run build`
     - Start Command: `npx vite preview --port $PORT --host`
   - Variável:
     ```
     VITE_API_BASE_URL=https://seu-backend.railway.app/api
     ```
   - URL: `https://seu-frontend.railway.app`

**Pronto! ✅**

---

## 🌐 Opção Recomendada: Vercel (Frontend) + Railway (Backend)

### Backend no Railway
- Siga passos acima do Railway

### Frontend no Vercel
1. Acesse: https://vercel.com
2. Add New Project → Import do GitHub
3. Configure:
   - Framework: Vite
   - Root Directory: `frontend`
   - Build: `npm run build`
   - Output: `dist`
4. Variável: `VITE_API_BASE_URL=https://seu-backend.railway.app/api`
5. Deploy! URL: `https://seu-app.vercel.app`

**Mais rápido e com CDN global! ⚡**

---

## 📋 Variáveis de Ambiente Necessárias

### Backend:
```
PORT=3000
NODE_ENV=production
SUPABASE_URL=sua_url_do_supabase
SUPABASE_ANON_KEY=sua_chave_do_supabase
FRONTEND_URL=https://seu-frontend.vercel.app
```

### Frontend:
```
VITE_API_BASE_URL=https://seu-backend.railway.app/api
```

---

## 🔗 Após o Deploy

1. Atualize `FRONTEND_URL` no backend com a URL real do frontend
2. Atualize `VITE_API_BASE_URL` no frontend com a URL real do backend
3. Teste se está tudo funcionando!

---

**Veja o arquivo `GUIA-DEPLOY.md` para opções detalhadas!**

