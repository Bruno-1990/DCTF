#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de edição de arquivos SPED
Permite modificar valores específicos preservando a estrutura do arquivo
"""
import sys
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import re
import logging

# Tentar importar chardet para detecção de encoding
try:
    import chardet
    HAS_CHARDET = True
except ImportError:
    HAS_CHARDET = False

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


def parse_float_br(value: str) -> float:
    """
    Converte string para float, suportando formato brasileiro (vírgula como separador decimal).
    
    Args:
        value: String com número (pode ter vírgula ou ponto como separador decimal)
    
    Returns:
        float: Valor convertido, ou 0.0 se vazio/inválido
    """
    if not value or not value.strip():
        return 0.0
    
    # Remove espaços
    value = value.strip()
    
    # Tenta converter diretamente (formato padrão com ponto)
    try:
        return float(value)
    except ValueError:
        pass
    
    # Se falhar, tenta substituir vírgula por ponto (formato brasileiro)
    try:
        # Remove pontos de milhar e substitui vírgula por ponto
        value_clean = value.replace('.', '').replace(',', '.')
        return float(value_clean)
    except (ValueError, AttributeError):
        return 0.0


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
        self.encoding: str = 'utf-8'  # Encoding detectado será armazenado aqui
        self._load_file()
    
    def _detect_encoding(self) -> str:
        """
        Detecta a codificação do arquivo SPED
        Tenta múltiplas codificações comuns para arquivos brasileiros
        """
        # Lista de codificações comuns para arquivos SPED brasileiros
        # Ordem: tentar latin-1 primeiro (mais comum em SPED), depois windows-1252, depois UTF-8
        encodings = ['latin-1', 'iso-8859-1', 'windows-1252', 'cp1252', 'utf-8']
        
        # Se chardet estiver disponível, usar para detecção
        if HAS_CHARDET:
            try:
                with open(self.sped_path, 'rb') as f:
                    raw_data = f.read(10000)  # Ler primeiros 10KB para detecção
                    result = chardet.detect(raw_data)
                    if result and result['encoding']:
                        detected = result['encoding'].lower()
                        # Normalizar alguns encodings
                        if detected in ['windows-1252', 'cp1252']:
                            detected = 'windows-1252'
                        elif detected in ['latin-1', 'iso-8859-1']:
                            detected = 'latin-1'
                        logger.info(f"Encoding detectado por chardet: {detected} (confiança: {result.get('confidence', 0):.2f})")
                        return detected
            except Exception as e:
                logger.warning(f"Erro ao detectar encoding com chardet: {e}")
        
        # Tentar cada encoding até encontrar um que funcione
        for encoding in encodings:
            try:
                with open(self.sped_path, 'r', encoding=encoding) as f:
                    f.read(1000)  # Tentar ler um pouco
                logger.info(f"Encoding detectado por tentativa: {encoding}")
                return encoding
            except (UnicodeDecodeError, UnicodeError):
                continue
        
        # Se nenhum funcionar, usar latin-1 como fallback (mais permissivo)
        logger.warning("Não foi possível detectar encoding, usando latin-1 como fallback")
        return 'latin-1'
    
    def _load_file(self):
        """Carrega arquivo SPED em memória com detecção automática de encoding"""
        # VALIDAÇÃO 1: Arquivo existe
        if not self.sped_path.exists():
            raise FileNotFoundError(f"Arquivo SPED não encontrado: {self.sped_path}")
        
        # VALIDAÇÃO 2: É um arquivo (não diretório)
        if not self.sped_path.is_file():
            raise Exception(f"Caminho não é um arquivo: {self.sped_path}")
        
        # VALIDAÇÃO 3: Arquivo é legível
        import os
        if not os.access(self.sped_path, os.R_OK):
            raise Exception(f"Arquivo não é legível: {self.sped_path}")
        
        # VALIDAÇÃO 4: Tamanho máximo do arquivo (prevenir DoS)
        MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
        file_size = self.sped_path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            raise Exception(f"Arquivo muito grande: {file_size} bytes (máximo: {MAX_FILE_SIZE} bytes)")
        
        # VALIDAÇÃO 5: Arquivo não está vazio
        if file_size == 0:
            raise Exception(f"Arquivo SPED está vazio: {self.sped_path}")
        
        # Detectar encoding
        encoding = self._detect_encoding()
        self.encoding = encoding  # Armazenar encoding detectado
        
        try:
            with open(self.sped_path, 'r', encoding=encoding) as f:
                self.lines = f.readlines()
                self.original_lines = self.lines.copy()
            
            logger.info(f"Arquivo SPED carregado: {len(self.lines)} linhas (encoding: {encoding})")
            
            # DEBUG: Verificar se há C100 e C190 no arquivo carregado
            c100_count = sum(1 for line in self.lines if line.strip().startswith("|C100|"))
            c190_count = sum(1 for line in self.lines if line.strip().startswith("|C190|"))
            logger.info(f"[_load_file] Registros encontrados no arquivo carregado: C100={c100_count}, C190={c190_count}")
            if c190_count == 0 and c100_count > 0:
                logger.warning(f"[_load_file] [AVISO] Arquivo tem {c100_count} C100 mas 0 C190. Isso pode ser normal se C190 ainda não foi gerado.")
        except (UnicodeDecodeError, UnicodeError) as e:
            logger.error(f"Erro ao ler arquivo com encoding {encoding}: {e}")
            # Tentar latin-1 como último recurso com tratamento de erros
            if encoding != 'latin-1':
                logger.warning("Tentando latin-1 como último recurso...")
                self.encoding = 'latin-1'
                try:
                    with open(self.sped_path, 'r', encoding='latin-1') as f:
                        self.lines = f.readlines()
                        self.original_lines = self.lines.copy()
                    logger.info(f"Arquivo SPED carregado com latin-1: {len(self.lines)} linhas")
                except (UnicodeDecodeError, UnicodeError):
                    # Se ainda falhar, usar errors='replace' para substituir caracteres inválidos
                    logger.warning("Usando latin-1 com substituição de caracteres inválidos...")
                    with open(self.sped_path, 'r', encoding='latin-1', errors='replace') as f:
                        self.lines = f.readlines()
                        self.original_lines = self.lines.copy()
                    logger.info(f"Arquivo SPED carregado com latin-1 (com substituição de erros): {len(self.lines)} linhas")
            else:
                # Se já estava tentando latin-1, usar errors='replace'
                logger.warning("Usando latin-1 com substituição de caracteres inválidos...")
                with open(self.sped_path, 'r', encoding='latin-1', errors='replace') as f:
                    self.lines = f.readlines()
                    self.original_lines = self.lines.copy()
                logger.info(f"Arquivo SPED carregado com latin-1 (com substituição de erros): {len(self.lines)} linhas")
    
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
        # VALIDAÇÃO 1: Registro não está vazio
        if not registro or registro.strip() == "":
            logger.error("Registro não pode estar vazio")
            return []
        
        # VALIDAÇÃO 2: Arquivo foi carregado
        if not self.lines:
            logger.error("Arquivo não foi carregado")
            return []
        
        # VALIDAÇÃO 3: Formato do registro (deve começar com letra e número)
        if len(registro) < 2 or not registro[0].isalpha() or not registro[1:].isdigit():
            logger.warning(f"Formato de registro suspeito: {registro}")
        
        # Se temos linha_sped, usar diretamente (convertendo de 1-indexed para 0-indexed)
        if linha_sped is not None and linha_sped > 0:
            idx = linha_sped - 1  # Converter de 1-indexed para 0-indexed
            if 0 <= idx < len(self.lines):
                line = self.lines[idx]
                if line.startswith(f"{registro}|"):
                    return [idx]
            return []
        
        indices = []
        # CORREÇÃO: Padrão deve considerar que linha pode começar com | ou não, e pode ter espaços
        # Exemplo: |C100|... ou C100|... ou   |C100|...
        registro_pattern = f"^\\s*\\|?{registro}\\|"
        
        # CORREÇÃO: Normalizar chave UMA VEZ antes do loop (mais eficiente)
        chave_normalizada = None
        if chave and registro == "C100":
            chave_normalizada = "".join(str(chave).split())
            logger.info(f"[find_line_by_record] Buscando C100 com chave normalizada: '{chave_normalizada}' (tamanho: {len(chave_normalizada)})")
            print(f"[find_line_by_record] Buscando C100 com chave normalizada: '{chave_normalizada}' (tamanho: {len(chave_normalizada)})", flush=True)
            
            # DEBUG: Mostrar primeiros 3 C100 encontrados no arquivo para comparar chaves
            c100_count_debug = 0
            for idx_debug, line_debug in enumerate(self.lines):
                if line_debug.strip().startswith("|C100|"):
                    parts_debug = split_sped_line(line_debug)
                    logger.info(f"[find_line_by_record] DEBUG - C100 #{c100_count_debug+1} na linha {idx_debug+1}:")
                    print(f"[find_line_by_record] DEBUG - C100 #{c100_count_debug+1} na linha {idx_debug+1}:", flush=True)
                    if len(parts_debug) > 9:
                        for i in [8, 9]:  # Verificar índices 8 e 9
                            chave_debug = "".join(parts_debug[i].strip().split()) if i < len(parts_debug) else "N/A"
                            logger.info(f"[find_line_by_record] DEBUG -   parts[{i}] = '{chave_debug}' (len={len(chave_debug)})")
                            print(f"[find_line_by_record] DEBUG -   parts[{i}] = '{chave_debug}' (len={len(chave_debug)})", flush=True)
                    c100_count_debug += 1
                    if c100_count_debug >= 3:
                        break
        
        # DEBUG: Logar informações sobre busca
        if registro == "C190":
            logger.debug(f"[find_line_by_record] Buscando C190. Total de linhas no arquivo: {len(self.lines)}")
            # Contar quantas linhas começam com |C190| para diagnóstico
            c190_count = sum(1 for line in self.lines if line.strip().startswith("|C190|"))
            logger.debug(f"[find_line_by_record] Linhas que começam com |C190|: {c190_count}")
            if c190_count > 0:
                # Mostrar primeiras 3 linhas C190 encontradas
                for idx_debug, line_debug in enumerate(self.lines):
                    if line_debug.strip().startswith("|C190|"):
                        logger.debug(f"[find_line_by_record] Exemplo C190 linha {idx_debug+1}: {line_debug[:100]}...")
                        if idx_debug >= 2:  # Mostrar apenas 3 primeiros
                            break
        
        # DEBUG: Para C100, logar quantos encontramos antes dos filtros
        if registro == "C100" and not chave and not cfop and not cst:
            c100_count_before = sum(1 for line in self.lines if line.strip().startswith("|C100|"))
            logger.info(f"[find_line_by_record] DEBUG: Total de linhas C100 encontradas (antes de filtros): {c100_count_before}")
            print(f"[find_line_by_record] DEBUG: Total de linhas C100 encontradas (antes de filtros): {c100_count_before}", flush=True)
        
        for idx, line in enumerate(self.lines):
            # CORREÇÃO: Usar strip() para remover espaços em branco antes de fazer match
            line_stripped = line.strip()
            
            # CORREÇÃO: Busca otimizada para C100 com chave - verificar apenas se começa com |C100|
            if registro == "C100" and chave_normalizada:
                # Busca mais rápida: apenas verificar se linha começa com |C100|
                if not line_stripped.startswith("|C100|"):
                    continue  # Pular linha imediatamente se não for C100
                
                # Se é C100, fazer split e comparar diretamente
                parts = split_sped_line(line)
                
                # DEBUG: Logar primeiros 3 C100 para ver o que tem nas posições
                if len(indices) < 3:
                    logger.info(f"[find_line_by_record] DEBUG - Analisando C100 na linha {idx+1}:")
                    print(f"[find_line_by_record] DEBUG - Analisando C100 na linha {idx+1}:", flush=True)
                    for i in [8, 9]:
                        if i < len(parts):
                            val = "".join(parts[i].strip().split())
                            match = "[OK MATCH]" if val == chave_normalizada else "[NAO CORRESPONDE]"
                            logger.info(f"[find_line_by_record] DEBUG -   parts[{i}] = '{val[:20]}...' (len={len(val)}) {match}")
                            print(f"[find_line_by_record] DEBUG -   parts[{i}] = '{val[:20]}...' (len={len(val)}) {match}", flush=True)
                
                # Tentar AMBOS os índices (8 e 9) sem assumir qual é o correto
                found = False
                for idx_tentativa in [8, 9]:
                    if len(parts) > idx_tentativa:
                        cand_clean = "".join(parts[idx_tentativa].strip().split())
                        
                        # Comparação direta
                        if cand_clean == chave_normalizada:
                            logger.info(f"[find_line_by_record] [OK] C100 encontrado na linha {idx+1} com chave em parts[{idx_tentativa}]")
                            print(f"[find_line_by_record] [OK] C100 encontrado na linha {idx+1} com chave em parts[{idx_tentativa}]", flush=True)
                            indices.append(idx)
                            found = True
                            break
                
                if found:
                    continue  # Já encontrou, próxima linha
                    
                continue  # Já processou, pular para próxima linha
            
            # Para outros casos, usar regex normal
            if re.match(registro_pattern, line_stripped):
                # Usar split_sped_line com a linha original (não stripada) para preservar estrutura
                # mas usar line_stripped para comparações de conteúdo
                parts = split_sped_line(line)
                
                # DEBUG: Logar quando encontrar registro (apenas para primeiros 3 para não poluir)
                if registro == "C100" and len(indices) < 3:
                    logger.debug(f"[find_line_by_record] C100 encontrado na linha {idx+1}: {line[:100]}...")
                
                # Se temos chave, verificar se corresponde (para outros registros ou C100 sem chave normalizada)
                if chave and registro == "C100" and not chave_normalizada:
                    # Fallback para caso chave não foi normalizada antes
                    chave_normalizada = "".join(str(chave).split())
                    if len(parts) > 8:
                        cand_clean = "".join(parts[8].strip().split())
                        if cand_clean == chave_normalizada:
                            indices.append(idx)
                            continue
                    elif len(parts) > 9:
                        cand_clean = "".join(parts[9].strip().split())
                        if cand_clean == chave_normalizada:
                            indices.append(idx)
                            continue
                    continue
                elif registro == "C170" and chave:
                        # C170 precisa verificar chave do C100 pai
                        # Por enquanto, vamos buscar por CFOP/CST
                        pass
                
                # Se temos CFOP, verificar
                if cfop:
                    # CORREÇÃO: Normalizar CFOP passado como parâmetro (remover todos os espaços)
                    cfop_clean_param = "".join(str(cfop).strip().split()) if cfop else ""
                    
                    if registro == "C170":
                        # Layout C170 após split: parts[0]="", parts[1]="C170", parts[2]=NUM_ITEM, ...
                        # parts[11]=CFOP (conforme layout oficial: REG(1), NUM_ITEM(2), ..., CFOP(11))
                        if len(parts) > 11:
                            linha_cfop = parts[11].strip()
                            # CORREÇÃO: Remover todos os espaços (incluindo internos) para comparação
                            linha_cfop_clean = "".join(linha_cfop.split())
                            if linha_cfop_clean != cfop_clean_param:
                                continue
                    elif registro == "C190":
                        # Layout C190: C190|CST_ICMS|CFOP|... (conforme layout oficial)
                        # Após split: parts[2]=CST_ICMS, parts[3]=CFOP
                        if len(parts) > 3:
                            linha_cfop = parts[3].strip()
                            # CORREÇÃO: Remover todos os espaços (incluindo internos) para comparação
                            linha_cfop_clean = "".join(linha_cfop.split())
                            if linha_cfop_clean != cfop_clean_param:
                                continue
                
                # Se temos CST, verificar (normalizando para comparação)
                if cst:
                    try:
                        from common import normalize_cst_for_compare
                        cst_normalizado = normalize_cst_for_compare(cst)
                    except ImportError:
                        # Fallback se não conseguir importar
                        cst_normalizado = str(cst).strip().zfill(3)
                    
                    if registro == "C170":
                        # Layout C170 após split: parts[0]="", parts[1]="C170", parts[2]=NUM_ITEM, ...
                        # parts[10]=CST_ICMS (conforme layout oficial: REG(1), NUM_ITEM(2), ..., CST_ICMS(10))
                        if len(parts) > 10:
                            linha_cst = parts[10].strip()
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                linha_cst_normalizado = ncfc(linha_cst)
                            except ImportError:
                                linha_cst_normalizado = linha_cst.strip().zfill(3)
                            if linha_cst_normalizado != cst_normalizado:
                                continue
                    elif registro == "C190":
                        # Layout C190: C190|CST_ICMS|CFOP|... (conforme layout oficial)
                        # Após split: parts[2]=CST_ICMS, parts[3]=CFOP
                        if len(parts) > 2:
                            linha_cst = parts[2].strip()
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                linha_cst_normalizado = ncfc(linha_cst)
                            except ImportError:
                                linha_cst_normalizado = linha_cst.strip().zfill(3)
                            if linha_cst_normalizado != cst_normalizado:
                                continue
                
                indices.append(idx)
        
        return indices
    
    def find_children_records(self, c100_index: int) -> Tuple[List[int], List[int]]:
        """
        Encontra C170 e C190 relacionados a um C100 específico.
        C170 e C190 são registros filhos que aparecem após o C100 até o próximo C100.
        
        Args:
            c100_index: Índice da linha do C100 (0-indexed)
        
        Returns:
            Tupla (indices_c170, indices_c190) com listas de índices das linhas
        """
        indices_c170 = []
        indices_c190 = []
        
        if c100_index < 0 or c100_index >= len(self.lines):
            return (indices_c170, indices_c190)
        
        # Procurar C170 e C190 a partir da linha seguinte ao C100
        # Parar quando encontrar outro C100 ou um registro que inicia novo bloco
        # CORREÇÃO: C110-C197 são TODOS filhos de C100, não parar neles!
        # Registros que indicam NOVO documento (devem parar a busca):
        registros_novo_documento = ["C100", "C300", "C350", "C400", "C495", "C500", "C600", "C700", "C800", "D100", "D300", "D500"]
        
        for idx in range(c100_index + 1, len(self.lines)):
            line = self.lines[idx].strip()
            
            # Se linha vazia, continuar
            if not line:
                continue
            
            # Extrair tipo de registro
            if line.startswith("|") and "|" in line[1:]:
                registro = line.split("|")[1] if len(line.split("|")) > 1 else ""
            else:
                registro = ""
            
            # Se encontrou registro que inicia novo documento/bloco, parar
            if registro in registros_novo_documento:
                break
            
            # Se encontrou registro de outro bloco (não C ou 1), parar
            if registro and len(registro) > 0:
                if registro[0] not in ['C', '1']:
                    break
            
            # Coletar TODOS os C170 e C190 dentro do bloco do C100
            # (Não parar em C110, C111, etc. - eles são filhos do C100 também!)
            if line.startswith("|C170|"):
                indices_c170.append(idx)
            
            if line.startswith("|C190|"):
                indices_c190.append(idx)
        
        return (indices_c170, indices_c190)
    
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
                "Desconto": 22,  # Alias para VL_DESC
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
                # Layout C190 após split: fs[0]="", fs[1]="C190", fs[2]=CST, fs[3]=CFOP, fs[4]=ALIQ, 
                # fs[5]=VL_OPR, fs[6]=VL_BC_ICMS, fs[7]=VL_ICMS, fs[8]=VL_BC_ICMS_ST, 
                # fs[9]=VL_ICMS_ST, fs[10]=VL_RED_BC, fs[11]=VL_IPI, fs[12]=COD_OBS
                "VL_BC_ICMS": 6,
                "VL_ICMS": 7,
                "VL_BC_ICMS_ST": 8,
                "BC ST": 8,  # Alias para VL_BC_ICMS_ST
                "Base ST": 8,  # Alias para VL_BC_ICMS_ST
                "VL_ICMS_ST": 9,
                "ST": 9,  # Alias para VL_ICMS_ST
                "ICMS ST": 9,  # Alias para VL_ICMS_ST
                "VL_IPI": 11,
                "IPI": 11,  # Alias para VL_IPI
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
            # CORREÇÃO CRÍTICA: Se linha_sped é fornecida, usar diretamente!
            # linha_sped é 1-indexed (número da linha no SPED), converter para 0-indexed
            indices = [linha_sped - 1]
        else:
            indices = self.find_line_by_record(registro, chave=chave, cfop=cfop, cst=cst)
        
        if not indices:
            # Log mais silencioso - só logar em modo debug para evitar poluir logs
            logger.debug(f"Nenhuma linha encontrada para {registro} com chave={chave}, cfop={cfop}, cst={cst}")
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
            # VALIDAÇÃO 7: Índice dentro do range
            if idx >= len(self.lines):
                logger.warning(f"Índice {idx} fora do range do arquivo (total: {len(self.lines)} linhas)")
                continue
            
            line = self.lines[idx]
            
            # VALIDAÇÃO 8: Linha não está vazia
            if not line or line.strip() == "":
                logger.warning(f"Linha {idx + 1} está vazia")
                continue
            
            # Usar split_sped_line para garantir índices corretos
            parts = split_sped_line(line)
            
            # VALIDAÇÃO 9: Linha tem posição suficiente
            if len(parts) <= posicao:
                logger.warning(f"Linha {idx + 1} não tem posição {posicao} para campo {campo} (tem {len(parts)} campos)")
                continue
            
            # VALIDAÇÃO 10: Linha corresponde ao registro esperado
            if not line.startswith(f"|{registro}|") and not line.startswith(f"{registro}|"):
                logger.warning(f"Linha {idx + 1} não corresponde ao registro {registro}: {line[:50]}...")
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
    
    def find_cod_part_by_cnpj(self, cnpj: str) -> Optional[str]:
        """
        Encontra COD_PART existente para um CNPJ no registro 0150.
        
        Args:
            cnpj: CNPJ sem formatação (apenas números)
        
        Returns:
            COD_PART se encontrado, None caso contrário
        """
        cnpj_clean = re.sub(r"\D", "", str(cnpj).strip())
        if not cnpj_clean:
            return None
        
        for idx, line in enumerate(self.lines):
            if line.startswith("|0150|"):
                parts = split_sped_line(line, min_fields=9)
                if len(parts) >= 6:
                    cnpj_0150 = re.sub(r"\D", "", (parts[5] or "").strip())
                    if cnpj_0150 == cnpj_clean:
                        cod_part = (parts[2] or "").strip()
                        if cod_part:
                            return cod_part
        
        return None
    
    def get_next_cod_part(self) -> str:
        """
        Gera próximo COD_PART disponível.
        Busca o maior COD_PART numérico existente e incrementa.
        
        Returns:
            Próximo COD_PART disponível (string)
        """
        max_cod = 0
        
        for line in self.lines:
            if line.startswith("|0150|"):
                parts = split_sped_line(line, min_fields=9)
                if len(parts) >= 3:
                    cod_part = (parts[2] or "").strip()
                    # Tentar extrair número do COD_PART
                    cod_num = re.sub(r"\D", "", cod_part)
                    if cod_num:
                        try:
                            cod_int = int(cod_num)
                            if cod_int > max_cod:
                                max_cod = cod_int
                        except ValueError:
                            pass
        
        # Próximo código: incrementar o maior encontrado
        next_cod = max_cod + 1
        return str(next_cod).zfill(4)  # Formato padrão: 4 dígitos com zeros à esquerda
    
    def criar_0150_se_necessario(
        self,
        cnpj: str,
        nome: str,
        ie: str = "",
        uf: str = "",
        cpf: str = "",
        cod_mun: str = ""
    ) -> str:
        """
        Cria registro 0150 se não existir para o CNPJ.
        Auto-cadastro mínimo conforme SC FAQ.
        
        Args:
            cnpj: CNPJ (com ou sem formatação)
            nome: Nome/Razão Social
            ie: Inscrição Estadual (opcional)
            uf: UF (opcional)
            cpf: CPF (opcional, se pessoa física)
            cod_mun: Código do município (opcional)
        
        Returns:
            COD_PART criado ou existente
        """
        # Limpar CNPJ
        cnpj_clean = re.sub(r"\D", "", str(cnpj).strip())
        if not cnpj_clean:
            logger.warning("CNPJ vazio ao tentar criar 0150")
            return None
        
        # Verificar se já existe
        cod_part_existente = self.find_cod_part_by_cnpj(cnpj_clean)
        if cod_part_existente:
            logger.debug(f"0150 já existe para CNPJ {cnpj_clean}: COD_PART={cod_part_existente}")
            return cod_part_existente
        
        # Gerar próximo COD_PART
        cod_part = self.get_next_cod_part()
        
        # Limpar campos
        nome_clean = str(nome).strip()[:100] if nome else ""  # Limitar tamanho
        ie_clean = str(ie).strip()[:14] if ie else ""
        uf_clean = str(uf).strip()[:2].upper() if uf else ""
        cpf_clean = re.sub(r"\D", "", str(cpf).strip()) if cpf else ""
        cod_mun_clean = str(cod_mun).strip()[:7] if cod_mun else ""
        
        # Criar linha 0150
        # Layout: 0150|COD_PART|NOME|COD_PAIS|CNPJ|CPF|IE|COD_MUN|SUFRAMA|END|NUM|COMPL|BAIRRO
        # Campos mínimos: COD_PART(2), NOME(3), CNPJ(5) ou CPF(6)
        campos_0150 = [
            "",  # fs[0] - vazio antes do primeiro |
            "0150",  # fs[1]
            cod_part,  # fs[2] - COD_PART
            nome_clean,  # fs[3] - NOME
            "",  # fs[4] - COD_PAIS (deixar vazio)
            cnpj_clean if cnpj_clean else "",  # fs[5] - CNPJ
            cpf_clean if cpf_clean else "",  # fs[6] - CPF
            ie_clean,  # fs[7] - IE
            cod_mun_clean,  # fs[8] - COD_MUN
            "",  # fs[9] - SUFRAMA
            "",  # fs[10] - END
            "",  # fs[11] - NUM
            "",  # fs[12] - COMPL
            "",  # fs[13] - BAIRRO
        ]
        
        linha_0150 = "|".join(campos_0150) + "|\n"
        
        # Inserir após último 0150 ou antes de 0190
        posicao_inserir = None
        
        # Buscar último 0150
        ultimo_0150_idx = None
        for idx in range(len(self.lines) - 1, -1, -1):
            if self.lines[idx].startswith("|0150|"):
                ultimo_0150_idx = idx
                break
        
        if ultimo_0150_idx is not None:
            # Inserir após último 0150
            posicao_inserir = ultimo_0150_idx + 1
        else:
            # Buscar primeiro 0190 (inserir antes dele)
            for idx, line in enumerate(self.lines):
                if line.startswith("|0190|"):
                    posicao_inserir = idx
                    break
        
        # Se não encontrou posição, inserir antes do 9999
        if posicao_inserir is None:
            for idx in range(len(self.lines) - 1, -1, -1):
                if self.lines[idx].startswith('9999|'):
                    posicao_inserir = idx
                    break
        
        # Se ainda não encontrou, inserir no final (antes do 9999)
        if posicao_inserir is None:
            posicao_inserir = len(self.lines) - 1 if self.lines else 0
        
        # Inserir 0150
        self.lines.insert(posicao_inserir, linha_0150)
        logger.info(f"0150 criado: COD_PART={cod_part}, NOME={nome_clean}, CNPJ={cnpj_clean}")
        
        return cod_part
    
    def save(self, output_path: Optional[Path] = None) -> Path:
        """
        Salva arquivo SPED modificado
        
        Args:
            output_path: Caminho para salvar (se None, sobrescreve original)
        
        Returns:
            Caminho do arquivo salvo
        
        Raises:
            Exception: Se houver erro ao salvar o arquivo
        """
        if output_path is None:
            output_path = self.sped_path
        
        output_path = Path(output_path)
        
        # Garantir que o diretório existe
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            logger.debug(f"Diretório garantido: {output_path.parent}")
        except Exception as e:
            error_msg = f"Erro ao criar diretório {output_path.parent}: {e}"
            logger.error(error_msg)
            raise Exception(error_msg) from e
        
        # VALIDAÇÃO 1: Validar que há linhas para salvar
        if not self.lines:
            error_msg = "Nenhuma linha para salvar (arquivo vazio)"
            logger.error(error_msg)
            raise Exception(error_msg)
        
        # VALIDAÇÃO 2: Validar estrutura básica do arquivo
        tem_registro_inicial = any(line.startswith("|0000|") or line.startswith("|0001|") for line in self.lines)
        tem_registro_final = any(line.startswith("|9999|") for line in self.lines)
        
        if not tem_registro_inicial:
            logger.warning("Arquivo SPED não tem registro inicial (0000 ou 0001)")
        
        if not tem_registro_final:
            logger.warning("Arquivo SPED não tem registro final (9999)")
        
        # VALIDAÇÃO 3: Verificar linhas vazias no meio do arquivo
        linhas_vazias = [i for i, line in enumerate(self.lines) if line.strip() == ""]
        if linhas_vazias:
            logger.warning(f"Arquivo tem {len(linhas_vazias)} linhas vazias nas posições: {linhas_vazias[:10]}")
        
        # VALIDAÇÃO 4: Validar encoding antes de salvar
        try:
            # Testar se consegue escrever com o encoding
            test_line = self.lines[0] if self.lines else ""
            test_line.encode(self.encoding)
        except UnicodeEncodeError:
            logger.warning(f"Encoding {self.encoding} não suporta todos os caracteres, usando latin-1 como fallback")
            self.encoding = 'latin-1'
        
        # Usar o mesmo encoding do arquivo original para preservar caracteres especiais
        # Se o encoding original for latin-1 ou windows-1252, manter; caso contrário, usar UTF-8
        save_encoding = self.encoding if self.encoding in ['latin-1', 'iso-8859-1', 'windows-1252', 'cp1252'] else 'utf-8'
        
        try:
            logger.debug(f"Tentando salvar arquivo em {output_path} com encoding {save_encoding} ({len(self.lines)} linhas)")
            with open(output_path, 'w', encoding=save_encoding, newline='') as f:
                f.writelines(self.lines)
            logger.info(f"[OK] Arquivo SPED salvo em: {output_path} (encoding: {save_encoding}, {len(self.lines)} linhas)")
        except UnicodeEncodeError as e:
            # Se falhar, tentar latin-1 como fallback
            logger.warning(f"Erro ao salvar em {save_encoding}, tentando latin-1...")
            try:
                with open(output_path, 'w', encoding='latin-1', newline='', errors='replace') as f:
                    f.writelines(self.lines)
                logger.info(f"[OK] Arquivo SPED salvo em: {output_path} (encoding: latin-1 com substituição de erros, {len(self.lines)} linhas)")
            except Exception as e2:
                error_msg = f"Erro ao salvar arquivo mesmo com fallback latin-1: {e2}"
                logger.error(error_msg)
                raise Exception(error_msg) from e2
        except (IOError, OSError) as e:
            error_msg = f"Erro de I/O ao salvar arquivo {output_path}: {e}"
            logger.error(error_msg)
            raise Exception(error_msg) from e
        except Exception as e:
            error_msg = f"Erro inesperado ao salvar arquivo {output_path}: {e}"
            logger.error(error_msg)
            import traceback
            logger.debug(traceback.format_exc())
            raise Exception(error_msg) from e
        
        # Verificar se o arquivo foi realmente criado
        if not output_path.exists():
            error_msg = f"Arquivo não foi criado após save(): {output_path}"
            logger.error(error_msg)
            raise Exception(error_msg)
        
        # Verificar se o arquivo não está vazio
        file_size = output_path.stat().st_size
        if file_size == 0:
            error_msg = f"Arquivo criado mas está vazio: {output_path}"
            logger.error(error_msg)
            raise Exception(error_msg)
        
        logger.info(f"[OK] Arquivo verificado: {output_path} ({file_size} bytes)")
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
    # LOG: Início do processamento de correção
    logger.info(f"[CORREÇÃO] Iniciando aplicação de correção: {correcao.get('registro_corrigir')} - Campo: {correcao.get('campo')}")
    
    try:
        # VALIDAÇÃO 1: Arquivo SPED existe
        if not sped_path.exists():
            return (False, sped_path, {
                "erro": f"Arquivo SPED não encontrado: {sped_path}",
                "sugestao": "Verifique se o caminho do arquivo está correto"
            })
        
        # VALIDAÇÃO 2: Arquivo não está vazio
        try:
            file_size = sped_path.stat().st_size
            if file_size == 0:
                return (False, sped_path, {
                    "erro": "Arquivo SPED está vazio",
                    "sugestao": "Verifique se o arquivo foi carregado corretamente"
                })
        except OSError as e:
            return (False, sped_path, {
                "erro": f"Erro ao acessar arquivo SPED: {e}",
                "sugestao": "Verifique permissões do arquivo"
            })
        
        editor = SpedEditor(sped_path)
        
        # DEBUG: Verificar se arquivo foi carregado corretamente
        logger.info(f"[CORREÇÃO] Arquivo SPED carregado: {len(editor.lines)} linhas")
        print(f"[CORREÇÃO] Arquivo SPED carregado: {len(editor.lines)} linhas", flush=True)
        
        # DEBUG: Contar registros no arquivo
        if editor.lines:
            c100_count = sum(1 for line in editor.lines if line.strip().startswith("|C100|"))
            c170_count = sum(1 for line in editor.lines if line.strip().startswith("|C170|"))
            c190_count = sum(1 for line in editor.lines if line.strip().startswith("|C190|"))
            logger.info(f"[CORREÇÃO] Registros encontrados no arquivo: C100={c100_count}, C170={c170_count}, C190={c190_count}")
            print(f"[CORREÇÃO] Registros encontrados no arquivo: C100={c100_count}, C170={c170_count}, C190={c190_count}", flush=True)
            
            # Mostrar primeiras linhas C100 para debug
            if c100_count > 0:
                for idx, line in enumerate(editor.lines[:50]):  # Primeiras 50 linhas
                    if line.strip().startswith("|C100|"):
                        logger.info(f"[CORREÇÃO] Exemplo C100 linha {idx+1}: {line[:150]}...")
                        print(f"[CORREÇÃO] Exemplo C100 linha {idx+1}: {line[:150]}...", flush=True)
                        break
        
        registro = correcao.get("registro_corrigir", "C190")
        campo = correcao.get("campo", "VL_BC_ICMS")
        
        # VALIDAÇÃO 3: Registro válido
        registros_validos = ["C100", "C170", "C190"]
        if registro not in registros_validos and registro != "DESCONHECIDO":
            return (False, sped_path, {
                "erro": f"Registro inválido: {registro}",
                "sugestao": f"Registro deve ser um dos: {', '.join(registros_validos)}"
            })
        
        # VALIDAÇÃO 4: Campo não vazio
        if not campo or str(campo).strip() == "":
            return (False, sped_path, {
                "erro": "Campo não pode estar vazio",
                "sugestao": "Forneça um campo válido para correção"
            })
        
        # VALIDAÇÃO 5: Valor correto é numérico
        try:
            valor_correto = float(correcao.get("valor_correto", 0))
        except (ValueError, TypeError) as e:
            return (False, sped_path, {
                "erro": f"valor_correto inválido: {correcao.get('valor_correto')}",
                "sugestao": "valor_correto deve ser um número válido",
                "detalhes": str(e)
            })
        
        # VALIDAÇÃO 6: Valor não é NaN ou infinito
        from math import isnan, isinf
        if isnan(valor_correto) or isinf(valor_correto):
            return (False, sped_path, {
                "erro": f"valor_correto inválido: {valor_correto}",
                "sugestao": "valor_correto deve ser um número finito"
            })
        
        chave = correcao.get("chave")
        cfop = correcao.get("cfop")
        cst_raw = correcao.get("cst")
        linha_sped = correcao.get("linha_sped")
        
        # DEBUG: Logar valores recebidos da correção - VERSÃO SEGURA COM STDERR
        try:
            chave_str = str(chave) if chave else "None"
            cfop_str = str(cfop) if cfop else "None"
            cst_str = str(cst_raw) if cst_raw else "None"
            chave_len = len(chave_str) if chave else 0
            chave_bool = bool(chave)
            sys.stderr.write(f"[CORRECAO] DEBUG - chave='{chave_str[:30]}...' (len={chave_len}, bool={chave_bool}, type={type(chave)})\n")
            sys.stderr.write(f"[CORRECAO] DEBUG - cfop='{cfop_str}' (type={type(cfop)}), cst='{cst_str}' (type={type(cst_raw)})\n")
            sys.stderr.flush()
        except Exception as e:
            sys.stderr.write(f"[CORRECAO] DEBUG - Erro ao logar valores: {e}\n")
            sys.stderr.flush()
        
        # VALIDAÇÃO 7: Chave NF formato (quando fornecida)
        if chave:
            chave_limpa = "".join(str(chave).split())  # Remove espaços
            if len(chave_limpa) != 44:
                logger.warning(f"[VALIDAÇÃO] Chave NF tem tamanho inválido: {len(chave_limpa)} (esperado: 44)")
                # Não falhar, apenas avisar - pode ser chave parcial
        
        # VALIDAÇÃO 8: CFOP formato (quando fornecido)
        if cfop:
            cfop_limpo = "".join(str(cfop).split())
            if len(cfop_limpo) != 4 or not cfop_limpo.isdigit():
                logger.warning(f"[VALIDAÇÃO] CFOP formato inválido: {cfop} (esperado: 4 dígitos)")
        
        # VALIDAÇÃO 9: CST formato (quando fornecido)
        if cst_raw:
            cst_limpo = str(cst_raw).strip()
            if len(cst_limpo) > 3 or not cst_limpo.isdigit():
                logger.warning(f"[VALIDAÇÃO] CST formato inválido: {cst_raw} (esperado: até 3 dígitos)")
        
        # VALIDAÇÃO 10: linha_sped válida (quando fornecida)
        if linha_sped is not None:
            try:
                linha_sped = int(linha_sped)
                if linha_sped < 1:
                    return (False, sped_path, {
                        "erro": f"linha_sped deve ser maior que 0: {linha_sped}",
                        "sugestao": "linha_sped deve ser um número positivo (1-indexed)"
                    })
            except (ValueError, TypeError):
                return (False, sped_path, {
                    "erro": f"linha_sped inválido: {correcao.get('linha_sped')}",
                    "sugestao": "linha_sped deve ser um número inteiro"
                })
        
        # VALIDAÇÃO 11: output_path é válido (se fornecido)
        if output_path:
            output_path = Path(output_path)
            # Verificar se diretório pai existe ou pode ser criado
            try:
                output_path.parent.mkdir(parents=True, exist_ok=True)
            except (OSError, PermissionError) as e:
                return (False, sped_path, {
                    "erro": f"Não foi possível criar diretório para arquivo de saída: {e}",
                    "sugestao": "Verifique permissões do diretório",
                    "caminho": str(output_path.parent)
                })
        
        # CORREÇÃO: Tratar caso especial quando registro é "DESCONHECIDO"
        # Se o campo é "Desconto", isso significa que é VL_DESC no C100
        if registro == "DESCONHECIDO" or registro == "":
            if campo == "Desconto" or campo == "VL_DESC":
                registro = "C100"
                campo = "VL_DESC"
                logger.info(f"[CORREÇÃO] Registro 'DESCONHECIDO' mapeado para C100, campo 'Desconto' mapeado para VL_DESC")
                print(f"[CORREÇÃO] Registro 'DESCONHECIDO' mapeado para C100, campo 'Desconto' mapeado para VL_DESC", flush=True)
            else:
                # Para outros campos com registro desconhecido, tentar inferir do campo
                # Por enquanto, retornar erro informativo
                return (False, sped_path, {
                    "erro": f"Não foi possível determinar o registro para correção. Registro: '{registro}', Campo: '{campo}'",
                    "sugestao": "Verifique se o campo e registro estão corretos na correção."
                })
        
        # CORREÇÃO: Mapear nomes de campos amigáveis para nomes técnicos
        campo_map = {
            "BC ST": "VL_BC_ICMS_ST",
            "Base ST": "VL_BC_ICMS_ST",
            "ST": "VL_ICMS_ST",
            "ICMS ST": "VL_ICMS_ST",
            "Desconto": "VL_DESC",
            "BC ICMS": "VL_BC_ICMS",
            "Base ICMS": "VL_BC_ICMS",
            "ICMS": "VL_ICMS",
            "IPI": "VL_IPI",
        }
        if campo in campo_map:
            campo_original = campo
            campo = campo_map[campo]
            logger.info(f"[CORREÇÃO] Campo '{campo_original}' mapeado para '{campo}'")
            print(f"[CORREÇÃO] Campo '{campo_original}' mapeado para '{campo}'", flush=True)
        
        # CORREÇÃO: Normalizar CST antes de usar (pode vir do DataFrame em formato diferente)
        # O CST pode vir como "00", "000", "0", etc. e precisa ser normalizado para 3 dígitos
        try:
            from common import normalize_cst_for_compare
            cst = normalize_cst_for_compare(cst_raw) if cst_raw else None
            cst_normalizado = cst  # Já normalizado
        except ImportError:
            # Fallback se não conseguir importar
            cst = str(cst_raw).strip().zfill(3) if cst_raw else None
            cst_normalizado = cst
        
        # CORREÇÃO: Limpar CFOP (remover espaços) antes de usar
        cfop_clean = str(cfop).strip() if cfop else ""
        cfop_clean = "".join(cfop_clean.split())  # Remove todos os espaços (incluindo internos)
        
        # CORREÇÃO: Se CFOP e CST estão vazios para C190, tentar atualizar C190 existente primeiro
        # antes de tentar criar um novo
        if registro == "C190" and (not cfop_clean or not cst_normalizado):
            logger.warning(f"[CORREÇÃO] CFOP ou CST vazios para C190. Tentando atualizar C190 existente com valor zerado...")
            print(f"[CORREÇÃO] CFOP ou CST vazios para C190. Tentando atualizar C190 existente com valor zerado...", flush=True)
            
            # DEBUG: Verificar o que está vindo em chave
            sys.stderr.write(f"[CORREÇÃO] DEBUG - Valor de chave recebido: '{chave}' (type={type(chave)}, bool={bool(chave)}, len={len(str(chave)) if chave else 0})\n")
            sys.stderr.flush()
            
            # CORREÇÃO CRÍTICA: Inicializar cfop_cst_encontrados ANTES de usar
            cfop_cst_encontrados = set()
            indices_c100 = []  # Inicializar para estar disponível em todo o escopo
            
            # Se temos chave, tentar encontrar C170 relacionados para obter CFOP/CST
            sys.stderr.write(f"[CORREÇÃO] DEBUG - Testando if chave: chave={chave}, bool(chave)={bool(chave)}\n")
            sys.stderr.flush()
            
            if chave:
                sys.stderr.write(f"[CORREÇÃO] DEBUG - ENTROU NO IF CHAVE!\n")
                sys.stderr.flush()
                
                sys.stderr.write(f"[CORREÇÃO] DEBUG - Linha 1194 - Tentando encontrar CFOP/CST...\n")
                sys.stderr.flush()
                
                # VALIDAÇÃO: Verificar se arquivo foi carregado
                sys.stderr.write(f"[CORREÇÃO] DEBUG - Linha 1198 - Verificando editor.lines: len={len(editor.lines) if hasattr(editor, 'lines') and editor.lines else 0}\n")
                sys.stderr.flush()
                
                if not editor.lines:
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - editor.lines está vazio! RETORNANDO ERRO.\n")
                    sys.stderr.flush()
                    logger.error(f"[CORREÇÃO] Arquivo SPED não foi carregado corretamente")
                    print(f"[CORREÇÃO] Arquivo SPED não foi carregado corretamente", flush=True)
                    return (False, sped_path, {
                        "erro": "Arquivo SPED não foi carregado corretamente",
                        "detalhes": "O arquivo SPED não possui linhas carregadas. Verifique se o arquivo existe e está acessível.",
                        "sugestao": "Verifique se o caminho do arquivo está correto e se o arquivo não está corrompido."
                    })
                
                sys.stderr.write(f"[CORREÇÃO] DEBUG - Linha 1207 - INICIANDO BUSCA DO C100\n")
                sys.stderr.flush()
                
                try:
                    # Buscar C100 com esta chave
                    sys.stderr.write(f"[CORREÇÃO] ========== INÍCIO DA BUSCA DO C100 ==========\n")
                    sys.stderr.flush()
                    
                    sys.stderr.write(f"[CORREÇÃO] Chave fornecida para busca: '{chave[:30] if len(str(chave)) >= 30 else chave}...'\n")
                    sys.stderr.flush()
                    
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - Linha 1222 - ANTES de chamar find_line_by_record\n")
                    sys.stderr.flush()
                    
                    indices_c100 = editor.find_line_by_record("C100", chave=chave)
                    
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - Linha 1227 - DEPOIS de chamar find_line_by_record. Resultado: {len(indices_c100)} C100s encontrados\n")
                    sys.stderr.flush()
                except Exception as e:
                    sys.stderr.write(f"[CORREÇÃO] !!!!! ERRO CAPTURADO na busca do C100: {type(e).__name__}: {e}\n")
                    import traceback
                    sys.stderr.write(f"[CORREÇÃO] Traceback:\n{traceback.format_exc()}\n")
                    sys.stderr.flush()
                    # Continuar mesmo com erro
                    indices_c100 = []
                
                sys.stderr.write(f"[CORREÇÃO] C100 encontrados: {len(indices_c100)}\n")
                sys.stderr.flush()
                
                # Se encontrou C100, buscar C170 e C190 relacionados (filhos do C100)
                sys.stderr.write(f"[CORREÇÃO] DEBUG - Testando if indices_c100: len={len(indices_c100)}, bool={bool(indices_c100)}\n")
                sys.stderr.flush()
                
                if indices_c100:
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - ENTROU NO IF indices_c100! Processando C100 encontrado...\n")
                    sys.stderr.flush()
                    
                    c100_idx = indices_c100[0]  # Usar o primeiro C100 encontrado
                    sys.stderr.write(f"[CORREÇÃO] C100 encontrado na linha {c100_idx+1}. Buscando C170 e C190 relacionados...\n")
                    sys.stderr.flush()
                    
                    # DEBUG: Mostrar próximos 15 registros após C100 para diagnóstico
                    logger.info(f"[CORREÇÃO] DEBUG - Próximos 15 registros após C100 (linha {c100_idx+1}):")
                    print(f"[CORREÇÃO] DEBUG - Próximos 15 registros após C100 (linha {c100_idx+1}):", flush=True)
                    for debug_idx in range(c100_idx + 1, min(c100_idx + 16, len(editor.lines))):
                        debug_line = editor.lines[debug_idx].strip()
                        if debug_line and debug_line.startswith("|"):
                            tipo_reg = debug_line.split("|")[1] if len(debug_line.split("|")) > 1 else "?"
                            logger.info(f"[CORREÇÃO] DEBUG -   Linha {debug_idx+1}: |{tipo_reg}| {debug_line[:80]}")
                            print(f"[CORREÇÃO] DEBUG -   Linha {debug_idx+1}: |{tipo_reg}|", flush=True)
                    
                    # Buscar registros filhos do C100
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - Chamando find_children_records para C100 idx={c100_idx}...\n")
                    sys.stderr.flush()
                    
                    indices_c170_relacionados, indices_c190_relacionados = editor.find_children_records(c100_idx)
                    
                    sys.stderr.write(f"[CORREÇÃO] Encontrados {len(indices_c170_relacionados)} C170 e {len(indices_c190_relacionados)} C190 relacionados ao C100\n")
                    sys.stderr.flush()
                    
                    # Extrair CFOP/CST dos C170 relacionados
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - Extraindo CFOP/CST de {len(indices_c170_relacionados)} C170 relacionados...\n")
                    sys.stderr.flush()
                    
                    for idx_c170 in indices_c170_relacionados:
                        sys.stderr.write(f"[CORREÇÃO] DEBUG - Processando C170 idx={idx_c170}...\n")
                        sys.stderr.flush()
                        line_c170 = editor.lines[idx_c170]
                        parts_c170 = split_sped_line(line_c170, min_fields=21)
                        
                        sys.stderr.write(f"[CORREÇÃO] DEBUG - C170 parts: len={len(parts_c170)}\n")
                        sys.stderr.flush()
                        
                        if len(parts_c170) > 11:
                            cfop_c170 = parts_c170[11].strip()  # Campo 11 do C170 é CFOP
                            cst_c170 = parts_c170[10].strip() if len(parts_c170) > 10 else ""  # Campo 10 é CST_ICMS
                            
                            sys.stderr.write(f"[CORREÇÃO] DEBUG - C170 extraído: cfop='{cfop_c170}', cst='{cst_c170}'\n")
                            sys.stderr.flush()
                            
                            if cfop_c170 and cst_c170:
                                sys.stderr.write(f"[CORREÇÃO] DEBUG - C170 tem CFOP e CST! Normalizando...\n")
                                sys.stderr.flush()
                                
                                try:
                                    from common import normalize_cst_for_compare
                                    cst_c170_norm = normalize_cst_for_compare(cst_c170)
                                except ImportError:
                                    cst_c170_norm = cst_c170.strip().zfill(3)
                                
                                cfop_c170_clean = "".join(cfop_c170.split())
                                cfop_cst_encontrados.add((cfop_c170_clean, cst_c170_norm))
                                
                                sys.stderr.write(f"[CORREÇÃO] [OK] C170 relacionado encontrado (linha {idx_c170+1}): CFOP={cfop_c170_clean}, CST={cst_c170_norm}\n")
                                sys.stderr.flush()
                            else:
                                sys.stderr.write(f"[CORREÇÃO] DEBUG - C170 não tem CFOP/CST válidos\n")
                                sys.stderr.flush()
                    
                    # Buscar C190 relacionado com o campo zerado
                    if indices_c190_relacionados and campo:
                        posicao_campo = editor.get_field_position("C190", campo)
                        if posicao_campo:
                            for idx_c190 in indices_c190_relacionados:
                                line_c190 = editor.lines[idx_c190]
                                parts_c190 = split_sped_line(line_c190, min_fields=13)
                                
                                # Verificar se o campo está zerado
                                if len(parts_c190) > posicao_campo:
                                    valor_atual = parse_float_br(parts_c190[posicao_campo] or "0")
                                    if abs(valor_atual) < 0.01:  # Campo zerado
                                        # Extrair CFOP/CST deste C190
                                        if len(parts_c190) > 3:
                                            cfop_c190 = parts_c190[3].strip()
                                            cst_c190 = parts_c190[2].strip() if len(parts_c190) > 2 else ""
                                            
                                            if cfop_c190 and cst_c190:
                                                cfop_c190_clean = "".join(cfop_c190.split())
                                                try:
                                                    from common import normalize_cst_for_compare
                                                    cst_c190_norm = normalize_cst_for_compare(cst_c190)
                                                except ImportError:
                                                    cst_c190_norm = cst_c190.strip().zfill(3)
                                                
                                                # Tentar atualizar este C190
                                                sucesso = editor.update_field(
                                                    registro="C190",
                                                    campo=campo,
                                                    novo_valor=valor_correto,
                                                    cfop=cfop_c190_clean,
                                                    cst=cst_c190_norm,
                                                    linha_sped=idx_c190+1
                                                )
                                                
                                                sys.stderr.write(f"[CORREÇÃO] DEBUG - update_field retornou sucesso={sucesso}\n")
                                                sys.stderr.flush()
                                                
                                                if sucesso:
                                                    sys.stderr.write(f"[CORREÇÃO] [SUCESSO] C190 atualizado na linha {idx_c190+1}! Salvando e retornando...\n")
                                                    sys.stderr.flush()
                                                    
                                                    if output_path is None:
                                                        output_path = sped_path.parent / f"{sped_path.stem}_corrigido{sped_path.suffix}"
                                                    else:
                                                        output_path = Path(output_path)
                                                    
                                                    editor.save(output_path)
                                                    resumo = editor.get_changes_summary()
                                                    return (True, output_path, resumo)
                                                
                                                sys.stderr.write(f"[CORREÇÃO] Não conseguiu atualizar C190 na linha {idx_c190+1}, continuando busca...\n")
                                                sys.stderr.flush()
                    
                    # Se encontrou CFOP/CST via C170 relacionados, usar para continuar
                    sys.stderr.write(f"[CORREÇÃO] DEBUG - Verificando cfop_cst_encontrados: {len(cfop_cst_encontrados)} encontrados\n")
                    sys.stderr.flush()
                    
                    if cfop_cst_encontrados:
                        sys.stderr.write(f"[CORREÇÃO] [OK] CFOP/CST encontrados via C170: {len(cfop_cst_encontrados)} combinações\n")
                        sys.stderr.flush()
                        # Continuar o processamento normalmente (o código abaixo vai usar cfop_cst_encontrados)
                    else:
                        sys.stderr.write(f"[CORREÇÃO] DEBUG - NENHUM CFOP/CST encontrado via C170! Continuando...\n")
                        sys.stderr.flush()
                
                sys.stderr.write(f"[CORREÇÃO] DEBUG - SAIU DO IF indices_c100. Continuando processamento...\n")
                sys.stderr.write(f"[CORREÇÃO] DEBUG - indices_c100={len(indices_c100) if indices_c100 else 0}, cfop_cst_encontrados={len(cfop_cst_encontrados)}\n")
                sys.stderr.flush()
                
                # Log resumido
                if not indices_c100:
                    sys.stderr.write(f"[CORREÇÃO] Nenhum C100 encontrado com a chave fornecida: {chave}\n")
                    sys.stderr.flush()
                    # DEBUG: Tentar buscar sem chave para ver se há C100 no arquivo
                    todos_c100_debug = editor.find_line_by_record("C100")
                    logger.info(f"[CORREÇÃO] DEBUG - Total de C100 no arquivo (sem filtro): {len(todos_c100_debug)}")
                    print(f"[CORREÇÃO] DEBUG - Total de C100 no arquivo (sem filtro): {len(todos_c100_debug)}", flush=True)
                    if todos_c100_debug:
                        logger.info(f"[CORREÇÃO] DEBUG - Encontrados {len(todos_c100_debug)} C100 no arquivo. Comparando chaves...")
                        print(f"[CORREÇÃO] DEBUG - Encontrados {len(todos_c100_debug)} C100 no arquivo. Comparando chaves...", flush=True)
                        
                        chave_fornecida_norm = "".join(str(chave).split())
                        for idx_debug in todos_c100_debug[:5]:  # Primeiros 5
                            linha_debug = editor.lines[idx_debug]
                            parts_debug = split_sped_line(linha_debug, min_fields=10)
                            if len(parts_debug) > 9:
                                chave_encontrada = parts_debug[9].strip()
                                chave_encontrada_norm = "".join(chave_encontrada.split())
                                match = "[OK] MATCH" if chave_encontrada_norm == chave_fornecida_norm else "[DIFERENTE]"
                                logger.info(f"[CORREÇÃO] DEBUG - Linha {idx_debug+1}: {match} | Fornecida: '{chave_fornecida_norm[:30]}...' | Encontrada: '{chave_encontrada_norm[:30]}...'")
                                print(f"[CORREÇÃO] DEBUG - Linha {idx_debug+1}: {match} | Fornecida: '{chave_fornecida_norm[:30]}...' | Encontrada: '{chave_encontrada_norm[:30]}...'", flush=True)
                
                # DEBUG: Verificar se há C100 no arquivo (sem filtro de chave)
                todos_c100 = editor.find_line_by_record("C100")
                logger.info(f"[CORREÇÃO] Total de C100 no arquivo (sem filtro): {len(todos_c100)}")
                print(f"[CORREÇÃO] Total de C100 no arquivo (sem filtro): {len(todos_c100)}", flush=True)
                
                # Se não encontrou C100, mostrar exemplos para debug
                if len(todos_c100) == 0:
                    logger.warning(f"[CORREÇÃO] Nenhum C100 encontrado no arquivo SPED. Tentando buscar CFOP/CST diretamente do C170...")
                    print(f"[CORREÇÃO] Nenhum C100 encontrado no arquivo SPED. Tentando buscar CFOP/CST diretamente do C170...", flush=True)
                    
                    # ALTERNATIVA: Buscar CFOP/CST diretamente do C170 usando a chave
                    # C170 também contém a chave da NF (campo 2)
                    chave_normalizada = "".join(str(chave).split())
                    todos_c170 = editor.find_line_by_record("C170")
                    logger.info(f"[CORREÇÃO] Total de C170 no arquivo: {len(todos_c170)}")
                    print(f"[CORREÇÃO] Total de C170 no arquivo: {len(todos_c170)}", flush=True)
                    
                    # Buscar C170 com a chave fornecida
                    for idx in todos_c170:
                        line = editor.lines[idx]
                        parts = split_sped_line(line, min_fields=21)
                        if len(parts) > 2:
                            chave_c170 = parts[2].strip()  # Campo 2 do C170 é a chave da NF
                            chave_c170_normalizada = "".join(chave_c170.split())
                            
                            # Comparar chaves normalizadas
                            if chave_c170_normalizada == chave_normalizada or chave_c170 == chave:
                                # Encontrou C170 com a chave! Extrair CFOP/CST
                                if len(parts) > 11:
                                    cfop_c170 = parts[11].strip()  # Campo 11 do C170 é CFOP
                                    cst_c170 = parts[10].strip() if len(parts) > 10 else ""  # Campo 10 é CST_ICMS
                                    
                                    if cfop_c170 and cst_c170:
                                        cfop_cst_encontrados.add((cfop_c170, cst_c170))
                                        logger.info(f"[CORREÇÃO] [OK] C170 encontrado na linha {idx+1} com chave correspondente: CFOP={cfop_c170}, CST={cst_c170}")
                                        print(f"[CORREÇÃO] [OK] C170 encontrado na linha {idx+1} com chave correspondente: CFOP={cfop_c170}, CST={cst_c170}", flush=True)
                    
                    # Se encontrou CFOP/CST via C170, continuar o processamento
                    if cfop_cst_encontrados:
                        logger.info(f"[CORREÇÃO] [OK] CFOP/CST encontrados via C170 direto: {len(cfop_cst_encontrados)} combinações")
                        print(f"[CORREÇÃO] [OK] CFOP/CST encontrados via C170 direto: {len(cfop_cst_encontrados)} combinações", flush=True)
                        # Continuar o processamento normalmente (o código abaixo vai usar cfop_cst_encontrados)
                    else:
                        # CAMADA 4: Se ainda não encontrou, buscar C190 diretamente pelo campo zerado
                        logger.info(f"[CORREÇÃO] Não encontrou C100 nem C170. Buscando C190 diretamente pelo campo '{campo}' zerado...")
                        print(f"[CORREÇÃO] Não encontrou C100 nem C170. Buscando C190 diretamente pelo campo '{campo}' zerado...", flush=True)
                        
                        todos_c190 = editor.find_line_by_record("C190")
                        logger.info(f"[CORREÇÃO] Total de C190 no arquivo: {len(todos_c190)}")
                        print(f"[CORREÇÃO] Total de C190 no arquivo: {len(todos_c190)}", flush=True)
                        
                        # Estratégia 4a: Buscar C190 com o campo que precisa ser corrigido zerado
                        if todos_c190 and campo:
                            posicao_campo = editor.get_field_position("C190", campo)
                            if posicao_campo:
                                for idx in todos_c190:
                                    line = editor.lines[idx]
                                    parts = split_sped_line(line, min_fields=13)
                                    
                                    # Verificar se o campo está zerado
                                    if len(parts) > posicao_campo:
                                        valor_atual = parse_float_br(parts[posicao_campo] or "0")
                                        if abs(valor_atual) < 0.01:  # Campo zerado
                                            # Extrair CFOP/CST deste C190
                                            if len(parts) > 3:
                                                cfop_c190 = parts[3].strip()
                                                cst_c190 = parts[2].strip() if len(parts) > 2 else ""
                                                
                                                if cfop_c190 and cst_c190:
                                                    cfop_c190_clean = "".join(cfop_c190.split())
                                                    try:
                                                        from common import normalize_cst_for_compare
                                                        cst_c190_norm = normalize_cst_for_compare(cst_c190)
                                                    except ImportError:
                                                        cst_c190_norm = cst_c190.strip().zfill(3)
                                                    
                                                    cfop_cst_encontrados.add((cfop_c190_clean, cst_c190_norm))
                                                    logger.info(f"[CORREÇÃO] [OK] C190 encontrado com {campo} zerado (linha {idx+1}): CFOP={cfop_c190_clean}, CST={cst_c190_norm}")
                                                    print(f"[CORREÇÃO] [OK] C190 encontrado com {campo} zerado (linha {idx+1}): CFOP={cfop_c190_clean}, CST={cst_c190_norm}", flush=True)
                                                    break  # Usar o primeiro encontrado
                        
                        # Estratégia 4b: Se ainda não encontrou, buscar qualquer C190 próximo (último recurso)
                        if not cfop_cst_encontrados and todos_c190:
                            logger.info(f"[CORREÇÃO] Tentando usar primeiro C190 encontrado como último recurso...")
                            print(f"[CORREÇÃO] Tentando usar primeiro C190 encontrado como último recurso...", flush=True)
                            
                            # Usar o primeiro C190 encontrado
                            idx = todos_c190[0]
                            line = editor.lines[idx]
                            parts = split_sped_line(line, min_fields=13)
                            
                            if len(parts) > 3:
                                cfop_c190 = parts[3].strip()
                                cst_c190 = parts[2].strip() if len(parts) > 2 else ""
                                
                                if cfop_c190 and cst_c190:
                                    cfop_c190_clean = "".join(cfop_c190.split())
                                    try:
                                        from common import normalize_cst_for_compare
                                        cst_c190_norm = normalize_cst_for_compare(cst_c190)
                                    except ImportError:
                                        cst_c190_norm = cst_c190.strip().zfill(3)
                                    
                                    cfop_cst_encontrados.add((cfop_c190_clean, cst_c190_norm))
                                    logger.warning(f"[CORREÇÃO] [AVISO] Usando C190 da linha {idx+1} como último recurso: CFOP={cfop_c190_clean}, CST={cst_c190_norm}")
                                    print(f"[CORREÇÃO] [AVISO] Usando C190 da linha {idx+1} como último recurso: CFOP={cfop_c190_clean}, CST={cst_c190_norm}", flush=True)
                        
                        # Se ainda não encontrou, retornar erro
                        if not cfop_cst_encontrados:
                            # Verificar outros registros para diagnóstico
                            outros_registros = {}
                            for idx, line in enumerate(editor.lines[:100]):  # Primeiras 100 linhas
                                if line.startswith("|") and "|" in line[1:]:
                                    reg = line.split("|")[1]
                                    outros_registros[reg] = outros_registros.get(reg, 0) + 1
                            
                            logger.info(f"[CORREÇÃO] Registros encontrados no arquivo: {outros_registros}")
                            print(f"[CORREÇÃO] Registros encontrados no arquivo: {outros_registros}", flush=True)
                            
                            return (False, sped_path, {
                                        "erro": "Não foi possível encontrar CFOP/CST para o C190",
                                        "detalhes": f"Nenhum C100, C170 ou C190 com a chave '{chave[:20] if chave else 'N/A'}...' foi encontrado. Registros encontrados: {list(outros_registros.keys())[:10]}",
                                        "sugestao": "Verifique se o arquivo SPED contém registros C100, C170 ou C190. Alguns arquivos podem ter apenas C100 e C190 (sem C170)."
                            })
                
                # Se encontrou C100 mas não com a chave específica, mostrar exemplos
                if len(indices_c100) == 0 and len(todos_c100) > 0:
                    logger.warning(f"[CORREÇÃO] C100 não encontrado com chave específica. Mostrando exemplos de chaves no arquivo...")
                    print(f"[CORREÇÃO] C100 não encontrado com chave específica. Mostrando exemplos de chaves no arquivo...", flush=True)
                    
                    # Mostrar primeiras 3 chaves encontradas
                    for idx in todos_c100[:3]:
                        line = editor.lines[idx]
                        parts = split_sped_line(line, min_fields=10)
                        if len(parts) > 9:
                            chave_exemplo = parts[9].strip()
                            logger.info(f"[CORREÇÃO]   Exemplo de chave C100 na linha {idx+1}: {chave_exemplo[:20]}...")
                            print(f"[CORREÇÃO]   Exemplo de chave C100 na linha {idx+1}: {chave_exemplo[:20]}...", flush=True)
                    
                    # Tentar normalizar a chave fornecida e comparar novamente
                    chave_normalizada_fornecida = "".join(str(chave).split())
                    logger.info(f"[CORREÇÃO] Chave fornecida (normalizada): {chave_normalizada_fornecida}")
                    print(f"[CORREÇÃO] Chave fornecida (normalizada): {chave_normalizada_fornecida}", flush=True)
                
                # Se encontrou CFOP/CST via C170 direto (sem C100), pular busca no bloco C100
                if cfop_cst_encontrados and len(indices_c100) == 0:
                    logger.info(f"[CORREÇÃO] CFOP/CST já encontrados via C170 direto, pulando busca no bloco C100")
                    print(f"[CORREÇÃO] CFOP/CST já encontrados via C170 direto, pulando busca no bloco C100", flush=True)
                elif indices_c100:
                    # C100 encontrado pela chave - verificar próxima(s) linha(s) até encontrar C170 ou C190
                    c100_idx = indices_c100[0]
                    logger.info(f"[CORREÇÃO] ========== PASSO 5 - C100 ENCONTRADO NA LINHA {c100_idx+1} ==========")
                    print(f"[CORREÇÃO] ========== PASSO 5 - C100 ENCONTRADO NA LINHA {c100_idx+1} ==========", flush=True)
                    logger.info(f"[CORREÇÃO] PASSO 5.1 - Linha C100 completa: '{editor.lines[c100_idx].rstrip()[:150]}'")
                    print(f"[CORREÇÃO] PASSO 5.1 - Linha C100 completa: '{editor.lines[c100_idx].rstrip()[:150]}'", flush=True)
                    logger.info(f"[CORREÇÃO] PASSO 5.2 - Iniciando busca por C170 ou C190 após C100...")
                    print(f"[CORREÇÃO] PASSO 5.2 - Iniciando busca por C170 ou C190 após C100...", flush=True)
                    
                    encontrou_cfop_cst = False
                    
                    # Buscar próximo C100 ou C195 para delimitar o bloco
                    logger.info(f"[CORREÇÃO] PASSO 5.3 - Buscando próximo C100/C195 para delimitar bloco...")
                    print(f"[CORREÇÃO] PASSO 5.3 - Buscando próximo C100/C195 para delimitar bloco...", flush=True)
                    proximo_c100_idx = None
                    for idx in range(c100_idx + 1, len(editor.lines)):
                        line = editor.lines[idx]
                        if line.strip().startswith("|C100|") or line.strip().startswith("|C195|"):
                            proximo_c100_idx = idx
                            logger.info(f"[CORREÇÃO] PASSO 5.3.1 - Próximo C100/C195 encontrado na linha {idx+1}")
                            print(f"[CORREÇÃO] PASSO 5.3.1 - Próximo C100/C195 encontrado na linha {idx+1}", flush=True)
                            break
                    
                    limite_busca = proximo_c100_idx if proximo_c100_idx else len(editor.lines)
                    logger.info(f"[CORREÇÃO] PASSO 5.4 - Limite de busca: linha {limite_busca} (total de linhas: {len(editor.lines)})")
                    print(f"[CORREÇÃO] PASSO 5.4 - Limite de busca: linha {limite_busca} (total de linhas: {len(editor.lines)})", flush=True)
                    logger.info(f"[CORREÇÃO] PASSO 5.5 - Verificando linhas de {c100_idx+2} até {limite_busca} (ou próximo C100/C195)")
                    print(f"[CORREÇÃO] PASSO 5.5 - Verificando linhas de {c100_idx+2} até {limite_busca} (ou próximo C100/C195)", flush=True)
                    
                    # Verificar cada linha após o C100 até encontrar C170 ou C190
                    linhas_verificadas = 0
                    for idx in range(c100_idx + 1, limite_busca):
                        line = editor.lines[idx]
                        line_stripped = line.strip()
                        linhas_verificadas += 1
                        
                        # LOG DETALHADO: Primeiras 10 linhas e depois a cada 50
                        if linhas_verificadas <= 10 or linhas_verificadas % 50 == 0:
                            tipo_linha = "VAZIA" if not line_stripped else (line_stripped.split("|")[1] if "|" in line_stripped and len(line_stripped.split("|")) > 1 else "DESCONHECIDA")
                            logger.info(f"[CORREÇÃO] PASSO 6.{linhas_verificadas} - Linha {idx+1}: [{tipo_linha}] '{line_stripped[:100]}'")
                            print(f"[CORREÇÃO] PASSO 6.{linhas_verificadas} - Linha {idx+1}: [{tipo_linha}] '{line_stripped[:100]}'", flush=True)
                        
                        # Pular apenas linhas realmente vazias
                        if not line_stripped or line_stripped == "":
                            if linhas_verificadas <= 10:
                                logger.debug(f"[CORREÇÃO] PASSO 6.{linhas_verificadas} - Linha {idx+1} está vazia, pulando...")
                            continue
                        
                        # Parar se encontrar próximo C100 ou C195 (fim do bloco)
                        if line_stripped.startswith("|C100|") or line_stripped.startswith("|C195|"):
                            logger.info(f"[CORREÇÃO] PASSO 6.{linhas_verificadas} - [FIM DO BLOCO] Encontrado próximo C100/C195 na linha {idx+1}")
                            print(f"[CORREÇÃO] PASSO 6.{linhas_verificadas} - [FIM DO BLOCO] Encontrado próximo C100/C195 na linha {idx+1}", flush=True)
                            break
                        
                        # CORREÇÃO: IGNORAR C110 (não é C170 nem C190, mas não é fim do bloco)
                        if line_stripped.startswith("|C110|"):
                            if linhas_verificadas <= 10:
                                logger.debug(f"[CORREÇÃO] PASSO 6.{linhas_verificadas} - Linha {idx+1} é C110, continuando busca...")
                            continue
                        
                        # CASO 1: Encontrou C170
                        if line_stripped.startswith("|C170|"):
                            logger.info(f"[CORREÇÃO] ========== PASSO 7 - C170 ENCONTRADO NA LINHA {idx+1} ==========")
                            print(f"[CORREÇÃO] ========== PASSO 7 - C170 ENCONTRADO NA LINHA {idx+1} ==========", flush=True)
                            logger.info(f"[CORREÇÃO] PASSO 7.1 - Linha C170 completa: '{line.rstrip()[:150]}'")
                            print(f"[CORREÇÃO] PASSO 7.1 - Linha C170 completa: '{line.rstrip()[:150]}'", flush=True)
                            
                            parts = split_sped_line(line, min_fields=21)
                            logger.info(f"[CORREÇÃO] PASSO 7.2 - C170 split resultou em {len(parts)} campos")
                            print(f"[CORREÇÃO] PASSO 7.2 - C170 split resultou em {len(parts)} campos", flush=True)
                            
                            # DEBUG: Mostrar estrutura do C170
                            if len(parts) > 12:
                                logger.info(f"[CORREÇÃO] PASSO 7.3 - parts[10] (CST)='{parts[10]}', parts[11] (CFOP)='{parts[11]}'")
                                print(f"[CORREÇÃO] PASSO 7.3 - parts[10] (CST)='{parts[10]}', parts[11] (CFOP)='{parts[11]}'", flush=True)
                            
                            if len(parts) > 11:
                                cfop_c170 = parts[11].strip()  # Campo 11 = CFOP
                                cst_c170 = parts[10].strip() if len(parts) > 10 else ""  # Campo 10 = CST_ICMS
                                
                                logger.info(f"[CORREÇÃO] PASSO 7.4 - Extraídos: CFOP='{cfop_c170}', CST='{cst_c170}'")
                                print(f"[CORREÇÃO] PASSO 7.4 - Extraídos: CFOP='{cfop_c170}', CST='{cst_c170}'", flush=True)
                                
                                # CORREÇÃO: Validação mais flexível - aceitar qualquer valor não vazio (incluindo "0")
                                cfop_valido = bool(cfop_c170 and str(cfop_c170).strip())
                                cst_valido = bool(cst_c170 and str(cst_c170).strip())
                                
                                logger.info(f"[CORREÇÃO] PASSO 7.5 - Validação: CFOP válido={cfop_valido}, CST válido={cst_valido}")
                                print(f"[CORREÇÃO] PASSO 7.5 - Validação: CFOP válido={cfop_valido}, CST válido={cst_valido}", flush=True)
                                
                                if cfop_valido and cst_valido:
                                    cfop_c170_clean = "".join(cfop_c170.split())
                                    try:
                                        from common import normalize_cst_for_compare
                                        cst_c170_norm = normalize_cst_for_compare(cst_c170)
                                    except ImportError:
                                        cst_c170_norm = cst_c170.strip().zfill(3)
                                    
                                    cfop_cst_encontrados.add((cfop_c170_clean, cst_c170_norm))
                                    logger.info(f"[CORREÇÃO] PASSO 7.6 - [OK] CFOP/CST extraído do C170: CFOP={cfop_c170_clean}, CST={cst_c170_norm}")
                                    print(f"[CORREÇÃO] PASSO 7.6 - [OK] CFOP/CST extraído do C170: CFOP={cfop_c170_clean}, CST={cst_c170_norm}", flush=True)
                                    encontrou_cfop_cst = True
                                    continue  # Continuar buscando mais C170 ou C190
                                else:
                                    logger.warning(f"[CORREÇÃO] PASSO 7.6 - [FALHOU] C170 sem CFOP/CST válidos: CFOP='{cfop_c170}' (válido={cfop_valido}), CST='{cst_c170}' (válido={cst_valido})")
                                    print(f"[CORREÇÃO] PASSO 7.6 - [FALHOU] C170 sem CFOP/CST válidos: CFOP='{cfop_c170}' (válido={cfop_valido}), CST='{cst_c170}' (válido={cst_valido})", flush=True)
                            else:
                                logger.warning(f"[CORREÇÃO] PASSO 7.6 - [FALHOU] C170 tem menos de 12 campos: {len(parts)}")
                                print(f"[CORREÇÃO] PASSO 7.6 - [FALHOU] C170 tem menos de 12 campos: {len(parts)}", flush=True)
                        
                        # CASO 2: Encontrou C190
                        elif line_stripped.startswith("|C190|"):
                            logger.info(f"[CORREÇÃO] ========== PASSO 8 - C190 ENCONTRADO NA LINHA {idx+1} ==========")
                            print(f"[CORREÇÃO] ========== PASSO 8 - C190 ENCONTRADO NA LINHA {idx+1} ==========", flush=True)
                            logger.info(f"[CORREÇÃO] PASSO 8.1 - Linha C190 completa: '{line.rstrip()[:150]}'")
                            print(f"[CORREÇÃO] PASSO 8.1 - Linha C190 completa: '{line.rstrip()[:150]}'", flush=True)
                            
                            parts = split_sped_line(line, min_fields=13)
                            logger.info(f"[CORREÇÃO] PASSO 8.2 - C190 split resultou em {len(parts)} campos")
                            print(f"[CORREÇÃO] PASSO 8.2 - C190 split resultou em {len(parts)} campos", flush=True)
                            
                            # Mostrar campos relevantes para debug
                            if len(parts) > 4:
                                logger.info(f"[CORREÇÃO] PASSO 8.3 - parts[1]='{parts[1]}', parts[2]='{parts[2]}' (CST), parts[3]='{parts[3]}' (CFOP)")
                                print(f"[CORREÇÃO] PASSO 8.3 - parts[1]='{parts[1]}', parts[2]='{parts[2]}' (CST), parts[3]='{parts[3]}' (CFOP)", flush=True)
                            
                            if len(parts) > 3:
                                # CORREÇÃO: C190 layout: parts[2]=CST, parts[3]=CFOP
                                cst_c190 = parts[2].strip() if len(parts) > 2 else ""  # Campo 2 = CST_ICMS
                                cfop_c190 = parts[3].strip()  # Campo 3 = CFOP
                                
                                logger.info(f"[CORREÇÃO] PASSO 8.4 - Extraídos: CFOP (parts[3])='{cfop_c190}', CST (parts[2])='{cst_c190}'")
                                print(f"[CORREÇÃO] PASSO 8.4 - Extraídos: CFOP (parts[3])='{cfop_c190}', CST (parts[2])='{cst_c190}'", flush=True)
                                
                                # CORREÇÃO: Validação mais flexível - aceitar qualquer valor não vazio (incluindo "0")
                                cfop_valido = bool(cfop_c190 and str(cfop_c190).strip())
                                cst_valido = bool(cst_c190 and str(cst_c190).strip())
                                
                                logger.info(f"[CORREÇÃO] PASSO 8.5 - Validação: CFOP válido={cfop_valido} ('{cfop_c190}'), CST válido={cst_valido} ('{cst_c190}')")
                                print(f"[CORREÇÃO] PASSO 8.5 - Validação: CFOP válido={cfop_valido} ('{cfop_c190}'), CST válido={cst_valido} ('{cst_c190}')", flush=True)
                                
                                if cfop_valido and cst_valido:
                                    cfop_c190_clean = "".join(cfop_c190.split())
                                    try:
                                        from common import normalize_cst_for_compare
                                        cst_c190_norm = normalize_cst_for_compare(cst_c190)
                                    except ImportError:
                                        cst_c190_norm = cst_c190.strip().zfill(3)
                                    
                                    cfop_cst_encontrados.add((cfop_c190_clean, cst_c190_norm))
                                    logger.info(f"[CORREÇÃO] PASSO 8.6 - [OK] CFOP/CST extraído do C190: CFOP={cfop_c190_clean}, CST={cst_c190_norm}")
                                    print(f"[CORREÇÃO] PASSO 8.6 - [OK] CFOP/CST extraído do C190: CFOP={cfop_c190_clean}, CST={cst_c190_norm}", flush=True)
                                    encontrou_cfop_cst = True
                                    continue  # Continuar buscando mais C190
                                else:
                                    logger.warning(f"[CORREÇÃO] PASSO 8.6 - [FALHOU] C190 sem CFOP/CST válidos: CFOP='{cfop_c190}' (válido={cfop_valido}), CST='{cst_c190}' (válido={cst_valido})")
                                    print(f"[CORREÇÃO] PASSO 8.6 - [FALHOU] C190 sem CFOP/CST válidos: CFOP='{cfop_c190}' (válido={cfop_valido}), CST='{cst_c190}' (válido={cst_valido})", flush=True)
                            else:
                                logger.warning(f"[CORREÇÃO] PASSO 8.6 - [FALHOU] C190 tem menos de 4 campos: {len(parts)}")
                                print(f"[CORREÇÃO] PASSO 8.6 - [FALHOU] C190 tem menos de 4 campos: {len(parts)}", flush=True)
                                # Mostrar todos os campos para diagnóstico
                                logger.info(f"[CORREÇÃO] PASSO 8.6 - Todos os campos: {parts[:10]}")
                                print(f"[CORREÇÃO] PASSO 8.6 - Todos os campos: {parts[:10]}", flush=True)
                    
                    # Log final
                    logger.info(f"[CORREÇÃO] ========== PASSO 9 - RESULTADO FINAL ==========")
                    print(f"[CORREÇÃO] ========== PASSO 9 - RESULTADO FINAL ==========", flush=True)
                    logger.info(f"[CORREÇÃO] PASSO 9.1 - Linhas verificadas: {linhas_verificadas}")
                    print(f"[CORREÇÃO] PASSO 9.1 - Linhas verificadas: {linhas_verificadas}", flush=True)
                    logger.info(f"[CORREÇÃO] PASSO 9.2 - CFOP/CST encontrados: {encontrou_cfop_cst}")
                    print(f"[CORREÇÃO] PASSO 9.2 - CFOP/CST encontrados: {encontrou_cfop_cst}", flush=True)
                    logger.info(f"[CORREÇÃO] PASSO 9.3 - Total de combinações CFOP/CST: {len(cfop_cst_encontrados)}")
                    print(f"[CORREÇÃO] PASSO 9.3 - Total de combinações CFOP/CST: {len(cfop_cst_encontrados)}", flush=True)
                    
                    if encontrou_cfop_cst and cfop_cst_encontrados:
                        logger.info(f"[CORREÇÃO] PASSO 9.4 - [OK] CFOP/CST encontrados: {len(cfop_cst_encontrados)} combinações")
                        print(f"[CORREÇÃO] PASSO 9.4 - [OK] CFOP/CST encontrados: {len(cfop_cst_encontrados)} combinações", flush=True)
                        for cfop_found, cst_found in cfop_cst_encontrados:
                            logger.info(f"[CORREÇÃO] PASSO 9.4 - CFOP={cfop_found}, CST={cst_found}")
                            print(f"[CORREÇÃO] PASSO 9.4 - CFOP={cfop_found}, CST={cst_found}", flush=True)
                    else:
                        logger.warning(f"[CORREÇÃO] PASSO 9.4 - [FALHOU] Não foi possível encontrar C170 ou C190 após C100 na linha {c100_idx+1}")
                        print(f"[CORREÇÃO] PASSO 9.4 - [FALHOU] Não foi possível encontrar C170 ou C190 após C100 na linha {c100_idx+1}", flush=True)
                        # DEBUG: Mostrar próximas 10 linhas após o C100 para diagnóstico
                        logger.info(f"[CORREÇÃO] PASSO 9.5 - Próximas 10 linhas após C100 (linha {c100_idx+1}):")
                        print(f"[CORREÇÃO] PASSO 9.5 - Próximas 10 linhas após C100 (linha {c100_idx+1}):", flush=True)
                        for debug_idx in range(c100_idx + 1, min(c100_idx + 11, len(editor.lines))):
                            debug_line = editor.lines[debug_idx]
                            debug_stripped = debug_line.strip()
                            tipo_linha = "VAZIA" if not debug_stripped else debug_stripped.split("|")[1] if "|" in debug_stripped else "DESCONHECIDA"
                            logger.info(f"[CORREÇÃO] PASSO 9.5 - Linha {debug_idx+1}: [{tipo_linha}] '{debug_stripped[:100]}'")
                            print(f"[CORREÇÃO] PASSO 9.5 - Linha {debug_idx+1}: [{tipo_linha}] '{debug_stripped[:100]}'", flush=True)
                
                # Se encontrou CFOP/CST (seja via C100→C170, C100→C190, C170 direto, ou C190 direto), usar para atualizar C190
                if cfop_cst_encontrados:
                    logger.info(f"[CORREÇÃO] Encontradas {len(cfop_cst_encontrados)} combinações CFOP/CST. Tentando atualizar C190...")
                    print(f"[CORREÇÃO] Encontradas {len(cfop_cst_encontrados)} combinações CFOP/CST. Tentando atualizar C190...", flush=True)
                    
                    # Tentar cada combinação CFOP/CST encontrada
                    tentativas_sucesso = False
                    for cfop_encontrado, cst_encontrado in cfop_cst_encontrados:
                        # Limpar CFOP encontrado
                        cfop_encontrado_clean = "".join(cfop_encontrado.split())
                        
                        # Normalizar CST encontrado
                        try:
                            from common import normalize_cst_for_compare
                            cst_encontrado_norm = normalize_cst_for_compare(cst_encontrado)
                        except ImportError:
                            cst_encontrado_norm = cst_encontrado.strip().zfill(3)
                        
                        logger.debug(f"[CORREÇÃO] Tentando atualizar C190 com CFOP={cfop_encontrado_clean}, CST={cst_encontrado_norm}")
                        
                        # Tentar atualizar C190 com CFOP/CST encontrados
                        sucesso = editor.update_field(
                            registro="C190",
                            campo=campo,
                            novo_valor=valor_correto,
                            cfop=cfop_encontrado_clean,
                            cst=cst_encontrado_norm
                        )
                        
                        if sucesso:
                            logger.info(f"[CORREÇÃO] [SUCESSO] C190 atualizado com CFOP={cfop_encontrado_clean}, CST={cst_encontrado_norm}")
                            print(f"[CORREÇÃO] [SUCESSO] C190 atualizado com CFOP={cfop_encontrado_clean}, CST={cst_encontrado_norm}", flush=True)
                            tentativas_sucesso = True
                            break  # Encontrou e atualizou, não precisa tentar outras combinações
                    
                    if tentativas_sucesso:
                        # Salvar arquivo corrigido
                        if output_path is None:
                            output_path = sped_path.parent / f"{sped_path.stem}_corrigido{sped_path.suffix}"
                        else:
                            output_path = Path(output_path)
                        
                        editor.save(output_path)
                        resumo = editor.get_changes_summary()
                        return (True, output_path, resumo)
                    else:
                        # C190 não existe para nenhuma combinação, precisa criar
                        logger.info(f"[CORREÇÃO] C190 não encontrado para nenhuma das {len(cfop_cst_encontrados)} combinações. Criando novo C190...")
                        print(f"[CORREÇÃO] C190 não encontrado para nenhuma das {len(cfop_cst_encontrados)} combinações. Criando novo C190...", flush=True)
                        
                        # Usar a primeira combinação para criar
                        cfop_encontrado, cst_encontrado = list(cfop_cst_encontrados)[0]
                        cfop_encontrado_clean = "".join(cfop_encontrado.split())
                        try:
                            from common import normalize_cst_for_compare
                            cst_encontrado_norm = normalize_cst_for_compare(cst_encontrado)
                        except ImportError:
                            cst_encontrado_norm = cst_encontrado.strip().zfill(3)
                        
                        # Buscar C170 relacionados para calcular valores
                        indices_c170 = editor.find_line_by_record("C170", cfop=cfop_encontrado_clean, cst=cst_encontrado_norm)
                        
                        # Se não encontrou C170 com CFOP/CST exatos, tentar buscar C170 do bloco do C100 (se houver)
                        if not indices_c170 and indices_c100:
                            logger.info(f"[CORREÇÃO] Buscando C170 do bloco do C100 para calcular valores do C190...")
                            print(f"[CORREÇÃO] Buscando C170 do bloco do C100 para calcular valores do C190...", flush=True)
                            # Buscar C170 no bloco do C100
                            c100_idx = indices_c100[0]
                            for idx in range(c100_idx + 1, len(editor.lines)):
                                line = editor.lines[idx]
                                if line.startswith("|C100|") or line.startswith("|C195|"):
                                    break
                                if line.startswith("|C170|"):
                                    indices_c170.append(idx)
                        
                        # Se ainda não encontrou, buscar C170 pela chave
                        if not indices_c170 and chave:
                            logger.info(f"[CORREÇÃO] Buscando C170 pela chave da NF...")
                            print(f"[CORREÇÃO] Buscando C170 pela chave da NF...", flush=True)
                            chave_normalizada = "".join(str(chave).split())
                            todos_c170 = editor.find_line_by_record("C170")
                            for idx in todos_c170:
                                line = editor.lines[idx]
                                parts = split_sped_line(line, min_fields=21)
                                if len(parts) > 2:
                                    chave_c170 = parts[2].strip()
                                    chave_c170_normalizada = "".join(chave_c170.split())
                                    if chave_c170_normalizada == chave_normalizada or chave_c170 == chave:
                                        indices_c170.append(idx)
                        
                        # Se encontrou C170, usar para calcular valores (lógica existente mais abaixo)
                        if indices_c170:
                            # Calcular valores baseados nos C170
                            # ... (continuar com a lógica existente de criação do C190)
                            # Por enquanto, vamos usar a lógica que já existe mais abaixo
                            pass
                        else:
                            # CASO ESPECIAL: Se encontramos CFOP/CST via C190 (sem C170), podemos criar C190 diretamente
                            # Isso acontece quando o arquivo tem apenas C100 e C190, sem C170
                            logger.info(f"[CORREÇÃO] Não encontrou C170, mas encontrou CFOP/CST via C190. Criando C190 diretamente com valor fornecido...")
                            print(f"[CORREÇÃO] Não encontrou C170, mas encontrou CFOP/CST via C190. Criando C190 diretamente com valor fornecido...", flush=True)
                            
                            # Criar C190 com valores mínimos (apenas o campo que precisa ser corrigido)
                            # Layout C190: C190|CST|CFOP|ALIQ|VL_OPR|VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_RED_BC|VL_IPI|COD_OBS|
                            campos_c190 = [
                                "",
                                "C190",
                                cst_encontrado_norm or "",
                                cfop_encontrado_clean or "",
                                "",  # ALIQ_ICMS
                                "0.00",  # VL_OPR
                                "0.00",  # VL_BC_ICMS
                                "0.00",  # VL_ICMS
                                "0.00",  # VL_BC_ICMS_ST
                                "0.00",  # VL_ICMS_ST
                                "0.00",  # VL_RED_BC
                                "0.00",  # VL_IPI
                                ""  # COD_OBS
                            ]
                            
                            # Mapear campo para posição e definir valor correto
                            posicao_campo = editor.get_field_position("C190", campo)
                            if posicao_campo and posicao_campo < len(campos_c190):
                                campos_c190[posicao_campo] = f"{valor_correto:.2f}"
                            
                            linha_c190 = "|".join(campos_c190) + "|\n"
                            
                            # Inserir após o C100 (se houver) ou no final do arquivo
                            # Usar indices_c100 se disponível, senão buscar
                            c100_idx_para_inserir = None
                            if indices_c100:
                                c100_idx_para_inserir = indices_c100[0]
                            else:
                                # Tentar encontrar C100 pela chave novamente
                                if chave:
                                    indices_c100_temp = editor.find_line_by_record("C100", chave=chave)
                                    if indices_c100_temp:
                                        c100_idx_para_inserir = indices_c100_temp[0]
                            
                            if c100_idx_para_inserir is not None:
                                posicao_inserir = c100_idx_para_inserir + 1
                            else:
                                # Buscar último C190 ou C195 para inserir após
                                ultimo_c190 = None
                                for idx in range(len(editor.lines) - 1, -1, -1):
                                    if editor.lines[idx].startswith("|C190|") or editor.lines[idx].startswith("|C195|"):
                                        ultimo_c190 = idx
                                        break
                                posicao_inserir = (ultimo_c190 + 1) if ultimo_c190 else len(editor.lines)
                            
                            editor.lines.insert(posicao_inserir, linha_c190)
                            logger.info(f"[CORREÇÃO] [OK] C190 criado na linha {posicao_inserir + 1} (sem C170): CFOP={cfop_encontrado_clean}, CST={cst_encontrado_norm}, {campo}={valor_correto:.2f}")
                            print(f"[CORREÇÃO] [OK] C190 criado na linha {posicao_inserir + 1} (sem C170): CFOP={cfop_encontrado_clean}, CST={cst_encontrado_norm}, {campo}={valor_correto:.2f}", flush=True)
                            
                            # Salvar arquivo corrigido
                            if output_path is None:
                                output_path = sped_path.parent / f"{sped_path.stem}_corrigido{sped_path.suffix}"
                            else:
                                output_path = Path(output_path)
                            
                            editor.save(output_path)
                            resumo = editor.get_changes_summary()
                            return (True, output_path, resumo)
                else:
                    # Se não encontrou CFOP/CST em nenhum lugar, tentar última camada: buscar C190 com campo zerado
                    logger.warning(f"[CORREÇÃO] Não foi possível encontrar CFOP/CST via chave. Tentando última camada: buscar C190 com campo '{campo}' zerado...")
                    print(f"[CORREÇÃO] Não foi possível encontrar CFOP/CST via chave. Tentando última camada: buscar C190 com campo '{campo}' zerado...", flush=True)
                    
                    # CAMADA FINAL: Buscar C190 com o campo que precisa ser corrigido zerado
                    todos_c190 = editor.find_line_by_record("C190")
                    logger.info(f"[CORREÇÃO] Total de C190 no arquivo para busca final: {len(todos_c190)}")
                    print(f"[CORREÇÃO] Total de C190 no arquivo para busca final: {len(todos_c190)}", flush=True)
                    
                    if todos_c190 and campo:
                        posicao_campo = editor.get_field_position("C190", campo)
                        if posicao_campo:
                            for idx in todos_c190:
                                line = editor.lines[idx]
                                parts = split_sped_line(line, min_fields=13)
                                
                                # Verificar se o campo está zerado
                                if len(parts) > posicao_campo:
                                    valor_atual = parse_float_br(parts[posicao_campo] or "0")
                                    if abs(valor_atual) < 0.01:  # Campo zerado
                                        # Extrair CFOP/CST deste C190
                                        if len(parts) > 3:
                                            cfop_c190 = parts[3].strip()
                                            cst_c190 = parts[2].strip() if len(parts) > 2 else ""
                                            
                                            if cfop_c190 and cst_c190:
                                                cfop_c190_clean = "".join(cfop_c190.split())
                                                try:
                                                    from common import normalize_cst_for_compare
                                                    cst_c190_norm = normalize_cst_for_compare(cst_c190)
                                                except ImportError:
                                                    cst_c190_norm = cst_c190.strip().zfill(3)
                                                
                                                # Usar este CFOP/CST para atualizar
                                                logger.info(f"[CORREÇÃO] [OK] C190 encontrado com {campo} zerado (linha {idx+1}): CFOP={cfop_c190_clean}, CST={cst_c190_norm}")
                                                print(f"[CORREÇÃO] [OK] C190 encontrado com {campo} zerado (linha {idx+1}): CFOP={cfop_c190_clean}, CST={cst_c190_norm}", flush=True)
                                                
                                                sucesso = editor.update_field(
                                                    registro="C190",
                                                    campo=campo,
                                                    novo_valor=valor_correto,
                                                    cfop=cfop_c190_clean,
                                                    cst=cst_c190_norm,
                                                    linha_sped=idx+1
                                                )
                                                
                                                if sucesso:
                                                    if output_path is None:
                                                        output_path = sped_path.parent / f"{sped_path.stem}_corrigido{sped_path.suffix}"
                                                    else:
                                                        output_path = Path(output_path)
                                                    
                                                    editor.save(output_path)
                                                    resumo = editor.get_changes_summary()
                                                    return (True, output_path, resumo)
                                                
                                                # Se não conseguiu atualizar este, continuar procurando
                                                logger.warning(f"[CORREÇÃO] Não conseguiu atualizar C190 na linha {idx+1}, continuando busca...")
                                                print(f"[CORREÇÃO] Não conseguiu atualizar C190 na linha {idx+1}, continuando busca...", flush=True)
                    
                    # Se chegou aqui, realmente não encontrou CFOP/CST em nenhum lugar
                    logger.warning(f"[CORREÇÃO] Não foi possível encontrar CFOP/CST para o C190 após todas as tentativas")
                    print(f"[CORREÇÃO] Não foi possível encontrar CFOP/CST para o C190 após todas as tentativas", flush=True)
                    
                    # Verificar se há outros registros no arquivo para diagnóstico
                    outros_registros = {}
                    for idx, line in enumerate(editor.lines[:100]):  # Primeiras 100 linhas
                        if line.startswith("|") and "|" in line[1:]:
                            reg = line.split("|")[1]
                            outros_registros[reg] = outros_registros.get(reg, 0) + 1
                    
                    return (False, sped_path, {
                        "erro": "Não foi possível encontrar CFOP/CST para o C190",
                        "detalhes": f"Não foram encontrados C100, C170 ou C190 com a chave '{chave[:20] if chave else 'N/A'}...' para obter CFOP/CST. Registros encontrados: {list(outros_registros.keys())[:10]}",
                        "sugestao": "Verifique se o arquivo SPED contém registros C100, C170 ou C190 com a chave da NF correspondente, ou C190 com o campo zerado."
                    })
            else:
                # DEBUG: Se não entrou no if chave
                sys.stderr.write(f"[CORREÇÃO] DEBUG - NÃO ENTROU NO IF CHAVE! chave='{chave}', bool(chave)={bool(chave)}, type={type(chave)}\n")
                sys.stderr.flush()
            
            # Se não encontrou via chave, buscar todos os C190 e tentar atualizar um com valor zerado
            # CORREÇÃO: Também tentar buscar C190 que correspondem ao campo que queremos corrigir
            todos_c190 = editor.find_line_by_record("C190")
            logger.info(f"[CORREÇÃO] Total de C190 encontrados no arquivo: {len(todos_c190)}")
            print(f"[CORREÇÃO] Total de C190 encontrados no arquivo: {len(todos_c190)}", flush=True)
            
            if todos_c190:
                # Tentar encontrar um C190 com o campo zerado que precisa ser atualizado
                logger.info(f"[CORREÇÃO] Buscando C190 com campo {campo} zerado...")
                print(f"[CORREÇÃO] Buscando C190 com campo {campo} zerado...", flush=True)
                
                for idx in todos_c190:
                    line = editor.lines[idx]
                    parts = split_sped_line(line, min_fields=13)
                    if len(parts) > 1:
                        # Verificar se o campo que queremos corrigir está zerado neste C190
                        posicao_campo = editor.get_field_position("C190", campo)
                        if posicao_campo and len(parts) > posicao_campo:
                            valor_atual = parse_float_br(parts[posicao_campo] or "0")
                            # Se o valor atual está zerado ou muito próximo de zero, atualizar
                            if abs(valor_atual) < 0.01:
                                logger.info(f"[CORREÇÃO] Encontrado C190 na linha {idx+1} com {campo} zerado (valor atual: {valor_atual}). Atualizando...")
                                print(f"[CORREÇÃO] Encontrado C190 na linha {idx+1} com {campo} zerado (valor atual: {valor_atual}). Atualizando...", flush=True)
                                
                                # Extrair CFOP e CST deste C190 para usar na atualização
                                if len(parts) > 3:
                                    cfop_encontrado = parts[3].strip()
                                    cst_encontrado = parts[2].strip() if len(parts) > 2 else ""
                                    
                                    logger.info(f"[CORREÇÃO] C190 encontrado - CFOP: '{cfop_encontrado}', CST: '{cst_encontrado}'")
                                    print(f"[CORREÇÃO] C190 encontrado - CFOP: '{cfop_encontrado}', CST: '{cst_encontrado}'", flush=True)
                                    
                                    # Limpar CFOP encontrado
                                    cfop_encontrado_clean = "".join(cfop_encontrado.split())
                                    
                                    # Normalizar CST encontrado
                                    try:
                                        from common import normalize_cst_for_compare
                                        cst_encontrado_norm = normalize_cst_for_compare(cst_encontrado)
                                    except ImportError:
                                        cst_encontrado_norm = cst_encontrado.strip().zfill(3)
                                    
                                    # Atualizar usando o CFOP e CST encontrados
                                    sucesso = editor.update_field(
                                        registro="C190",
                                        campo=campo,
                                        novo_valor=valor_correto,
                                        cfop=cfop_encontrado_clean,
                                        cst=cst_encontrado_norm,
                                        linha_sped=idx+1  # linha_sped é 1-indexed
                                    )
                                    
                                    if sucesso:
                                        logger.info(f"[CORREÇÃO] [OK] SUCESSO: C190 atualizado na linha {idx+1}")
                                        print(f"[CORREÇÃO] [OK] SUCESSO: C190 atualizado na linha {idx+1}", flush=True)
                                        
                                        # Salvar arquivo corrigido
                                        if output_path is None:
                                            output_path = sped_path.parent / f"{sped_path.stem}_corrigido{sped_path.suffix}"
                                        else:
                                            output_path = Path(output_path)
                                        
                                        editor.save(output_path)
                                        resumo = editor.get_changes_summary()
                                        return (True, output_path, resumo)
                                    else:
                                        logger.warning(f"[CORREÇÃO] [AVISO] Falha ao atualizar C190 na linha {idx+1}")
                                        print(f"[CORREÇÃO] [AVISO] Falha ao atualizar C190 na linha {idx+1}", flush=True)
                                else:
                                    logger.warning(f"[CORREÇÃO] C190 na linha {idx+1} não tem CFOP/CST suficientes (parts length: {len(parts)})")
                                    print(f"[CORREÇÃO] C190 na linha {idx+1} não tem CFOP/CST suficientes (parts length: {len(parts)})", flush=True)
                            else:
                                logger.debug(f"[CORREÇÃO] C190 na linha {idx+1} tem {campo} = {valor_atual} (não zerado)")
                        else:
                            logger.warning(f"[CORREÇÃO] C190 na linha {idx+1} não tem posição {posicao_campo} para campo {campo}")
                            print(f"[CORREÇÃO] C190 na linha {idx+1} não tem posição {posicao_campo} para campo {campo}", flush=True)
                
                # Se não encontrou C190 com valor zerado, retornar erro informativo
                return (False, sped_path, {
                    "erro": "Não foi possível aplicar correção: CFOP e CST são obrigatórios para identificar o C190 correto",
                    "detalhes": f"Existem {len(todos_c190)} registros C190 no arquivo, mas não foi possível identificar qual atualizar sem CFOP e CST.",
                    "sugestao": "Verifique se CFOP e CST estão sendo fornecidos na correção. Se não, a correção precisa incluir essas informações para identificar o C190 correto."
                })
            else:
                # Não há C190 no arquivo, mas também não temos CFOP/CST para criar um novo
                logger.error(f"[CORREÇÃO] Não foi possível encontrar CFOP/CST para criar C190")
                print(f"[CORREÇÃO] Não foi possível encontrar CFOP/CST para criar C190", flush=True)
                return (False, sped_path, {
                    "erro": "CFOP e CST são obrigatórios para criar C190",
                    "detalhes": f"Não foi possível encontrar CFOP e CST relacionados à chave NF {chave[:20] if chave else 'N/A'}... no arquivo SPED. Verifique se o arquivo contém os registros C100 e C170 necessários.",
                    "sugestao": "Verifique se CFOP e CST estão sendo fornecidos na correção ou se existem registros C170 relacionados ao C100 com a chave fornecida."
                })
        
        # Se C190 não existe e precisa ser criado
        if registro == "C190" and valor_correto > 0:
            
            # Verificar se C190 já existe (usar CFOP limpo)
            indices_c190 = editor.find_line_by_record("C190", cfop=cfop_clean, cst=cst_normalizado, linha_sped=linha_sped)
            
            if not indices_c190:
                # C190 não existe, precisa criar
                # VALIDAÇÃO LEGAL: Verificar se temos C170 relacionados antes de criar C190
                # Conforme legislação: C190 = Σ C170 por CFOP/CST
                # CORREÇÃO: Limpar CFOP (remover espaços) antes de buscar
                cfop_clean = str(cfop).strip() if cfop else ""
                cfop_clean = "".join(cfop_clean.split())  # Remove todos os espaços (incluindo internos)
                logger.info(f"[DEBUG] Buscando C170 com CFOP='{cfop_clean}' (original='{cfop}'), CST original={cst_raw}, CST normalizado={cst_normalizado}")
                print(f"[DEBUG] Buscando C170 com CFOP='{cfop_clean}' (original='{cfop}'), CST original={cst_raw}, CST normalizado={cst_normalizado}", flush=True)
                
                indices_c170 = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_normalizado)
                logger.info(f"[DEBUG] C170 encontrados com CFOP='{cfop_clean}' e CST={cst_normalizado}: {len(indices_c170)}")
                print(f"[DEBUG] C170 encontrados com CFOP='{cfop_clean}' e CST={cst_normalizado}: {len(indices_c170)}", flush=True)
                
                # Se não encontrou, tentar com CST original também (pode estar em formato diferente)
                if not indices_c170 and cst_raw:
                    logger.warning(f"[DEBUG] Não encontrou C170 com CST normalizado {cst_normalizado}, tentando com CST original {cst_raw}")
                    print(f"[DEBUG] Não encontrou C170 com CST normalizado {cst_normalizado}, tentando com CST original {cst_raw}", flush=True)
                    indices_c170 = editor.find_line_by_record("C170", cfop=cfop_clean, cst=cst_raw)
                    logger.info(f"[DEBUG] C170 encontrados com CST original {cst_raw}: {len(indices_c170)}")
                    print(f"[DEBUG] C170 encontrados com CST original {cst_raw}: {len(indices_c170)}", flush=True)
                
                # Se ainda não encontrou, tentar buscar apenas por CFOP e verificar CST manualmente
                if not indices_c170:
                    logger.warning(f"[DEBUG] Tentando busca alternativa: buscar por CFOP e verificar CST manualmente")
                    
                    # Primeiro, verificar se há C170 no arquivo (sem filtro)
                    todos_c170 = editor.find_line_by_record("C170")
                    print(f"[DEBUG] Total de linhas C170 no arquivo: {len(todos_c170)}", flush=True)
                    logger.info(f"[DEBUG] Total de linhas C170 no arquivo: {len(todos_c170)}")
                    
                    # Coletar todos os CFOPs/CSTs únicos para análise
                    cfops_csts_encontrados = {}
                    if todos_c170:
                        print(f"[DEBUG] Analisando todos os C170 para mapear CFOPs/CSTs disponíveis...", flush=True)
                        logger.info(f"[DEBUG] Analisando todos os C170 para mapear CFOPs/CSTs disponíveis...")
                        for idx in todos_c170:
                            line = editor.lines[idx]
                            parts = split_sped_line(line, min_fields=21)
                            if len(parts) > 11:
                                cfop_encontrado_raw = parts[11].strip()
                                # CORREÇÃO: Remover todos os espaços (incluindo internos) do CFOP
                                cfop_encontrado = "".join(cfop_encontrado_raw.split())
                                cst_encontrado = parts[10].strip() if len(parts) > 10 else "N/A"
                                chave = f"{cfop_encontrado}/{cst_encontrado}"
                                if chave not in cfops_csts_encontrados:
                                    cfops_csts_encontrados[chave] = 0
                                cfops_csts_encontrados[chave] += 1
                        
                        # Mostrar resumo de CFOPs/CSTs encontrados
                        print(f"[DEBUG] Total de combinacoes CFOP/CST unicas encontradas: {len(cfops_csts_encontrados)}", flush=True)
                        logger.info(f"[DEBUG] Total de combinacoes CFOP/CST unicas encontradas: {len(cfops_csts_encontrados)}")
                        
                        # Mostrar as primeiras 20 combinações
                        print(f"[DEBUG] Primeiras 20 combinacoes CFOP/CST encontradas:", flush=True)
                        logger.info(f"[DEBUG] Primeiras 20 combinacoes CFOP/CST encontradas:")
                        for i, (chave, count) in enumerate(sorted(cfops_csts_encontrados.items())[:20]):
                            print(f"[DEBUG]   {i+1}. {chave} ({count} C170)", flush=True)
                            logger.info(f"[DEBUG]   {i+1}. {chave} ({count} C170)")
                        
                        # Verificar se o CFOP buscado existe (mesmo com CST diferente)
                        cfops_unicos = set()
                        for idx in todos_c170:
                            line = editor.lines[idx]
                            parts = split_sped_line(line, min_fields=21)
                            if len(parts) > 11:
                                cfop_raw = parts[11].strip()
                                # CORREÇÃO: Remover todos os espaços (incluindo internos) do CFOP
                                cfop_clean = "".join(cfop_raw.split())
                                cfops_unicos.add(cfop_clean)
                        
                        print(f"[DEBUG] CFOPs unicos encontrados no arquivo: {sorted(cfops_unicos)}", flush=True)
                        logger.info(f"[DEBUG] CFOPs unicos encontrados no arquivo: {sorted(cfops_unicos)}")
                        print(f"[DEBUG] CFOP buscado: {cfop}", flush=True)
                        logger.info(f"[DEBUG] CFOP buscado: {cfop}")
                        
                        # CORREÇÃO: Comparar com CFOP limpo
                        if cfop_clean not in cfops_unicos:
                            print(f"[DEBUG] AVISO CRITICO: CFOP '{cfop_clean}' (original='{cfop}') NAO EXISTE no arquivo SPED!", flush=True)
                            logger.error(f"[DEBUG] AVISO CRITICO: CFOP '{cfop_clean}' (original='{cfop}') NAO EXISTE no arquivo SPED!")
                            print(f"[DEBUG] Isso significa que nao ha C170 com este CFOP, portanto nao podemos criar C190.", flush=True)
                            logger.error(f"[DEBUG] Isso significa que nao ha C170 com este CFOP, portanto nao podemos criar C190.")
                    
                    # Mostrar alguns exemplos de C170 do arquivo
                    if todos_c170:
                        print(f"[DEBUG] Exemplos de C170 no arquivo (primeiros 5):", flush=True)
                        logger.info(f"[DEBUG] Exemplos de C170 no arquivo (primeiros 5):")
                        for idx in todos_c170[:5]:
                            line = editor.lines[idx]
                            parts = split_sped_line(line, min_fields=21)
                            if len(parts) > 11:
                                cfop_exemplo_raw = parts[11].strip()
                                # CORREÇÃO: Remover todos os espaços (incluindo internos) do CFOP
                                cfop_exemplo = "".join(cfop_exemplo_raw.split())
                                cst_exemplo = parts[10].strip() if len(parts) > 10 else "N/A"
                                print(f"[DEBUG]   Linha {idx+1}: CFOP='{cfop_exemplo}' (original='{cfop_exemplo_raw}'), CST={cst_exemplo}", flush=True)
                                logger.info(f"[DEBUG]   Linha {idx+1}: CFOP='{cfop_exemplo}' (original='{cfop_exemplo_raw}'), CST={cst_exemplo}")
                    
                    c170_cfop = editor.find_line_by_record("C170", cfop=cfop_clean)
                    print(f"[DEBUG] C170 encontrados apenas com CFOP '{cfop_clean}' (original='{cfop}'): {len(c170_cfop)}", flush=True)
                    logger.info(f"[DEBUG] C170 encontrados apenas com CFOP '{cfop_clean}' (original='{cfop}'): {len(c170_cfop)}")
                    
                    # Se encontrou C170 com CFOP, mostrar seus CSTs
                    if c170_cfop:
                        print(f"[DEBUG] CSTs encontrados nos C170 com CFOP {cfop}:", flush=True)
                        logger.info(f"[DEBUG] CSTs encontrados nos C170 com CFOP {cfop}:")
                        csts_encontrados = set()
                        for idx in c170_cfop[:10]:  # Primeiros 10
                            line = editor.lines[idx]
                            parts = split_sped_line(line, min_fields=21)
                            if len(parts) > 10:
                                cst_exemplo = parts[10].strip()
                                csts_encontrados.add(cst_exemplo)
                                try:
                                    from common import normalize_cst_for_compare as ncfc
                                    cst_exemplo_norm = ncfc(cst_exemplo)
                                except ImportError:
                                    cst_exemplo_norm = cst_exemplo.strip().zfill(3)
                                print(f"[DEBUG]   Linha {idx+1}: CST={cst_exemplo} (normalizado: {cst_exemplo_norm})", flush=True)
                                logger.info(f"[DEBUG]   Linha {idx+1}: CST={cst_exemplo} (normalizado: {cst_exemplo_norm})")
                        print(f"[DEBUG] CSTs únicos encontrados: {sorted(csts_encontrados)}", flush=True)
                        print(f"[DEBUG] CST buscado: {cst_raw} (normalizado: {cst_normalizado})", flush=True)
                        logger.info(f"[DEBUG] CSTs únicos encontrados: {sorted(csts_encontrados)}")
                        logger.info(f"[DEBUG] CST buscado: {cst_raw} (normalizado: {cst_normalizado})")
                    else:
                        print(f"[DEBUG] AVISO: Nenhum C170 encontrado com CFOP '{cfop_clean}' (original='{cfop}')", flush=True)
                        logger.warning(f"[DEBUG] AVISO: Nenhum C170 encontrado com CFOP '{cfop_clean}' (original='{cfop}')")
                    
                    indices_c170_alternativo = []
                    for idx in c170_cfop:
                        line = editor.lines[idx]
                        parts = split_sped_line(line, min_fields=21)
                        # Layout C170: parts[10]=CST_ICMS, parts[11]=CFOP
                        if len(parts) > 10:
                            linha_cst = parts[10].strip()
                            try:
                                from common import normalize_cst_for_compare as ncfc
                                linha_cst_norm = ncfc(linha_cst)
                            except ImportError:
                                linha_cst_norm = linha_cst.strip().zfill(3)
                            
                            # Comparar CST normalizado
                            if linha_cst_norm == cst_normalizado:
                                indices_c170_alternativo.append(idx)
                            # Também tentar comparar sem normalização (caso ambos estejam no mesmo formato)
                            elif linha_cst == cst or linha_cst == str(cst).strip():
                                indices_c170_alternativo.append(idx)
                    
                    if indices_c170_alternativo:
                        logger.info(f"[DEBUG] Busca alternativa encontrou {len(indices_c170_alternativo)} C170")
                        indices_c170 = indices_c170_alternativo
                    else:
                        # Mostrar exemplos de C170 encontrados para debug
                        if c170_cfop:
                            logger.warning(f"[DEBUG] Exemplos de C170 com CFOP '{cfop_clean}' (original='{cfop}') (mas CST diferente):")
                            for idx in c170_cfop[:5]:  # Primeiros 5
                                line = editor.lines[idx]
                                parts = split_sped_line(line, min_fields=21)
                                # Layout C170: parts[10]=CST_ICMS, parts[11]=CFOP
                                if len(parts) > 11:
                                    cst_exemplo = parts[10].strip()
                                    cfop_exemplo_raw = parts[11].strip()
                                    # CORREÇÃO: Remover todos os espaços (incluindo internos) do CFOP
                                    cfop_exemplo = "".join(cfop_exemplo_raw.split())
                                    try:
                                        from common import normalize_cst_for_compare as ncfc
                                        cst_exemplo_norm = ncfc(cst_exemplo)
                                    except ImportError:
                                        cst_exemplo_norm = cst_exemplo.strip().zfill(3)
                                    logger.warning(f"[DEBUG]   Linha {idx+1}: CFOP='{cfop_exemplo}' (original='{cfop_exemplo_raw}'), CST={cst_exemplo} (normalizado: {cst_exemplo_norm})")
                
                if not indices_c170:
                    print(f"[DEBUG] ERRO: Nenhum C170 encontrado após todas as tentativas. CFOP='{cfop_clean}' (original='{cfop}'), CST original={cst_raw}, CST normalizado={cst_normalizado}", flush=True)
                    logger.error(f"[DEBUG] ERRO: Nenhum C170 encontrado após todas as tentativas. CFOP='{cfop_clean}' (original='{cfop}'), CST original={cst_raw}, CST normalizado={cst_normalizado}")
                    logger.warning(f"Não é possível criar C190 sem C170 relacionados. CFOP {cfop_clean} / CST {cst_normalizado} não possui C170 correspondente.")
                    return (False, sped_path, {
                        "erro": "Não é possível criar C190 sem C170 relacionados conforme legislação",
                        "detalhes": f"Conforme Guia Prático EFD-ICMS/IPI, Seção 3, Bloco C: C190 deve ser igual à soma dos C170 agrupados por CFOP e CST. Não foram encontrados C170 com CFOP {cfop} e CST {cst} (normalizado: {cst_normalizado}).",
                        "sugestao": f"Verificar se existem C170 com CFOP {cfop} e CST {cst} antes de criar o C190 correspondente."
                    })
                
                logger.info(f"Criando novo C190 para CFOP {cfop} / CST {cst} com {campo} = {valor_correto:.2f} (baseado em {len(indices_c170)} C170 relacionados)")
                
                # Calcular valores baseados nos C170 ou usar valores da correção
                vl_bc_icms = 0.0
                vl_icms = 0.0
                vl_bc_icms_st = 0.0
                vl_icms_st = 0.0
                vl_ipi = 0.0
                vl_opr = 0.0
                
                # Mapear campo para variável
                if campo == "VL_BC_ICMS":
                    vl_bc_icms = valor_correto
                elif campo == "VL_ICMS":
                    vl_icms = valor_correto
                elif campo == "VL_BC_ICMS_ST":
                    vl_bc_icms_st = valor_correto
                elif campo == "VL_ICMS_ST":
                    vl_icms_st = valor_correto
                elif campo == "VL_IPI":
                    vl_ipi = valor_correto
                
                # VALIDAÇÃO LEGAL: Calcular valores baseados nos C170 relacionados
                # Conforme legislação: C190 = Σ C170 por CFOP/CST
                if indices_c170:
                    for idx in indices_c170:
                        parts = split_sped_line(editor.lines[idx], min_fields=21)
                        # Layout C170 após split: fs[0]="", fs[1]="C170", fs[2]=NUM_ITEM, ...
                        # fs[9]=VL_BC_ICMS, fs[10]=VL_ICMS, fs[11]=VL_BC_ICMS_ST, fs[12]=VL_ICMS_ST, fs[13]=VL_IPI, fs[15]=VL_ITEM
                        if len(parts) > 9:
                            vl_bc_icms += parse_float_br(parts[9] or "0")
                        if len(parts) > 10:
                            vl_icms += parse_float_br(parts[10] or "0")
                        if len(parts) > 11:
                            vl_bc_icms_st += parse_float_br(parts[11] or "0")
                        if len(parts) > 12:
                            vl_icms_st += parse_float_br(parts[12] or "0")
                        if len(parts) > 13:
                            vl_ipi += parse_float_br(parts[13] or "0")
                        if len(parts) > 15:
                            vl_opr += parse_float_br(parts[15] or "0")
                    
                    # VALIDAÇÃO LEGAL: O valor do campo corrigido deve ser igual à soma dos C170
                    # Tolerância de 0.02 para arredondamentos
                    valor_soma_c170 = {
                        "VL_BC_ICMS": vl_bc_icms,
                        "VL_ICMS": vl_icms,
                        "VL_BC_ICMS_ST": vl_bc_icms_st,
                        "VL_ICMS_ST": vl_icms_st,
                        "VL_IPI": vl_ipi
                    }.get(campo, 0.0)
                    
                    diferenca = abs(valor_correto - valor_soma_c170)
                    if diferenca > 0.02:
                        logger.warning(f"VALIDAÇÃO LEGAL: Valor da correção ({valor_correto:.2f}) difere da soma dos C170 ({valor_soma_c170:.2f}) em {diferenca:.2f}")
                        logger.warning(f"Usando soma dos C170 ({valor_soma_c170:.2f}) conforme legislação: C190.{campo} = Σ C170.{campo} por CFOP/CST")
                        # Usar a soma dos C170 como valor correto (conforme legislação)
                        valor_correto = valor_soma_c170
                
                # VALIDAÇÃO LEGAL: Garantir que o campo corrigido use o valor da soma dos C170
                # Se o campo específico não foi calculado ou está zerado, usar o valor da correção
                # Mas apenas se for o campo que estamos corrigindo
                if campo == "VL_BC_ICMS":
                    vl_bc_icms = valor_correto  # Usar valor da correção (já validado acima)
                elif campo == "VL_ICMS":
                    vl_icms = valor_correto
                elif campo == "VL_BC_ICMS_ST":
                    vl_bc_icms_st = valor_correto
                elif campo == "VL_ICMS_ST":
                    vl_icms_st = valor_correto
                elif campo == "VL_IPI":
                    vl_ipi = valor_correto
                
                # VALIDAÇÃO LEGAL: Verificar se CFOP e CST são válidos
                if not cfop or len(cfop.strip()) == 0:
                    return (False, sped_path, {
                        "erro": "CFOP é obrigatório para criar C190 conforme legislação",
                        "referencia_legal": "Guia Prático EFD-ICMS/IPI, Seção 3, Bloco C"
                    })
                
                if not cst_normalizado or len(str(cst_normalizado).strip()) == 0:
                    return (False, sped_path, {
                        "erro": "CST é obrigatório para criar C190 conforme legislação",
                        "referencia_legal": "Guia Prático EFD-ICMS/IPI, Seção 3, Bloco C"
                    })
                
                # Criar linha C190
                # Layout: C190|CST_ICMS|CFOP|ALIQ_ICMS|VL_OPR|VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_RED_BC|VL_IPI|COD_OBS|
                # Após split: fs[0]="", fs[1]="C190", fs[2]=CST, fs[3]=CFOP, fs[4]=ALIQ, fs[5]=VL_OPR, 
                #            fs[6]=VL_BC_ICMS, fs[7]=VL_ICMS, fs[8]=VL_BC_ICMS_ST, fs[9]=VL_ICMS_ST, 
                #            fs[10]=VL_RED_BC, fs[11]=VL_IPI, fs[12]=COD_OBS
                campos_c190 = [
                    "",  # fs[0] - vazio antes do primeiro |
                    "C190",  # fs[1]
                    cst_normalizado or "",  # fs[2] - CST_ICMS (usar CST normalizado)
                    cfop or "",  # fs[3] - CFOP
                    "",  # fs[4] - ALIQ_ICMS (deixar vazio por enquanto)
                    f"{vl_opr:.2f}",  # fs[5] - VL_OPR
                    f"{vl_bc_icms:.2f}",  # fs[6] - VL_BC_ICMS
                    f"{vl_icms:.2f}",  # fs[7] - VL_ICMS
                    f"{vl_bc_icms_st:.2f}",  # fs[8] - VL_BC_ICMS_ST
                    f"{vl_icms_st:.2f}",  # fs[9] - VL_ICMS_ST
                    "",  # fs[10] - VL_RED_BC (deixar vazio)
                    f"{vl_ipi:.2f}",  # fs[11] - VL_IPI
                    ""  # fs[12] - COD_OBS (deixar vazio)
                ]
                
                linha_c190 = "|".join(campos_c190) + "|\n"
                
                # Encontrar posição para inserir C190
                # Inserir após o último C170 relacionado ou após o último C190 do mesmo bloco
                posicao_inserir = None
                
                if indices_c170:
                    # Inserir após o último C170
                    posicao_inserir = max(indices_c170) + 1
                else:
                    # Buscar último C190 para inserir após ele
                    todos_c190 = editor.find_line_by_record("C190")
                    if todos_c190:
                        posicao_inserir = max(todos_c190) + 1
                    else:
                        # Buscar último C170 do arquivo para inserir após
                        todos_c170 = editor.find_line_by_record("C170")
                        if todos_c170:
                            posicao_inserir = max(todos_c170) + 1
                
                # Se não encontrou posição, inserir antes do 9999
                if posicao_inserir is None:
                    for idx in range(len(editor.lines) - 1, -1, -1):
                        if editor.lines[idx].startswith('9999|'):
                            posicao_inserir = idx
                            break
                
                if posicao_inserir is None:
                    posicao_inserir = len(editor.lines)
                
                # Inserir C190
                editor.lines.insert(posicao_inserir, linha_c190)
                logger.info(f"SUCESSO: C190 criado na linha {posicao_inserir + 1} com CFOP {cfop}, CST {cst}, {campo} = {valor_correto:.2f}")
                logger.info(f"SUCESSO: VALIDAÇÃO LEGAL: C190.{campo} = {valor_correto:.2f} = Σ C170.{campo} por CFOP/CST (conforme Guia Prático EFD-ICMS/IPI, Seção 3, Bloco C)")
                
                # Marcar como sucesso
                sucesso = True
            else:
                # C190 existe, atualizar
                # VALIDAÇÃO LEGAL: Verificar se o valor a atualizar está de acordo com a legislação
                # C190 = Σ C170 por CFOP/CST
                indices_c170 = editor.find_line_by_record("C170", cfop=cfop, cst=cst)
                
                if indices_c170:
                    # Calcular soma dos C170 para validar
                    soma_c170 = 0.0
                    for idx in indices_c170:
                        parts = split_sped_line(editor.lines[idx], min_fields=21)
                        # Mapear campo para posição no C170
                        posicao_campo = {
                            "VL_BC_ICMS": 9,
                            "VL_ICMS": 10,
                            "VL_BC_ICMS_ST": 11,
                            "VL_ICMS_ST": 12,
                            "VL_IPI": 13
                        }.get(campo, 9)
                        
                        if len(parts) > posicao_campo:
                            soma_c170 += parse_float_br(parts[posicao_campo] or "0")
                    
                    # Validar se o valor da correção está de acordo com a legislação
                    diferenca = abs(valor_correto - soma_c170)
                    if diferenca > 0.02:
                        logger.warning(f"VALIDAÇÃO LEGAL: Valor da correção ({valor_correto:.2f}) difere da soma dos C170 ({soma_c170:.2f}) em {diferenca:.2f}")
                        logger.warning(f"Ajustando para soma dos C170 ({soma_c170:.2f}) conforme legislação: C190.{campo} = Σ C170.{campo} por CFOP/CST")
                        # Usar a soma dos C170 como valor correto (conforme legislação)
                        valor_correto = soma_c170
                
                sucesso = editor.update_field(
                    registro=registro,
                    campo=campo,
                    novo_valor=valor_correto,
                    cfop=cfop,
                    cst=cst_normalizado,  # Usar CST normalizado
                    linha_sped=linha_sped
                )
                
                if sucesso:
                    logger.info(f"SUCESSO: C190 atualizado: {campo} = {valor_correto:.2f}")
                    if indices_c170:
                        logger.info(f"SUCESSO: VALIDAÇÃO LEGAL: C190.{campo} = {valor_correto:.2f} = Σ C170.{campo} por CFOP/CST (conforme Guia Prático EFD-ICMS/IPI, Seção 3, Bloco C)")
        else:
            # Caso para C100, C170 ou outros registros que não são C190
            # Normalizar CST antes de atualizar (pode vir do XML em formato diferente)
            try:
                from common import normalize_cst_for_compare
                cst_normalizado = normalize_cst_for_compare(cst_raw) if cst_raw else None
            except ImportError:
                # Fallback se não conseguir importar
                cst_normalizado = str(cst_raw).strip().zfill(3) if cst_raw else None
            
            # Para C100, não precisamos de CFOP ou CST, apenas da chave
            if registro == "C100":
                # Atualizar campo no C100 usando a chave
                sucesso = editor.update_field(
                    registro=registro,
                    campo=campo,
                    novo_valor=valor_correto,
                    chave=chave,
                    linha_sped=linha_sped
                )
            else:
                # Para C170 e outros, usar CFOP e CST se disponíveis
                sucesso = editor.update_field(
                    registro=registro,
                    campo=campo,
                    novo_valor=valor_correto,
                    chave=chave,
                    cfop=cfop_clean if cfop else None,
                    cst=cst_normalizado,  # Usar CST normalizado
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

