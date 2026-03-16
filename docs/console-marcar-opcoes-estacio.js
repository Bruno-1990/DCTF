/**
 * Console da página – marcar opção correta (Estácio)
 *
 * Como abrir o console:
 * 1. Na página do exercício (estacio.saladeavaliacoes.com.br), pressione F12
 *    ou clique com o botão direito > "Inspecionar" > aba "Console"
 * 2. Cole o script abaixo (ou só a função marcarOpcao) e altere o texto da opção correta
 * 3. Pressione Enter
 */

(function() {
  // ALTERE para o texto exato da alternativa correta da questão atual
  const TEXTO_DA_OPCAO_CORRETA = 'II e III';

  function encontrarEClicar(texto) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === texto) {
        let el = node.parentElement;
        while (el && el !== document.body) {
          if (el.click && typeof el.click === 'function') {
            el.click();
            console.log('Clicado em:', el);
            return true;
          }
          el = el.parentElement;
        }
      }
    }
    console.log('Texto "' + texto + '" não encontrado.');
    return false;
  }

  encontrarEClicar(TEXTO_DA_OPCAO_CORRETA);
})();

/* --- Função global para usar direto no console (opcional) ---
 * Exemplo: marcarOpcao('if(x>0) x++; if(x<0) x--;')
 */
function marcarOpcao(texto) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.trim() === texto) {
      let el = node.parentElement;
      while (el && el !== document.body) {
        if (el.click) { el.click(); console.log('Clicado:', el); return true; }
        el = el.parentElement;
      }
    }
  }
  console.log('Não encontrado:', texto);
  return false;
}
