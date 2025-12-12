#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de edição de arquivos SPED
Permite modificar valores específicos preservando a estrutura do arquivo
"""
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import re
import logging

# Importar split_sped_line do parsers
try:
    from parsers import split_sped_line
except ImportError:
    # Fallback se não conseguir importar
    def split_sped_line(line: str, min_fields: int = 0) -> List[str]:
        line = line.rstrip("\n\r")
        if line and not line.endswith("|"):
            line = line + "|"
        fields = line.split("|")
        if min_fields > 0 and len(fields) < min_fields:
            fields.extend([""] * (min_fields - len(fields)))
        return fields

logger = logging.getLogger(__name__)


class SpedEditor:
    """Editor de arquivos SPED que preserva estrutura e formatação"""
    
    def __init__(self, sped_path: Path):
        """
        Inicializa editor com arquivo SPED
        
        Args:
            sped_path: Caminho para arquivo SPED
        """
        self.sped_path = Path(sped_path)
        self.lines: List[str] = []
        self.original_lines: List[str] = []
        self._load_file()
    
    def _load_file(self):
        """Carrega arquivo SPED em memória"""
        if not self.sped_path.exists():
            raise FileNotFoundError(f"Arquivo SPED não encontrado: {self.sped_path}")
        
        with open(self.sped_path, 'r', encoding='utf-8') as f:
            self.lines = f.readlines()
            self.original_lines = self.lines.copy()
        
        logger.info(f"Arquivo SPED carregado: {len(self.lines)} linhas")
    
    def find_line_by_record(self, registro: str, chave: Optional[str] = None, 
                           cfop: Optional[str] = None, cst: Optional[str] = None,
                           campo: Optional[str] = None, linha_sped: Optional[int] = None) -> List[int]:
        """
        Encontra linhas que correspondem a um registro específico
        
        Args:
            registro: Tipo de registro (C100, C170, C190, etc.)
            chave: Chave da NF (opcional, para C100/C170)
            cfop: CFOP (opcional, para C170/C190)
            cst: CST (opcional, para C170/C190)
            campo: Campo específico a modificar (opcional)
            linha_sped: Número da linha no SPED (1-indexed, opcional)
        
        Returns:
            Lista de índices de linhas que correspondem (0-indexed)
        """
        # Se temos linha_sped, usar diretamente (convertendo de 1-indexed para 0-indexed)
        if linha_sped is not None and linha_sped > 0:
            idx = linha_sped - 1  # Converter de 1-indexed para 0-indexed
            if 0 <= idx < len(self.lines):
                line = self.lines[idx]
                if line.startswith(f"{registro}|"):
                    return [idx]
            return []
        
        indices = []
        registro_pattern = f"^{registro}\\|"
        
        for idx, line in enumerate(self.lines):
            if re.match(registro_pattern, line):
                # Usar split_sped_line para garantir índices corretos
                parts = split_sped_line(line)
                
                # Se temos chave, verificar se corresponde
                if chave:
                    # Extrair chave da linha (posição varia por registro)
                    if registro == "C100":
                        # C100|CHAVE|... (posição 2 após split)
                        if len(parts) > 2:
                            linha_chave = parts[2].strip()
                            if linha_chave != chave:
                                continue
                    elif registro == "C170":
                        # C170 precisa verificar chave do C100 pai
                        # Por enquanto, vamos buscar por CFOP/CST
                        pass
                
                # Se temos CFOP, verificar
                if cfop:
                    if registro == "C170":
                        # C170|NUM_ITEM|COD_ITEM|DESCR_COMPL|QTD|UNID|VL_ITEM|VL_DESC|CFOP|... (posição 8)
                        if len(parts) > 8:
                            linha_cfop = parts[8].strip()
                            if linha_cfop != cfop:
                                continue
                    elif registro == "C190":
                        # C190|CFOP|... (posição 2)
                        if len(parts) > 2:
                            linha_cfop = parts[2].strip()
                            if linha_cfop != cfop:
                                continue
                
                # Se temos CST, verificar
                if cst:
                    if registro == "C170":
                        # C170|...|CST_ICMS|... (posição 7)
                        if len(parts) > 7:
                            linha_cst = parts[7].strip()
                            if linha_cst != cst:
                                continue
                    elif registro == "C190":
                        # C190|CFOP|CST_ICMS|... (posição 3)
                        if len(parts) > 3:
                            linha_cst = parts[3].strip()
                            if linha_cst != cst:
                                continue
                
                indices.append(idx)
        
        return indices
    
    def get_field_position(self, registro: str, campo: str) -> Optional[int]:
        """
        Retorna posição do campo no registro conforme layout SPED
        
        Args:
            registro: Tipo de registro (C100, C170, C190, etc.)
            campo: Nome do campo (VL_BC_ICMS, VL_ICMS, etc.)
        
        Returns:
            Posição do campo (índice na lista split por |) ou None
        """
        # Mapeamento de campos para posições conforme layout SPED
        campos_map = {
            "C100": {
                "VL_BC_ICMS": 15,
                "VL_ICMS": 16,
                "VL_BC_ICMS_ST": 17,
                "VL_ICMS_ST": 18,
                "VL_IPI": 19,
                "VL_FRETE": 20,
                "VL_SEG": 21,
                "VL_DESC": 22,
                "VL_OUT_ENT": 23,
                "VL_TOT": 24,
            },
            "C170": {
                "VL_BC_ICMS": 9,
                "VL_ICMS": 10,
                "VL_BC_ICMS_ST": 11,
                "VL_ICMS_ST": 12,
                "VL_IPI": 13,
                "VL_UNIT": 14,
                "VL_ITEM": 15,
            },
            "C190": {
                "VL_BC_ICMS": 4,
                "VL_ICMS": 5,
                "VL_BC_ICMS_ST": 6,
                "VL_ICMS_ST": 7,
                "VL_IPI": 8,
            }
        }
        
        if registro in campos_map and campo in campos_map[registro]:
            return campos_map[registro][campo]
        
        return None
    
    def update_field(self, registro: str, campo: str, novo_valor: float,
                    chave: Optional[str] = None, cfop: Optional[str] = None,
                    cst: Optional[str] = None, linha_indice: Optional[int] = None,
                    linha_sped: Optional[int] = None) -> bool:
        """
        Atualiza um campo específico em um registro
        
        Args:
            registro: Tipo de registro (C100, C170, C190)
            campo: Nome do campo a modificar
            novo_valor: Novo valor (será formatado como string com 2 decimais)
            chave: Chave da NF (para C100/C170)
            cfop: CFOP (para C170/C190)
            cst: CST (para C170/C190)
            linha_indice: Índice específico da linha (se conhecido)
        
        Returns:
            True se atualizado com sucesso, False caso contrário
        """
        # Encontrar linha(s) a modificar
        if linha_indice is not None:
            indices = [linha_indice]
        elif linha_sped is not None:
            # linha_sped é 1-indexed, converter para 0-indexed
            indices = self.find_line_by_record(registro, chave=chave, cfop=cfop, cst=cst, linha_sped=linha_sped)
        else:
            indices = self.find_line_by_record(registro, chave=chave, cfop=cfop, cst=cst)
        
        if not indices:
            logger.warning(f"Nenhuma linha encontrada para {registro} com chave={chave}, cfop={cfop}, cst={cst}")
            return False
        
        # Obter posição do campo
        posicao = self.get_field_position(registro, campo)
        if posicao is None:
            logger.warning(f"Campo {campo} não encontrado no registro {registro}")
            return False
        
        # Formatar novo valor (2 decimais, sem separador de milhar)
        valor_formatado = f"{novo_valor:.2f}".replace(".", ",")
        
        # Atualizar cada linha encontrada
        atualizado = False
        for idx in indices:
            line = self.lines[idx]
            # Usar split_sped_line para garantir índices corretos
            parts = split_sped_line(line)
            
            # Verificar se tem posição suficiente
            if len(parts) <= posicao:
                logger.warning(f"Linha {idx + 1} não tem posição {posicao} para campo {campo} (tem {len(parts)} campos)")
                continue
            
            # Atualizar valor
            valor_antigo = parts[posicao]
            parts[posicao] = valor_formatado
            
            # Reconstruir linha preservando estrutura
            # Remover primeiro campo vazio se existir (split_sped_line pode adicionar)
            if parts and parts[0] == '':
                parts = parts[1:]
            
            nova_linha = '|'.join(parts)
            
            # Garantir que termina com | para preservar estrutura
            if not nova_linha.rstrip().endswith('|'):
                nova_linha += '|'
            
            # Adicionar newline se original tinha
            if line.endswith('\n'):
                nova_linha += '\n'
            elif line.endswith('\r\n'):
                nova_linha += '\r\n'
            
            self.lines[idx] = nova_linha
            atualizado = True
            
            logger.info(f"Linha {idx + 1} atualizada: {campo} de {valor_antigo} para {valor_formatado}")
        
        return atualizado
    
    def add_record(self, registro: str, valores: Dict[str, any]) -> bool:
        """
        Adiciona um novo registro ao SPED
        
        Args:
            registro: Tipo de registro (C100, C170, C190, etc.)
            valores: Dicionário com valores dos campos (chave = nome do campo ou posição)
        
        Returns:
            True se adicionado com sucesso
        """
        # Construir linha do registro
        parts = [registro]
        
        # Adicionar valores nas posições corretas
        # Por enquanto, vamos usar um método simples baseado em ordem
        # TODO: Implementar mapeamento completo de campos
        
        linha = '|'.join(parts) + '|'
        
        # Encontrar posição apropriada para inserir
        # Para C190, inserir após último C170 do mesmo CFOP/CST
        # Para C170, inserir após último C170 do mesmo C100
        
        # Por enquanto, adicionar no final (antes do registro 9999)
        for idx in range(len(self.lines) - 1, -1, -1):
            if self.lines[idx].startswith('9999|'):
                self.lines.insert(idx, linha + '\n')
                logger.info(f"Registro {registro} adicionado na linha {idx}")
                return True
        
        # Se não encontrou 9999, adicionar no final
        self.lines.append(linha + '\n')
        logger.info(f"Registro {registro} adicionado no final")
        return True
    
    def save(self, output_path: Optional[Path] = None) -> Path:
        """
        Salva arquivo SPED modificado
        
        Args:
            output_path: Caminho para salvar (se None, sobrescreve original)
        
        Returns:
            Caminho do arquivo salvo
        """
        if output_path is None:
            output_path = self.sped_path
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.writelines(self.lines)
        
        logger.info(f"Arquivo SPED salvo em: {output_path}")
        return output_path
    
    def get_changes_summary(self) -> Dict[str, any]:
        """
        Retorna resumo das alterações realizadas
        
        Returns:
            Dicionário com informações das alterações
        """
        changes = []
        
        for idx, (original, modified) in enumerate(zip(self.original_lines, self.lines)):
            if original != modified:
                changes.append({
                    "linha": idx + 1,
                    "original": original.strip(),
                    "modificado": modified.strip()
                })
        
        return {
            "total_alteracoes": len(changes),
            "alteracoes": changes
        }


def aplicar_correcao_c170_c190(sped_path: Path, correcao: Dict[str, any], output_path: Optional[Path] = None) -> Tuple[bool, Path, Dict[str, any]]:
    """
    Aplica correção automática para divergência C170 x C190
    
    Args:
        sped_path: Caminho do arquivo SPED original
        correcao: Dicionário com informações da correção:
            {
                "registro_corrigir": "C190" ou "C170",
                "campo": "VL_BC_ICMS",
                "valor_correto": 4202.00,
                "chave": "32250939808246000120",
                "cfop": "1407",
                "cst": "060",
                "linha_sped": 1234  # opcional
            }
    
    Returns:
        Tupla (sucesso, caminho_arquivo_corrigido, resumo_alteracoes)
    """
    try:
        editor = SpedEditor(sped_path)
        
        registro = correcao.get("registro_corrigir", "C190")
        campo = correcao.get("campo", "VL_BC_ICMS")
        valor_correto = float(correcao.get("valor_correto", 0))
        chave = correcao.get("chave")
        cfop = correcao.get("cfop")
        cst = correcao.get("cst")
        linha_sped = correcao.get("linha_sped")
        
        # Se C190 não existe e precisa ser criado
        if registro == "C190" and valor_correto > 0:
            # Verificar se C190 já existe
            indices_c190 = editor.find_line_by_record("C190", cfop=cfop, cst=cst, linha_sped=linha_sped)
            
            if not indices_c190:
                # C190 não existe, precisa criar
                # Buscar último C190 para usar como template ou criar novo
                # Por enquanto, vamos tentar encontrar próximo C190 para inserir antes
                # TODO: Implementar criação completa de C190 com todos os campos
                logger.warning(f"C190 não existe para CFOP {cfop} / CST {cst}. Criação completa ainda não implementada.")
                return (False, sped_path, {
                    "erro": "C190 não existe e criação completa ainda não implementada",
                    "sugestao": f"Criar C190 manualmente com CFOP {cfop}, CST {cst}, {campo} = {valor_correto:.2f}"
                })
            else:
                # C190 existe, atualizar
                sucesso = editor.update_field(
                    registro=registro,
                    campo=campo,
                    novo_valor=valor_correto,
                    cfop=cfop,
                    cst=cst,
                    linha_sped=linha_sped
                )
        else:
            # Atualizar campo existente
            sucesso = editor.update_field(
                registro=registro,
                campo=campo,
                novo_valor=valor_correto,
                chave=chave,
                cfop=cfop,
                cst=cst,
                linha_sped=linha_sped
            )
        
        if not sucesso:
            return (False, sped_path, {"erro": "Não foi possível aplicar correção"})
        
        # Salvar arquivo corrigido no caminho especificado ou gerar nome automático
        if output_path is None:
            output_path = sped_path.parent / f"{sped_path.stem}_corrigido{sped_path.suffix}"
        else:
            output_path = Path(output_path)
        
        editor.save(output_path)
        
        resumo = editor.get_changes_summary()
        
        return (True, output_path, resumo)
    
    except Exception as e:
        logger.error(f"Erro ao aplicar correção: {e}")
        import traceback
        traceback.print_exc()
        return (False, sped_path, {"erro": str(e)})

