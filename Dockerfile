# syntax=docker/dockerfile:1

FROM node:20 AS backend-build
WORKDIR /app

# Instala dependências de desenvolvimento
COPY package.json package-lock.json ./
RUN npm ci

# Copia o código-fonte e compila
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Imagem final mais enxuta
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Instala apenas dependências de produção
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia artefatos compilados
COPY --from=backend-build /app/dist ./dist

# Exposição da porta configurada (padrão 3000)
EXPOSE 3000

CMD ["node", "dist/index.js"]

