"""
Motor de Correção - Aplica correções no SPED com guardrails e recalculação de totais
"""

from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from dataclasses import dataclass, field
from pathlib import Path
import logging
from collections import defaultdict
import shutil
from datetime import datetime

from .plan_generator import Correcao, PlanoCorrecoes
from .guardrails import Guardrails, ResultadoGuardrail
from ..validation.totaling_engine import TotalingEngine

logger = logging.getLogger(__name__)


@dataclass
class ResultadoCorrecao:
    """Resultado da aplicação de uma correção"""
    correcao_id: str
    sucesso: bool
    registro_alterado: Optional[str] = None  # 'C100', 'C170', 'C190'
    linha_original: Optional[str] = None
    linha_corrigida: Optional[str] = None
    erro: Optional[str] = None
    avisos: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte resultado para dicionário"""
        return {
            'correcao_id': self.correcao_id,
            'sucesso': self.sucesso,
            'registro_alterado': self.registro_alterado,
            'linha_original': self.linha_original,
            'linha_corrigida': self.linha_corrigida,
            'erro': self.erro,
            'avisos': self.avisos,
        }


@dataclass
class ResultadoAplicacao:
    """Resultado completo da aplicação de correções"""
    correcoes_aplicadas: int = 0
    correcoes_falhadas: int = 0
    resultados: List[ResultadoCorrecao] = field(default_factory=list)
    c190_recalculados: int = 0
    validacao_pos_correcao: Optional[Dict[str, Any]] = None
    arquivo_gerado: Optional[Path] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Converte resultado para dicionário"""
        return {
            'correcoes_aplicadas': self.correcoes_aplicadas,
            'correcoes_falhadas': self.correcoes_falhadas,
            'resultados': [r.to_dict() for r in self.resultados],
            'c190_recalculados': self.c190_recalculados,
            'validacao_pos_correcao': self.validacao_pos_correcao,
            'arquivo_gerado': str(self.arquivo_gerado) if self.arquivo_gerado else None,
            'metadata': self.metadata,
        }


