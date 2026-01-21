"""
Extrator de Regras Estruturadas de Documentos Legais
Identifica e extrai regras de validação, obrigatoriedades, tolerâncias e exceções
"""

import re
from typing import List, Dict, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import date
from .document_parser import ParsedDocument, DocumentSection
from .chunking import Chunk


@dataclass
class ExtractedRule:
    """Regra estruturada extraída de um documento"""
    rule_type: str  # VALIDACAO, OBRIGATORIEDADE, TOLERANCIA, EXCECAO
    rule_category: Optional[str] = None  # C100, C170, C190, E110, etc.
    rule_description: str = ""
    rule_condition: Optional[str] = None  # Condição lógica/SQL
    legal_reference: Optional[str] = None  # "Guia Prático 3.2.1, Seção 5.2.3"
    article_reference: Optional[str] = None  # "Art. 12, § 3º"
    section_reference: Optional[str] = None  # "Seção 5.2.3"
    vigencia_inicio: Optional[date] = None
    vigencia_fim: Optional[date] = None
    chunk_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class RuleExtractor:
    """Extrator de regras estruturadas de documentos legais"""
    
    def __init__(self):
        # Padrões para identificar tipos de regras
        self.validation_patterns = [
            r'deve\s+(?:ser|estar|ter|conter|existir|bater|igualar)',
            r'devem\s+(?:ser|estar|ter|conter|existir|bater|igualar)',
            r'validar',
            r'validação',
            r'verificar',
            r'verificação',
            r'conferir',
            r'conferência',
            r'comparar',
            r'comparar-se',
            r'igualar',
            r'igualar-se',
            r'bater\s+com',
            r'corresponder',
            r'corresponder-se',
        ]
        
        self.obligation_patterns = [
            r'é\s+obrigatório',
            r'são\s+obrigatórios',
            r'obrigatório\s+(?:o|a|os|as)',
            r'obrigatória\s+(?:o|a|os|as)',
            r'deve\s+ser\s+preenchido',
            r'devem\s+ser\s+preenchidos',
            r'exigir',
            r'exige',
            r'exigência',
            r'requer',
            r'requisito',
            r'necessário',
            r'necessária',
        ]
        
        self.tolerance_patterns = [
            r'tolerância',
            r'tolerâncias',
            r'permitido\s+(?:diferença|divergência)',
            r'permitida\s+(?:diferença|divergência)',
            r'aceita\s+(?:diferença|divergência)',
            r'aceita-se\s+(?:diferença|divergência)',
            r'até\s+(?:R\$|R\$\s*)?[\d.,]+\s*(?:de\s+)?(?:diferença|divergência)',
            r'margem\s+de\s+erro',
            r'variação\s+permitida',
        ]
        
        self.exception_patterns = [
            r'exceção',
            r'exceções',
            r'exceto',
            r'excetuando',
            r'salvo',
            r'exceto\s+nos\s+casos',
            r'exceto\s+quando',
            r'observadas\s+as\s+exceções',
            r'observadas\s+exceções',
            r'não\s+se\s+aplica',
            r'não\s+se\s+aplicam',
        ]
        
        # Padrões para identificar categorias SPED
        self.category_patterns = {
            'C100': r'\bC100\b',
            'C170': r'\bC170\b',
            'C190': r'\bC190\b',
            'C197': r'\bC197\b',
            'E100': r'\bE100\b',
            'E110': r'\bE110\b',
            'E111': r'\bE111\b',
            'E112': r'\bE112\b',
            'E116': r'\bE116\b',
            'E210': r'\bE210\b',
            'E220': r'\bE220\b',
            'E300': r'\bE300\b',
            'E310': r'\bE310\b',
            '0150': r'\b0150\b',
            '0190': r'\b0190\b',
            '0200': r'\b0200\b',
            '0220': r'\b0220\b',
        }
    
    def extract_rules(
        self,
        parsed_doc: ParsedDocument,
        chunks: Optional[List[Chunk]] = None
    ) -> List[ExtractedRule]:
        """
        Extrai regras estruturadas de um documento parseado
        
        Args:
            parsed_doc: Documento parseado
            chunks: Lista de chunks (opcional, para rastreabilidade)
            
        Returns:
            Lista de regras extraídas
        """
        rules: List[ExtractedRule] = []
        
        # Extrair regras das seções
        for section in parsed_doc.sections:
            section_rules = self._extract_rules_from_section(
                section,
                parsed_doc,
                chunks
            )
            rules.extend(section_rules)
        
        # Extrair regras do texto completo (fallback)
        if not rules:
            full_text_rules = self._extract_rules_from_text(
                parsed_doc.full_text,
                parsed_doc,
                chunks
            )
            rules.extend(full_text_rules)
        
        return rules
    
    def _extract_rules_from_section(
        self,
        section: DocumentSection,
        parsed_doc: ParsedDocument,
        chunks: Optional[List[Chunk]] = None
    ) -> List[ExtractedRule]:
        """Extrai regras de uma seção específica"""
        rules: List[ExtractedRule] = []
        text = section.content or ""
        
        if not text.strip():
            return rules
        
        # Identificar tipo de regra
        rule_type = self._identify_rule_type(text)
        if not rule_type:
            return rules
        
        # Identificar categoria SPED
        category = self._identify_category(text)
        
        # Extrair descrição da regra
        description = self._extract_description(text, rule_type)
        
        # Extrair condição
        condition = self._extract_condition(text)
        
        # Construir referência legal
        legal_ref = self._build_legal_reference(parsed_doc, section)
        
        # Encontrar chunk correspondente (se disponível)
        chunk_id = None
        if chunks:
            chunk_id = self._find_matching_chunk(section, chunks)
        
        rule = ExtractedRule(
            rule_type=rule_type,
            rule_category=category,
            rule_description=description,
            rule_condition=condition,
            legal_reference=legal_ref,
            article_reference=section.article_number,
            section_reference=section.title if section.level <= 2 else None,
            vigencia_inicio=parsed_doc.metadata.vigencia_inicio,
            vigencia_fim=parsed_doc.metadata.vigencia_fim,
            chunk_id=chunk_id,
            metadata={
                'section_level': section.level,
                'documento_tipo': parsed_doc.metadata.documento_tipo,
                'documento_nome': parsed_doc.metadata.documento_nome,
                'versao': parsed_doc.metadata.versao,
            }
        )
        
        rules.append(rule)
        
        return rules
    
    def _extract_rules_from_text(
        self,
        text: str,
        parsed_doc: ParsedDocument,
        chunks: Optional[List[Chunk]] = None
    ) -> List[ExtractedRule]:
        """Extrai regras do texto completo (fallback)"""
        rules: List[ExtractedRule] = []
        
        # Dividir em parágrafos
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        for para in paragraphs:
            # Identificar tipo de regra
            rule_type = self._identify_rule_type(para)
            if not rule_type:
                continue
            
            # Identificar categoria
            category = self._identify_category(para)
            
            # Extrair descrição
            description = self._extract_description(para, rule_type)
            
            # Extrair condição
            condition = self._extract_condition(para)
            
            # Construir referência
            legal_ref = f"{parsed_doc.metadata.documento_nome}"
            if parsed_doc.metadata.versao:
                legal_ref += f" {parsed_doc.metadata.versao}"
            
            rule = ExtractedRule(
                rule_type=rule_type,
                rule_category=category,
                rule_description=description,
                rule_condition=condition,
                legal_reference=legal_ref,
                vigencia_inicio=parsed_doc.metadata.vigencia_inicio,
                vigencia_fim=parsed_doc.metadata.vigencia_fim,
                metadata={
                    'documento_tipo': parsed_doc.metadata.documento_tipo,
                    'documento_nome': parsed_doc.metadata.documento_nome,
                    'versao': parsed_doc.metadata.versao,
                }
            )
            
            rules.append(rule)
        
        return rules
    
    def _identify_rule_type(self, text: str) -> Optional[str]:
        """Identifica o tipo de regra (VALIDACAO, OBRIGATORIEDADE, etc.)"""
        text_lower = text.lower()
        
        # Verificar padrões de validação
        for pattern in self.validation_patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return "VALIDACAO"
        
        # Verificar padrões de obrigatoriedade
        for pattern in self.obligation_patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return "OBRIGATORIEDADE"
        
        # Verificar padrões de tolerância
        for pattern in self.tolerance_patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return "TOLERANCIA"
        
        # Verificar padrões de exceção
        for pattern in self.exception_patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return "EXCECAO"
        
        return None
    
    def _identify_category(self, text: str) -> Optional[str]:
        """Identifica a categoria SPED (C100, C170, etc.)"""
        # Procurar por padrões de categoria
        for category, pattern in self.category_patterns.items():
            if re.search(pattern, text, re.IGNORECASE):
                return category
        
        return None
    
    def _extract_description(self, text: str, rule_type: str) -> str:
        """Extrai descrição da regra"""
        # Limpar texto
        text = text.strip()
        
        # Remover quebras de linha excessivas
        text = re.sub(r'\n+', ' ', text)
        
        # Limitar tamanho (primeiras 500 caracteres)
        if len(text) > 500:
            # Tentar cortar em uma sentença completa
            sentences = re.split(r'[.!?]\s+', text[:500])
            if len(sentences) > 1:
                text = '. '.join(sentences[:-1]) + '.'
            else:
                text = text[:500] + '...'
        
        return text
    
    def _extract_condition(self, text: str) -> Optional[str]:
        """Extrai condição lógica da regra"""
        # Procurar por padrões de condição
        # Ex: "se X então Y", "quando X", "caso X"
        
        condition_patterns = [
            r'se\s+([^,]+?)\s+então',
            r'quando\s+([^,]+?)(?:,|\.)',
            r'caso\s+([^,]+?)(?:,|\.)',
            r'onde\s+([^,]+?)(?:,|\.)',
        ]
        
        for pattern in condition_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
    
    def _build_legal_reference(
        self,
        parsed_doc: ParsedDocument,
        section: DocumentSection
    ) -> str:
        """Constrói referência legal completa"""
        parts = []
        
        # Nome do documento
        parts.append(parsed_doc.metadata.documento_nome)
        
        # Versão
        if parsed_doc.metadata.versao:
            parts.append(parsed_doc.metadata.versao)
        
        # Seção
        if section.title and section.level <= 2:
            parts.append(section.title)
        
        return ", ".join(parts)
    
    def _find_matching_chunk(
        self,
        section: DocumentSection,
        chunks: List[Chunk]
    ) -> Optional[str]:
        """Encontra o chunk correspondente a uma seção"""
        section_text = section.content or ""
        section_start = section_text[:100] if section_text else ""
        
        for chunk in chunks:
            if chunk.section_title == section.title:
                return f"{chunk.chunk_index}"
            
            # Verificar se o início do chunk corresponde à seção
            if chunk.chunk_text.startswith(section_start[:50]):
                return f"{chunk.chunk_index}"
        
        return None


