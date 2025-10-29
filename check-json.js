const fs = require('fs');

// Ler o arquivo atual
const content = fs.readFileSync('.taskmaster/tasks/tasks.json', 'utf8');

// Tentar parsear para ver se há erros
try {
  const data = JSON.parse(content);
  console.log('JSON válido!');
  console.log('Total de tarefas:', data.tags.principal.tasks.length);
} catch (e) {
  console.log('Erro ao parsear:', e.message);
  
  // Tentar corrigir o arquivo
  try {
    // Ler linha por linha para encontrar o problema
    const lines = content.split('\n');
    console.log('Linha 265:', lines[264]);
    console.log('Linha 264:', lines[263]);
    console.log('Linha 263:', lines[262]);
  } catch (err) {
    console.log('Erro ao ler linhas:', err.message);
  }
}

