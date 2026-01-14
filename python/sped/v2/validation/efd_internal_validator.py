#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Validador Interno da EFD (Camada B)
Valida consistência interna do SPED: C170→C190→C100→E110/E111

Este módulo implementa validações de totalização e consistência:
- C170 → C190: Totalização por CST/CFOP/ALIQ
- C190 → C100: Valores totais do documento
- C100 → E110/E111: Impacto nas totalizações do período
- Detecção de ajustes C197/E111
- Validação de cadastros 0150/0190/0200
"""

from __future__ import annotations
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class ValidationSeverity(Enum):
    """Severidade da validação"""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class ValidationIssue:
    """Representa um problema encontrado na validação"""
    code: str
    message: str
    severity: ValidationSeverity
    registro: str  # Tipo de registro (C100, C170, C190, E110, etc.)
    linha: Optional[int] = None
    campo: Optional[str] = None
    valor_esperado: Optional[float] = None
    valor_encontrado: Optional[float] = None
    diferenca: Optional[float] = None
    contexto: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationResult:
    """Resultado completo da validação interna"""
    valido: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    estatisticas: Dict[str, Any] = field(default_factory=dict)
    
    def add_issue(self, issue: ValidationIssue):
        """Adiciona um issue ao resultado"""
        self.issues.append(issue)
        if issue.severity == ValidationSeverity.ERROR:
            self.valido = False
    
    def get_issues_by_severity(self, severity: ValidationSeverity) -> List[ValidationIssue]:
        """Retorna issues filtrados por severidade"""
        return [issue for issue in self.issues if issue.severity == severity]
    
    def get_issues_by_registro(self, registro: str) -> List[ValidationIssue]:
        """Retorna issues filtrados por tipo de registro"""
        return [issue for issue in self.issues if issue.registro == registro]


class EFDInternalValidator:
    """Validador interno da EFD"""
    
    def __init__(self, tolerancia_linha: float = 0.01, tolerancia_documento: float = 0.10):
        """
        Inicializa o validador
        
        Args:
            tolerancia_linha: Tolerância para diferenças em linhas individuais (R$)
            tolerancia_documento: Tolerância para diferenças em documentos (R$)
        """
        self.tolerancia_linha = tolerancia_linha
        self.tolerancia_documento = tolerancia_documento
        self.efd_data: Dict[str, Any] = {}
    
    def validate(self, efd_path: Path) -> ValidationResult:
        """
        Executa todas as validações internas da EFD
        
        Args:
            efd_path: Caminho do arquivo EFD
            
        Returns:
            ValidationResult com todos os issues encontrados
        """
        result = ValidationResult(valido=True)
        
        try:
            # Carregar dados do EFD
            self._load_efd_data(efd_path)
            
            # Executar validações
            self._validate_c170_c190(result)
            self._validate_c190_c100(result)
            self._validate_c100_e110_e111(result)
            self._validate_ajustes_c197_e111(result)
            self._validate_cadastros(result)
            
            # Calcular estatísticas
            result.estatisticas = self._calculate_statistics(result)
            
        except Exception as e:
            logger.error(f"Erro ao validar EFD: {e}", exc_info=True)
            result.add_issue(ValidationIssue(
                code="VALIDATION_ERROR",
                message=f"Erro ao executar validação: {str(e)}",
                severity=ValidationSeverity.ERROR,
                registro="SISTEMA"
            ))
        
        return result
    
    def _load_efd_data(self, efd_path: Path):
        """Carrega dados do EFD em estruturas indexadas"""
        self.efd_data = {
            'c100': [],
            'c170': [],
            'c190': [],
            'e110': [],
            'e111': [],
            'c197': [],
            '0150': [],
            '0190': [],
            '0200': [],
        }
        
        current_c100: Optional[Dict[str, Any]] = None
        
        try:
            with efd_path.open("r", encoding="latin1", errors="ignore") as f:
                for linha_num, line in enumerate(f, start=1):
                    line = line.strip()
                    if not line or not line.startswith("|"):
                        continue
                    
                    parts = line.split("|")
                    if len(parts) < 2:
                        continue
                    
                    registro = parts[1]
                    
                    if registro == "C100":
                        current_c100 = self._parse_c100(parts, linha_num)
                        if current_c100:
                            self.efd_data['c100'].append(current_c100)
                    
                    elif registro == "C170":
                        c170 = self._parse_c170(parts, linha_num, current_c100)
                        if c170:
                            self.efd_data['c170'].append(c170)
                    
                    elif registro == "C190":
                        c190 = self._parse_c190(parts, linha_num, current_c100)
                        if c190:
                            self.efd_data['c190'].append(c190)
                    
                    elif registro == "E110":
                        e110 = self._parse_e110(parts, linha_num)
                        if e110:
                            self.efd_data['e110'].append(e110)
                    
                    elif registro == "E111":
                        e111 = self._parse_e111(parts, linha_num)
                        if e111:
                            self.efd_data['e111'].append(e111)
                    
                    elif registro == "C197":
                        c197 = self._parse_c197(parts, linha_num)
                        if c197:
                            self.efd_data['c197'].append(c197)
                    
                    elif registro == "0150":
                        reg0150 = self._parse_0150(parts, linha_num)
                        if reg0150:
                            self.efd_data['0150'].append(reg0150)
                    
                    elif registro == "0190":
                        reg0190 = self._parse_0190(parts, linha_num)
                        if reg0190:
                            self.efd_data['0190'].append(reg0190)
                    
                    elif registro == "0200":
                        reg0200 = self._parse_0200(parts, linha_num)
                        if reg0200:
                            self.efd_data['0200'].append(reg0200)
        
        except Exception as e:
            logger.error(f"Erro ao carregar EFD: {e}", exc_info=True)
            raise
    
    def _parse_c100(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro C100"""
        try:
            return {
                'linha': linha,
                'IND_OPER': parts[2] if len(parts) > 2 else '',
                'IND_EMIT': parts[3] if len(parts) > 3 else '',
                'COD_PART': parts[4] if len(parts) > 4 else '',
                'COD_MOD': parts[5] if len(parts) > 5 else '',
                'COD_SIT': parts[6] if len(parts) > 6 else '',
                'SER': parts[7] if len(parts) > 7 else '',
                'NUM_DOC': parts[8] if len(parts) > 8 else '',
                'CHV_NFE': parts[9] if len(parts) > 9 else '',
                'DT_DOC': parts[10] if len(parts) > 10 else '',
                'DT_E_S': parts[11] if len(parts) > 11 else '',
                'VL_DOC': self._parse_decimal(parts[12] if len(parts) > 12 else '0'),
                'VL_DESC': self._parse_decimal(parts[13] if len(parts) > 13 else '0'),
                'VL_FRT': self._parse_decimal(parts[14] if len(parts) > 14 else '0'),
                'VL_SEG': self._parse_decimal(parts[15] if len(parts) > 15 else '0'),
                'VL_OUT_DA': self._parse_decimal(parts[16] if len(parts) > 16 else '0'),
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear C100 linha {linha}: {e}")
            return None
    
    def _parse_c170(self, parts: List[str], linha: int, c100: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Parseia registro C170"""
        try:
            return {
                'linha': linha,
                'c100_ref': c100,
                'NUM_ITEM': parts[2] if len(parts) > 2 else '',
                'COD_ITEM': parts[3] if len(parts) > 3 else '',
                'DESCR_COMPL': parts[4] if len(parts) > 4 else '',
                'QTD': self._parse_decimal(parts[5] if len(parts) > 5 else '0'),
                'UN': parts[6] if len(parts) > 6 else '',
                'VL_ITEM': self._parse_decimal(parts[7] if len(parts) > 7 else '0'),
                'VL_DESC': self._parse_decimal(parts[8] if len(parts) > 8 else '0'),
                'IND_MOV': parts[9] if len(parts) > 9 else '',
                'CST_ICMS': parts[10] if len(parts) > 10 else '',
                'CFOP': parts[11] if len(parts) > 11 else '',
                'COD_NAT': parts[12] if len(parts) > 12 else '',
                'VL_BC_ICMS': self._parse_decimal(parts[13] if len(parts) > 13 else '0'),
                'ALIQ_ICMS': self._parse_decimal(parts[14] if len(parts) > 14 else '0'),
                'VL_ICMS': self._parse_decimal(parts[15] if len(parts) > 15 else '0'),
                'VL_BC_ICMS_ST': self._parse_decimal(parts[16] if len(parts) > 16 else '0'),
                'ALIQ_ST': self._parse_decimal(parts[17] if len(parts) > 17 else '0'),
                'VL_ICMS_ST': self._parse_decimal(parts[18] if len(parts) > 18 else '0'),
                'VL_IPI': self._parse_decimal(parts[19] if len(parts) > 19 else '0'),
                'VL_OPR': self._parse_decimal(parts[20] if len(parts) > 20 else '0'),
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear C170 linha {linha}: {e}")
            return None
    
    def _parse_c190(self, parts: List[str], linha: int, c100: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Parseia registro C190"""
        try:
            return {
                'linha': linha,
                'c100_ref': c100,
                'CST_ICMS': parts[2] if len(parts) > 2 else '',
                'CFOP': parts[3] if len(parts) > 3 else '',
                'VL_OPR': self._parse_decimal(parts[4] if len(parts) > 4 else '0'),
                'VL_BC_ICMS': self._parse_decimal(parts[5] if len(parts) > 5 else '0'),
                'VL_ICMS': self._parse_decimal(parts[6] if len(parts) > 6 else '0'),
                'VL_BC_ICMS_ST': self._parse_decimal(parts[7] if len(parts) > 7 else '0'),
                'VL_ICMS_ST': self._parse_decimal(parts[8] if len(parts) > 8 else '0'),
                'VL_RED_BC': self._parse_decimal(parts[9] if len(parts) > 9 else '0'),
                'COD_OBS': parts[10] if len(parts) > 10 else '',
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear C190 linha {linha}: {e}")
            return None
    
    def _parse_e110(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro E110"""
        try:
            return {
                'linha': linha,
                'VL_TOT_DEBITOS': self._parse_decimal(parts[2] if len(parts) > 2 else '0'),
                'VL_AJ_DEBITOS': self._parse_decimal(parts[3] if len(parts) > 3 else '0'),
                'VL_TOT_AJ_DEBITOS': self._parse_decimal(parts[4] if len(parts) > 4 else '0'),
                'VL_ESTORNOS_CRED': self._parse_decimal(parts[5] if len(parts) > 5 else '0'),
                'VL_TOT_CREDITOS': self._parse_decimal(parts[6] if len(parts) > 6 else '0'),
                'VL_AJ_CREDITOS': self._parse_decimal(parts[7] if len(parts) > 7 else '0'),
                'VL_TOT_AJ_CREDITOS': self._parse_decimal(parts[8] if len(parts) > 8 else '0'),
                'VL_ESTORNOS_DEB': self._parse_decimal(parts[9] if len(parts) > 9 else '0'),
                'VL_SLD_CREDOR_ANT': self._parse_decimal(parts[10] if len(parts) > 10 else '0'),
                'VL_SLD_APURADO': self._parse_decimal(parts[11] if len(parts) > 11 else '0'),
                'VL_TOT_DED': self._parse_decimal(parts[12] if len(parts) > 12 else '0'),
                'VL_ICMS_RECOLHER': self._parse_decimal(parts[13] if len(parts) > 13 else '0'),
                'VL_SLD_CREDOR_TRANSPORTAR': self._parse_decimal(parts[14] if len(parts) > 14 else '0'),
                'DEB_ESP': self._parse_decimal(parts[15] if len(parts) > 15 else '0'),
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear E110 linha {linha}: {e}")
            return None
    
    def _parse_e111(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro E111"""
        try:
            return {
                'linha': linha,
                'COD_AJ_APUR': parts[2] if len(parts) > 2 else '',
                'DESCR_COMPL_AJ': parts[3] if len(parts) > 3 else '',
                'VL_AJ_APUR': self._parse_decimal(parts[4] if len(parts) > 4 else '0'),
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear E111 linha {linha}: {e}")
            return None
    
    def _parse_c197(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro C197"""
        try:
            return {
                'linha': linha,
                'COD_AJ': parts[2] if len(parts) > 2 else '',
                'DESCR_COMPL_AJ': parts[3] if len(parts) > 3 else '',
                'COD_ITEM': parts[4] if len(parts) > 4 else '',
                'VL_BC_ICMS': self._parse_decimal(parts[5] if len(parts) > 5 else '0'),
                'ALIQ_ICMS': self._parse_decimal(parts[6] if len(parts) > 6 else '0'),
                'VL_ICMS': self._parse_decimal(parts[7] if len(parts) > 7 else '0'),
                'VL_OPR': self._parse_decimal(parts[8] if len(parts) > 8 else '0'),
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear C197 linha {linha}: {e}")
            return None
    
    def _parse_0150(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro 0150 (Participante)"""
        try:
            return {
                'linha': linha,
                'COD_PART': parts[2] if len(parts) > 2 else '',
                'NOME': parts[3] if len(parts) > 3 else '',
                'COD_PAIS': parts[4] if len(parts) > 4 else '',
                'CNPJ': parts[5] if len(parts) > 5 else '',
                'CPF': parts[6] if len(parts) > 6 else '',
                'IE': parts[7] if len(parts) > 7 else '',
                'COD_MUN': parts[8] if len(parts) > 8 else '',
                'SUFRAMA': parts[9] if len(parts) > 9 else '',
                'END': parts[10] if len(parts) > 10 else '',
                'NUM': parts[11] if len(parts) > 11 else '',
                'COMPL': parts[12] if len(parts) > 12 else '',
                'BAIRRO': parts[13] if len(parts) > 13 else '',
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear 0150 linha {linha}: {e}")
            return None
    
    def _parse_0190(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro 0190 (Unidade)"""
        try:
            return {
                'linha': linha,
                'UNID': parts[2] if len(parts) > 2 else '',
                'DESCR': parts[3] if len(parts) > 3 else '',
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear 0190 linha {linha}: {e}")
            return None
    
    def _parse_0200(self, parts: List[str], linha: int) -> Optional[Dict[str, Any]]:
        """Parseia registro 0200 (Item)"""
        try:
            return {
                'linha': linha,
                'COD_ITEM': parts[2] if len(parts) > 2 else '',
                'DESCR_ITEM': parts[3] if len(parts) > 3 else '',
                'COD_BARRA': parts[4] if len(parts) > 4 else '',
                'COD_ANT_ITEM': parts[5] if len(parts) > 5 else '',
                'UNID_INV': parts[6] if len(parts) > 6 else '',
                'TIPO_ITEM': parts[7] if len(parts) > 7 else '',
                'COD_NCM': parts[8] if len(parts) > 8 else '',
                'EX_IPI': parts[9] if len(parts) > 9 else '',
                'COD_GEN': parts[10] if len(parts) > 10 else '',
                'COD_LST': parts[11] if len(parts) > 11 else '',
                'ALIQ_ICMS': self._parse_decimal(parts[12] if len(parts) > 12 else '0'),
            }
        except Exception as e:
            logger.warning(f"Erro ao parsear 0200 linha {linha}: {e}")
            return None
    
    def _parse_decimal(self, value: str) -> float:
        """Parseia valor decimal"""
        try:
            if not value or value.strip() == '':
                return 0.0
            return float(value.replace(',', '.'))
        except (ValueError, AttributeError):
            return 0.0
    
    def _validate_c170_c190(self, result: ValidationResult):
        """Valida C170 → C190 (totalização)"""
        # Agrupar C170s por C100 e por combinação CST/CFOP/ALIQ
        c170_por_c100: Dict[str, List[Dict[str, Any]]] = {}
        for c170 in self.efd_data['c170']:
            c100_ref = c170.get('c100_ref')
            if not c100_ref:
                continue
            chave_c100 = f"{c100_ref.get('COD_MOD')}:{c100_ref.get('SER')}:{c100_ref.get('NUM_DOC')}"
            if chave_c100 not in c170_por_c100:
                c170_por_c100[chave_c100] = []
            c170_por_c100[chave_c100].append(c170)
        
        # Agrupar C190s por C100
        c190_por_c100: Dict[str, List[Dict[str, Any]]] = {}
        for c190 in self.efd_data['c190']:
            c100_ref = c190.get('c100_ref')
            if not c100_ref:
                continue
            chave_c100 = f"{c100_ref.get('COD_MOD')}:{c100_ref.get('SER')}:{c100_ref.get('NUM_DOC')}"
            if chave_c100 not in c190_por_c100:
                c190_por_c100[chave_c100] = []
            c190_por_c100[chave_c100].append(c190)
        
        # Validar cada C100
        for chave_c100, c170s in c170_por_c100.items():
            # Agrupar C170s por combinação CST/CFOP/ALIQ
            c170_por_combinacao: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = {}
            for c170 in c170s:
                cst = str(c170.get('CST_ICMS', '')).strip()
                cfop = str(c170.get('CFOP', '')).strip()
                aliq = str(c170.get('ALIQ_ICMS', '')).strip()
                
                if not cst or not cfop:
                    continue
                
                combinacao = (cst, cfop, aliq)
                if combinacao not in c170_por_combinacao:
                    c170_por_combinacao[combinacao] = []
                c170_por_combinacao[combinacao].append(c170)
            
            # Calcular totais esperados de C170
            for combinacao, c170s_grupo in c170_por_combinacao.items():
                totais_esperados = {
                    'VL_OPR': sum(float(c170.get('VL_OPR', 0) or 0) for c170 in c170s_grupo),
                    'VL_BC_ICMS': sum(float(c170.get('VL_BC_ICMS', 0) or 0) for c170 in c170s_grupo),
                    'VL_ICMS': sum(float(c170.get('VL_ICMS', 0) or 0) for c170 in c170s_grupo),
                    'VL_BC_ICMS_ST': sum(float(c170.get('VL_BC_ICMS_ST', 0) or 0) for c170 in c170s_grupo),
                    'VL_ICMS_ST': sum(float(c170.get('VL_ICMS_ST', 0) or 0) for c170 in c170s_grupo),
                    'VL_IPI': sum(float(c170.get('VL_IPI', 0) or 0) for c170 in c170s_grupo),
                }
                
                # Buscar C190 correspondente
                c190_correspondente = None
                c190s = c190_por_c100.get(chave_c100, [])
                for c190 in c190s:
                    if (str(c190.get('CST_ICMS', '')).strip() == combinacao[0] and
                        str(c190.get('CFOP', '')).strip() == combinacao[1]):
                        c190_correspondente = c190
                        break
                
                if not c190_correspondente:
                    result.add_issue(ValidationIssue(
                        code="C190_FALTANTE",
                        message=f"C190 faltante para combinação CST={combinacao[0]}, CFOP={combinacao[1]}, ALIQ={combinacao[2]}",
                        severity=ValidationSeverity.ERROR,
                        registro="C190",
                        contexto={'c100': chave_c100, 'combinacao': combinacao}
                    ))
                    continue
                
                # Validar campos
                campos = ['VL_OPR', 'VL_BC_ICMS', 'VL_ICMS', 'VL_BC_ICMS_ST', 'VL_ICMS_ST']
                for campo in campos:
                    valor_esperado = totais_esperados.get(campo, 0.0)
                    valor_encontrado = float(c190_correspondente.get(campo, 0) or 0)
                    diferenca = abs(valor_esperado - valor_encontrado)
                    
                    if diferenca > self.tolerancia_linha:
                        result.add_issue(ValidationIssue(
                            code=f"C170_C190_{campo}",
                            message=f"Divergência em {campo}: esperado {valor_esperado:.2f}, encontrado {valor_encontrado:.2f}",
                            severity=ValidationSeverity.ERROR if diferenca > self.tolerancia_documento else ValidationSeverity.WARNING,
                            registro="C190",
                            linha=c190_correspondente.get('linha'),
                            campo=campo,
                            valor_esperado=valor_esperado,
                            valor_encontrado=valor_encontrado,
                            diferenca=diferenca,
                            contexto={'c100': chave_c100, 'combinacao': combinacao}
                        ))
    
    def _validate_c190_c100(self, result: ValidationResult):
        """Valida C190 → C100 (valores)"""
        # Agrupar C190s por C100
        c190_por_c100: Dict[str, List[Dict[str, Any]]] = {}
        for c190 in self.efd_data['c190']:
            c100_ref = c190.get('c100_ref')
            if not c100_ref:
                continue
            chave_c100 = f"{c100_ref.get('COD_MOD')}:{c100_ref.get('SER')}:{c100_ref.get('NUM_DOC')}"
            if chave_c100 not in c190_por_c100:
                c190_por_c100[chave_c100] = []
            c190_por_c100[chave_c100].append(c190)
        
        # Validar cada C100
        for c100 in self.efd_data['c100']:
            chave_c100 = f"{c100.get('COD_MOD')}:{c100.get('SER')}:{c100.get('NUM_DOC')}"
            c190s = c190_por_c100.get(chave_c100, [])
            
            if not c190s:
                result.add_issue(ValidationIssue(
                    code="C190_VAZIO",
                    message=f"C100 sem C190s associados",
                    severity=ValidationSeverity.WARNING,
                    registro="C100",
                    linha=c100.get('linha'),
                    contexto={'c100': chave_c100}
                ))
                continue
            
            # Somar VL_OPR dos C190s
            soma_vl_opr_c190 = sum(float(c190.get('VL_OPR', 0) or 0) for c190 in c190s)
            vl_doc_c100 = float(c100.get('VL_DOC', 0) or 0)
            
            diferenca = abs(vl_doc_c100 - soma_vl_opr_c190)
            
            if diferenca > self.tolerancia_documento:
                result.add_issue(ValidationIssue(
                    code="C100_VL_DOC_C190",
                    message=f"Divergência VL_DOC: C100={vl_doc_c100:.2f}, Σ(C190)={soma_vl_opr_c190:.2f}",
                    severity=ValidationSeverity.ERROR if diferenca > 1.0 else ValidationSeverity.WARNING,
                    registro="C100",
                    linha=c100.get('linha'),
                    campo="VL_DOC",
                    valor_esperado=vl_doc_c100,
                    valor_encontrado=soma_vl_opr_c190,
                    diferenca=diferenca,
                    contexto={'c100': chave_c100}
                ))
    
    def _validate_c100_e110_e111(self, result: ValidationResult):
        """Valida C100 → E110/E111 (impacto)"""
        if not self.efd_data['e110']:
            return
        
        # Calcular totais de ICMS dos C100s
        total_icms_c100 = 0.0
        total_icms_st_c100 = 0.0
        
        for c100 in self.efd_data['c100']:
            # Buscar C190s do C100
            chave_c100 = f"{c100.get('COD_MOD')}:{c100.get('SER')}:{c100.get('NUM_DOC')}"
            c190s = [c190 for c190 in self.efd_data['c190'] 
                     if c190.get('c100_ref') and 
                     f"{c190.get('c100_ref').get('COD_MOD')}:{c190.get('c100_ref').get('SER')}:{c190.get('c100_ref').get('NUM_DOC')}" == chave_c100]
            
            for c190 in c190s:
                total_icms_c100 += float(c190.get('VL_ICMS', 0) or 0)
                total_icms_st_c100 += float(c190.get('VL_ICMS_ST', 0) or 0)
        
        # Comparar com E110
        e110 = self.efd_data['e110'][0] if self.efd_data['e110'] else None
        if e110:
            vl_tot_creditos_e110 = float(e110.get('VL_TOT_CREDITOS', 0) or 0)
            diferenca_icms = abs(total_icms_c100 - vl_tot_creditos_e110)
            
            if diferenca_icms > self.tolerancia_documento * 10:  # Tolerância maior para período
                result.add_issue(ValidationIssue(
                    code="C100_E110_ICMS",
                    message=f"Divergência ICMS: Σ(C100)={total_icms_c100:.2f}, E110={vl_tot_creditos_e110:.2f}",
                    severity=ValidationSeverity.WARNING,
                    registro="E110",
                    linha=e110.get('linha'),
                    campo="VL_TOT_CREDITOS",
                    valor_esperado=total_icms_c100,
                    valor_encontrado=vl_tot_creditos_e110,
                    diferenca=diferenca_icms
                ))
    
    def _validate_ajustes_c197_e111(self, result: ValidationResult):
        """Valida ajustes C197/E111"""
        # Verificar se há C197 sem E111 correspondente
        codigos_ajuste_c197 = {c197.get('COD_AJ', '') for c197 in self.efd_data['c197'] if c197.get('COD_AJ')}
        codigos_ajuste_e111 = {e111.get('COD_AJ_APUR', '') for e111 in self.efd_data['e111'] if e111.get('COD_AJ_APUR')}
        
        codigos_sem_e111 = codigos_ajuste_c197 - codigos_ajuste_e111
        if codigos_sem_e111:
            for codigo in codigos_sem_e111:
                result.add_issue(ValidationIssue(
                    code="C197_SEM_E111",
                    message=f"C197 com código de ajuste {codigo} sem E111 correspondente",
                    severity=ValidationSeverity.WARNING,
                    registro="C197",
                    contexto={'codigo_ajuste': codigo}
                ))
    
    def _validate_cadastros(self, result: ValidationResult):
        """Valida cadastros 0150/0190/0200"""
        # Validar referências de participantes (0150)
        cod_part_0150 = {reg.get('COD_PART', '') for reg in self.efd_data['0150'] if reg.get('COD_PART')}
        
        for c100 in self.efd_data['c100']:
            cod_part = c100.get('COD_PART', '').strip()
            if cod_part and cod_part not in cod_part_0150:
                result.add_issue(ValidationIssue(
                    code="C100_COD_PART_INVALIDO",
                    message=f"C100 referencia COD_PART={cod_part} não cadastrado em 0150",
                    severity=ValidationSeverity.ERROR,
                    registro="C100",
                    linha=c100.get('linha'),
                    campo="COD_PART",
                    contexto={'cod_part': cod_part}
                ))
        
        # Validar referências de unidades (0190)
        unidades_0190 = {reg.get('UNID', '') for reg in self.efd_data['0190'] if reg.get('UNID')}
        
        for c170 in self.efd_data['c170']:
            un = c170.get('UN', '').strip()
            if un and un not in unidades_0190:
                result.add_issue(ValidationIssue(
                    code="C170_UN_INVALIDA",
                    message=f"C170 referencia UN={un} não cadastrada em 0190",
                    severity=ValidationSeverity.ERROR,
                    registro="C170",
                    linha=c170.get('linha'),
                    campo="UN",
                    contexto={'un': un}
                ))
        
        # Validar referências de itens (0200)
        cod_item_0200 = {reg.get('COD_ITEM', '') for reg in self.efd_data['0200'] if reg.get('COD_ITEM')}
        
        for c170 in self.efd_data['c170']:
            cod_item = c170.get('COD_ITEM', '').strip()
            if cod_item and cod_item not in cod_item_0200:
                result.add_issue(ValidationIssue(
                    code="C170_COD_ITEM_INVALIDO",
                    message=f"C170 referencia COD_ITEM={cod_item} não cadastrado em 0200",
                    severity=ValidationSeverity.ERROR,
                    registro="C170",
                    linha=c170.get('linha'),
                    campo="COD_ITEM",
                    contexto={'cod_item': cod_item}
                ))
    
    def _calculate_statistics(self, result: ValidationResult) -> Dict[str, Any]:
        """Calcula estatísticas da validação"""
        return {
            'total_issues': len(result.issues),
            'total_errors': len(result.get_issues_by_severity(ValidationSeverity.ERROR)),
            'total_warnings': len(result.get_issues_by_severity(ValidationSeverity.WARNING)),
            'total_info': len(result.get_issues_by_severity(ValidationSeverity.INFO)),
            'total_c100': len(self.efd_data['c100']),
            'total_c170': len(self.efd_data['c170']),
            'total_c190': len(self.efd_data['c190']),
            'total_e110': len(self.efd_data['e110']),
            'total_e111': len(self.efd_data['e111']),
        }


