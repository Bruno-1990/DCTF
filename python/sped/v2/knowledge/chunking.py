"""
Sistema de Chunking Inteligente para RAG
Divide documentos em chunks semânticos preservando contexto e metadados
"""

import re
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from .document_parser import ParsedDocument, DocumentSection


@dataclass
class Chunk:
    """Chunk de texto com metadados"""
    chunk_index: int
    chunk_text: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    article_number: Optional[str] = None
    context: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    # Para referências cruzadas
    references: List[str] = field(default_factory=list)  # IDs de chunks relacionados
    priority: int = 1  # 1 = normal, 2 = importante, 3 = muito importante


class IntelligentChunker:
    """Sistema de chunking inteligente com múltiplas estratégias"""
    
    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        min_chunk_size: int = 100,
        preserve_sections: bool = True,
        preserve_articles: bool = True
    ):
        """
        Args:
            chunk_size: Tamanho máximo do chunk em caracteres
            chunk_overlap: Sobreposição entre chunks em caracteres
            min_chunk_size: Tamanho mínimo do chunk
            preserve_sections: Preservar limites de seções
            preserve_articles: Preservar limites de artigos
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
        self.preserve_sections = preserve_sections
        self.preserve_articles = preserve_articles
    
    def chunk_document(self, parsed_doc: ParsedDocument) -> List[Chunk]:
        """
        Divide um documento parseado em chunks inteligentes
        
        Estratégia:
        1. Se preserve_sections=True: chunking por seção primeiro
        2. Se preserve_articles=True: chunking por artigo dentro das seções
        3. Chunking por tamanho com overlap para seções/artigos grandes
        4. Priorização de chunks importantes (títulos, artigos)
        """
        chunks: List[Chunk] = []
        
        if self.preserve_sections and parsed_doc.sections:
            # Estratégia 1: Chunking por seção (preserva contexto semântico)
            chunks = self._chunk_by_sections(parsed_doc)
        else:
            # Estratégia 2: Chunking por tamanho com overlap (fallback)
            chunks = self._chunk_by_size(parsed_doc.full_text, parsed_doc.pages)
        
        # Adicionar referências cruzadas
        chunks = self._add_cross_references(chunks)
        
        # Priorizar chunks importantes
        chunks = self._prioritize_chunks(chunks)
        
        return chunks
    
    def _chunk_by_sections(self, parsed_doc: ParsedDocument) -> List[Chunk]:
        """Chunking por seção, preservando estrutura"""
        chunks: List[Chunk] = []
        chunk_index = 0
        
        for section in parsed_doc.sections:
            section_text = section.content or ""
            section_title = section.title
            
            if not section_text.strip():
                continue
            
            # Se a seção é pequena, criar um único chunk
            if len(section_text) <= self.chunk_size:
                chunk = Chunk(
                    chunk_index=chunk_index,
                    chunk_text=section_text,
                    section_title=section_title,
                    article_number=section.article_number,
                    context=self._extract_context(section_title, section.article_number),
                    metadata={
                        'section_level': section.level,
                        'is_section_header': True,
                    }
                )
                chunks.append(chunk)
                chunk_index += 1
            else:
                # Seção grande: dividir com overlap
                section_chunks = self._chunk_text_with_overlap(
                    text=section_text,
                    chunk_index_start=chunk_index,
                    section_title=section_title,
                    article_number=section.article_number,
                    section_level=section.level
                )
                chunks.extend(section_chunks)
                chunk_index += len(section_chunks)
        
        return chunks
    
    def _chunk_text_with_overlap(
        self,
        text: str,
        chunk_index_start: int,
        section_title: Optional[str] = None,
        article_number: Optional[str] = None,
        section_level: int = 1
    ) -> List[Chunk]:
        """Divide texto em chunks com overlap, preservando sentenças"""
        chunks: List[Chunk] = []
        chunk_index = chunk_index_start
        
        # Dividir em parágrafos primeiro
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        current_chunk_text = ""
        current_chunk_start = 0
        
        for para in paragraphs:
            # Se adicionar este parágrafo exceder o tamanho, finalizar chunk atual
            if current_chunk_text and len(current_chunk_text + "\n\n" + para) > self.chunk_size:
                # Criar chunk
                chunk = Chunk(
                    chunk_index=chunk_index,
                    chunk_text=current_chunk_text.strip(),
                    section_title=section_title,
                    article_number=article_number,
                    context=self._extract_context(section_title, article_number),
                    metadata={
                        'section_level': section_level,
                        'is_continuation': chunk_index > chunk_index_start,
                    }
                )
                chunks.append(chunk)
                chunk_index += 1
                
                # Iniciar novo chunk com overlap
                # Pegar últimas sentenças do chunk anterior para contexto
                overlap_text = self._get_overlap_text(current_chunk_text, self.chunk_overlap)
                current_chunk_text = overlap_text + "\n\n" + para
            else:
                # Adicionar parágrafo ao chunk atual
                if current_chunk_text:
                    current_chunk_text += "\n\n" + para
                else:
                    current_chunk_text = para
        
        # Adicionar último chunk
        if current_chunk_text.strip():
            chunk = Chunk(
                chunk_index=chunk_index,
                chunk_text=current_chunk_text.strip(),
                section_title=section_title,
                article_number=article_number,
                context=self._extract_context(section_title, article_number),
                metadata={
                    'section_level': section_level,
                    'is_continuation': chunk_index > chunk_index_start,
                    'is_last_chunk': True,
                }
            )
            chunks.append(chunk)
        
        return chunks
    
    def _chunk_by_size(self, full_text: str, pages: List[str]) -> List[Chunk]:
        """Chunking simples por tamanho com overlap (fallback)"""
        chunks: List[Chunk] = []
        chunk_index = 0
        
        # Dividir em parágrafos
        paragraphs = [p.strip() for p in full_text.split('\n\n') if p.strip()]
        
        current_chunk_text = ""
        
        for para in paragraphs:
            if current_chunk_text and len(current_chunk_text + "\n\n" + para) > self.chunk_size:
                # Finalizar chunk atual
                chunk = Chunk(
                    chunk_index=chunk_index,
                    chunk_text=current_chunk_text.strip(),
                    metadata={'chunking_method': 'size_based'}
                )
                chunks.append(chunk)
                chunk_index += 1
                
                # Overlap: últimas sentenças do chunk anterior
                overlap_text = self._get_overlap_text(current_chunk_text, self.chunk_overlap)
                current_chunk_text = overlap_text + "\n\n" + para
            else:
                if current_chunk_text:
                    current_chunk_text += "\n\n" + para
                else:
                    current_chunk_text = para
        
        # Último chunk
        if current_chunk_text.strip():
            chunk = Chunk(
                chunk_index=chunk_index,
                chunk_text=current_chunk_text.strip(),
                metadata={'chunking_method': 'size_based', 'is_last_chunk': True}
            )
            chunks.append(chunk)
        
        return chunks
    
    def _get_overlap_text(self, text: str, overlap_size: int) -> str:
        """Extrai texto de overlap do final do chunk anterior"""
        if len(text) <= overlap_size:
            return text
        
        # Pegar últimas N caracteres
        overlap = text[-overlap_size:]
        
        # Tentar começar em uma sentença completa
        sentences = re.split(r'[.!?]\s+', overlap)
        if len(sentences) > 1:
            # Pegar a partir da segunda sentença (ignorar primeira que pode estar cortada)
            overlap = '. '.join(sentences[1:])
        
        return overlap.strip()
    
    def _extract_context(self, section_title: Optional[str], article_number: Optional[str]) -> str:
        """Extrai contexto resumido para o chunk"""
        context_parts = []
        
        if section_title:
            context_parts.append(f"Seção: {section_title[:50]}")
        
        if article_number:
            context_parts.append(f"Artigo: {article_number}")
        
        return " | ".join(context_parts) if context_parts else None
    
    def _add_cross_references(self, chunks: List[Chunk]) -> List[Chunk]:
        """Adiciona referências cruzadas entre chunks relacionados"""
        # Identificar referências no texto (ex: "conforme Art. 12", "ver Seção 5.2")
        reference_patterns = [
            r'(?:conforme|segundo|ver|vide)\s+(?:o\s+)?(?:Art\.?\s*|Artigo\s*)(\d+)',
            r'(?:conforme|segundo|ver|vide)\s+(?:a\s+)?(?:Seção|Seç\.?)\s+([\d.]+)',
            r'§\s*(\d+|único)',
        ]
        
        for i, chunk in enumerate(chunks):
            chunk_text = chunk.chunk_text
            
            # Procurar referências
            for pattern in reference_patterns:
                matches = re.finditer(pattern, chunk_text, re.IGNORECASE)
                for match in matches:
                    ref_text = match.group(0)
                    
                    # Tentar encontrar o chunk referenciado
                    referenced_chunk = self._find_referenced_chunk(
                        ref_text, chunks, chunk.article_number, chunk.section_title
                    )
                    
                    if referenced_chunk:
                        chunk.references.append(str(referenced_chunk.chunk_index))
                        # Adicionar referência bidirecional
                        if str(chunk.chunk_index) not in referenced_chunk.references:
                            referenced_chunk.references.append(str(chunk.chunk_index))
        
        return chunks
    
    def _find_referenced_chunk(
        self,
        ref_text: str,
        chunks: List[Chunk],
        current_article: Optional[str],
        current_section: Optional[str]
    ) -> Optional[Chunk]:
        """Encontra o chunk referenciado pelo texto"""
        # Procurar por número de artigo
        article_match = re.search(r'Art\.?\s*(\d+)', ref_text, re.IGNORECASE)
        if article_match:
            article_num = article_match.group(1)
            for chunk in chunks:
                if chunk.article_number == article_num:
                    return chunk
        
        # Procurar por seção
        section_match = re.search(r'Seção\s+([\d.]+)', ref_text, re.IGNORECASE)
        if section_match:
            section_ref = section_match.group(1)
            for chunk in chunks:
                if chunk.section_title and section_ref in chunk.section_title:
                    return chunk
        
        return None
    
    def _prioritize_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """Prioriza chunks importantes (títulos, artigos, definições)"""
        priority_keywords = [
            r'^definição',
            r'^conceito',
            r'^objetivo',
            r'^finalidade',
            r'^validação',
            r'^regra',
            r'^obrigatório',
            r'^exigência',
        ]
        
        for chunk in chunks:
            # Chunks de cabeçalho de seção são importantes
            if chunk.metadata.get('is_section_header'):
                chunk.priority = 3
            
            # Chunks com artigos são importantes
            elif chunk.article_number:
                chunk.priority = 2
            
            # Chunks com palavras-chave importantes
            elif any(re.match(pattern, chunk.chunk_text[:100], re.IGNORECASE) 
                    for pattern in priority_keywords):
                chunk.priority = 2
            
            # Chunks com muitas referências são importantes
            elif len(chunk.references) > 2:
                chunk.priority = 2
        
        return chunks
    
    def assign_page_numbers(self, chunks: List[Chunk], pages: List[str]) -> List[Chunk]:
        """Atribui números de página aos chunks baseado no texto"""
        if not pages:
            return chunks
        
        # Criar mapa de texto -> página
        page_text_map = {}
        for page_num, page_text in enumerate(pages, start=1):
            # Extrair primeiras palavras de cada página para matching
            first_words = ' '.join(page_text.split()[:20])
            page_text_map[first_words] = page_num
        
        # Atribuir páginas aos chunks
        for chunk in chunks:
            # Procurar correspondência com início de página
            chunk_start = chunk.chunk_text[:200]
            chunk_words = ' '.join(chunk_start.split()[:20])
            
            # Tentar encontrar página correspondente
            for page_start, page_num in page_text_map.items():
                if chunk_words in page_start or page_start in chunk_words:
                    chunk.page_number = page_num
                    break
        
        return chunks


def chunk_document(
    parsed_doc: ParsedDocument,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    preserve_sections: bool = True
) -> List[Chunk]:
    """
    Função principal para chunking de documentos
    
    Args:
        parsed_doc: Documento parseado
        chunk_size: Tamanho máximo do chunk
        chunk_overlap: Sobreposição entre chunks
        preserve_sections: Preservar limites de seções
        
    Returns:
        Lista de chunks com metadados
    """
    chunker = IntelligentChunker(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        preserve_sections=preserve_sections
    )
    
    chunks = chunker.chunk_document(parsed_doc)
    
    # Atribuir números de página se disponíveis
    if parsed_doc.pages:
        chunks = chunker.assign_page_numbers(chunks, parsed_doc.pages)
    
    return chunks


if __name__ == "__main__":
    # Teste básico
    from .document_parser import parse_document
    
    import sys
    if len(sys.argv) < 2:
        print("Uso: python chunking.py <caminho_do_arquivo>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    print(f"📄 Parseando e chunking documento: {file_path}")
    
    try:
        # Parsear documento
        parsed = parse_document(file_path)
        
        # Chunking
        chunks = chunk_document(parsed, chunk_size=1000, chunk_overlap=200)
        
        print(f"\n✅ Documento chunked com sucesso!")
        print(f"   Total de chunks: {len(chunks)}")
        print(f"   Tamanho médio: {sum(len(c.chunk_text) for c in chunks) / len(chunks):.0f} caracteres")
        
        print(f"\n📑 Primeiros 5 chunks:")
        for i, chunk in enumerate(chunks[:5], 1):
            print(f"\n   Chunk {chunk.chunk_index}:")
            print(f"      Tamanho: {len(chunk.chunk_text)} caracteres")
            print(f"      Seção: {chunk.section_title or 'N/A'}")
            print(f"      Artigo: {chunk.article_number or 'N/A'}")
            print(f"      Página: {chunk.page_number or 'N/A'}")
            print(f"      Prioridade: {chunk.priority}")
            print(f"      Referências: {len(chunk.references)}")
            print(f"      Preview: {chunk.chunk_text[:100]}...")
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

