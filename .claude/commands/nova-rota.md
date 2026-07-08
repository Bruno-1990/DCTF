---
allowed-tools: Edit Read Write Glob Grep Bash(npx vite *) Bash(cd *) Bash(mkdir *)
---

Crie uma nova rota/modulo full-stack chamada "$ARGUMENTS" seguindo o padrao do projeto.
Crie TODOS os arquivos e faca TODAS as alteracoes sem pedir confirmacao.

## Arquivos a criar

### 1. Backend — Rota (`src/routes/{feature}.ts`)
```typescript
import { Router } from 'express';
import { {Feature}Controller } from '../controllers/{Feature}Controller';

const router = Router();
const controller = new {Feature}Controller();

router.get('/', (req, res) => controller.listar(req, res));
router.get('/:id', (req, res) => controller.buscarPorId(req, res));
router.post('/', (req, res) => controller.criar(req, res));
router.put('/:id', (req, res) => controller.atualizar(req, res));
router.delete('/:id', (req, res) => controller.excluir(req, res));

export default router;
```

### 2. Backend — Controller (`src/controllers/{Feature}Controller.ts`)
```typescript
import { Request, Response } from 'express';

export class {Feature}Controller {
  async listar(req: Request, res: Response): Promise<void> {
    try {
      // TODO: implementar
      res.status(200).json({ items: [] });
    } catch (error: any) {
      console.error('[{FEATURE}] Erro ao listar:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async buscarPorId(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      // TODO: implementar
      res.status(200).json({});
    } catch (error: any) {
      console.error('[{FEATURE}] Erro ao buscar:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async criar(req: Request, res: Response): Promise<void> {
    try {
      // TODO: implementar
      res.status(201).json({});
    } catch (error: any) {
      console.error('[{FEATURE}] Erro ao criar:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async atualizar(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      // TODO: implementar
      res.status(200).json({});
    } catch (error: any) {
      console.error('[{FEATURE}] Erro ao atualizar:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }

  async excluir(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      // TODO: implementar
      res.status(204).send();
    } catch (error: any) {
      console.error('[{FEATURE}] Erro ao excluir:', error);
      res.status(500).json({ error: error?.message || 'Erro interno' });
    }
  }
}
```

### 3. Backend — Registrar no server.ts (`src/server.ts`)
- Adicionar import: `import {feature}Routes from './routes/{feature}';`
- Adicionar rota: `this.app.use('/api/{feature}', {feature}Routes);`

### 4. Frontend — Service (`frontend/src/services/{feature}.ts`)
```typescript
import api from './api';

export const {feature}Service = {
  async listar(params?: Record<string, any>) {
    const response = await api.get('/api/{feature}', { params });
    return response.data;
  },

  async buscarPorId(id: string) {
    const response = await api.get(`/api/{feature}/${id}`);
    return response.data;
  },

  async criar(data: Record<string, any>) {
    const response = await api.post('/api/{feature}', data);
    return response.data;
  },

  async atualizar(id: string, data: Record<string, any>) {
    const response = await api.put(`/api/{feature}/${id}`, data);
    return response.data;
  },

  async excluir(id: string) {
    await api.delete(`/api/{feature}/${id}`);
  },
};
```

### 5. Frontend — Pagina (`frontend/src/pages/{Feature}.tsx`)
```typescript
import React, { useState, useEffect } from 'react';
import { {feature}Service } from '../services/{feature}';
import { LoadingSpinner } from '../components/UI';

const {Feature}: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      try {
        const result = await {feature}Service.listar();
        setData(result.items || []);
      } catch (error) {
        console.error('Erro ao carregar:', error);
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{Titulo}</h1>
      {/* TODO: implementar UI */}
    </div>
  );
};

export default {Feature};
```

### 6. Frontend — Registrar rota (`frontend/src/router/index.tsx`)
- Adicionar import: `import {Feature} from '../pages/{Feature}';`
- Adicionar rota no children do Layout: `{ path: '{feature}', element: <{Feature} /> },`

### 7. Frontend — Adicionar no Sidebar (`frontend/src/components/Layout/Sidebar.tsx`)
- Adicionar item no array `navigation`:
```typescript
{ name: '{Titulo}', href: '/{feature}', icon: DocumentTextIcon },
```
- Importar o icone de `@heroicons/react/24/outline` se necessario

## Regras
- Substituir `{feature}` pelo nome em lowercase (ex: `notas-fiscais`)
- Substituir `{Feature}` pelo nome em PascalCase (ex: `NotasFiscais`)
- Substituir `{FEATURE}` pelo nome em UPPERCASE (ex: `NOTAS_FISCAIS`)
- Substituir `{Titulo}` pelo titulo legivel (ex: `Notas Fiscais`)
- Usar icone apropriado do Heroicons para o Sidebar
- Verificar build do frontend apos criar: `cd frontend && npx vite build`
