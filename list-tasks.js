const fs = require('fs');
const path = require('path');

// Ler o arquivo de tarefas
const tasksFile = path.join(__dirname, '.taskmaster', 'tasks', 'tasks.json');
const tasksData = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));

// Obter a tag atual
const currentTag = tasksData.currentTag;
const tagData = tasksData.tags[currentTag];

console.log(`\n📋 Task Master - Lista de Tarefas`);
console.log(`Tag Ativa: ${currentTag}`);
console.log(`Total de Tarefas: ${tagData.tasks.length}`);
console.log(`Descrição: ${tagData.description}`);
console.log(`\n${'='.repeat(60)}\n`);

// Listar as tarefas
tagData.tasks.forEach((task, index) => {
    const priority = task.priority === 'high' ? '🔥' : '🔶';
    const status = task.status === 'pending' ? '⏳' : '✅';
    
    console.log(`${priority} ${task.id}. ${task.title}`);
    console.log(`   Status: ${status} ${task.status.toUpperCase()}`);
    console.log(`   Prioridade: ${task.priority.toUpperCase()}`);
    console.log(`   Dependências: ${task.dependencies.length > 0 ? task.dependencies.join(', ') : 'Nenhuma'}`);
    console.log(`   Descrição: ${task.description}`);
    console.log(`   \n`);
});

// Estatísticas
const stats = {
    total: tagData.tasks.length,
    high: tagData.tasks.filter(t => t.priority === 'high').length,
    medium: tagData.tasks.filter(t => t.priority === 'medium').length,
    pending: tagData.tasks.filter(t => t.status === 'pending').length,
    completed: tagData.tasks.filter(t => t.status === 'done').length
};

console.log(`\n📊 Estatísticas:`);
console.log(`   Total: ${stats.total} tarefas`);
console.log(`   Alta Prioridade: ${stats.high} tarefas`);
console.log(`   Média Prioridade: ${stats.medium} tarefas`);
console.log(`   Pendentes: ${stats.pending} tarefas`);
console.log(`   Completas: ${stats.completed} tarefas`);
console.log(`   Progresso: ${Math.round((stats.completed / stats.total) * 100)}%\n`);