class Corrector:
    """Motor de correção para aplicar correções no SPED"""
    
    def __init__(self, guardrails: Optional[Guardrails] = None):
        """
        Inicializa o motor de correção
        
        Args:
            guardrails: Sistema de guardrails (opcional, cria padrão se não fornecido)
        """
        self.guardrails = guardrails or Guardrails()
        self.totaling_engine = TotalingEngine()
    
    def aplicar_correcoes(
        self,
        efd_path: Path,
        plano: PlanoCorrecoes,
        output_path: Optional[Path] = None,
        aplicar_guardrails: bool = True
    ) -> ResultadoAplicacao:
        """
        Aplica correções no arquivo SPED
        
        Args:
            efd_path: Caminho do arquivo SPED original
            plano: Plano de correções
            output_path: Caminho do arquivo SPED corrigido (opcional)
            aplicar_guardrails: Se True, aplica guardrails antes de corrigir
        
        Returns:
            Resultado da aplicação
        """
        resultado = ResultadoAplicacao()
        
        # Filtrar correções se guardrails estiver habilitado
        if aplicar_guardrails:
            plano = self.guardrails.filtrar_correcoes_permitidas(plano)
            resultado.metadata['guardrails_aplicados'] = True
            resultado.metadata['correcoes_filtradas'] = len(plano.correcoes)
        
        # Ler arquivo SPED
        try:
            with efd_path.open("r", encoding="latin1", errors="ignore") as f:
                linhas = f.readlines()
        except Exception as e:
            logger.error(f"Erro ao ler arquivo SPED: {e}")
            resultado.correcoes_falhadas = len(plano.correcoes)
            return resultado
        
        # Criar backup
        backup_path = efd_path.with_suffix('.bak')
        try:
            shutil.copy2(efd_path, backup_path)
            resultado.metadata['backup_criado'] = str(backup_path)
        except Exception as e:
            logger.warning(f"Erro ao criar backup: {e}")
        
        # Aplicar correções
        linhas_corrigidas = linhas.copy()
        correcoes_por_chave: Dict[str, List[Correcao]] = defaultdict(list)
        
        for correcao in plano.correcoes:
            if correcao.chave_nfe:
                correcoes_por_chave[correcao.chave_nfe].append(correcao)
        
        # Processar cada linha
        from parsers import split_sped_line
        
        current_chave = None
        c170_por_chave: Dict[str, List[Tuple[int, List[str]]]] = defaultdict(list)  # {chave: [(linha_idx, campos)]}
        c190_por_chave: Dict[str, List[Tuple[int, List[str]]]] = defaultdict(list)
        c100_por_chave: Dict[str, Tuple[int, List[str]]] = {}  # {chave: (linha_idx, campos)}
        
        for idx, linha in enumerate(linhas_corrigidas):
            if linha.startswith("|C100|"):
                campos = split_sped_line(linha)
                if len(campos) >= 10:
                    current_chave = campos[9].strip() if len(campos) > 9 else None
                    if current_chave:
                        c100_por_chave[current_chave] = (idx, campos)
            
            elif linha.startswith("|C170|") and current_chave:
                campos = split_sped_line(linha)
                c170_por_chave[current_chave].append((idx, campos))
            
            elif linha.startswith("|C190|") and current_chave:
                campos = split_sped_line(linha)
                c190_por_chave[current_chave].append((idx, campos))
        
        # Aplicar correções
        for chave, correcoes in correcoes_por_chave.items():
            for correcao in correcoes:
                resultado_correcao = self._aplicar_correcao_individual(
                    correcao,
                    linhas_corrigidas,
                    c100_por_chave.get(chave),
                    c170_por_chave.get(chave, []),
                    c190_por_chave.get(chave, [])
                )
                resultado.resultados.append(resultado_correcao)
                
                if resultado_correcao.sucesso:
                    resultado.correcoes_aplicadas += 1
                else:
                    resultado.correcoes_falhadas += 1
        
        # Recalcular C190 se necessário
        if resultado.correcoes_aplicadas > 0:
            resultado.c190_recalculados = self._recalcular_c190(
                linhas_corrigidas,
                c170_por_chave,
                c190_por_chave
            )
        
        # Gerar arquivo corrigido
        if output_path is None:
            output_path = efd_path.with_name(f"{efd_path.stem}_corrigido{efd_path.suffix}")
        
        try:
            with output_path.open("w", encoding="latin1", errors="ignore") as f:
                f.writelines(linhas_corrigidas)
            resultado.arquivo_gerado = output_path
        except Exception as e:
            logger.error(f"Erro ao gerar arquivo corrigido: {e}")
            resultado.metadata['erro_geracao'] = str(e)
        
        # Validação pós-correção
        if resultado.arquivo_gerado:
            resultado.validacao_pos_correcao = self._validar_pos_correcao(output_path)
        
        resultado.metadata['data_aplicacao'] = datetime.now().isoformat()
        resultado.metadata['arquivo_original'] = str(efd_path)
        
        return resultado
    
    def _aplicar_correcao_individual(
        self,
        correcao: Correcao,
        linhas: List[str],
        c100: Optional[Tuple[int, List[str]]],
        c170_list: List[Tuple[int, List[str]]],
        c190_list: List[Tuple[int, List[str]]]
    ) -> ResultadoCorrecao:
        """
        Aplica uma correção individual
        
        Args:
            correcao: Correção a aplicar
            linhas: Lista de linhas do SPED
            c100: Tupla (índice, campos) do C100
            c170_list: Lista de tuplas (índice, campos) dos C170
            c190_list: Lista de tuplas (índice, campos) dos C190
        
        Returns:
            Resultado da correção
        """
        resultado = ResultadoCorrecao(correcao_id=correcao.id, sucesso=False)
        
        try:
            # Mapear campo para posição no registro
            campo_map = {
                'VL_MERC': (16, 'C100'),
                'VL_ICMS': (20, 'C100'),
                'VL_ICMS_ST': (22, 'C100'),
                'VL_IPI': (25, 'C100'),
                'VL_ITEM': (7, 'C170'),
                'VL_ICMS': (13, 'C170'),
                'VL_OPR': (5, 'C190'),
                'VL_ICMS': (7, 'C190'),
                'VL_ICMS_ST': (9, 'C190'),
                'VL_IPI': (11, 'C190'),
            }
            
            # Determinar registro e posição
            registro_tipo = None
            posicao = None
            
            for campo, (pos, reg) in campo_map.items():
                if correcao.campo == campo or campo in correcao.campo:
                    posicao = pos
                    registro_tipo = reg
                    break
            
            if not registro_tipo or posicao is None:
                resultado.erro = f"Campo {correcao.campo} não mapeado para registro SPED"
                return resultado
            
            # Aplicar correção no registro apropriado
            if registro_tipo == 'C100' and c100:
                idx, campos = c100
                if len(campos) > posicao:
                    resultado.linha_original = linhas[idx]
                    campos[posicao] = self._formatar_valor_sped(correcao.valor_depois)
                    linhas[idx] = "|".join(campos) + "\n"
                    resultado.linha_corrigida = linhas[idx]
                    resultado.registro_alterado = 'C100'
                    resultado.sucesso = True
            
            elif registro_tipo == 'C170' and c170_list:
                # Aplicar no primeiro C170 (ou todos se necessário)
                for idx, campos in c170_list:
                    if len(campos) > posicao:
                        resultado.linha_original = linhas[idx]
                        campos[posicao] = self._formatar_valor_sped(correcao.valor_depois)
                        linhas[idx] = "|".join(campos) + "\n"
                        resultado.linha_corrigida = linhas[idx]
                        resultado.registro_alterado = 'C170'
                        resultado.sucesso = True
                        break
            
            elif registro_tipo == 'C190' and c190_list:
                # Aplicar no C190 correspondente (pode precisar de CFOP/CST matching)
                for idx, campos in c190_list:
                    if len(campos) > posicao:
                        resultado.linha_original = linhas[idx]
                        campos[posicao] = self._formatar_valor_sped(correcao.valor_depois)
                        linhas[idx] = "|".join(campos) + "\n"
                        resultado.linha_corrigida = linhas[idx]
                        resultado.registro_alterado = 'C190'
                        resultado.sucesso = True
                        break
            
            if not resultado.sucesso:
                resultado.erro = f"Registro {registro_tipo} não encontrado para correção"
        
        except Exception as e:
            logger.error(f"Erro ao aplicar correção {correcao.id}: {e}")
            resultado.erro = str(e)
        
        return resultado
    
    def _formatar_valor_sped(self, valor: Decimal) -> str:
        """
        Formata valor para formato SPED (vírgula como separador decimal)
        
        Args:
            valor: Valor a formatar
        
        Returns:
            String formatada
        """
        valor_str = f"{valor:.2f}"
        return valor_str.replace(".", ",")
    
    def _recalcular_c190(
        self,
        linhas: List[str],
        c170_por_chave: Dict[str, List[Tuple[int, List[str]]]],
        c190_por_chave: Dict[str, List[Tuple[int, List[str]]]]
    ) -> int:
        """
        Recalcula C190 baseado em C170 corrigidos
        
        Args:
            linhas: Lista de linhas do SPED
            c170_por_chave: C170 agrupados por chave
            c190_por_chave: C190 agrupados por chave
        
        Returns:
            Número de C190 recalculados
        """
        from parsers import split_sped_line
        
        recalculados = 0
        
        for chave, c170_list in c170_por_chave.items():
            if chave not in c190_por_chave:
                continue
            
            # Agrupar C170 por CFOP/CST
            c170_agrupado: Dict[Tuple[str, str], List[Tuple[int, List[str]]]] = defaultdict(list)
            for idx, campos in c170_list:
                if len(campos) >= 9:
                    cfop = campos[3] if len(campos) > 3 else ""
                    cst = campos[4] if len(campos) > 4 else ""
                    c170_agrupado[(cfop, cst)].append((idx, campos))
            
            # Recalcular cada C190
            for idx, campos_c190 in c190_por_chave[chave]:
                if len(campos_c190) < 12:
                    continue
                
                cfop_c190 = campos_c190[3] if len(campos_c190) > 3 else ""
                cst_c190 = campos_c190[2] if len(campos_c190) > 2 else ""
                
                # Buscar C170 correspondentes
                c170_correspondentes = c170_agrupado.get((cfop_c190, cst_c190), [])
                
                if c170_correspondentes:
                    # Somar valores dos C170
                    soma_vl_opr = Decimal('0.00')
                    soma_vl_icms = Decimal('0.00')
                    soma_vl_icms_st = Decimal('0.00')
                    soma_vl_ipi = Decimal('0.00')
                    
                    for _, campos_c170 in c170_correspondentes:
                        if len(campos_c170) >= 9:
                            vl_item = self._parse_valor_sped(campos_c170[7] if len(campos_c170) > 7 else "0")
                            vl_desc = self._parse_valor_sped(campos_c170[8] if len(campos_c170) > 8 else "0")
                            soma_vl_opr += (vl_item - vl_desc)
                            
                            if len(campos_c170) > 13:
                                soma_vl_icms += self._parse_valor_sped(campos_c170[13] or "0")
                            if len(campos_c170) > 15:
                                soma_vl_icms_st += self._parse_valor_sped(campos_c170[15] or "0")
                            if len(campos_c170) > 17:
                                soma_vl_ipi += self._parse_valor_sped(campos_c170[17] or "0")
                    
                    # Atualizar C190
                    campos_c190[5] = self._formatar_valor_sped(soma_vl_opr)  # VL_OPR
                    campos_c190[7] = self._formatar_valor_sped(soma_vl_icms)  # VL_ICMS
                    campos_c190[9] = self._formatar_valor_sped(soma_vl_icms_st)  # VL_ICMS_ST
                    campos_c190[11] = self._formatar_valor_sped(soma_vl_ipi)  # VL_IPI
                    
                    linhas[idx] = "|".join(campos_c190) + "\n"
                    recalculados += 1
        
        return recalculados
    
    def _parse_valor_sped(self, valor_str: str) -> Decimal:
        """Parse valor do SPED"""
        try:
            if not valor_str or valor_str.strip() == "":
                return Decimal('0.00')
            valor_limpo = valor_str.replace(".", "").replace(",", ".")
            return Decimal(valor_limpo)
        except:
            return Decimal('0.00')
    
    def _validar_pos_correcao(self, efd_path: Path) -> Dict[str, Any]:
        """
        Valida SPED após correção
        
        Args:
            efd_path: Caminho do arquivo SPED corrigido
        
        Returns:
            Dicionário com resultados da validação
        """
        try:
            # Ler registros para validação básica
            from parsers import split_sped_line
            
            c100_count = 0
            c170_count = 0
            c190_count = 0
            
            with efd_path.open("r", encoding="latin1", errors="ignore") as f:
                for linha in f:
                    if linha.startswith("|C100|"):
                        c100_count += 1
                    elif linha.startswith("|C170|"):
                        c170_count += 1
                    elif linha.startswith("|C190|"):
                        c190_count += 1
            
            return {
                'valido': True,
                'c100_count': c100_count,
                'c170_count': c170_count,
                'c190_count': c190_count,
                'mensagem': 'Arquivo SPED válido após correção'
            }
        
        except Exception as e:
            logger.error(f"Erro na validação pós-correção: {e}")
            return {
                'valido': False,
                'erro': str(e)
            }