def extract_rules_from_document(
    parsed_doc: ParsedDocument,
    chunks: Optional[List[Chunk]] = None
) -> List[ExtractedRule]:
    """
    Função principal para extrair regras de um documento
    
    Args:
        parsed_doc: Documento parseado
        chunks: Lista de chunks (opcional)
        
    Returns:
        Lista de regras extraídas
    """
    extractor = RuleExtractor()
    return extractor.extract_rules(parsed_doc, chunks)


if __name__ == "__main__":
    # Teste básico
    import sys
    from .document_parser import parse_document
    from .chunking import chunk_document
    
    if len(sys.argv) < 2:
        print("Uso: python rule_extractor.py <caminho_do_arquivo>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    print(f"📄 Extraindo regras de: {file_path}")
    
    try:
        # Parsear documento
        parsed = parse_document(file_path)
        
        # Chunking (para rastreabilidade)
        chunks = chunk_document(parsed, chunk_size=1000, chunk_overlap=200)
        
        # Extrair regras
        rules = extract_rules_from_document(parsed, chunks)
        
        print(f"\n✅ {len(rules)} regras extraídas!")
        
        # Agrupar por tipo
        by_type = {}
        for rule in rules:
            rule_type = rule.rule_type
            if rule_type not in by_type:
                by_type[rule_type] = []
            by_type[rule_type].append(rule)
        
        print(f"\n📊 Regras por tipo:")
        for rule_type, rule_list in by_type.items():
            print(f"   {rule_type}: {len(rule_list)}")
        
        # Agrupar por categoria
        by_category = {}
        for rule in rules:
            category = rule.rule_category or "GERAL"
            if category not in by_category:
                by_category[category] = []
            by_category[category].append(rule)
        
        print(f"\n📊 Regras por categoria SPED:")
        for category, rule_list in sorted(by_category.items()):
            print(f"   {category}: {len(rule_list)}")
        
        # Exibir primeiras regras
        print(f"\n📑 Primeiras 5 regras extraídas:")
        for i, rule in enumerate(rules[:5], 1):
            print(f"\n   Regra {i}:")
            print(f"      Tipo: {rule.rule_type}")
            print(f"      Categoria: {rule.rule_category or 'N/A'}")
            print(f"      Descrição: {rule.rule_description[:150]}...")
            print(f"      Referência: {rule.legal_reference or 'N/A'}")
            if rule.article_reference:
                print(f"      Artigo: {rule.article_reference}")
        
    except Exception as e:
        print(f"❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)








