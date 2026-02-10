# 🎯 GUIA DE USO: SISTEMA DE MONITORAMENTO DE ERROS

## 📸 COMO USAR AS NOVAS FUNCIONALIDADES

### 🟢 PASSO 1: Reiniciar o Backend

```bash
# No terminal do backend (parar com Ctrl+C se estiver rodando)
cd "C:\Users\bruno\Desktop\DCTF WEB\DCTF_MPC"
npm run dev
```

### 🟢 PASSO 2: Acessar a Página Admin

1. Abra o navegador
2. Vá para: `http://localhost:5173/administracao`
3. Faça login com credenciais Admin

### 🟢 PASSO 3: Executar Sincronização

Clique no botão verde: **"Sincronizar do Supabase para MySQL"**

---

## 🟡 SE HOUVER ERROS, VERÁ ESTE PAINEL:

```
┌────────────────────────────────────────────────────┐
│ ⚠️  🔍 Monitoramento de Erros                     │
│                                                    │
│ 408 registro(s) falharam na sincronização         │
│                                                    │
│ ┌──────────────────────┐  ┌───────────────────┐  │
│ │ 📥 Baixar Log        │  │ 🔄 Tentar         │  │
│ │    de Erros          │  │    Novamente      │  │
│ └──────────────────────┘  └───────────────────┘  │
│                                                    │
│ ▼ Ver Últimos Erros (408)                         │
│ ┌──────────────────────────────────────────────┐ │
│ │ UPDATE FALHOU - ID: abc, CNPJ: 12345678      │ │
│ │ Erro: {"code": "...", "message": "..."}      │ │
│ │                                               │ │
│ │ ---                                           │ │
│ │                                               │ │
│ │ INSERT FALHOU - ID: def, CNPJ: 98765432      │ │
│ │ Erro: {...}                                   │ │
│ │                                               │ │
│ │ ... e mais 393 erros (baixe o log completo)  │ │
│ └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

---

## 🎮 FUNCIONALIDADES DISPONÍVEIS

### 📥 **A) Baixar Log de Erros**

**Quando usar:** Quando precisar analisar TODOS os erros em detalhes

**Como funciona:**
1. Clique no botão **"📥 Baixar Log de Erros"**
2. Arquivo `sync-errors-2026-01-30.log` é baixado automaticamente
3. Abra em editor de texto (VS Code, Notepad++, etc)
4. Veja detalhes completos:
   - ID do registro
   - CNPJ
   - Período
   - Tipo de operação (INSERT/UPDATE)
   - Mensagem de erro completa
   - Dados que tentaram ser salvos

**Exemplo de conteúdo:**
```
=== SYNC ERROR LOG - 2026-01-30T14:30:00.000Z ===
UPDATE FALHOU - ID: abc-123, CNPJ: 12345678000190, Período: 2024-01, Erro: {"code":"UNKNOWN","message":"..."}
---
INSERT FALHOU - ID: def-456, CNPJ: 98765432000100, Período: 2024-02, Erro: {"code":"...","message":"..."}
=== END LOG ===
```

---

### 📋 **B) Painel de Monitoramento Visual**

**Quando usar:** Para ver rapidamente os tipos de erros

**Como funciona:**
- Aparece **automaticamente** após sincronização com erros
- Mostra até 15 erros mais recentes
- Área expansível (clique em "Ver Últimos Erros")
- Scroll automático se houver muitos erros

**O que mostra:**
- Número total de erros
- Tipo de operação que falhou (INSERT/UPDATE)
- ID do registro
- CNPJ
- Período
- Mensagem de erro

**Vantagens:**
- Não precisa baixar arquivo
- Feedback imediato
- Fácil de ler
- Atualizado em tempo real

---

### 🔄 **C) Retry Automático**

**Quando usar:** Quando quiser tentar processar novamente os registros que falharam

**Como funciona:**
1. Clique no botão **"🔄 Tentar Novamente"**
2. Sistema executa uma nova sincronização completa
3. Registros anteriores são reprocessados
4. Resultado atualizado aparece na tela
5. Log de erros é atualizado

**Cenários de uso:**
- **Erro transitório:** Problema temporário de rede/banco
- **Correção no banco:** Você corrigiu algo e quer reprocessar
- **Validação:** Testar se ainda há erros após mudanças

**Visual durante retry:**
```
[🔄 Tentando novamente...] ← Ícone girando
```

---

## 🔍 INVESTIGANDO OS 408 ERROS

### Com o sistema implementado, agora você pode:

1. **Executar nova sincronização**
2. **Baixar o log completo**
3. **Analisar padrões:**
   - Todos os erros são do mesmo tipo?
   - São todos UPDATE ou todos INSERT?
   - Há CNPJs específicos problemáticos?
   - As mensagens de erro dão pistas?

4. **Tomar ação:**
   - Se erro de tipo de dados → ajustar conversão
   - Se erro de constraint → verificar banco
   - Se erro transitório → usar retry
   - Se erro de lógica → corrigir código

---

## ⚙️ PRÓXIMOS PASSOS RECOMENDADOS

### 1. TESTAR AGORA:
```bash
# Reiniciar backend
npm run dev
```

### 2. EXECUTAR SINCRONIZAÇÃO:
- Vá para Admin
- Clique em "Sincronizar"
- Aguarde conclusão

### 3. ANALISAR ERROS:
- Veja painel amarelo (se houver erros)
- Baixe o log
- Leia mensagens de erro

### 4. INVESTIGAR CAUSA RAIZ:
- Identifique padrão nos erros
- Corrija causa (se possível)
- Use retry para reprocessar

---

## 🎉 BENEFÍCIOS IMPLEMENTADOS

✅ **Visibilidade Total** - Nada fica oculto
✅ **Debugging Fácil** - Logs completos e organizados
✅ **UX Aprimorada** - Feedback visual imediato
✅ **Recuperação Automática** - Retry com um clique
✅ **Produção-Ready** - Sistema robusto e confiável

---

Pronto para usar! 🚀
