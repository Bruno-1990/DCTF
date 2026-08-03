module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  // Os testes de INTEGRAÇÃO sobem o servidor real e escrevem no banco de
  // verdade (o clientes.int.test.ts chega a cadastrar cliente). Como o .env
  // aponta para o DCTF_WEB de produção, deixá-los na rodada padrão encheria a
  // base de "Empresa X" a cada `npm test`. Rode-os sob demanda:
  //     npm run test:integration
  // apontando MYSQL_DATABASE para um banco descartável.
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/tests/integration/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // setupFiles roda ANTES da avaliação do arquivo de teste — é o único ponto
  // em que dá para popular process.env a tempo do config/mysql, que lê as
  // variáveis na importação. Ver o cabeçalho de tests/env.ts.
  setupFiles: ['<rootDir>/tests/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // uuid v13 é ESM puro e o Jest roda em CommonJS — ver tests/__mocks__/uuid.ts
    '^uuid$': '<rootDir>/tests/__mocks__/uuid.ts'
  }
};
