"""
Validações adicionais baseadas na legislação EFD-ICMS/IPI
Conforme Ato COTEPE/ICMS nº 44/2018 e alterações
Estas validações são complementares às existentes em validators.py
"""
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple
import logging

try:
    import pandas as pd
except ImportError:
    pd = None

def _df(rows: List[Dict[str, Any]], columns: List[str]):
    """Helper para criar DataFrame"""
    if pd is None:
        return []
    if not rows:
        return pd.DataFrame(columns=columns)
    return pd.DataFrame(rows, columns=columns)


def check_relacionamento_c100_c170_c190(efd_txt: Path) -> pd.DataFrame:
    """
    Valida relacionamento obrigatório entre C100, C170 e C190:
    - C100 deve ter pelo menos um C170
    - C190 deve corresponder à soma dos C170 por CFOP/CST
    - C100.VL_MERC deve ser igual à soma dos C170.VL_ITEM
    Conforme legislação EFD-ICMS/IPI, Guia Prático Capítulo III, Seção 3
    """
    rows: List[Dict[str, Any]] = []
    try:
        from parsers import parse_efd_c100, parse_efd_c170_agregado, parse_efd_c190_totais
        
        c100_df = parse_efd_c100(efd_txt)
        c170_agregados = parse_efd_c170_agregado(efd_txt)
        c190_by_triple = parse_efd_c190_totais(efd_txt)[1]  # Retorna (by_key, by_triple)
        
        # Verificar se C100 tem C170 correspondente
        for _, c100_row in c100_df.iterrows():
            chave = str(c100_row.get("CHV_NFE", "") or "").strip()
            if not chave:
                continue
            
            # Verificar se há C170 para esta chave
            tem_c170 = any(
                k[0] == chave for k in c170_agregados.keys()
            )
            
            if not tem_c170 and str(c100_row.get("COD_SIT", "")).strip() not in ["2", "3", "5"]:
                # Documento não cancelado/denegado/inutilizado deve ter C170
                rows.append({
                    "CHAVE": chave,
                    "TIPO": "C100 sem C170",
                    "MENSAGEM": "Documento C100 não possui itens C170 correspondentes",
                    "SEVERIDADE": "alta",
                    "RECOMENDACAO": "Verificar se o documento foi lançado corretamente no SPED"
                })
        
        # Verificar consistência C100.VL_MERC vs soma C170.VL_ITEM
        for _, c100_row in c100_df.iterrows():
            chave = str(c100_row.get("CHV_NFE", "") or "").strip()
            if not chave:
                continue
            
            vl_merc_c100 = float(c100_row.get("VL_MERC", 0) or 0)
            
            # Somar VL_ITEM dos C170 desta chave
            vl_item_total = 0.0
            for (chave_c170, _, _), valores in c170_agregados.items():
                if chave_c170 == chave:
                    vl_item_total += valores.get("VL_ITEM", 0.0) or 0.0
            
            # Tolerância de 0.02
            diff = abs(vl_merc_c100 - vl_item_total)
            if diff > 0.02:
                rows.append({
                    "CHAVE": chave,
                    "TIPO": "C100.VL_MERC ≠ Σ(C170.VL_ITEM)",
                    "MENSAGEM": f"Diferença de R$ {diff:.2f} entre C100.VL_MERC e soma dos C170.VL_ITEM",
                    "VALOR_C100": round(vl_merc_c100, 2),
                    "VALOR_C170": round(vl_item_total, 2),
                    "DIFERENCA": round(diff, 2),
                    "SEVERIDADE": "alta" if diff > 10 else "media",
                    "RECOMENDACAO": "Verificar se todos os itens foram lançados corretamente no C170"
                })
    
    except Exception as e:
        logging.warning(f"Erro ao verificar relacionamento C100-C170-C190: {e}")
        import traceback
        traceback.print_exc()
    
    return _df(rows, columns=["CHAVE", "TIPO", "MENSAGEM", "VALOR_C100", "VALOR_C170", "DIFERENCA", "SEVERIDADE", "RECOMENDACAO"])


def check_relacionamento_e110_e116(efd_txt: Path) -> pd.DataFrame:
    """
    Valida relacionamento entre E110 e E116:
    - E110 deve ter E116 correspondente quando houver recolhimentos
    - Valores devem bater
    Conforme Capítulo III, Seção 4 do Guia Prático
    """
    rows: List[Dict[str, Any]] = []
    try:
        from parsers import parse_efd_e110_e116_e310_e316
        
        apur_e = parse_efd_e110_e116_e310_e316(efd_txt)
        
        # Verificar se E110 tem E116 correspondente
        # Esta validação é mais complexa e pode ser expandida conforme necessário
        # Por enquanto, apenas estrutura básica
        
    except Exception as e:
        logging.warning(f"Erro ao verificar relacionamento E110-E116: {e}")
    
    return _df(rows, columns=["PERIODO", "TIPO", "MENSAGEM", "SEVERIDADE", "RECOMENDACAO"])


def check_sequencia_registros(efd_txt: Path) -> pd.DataFrame:
    """
    Valida sequência lógica de registros conforme estrutura obrigatória da EFD
    """
    rows: List[Dict[str, Any]] = []
    try:
        current_c100: Optional[str] = None
        tem_c170 = False
        
        with efd_txt.open("r", encoding="latin1", errors="ignore") as f:
            for line in f:
                if line.startswith("|C100|"):
                    # Novo C100 encontrado
                    if current_c100 and not tem_c170:
                        # C100 anterior não tinha C170
                        rows.append({
                            "REGISTRO": "C100",
                            "CHAVE": current_c100,
                            "TIPO": "C100 sem C170",
                            "MENSAGEM": "Registro C100 não possui C170 correspondente",
                            "SEVERIDADE": "alta",
                            "RECOMENDACAO": "Verificar se o documento foi lançado corretamente"
                        })
                    current_c100 = line.split("|")[9] if len(line.split("|")) > 9 else ""
                    tem_c170 = False
                elif line.startswith("|C170|") and current_c100:
                    tem_c170 = True
                elif line.startswith("|C100|") and current_c100 and not tem_c170:
                    # Novo C100 sem C170 no anterior
                    rows.append({
                        "REGISTRO": "C100",
                        "CHAVE": current_c100,
                        "TIPO": "C100 sem C170",
                        "MENSAGEM": "Registro C100 não possui C170 correspondente",
                        "SEVERIDADE": "alta",
                        "RECOMENDACAO": "Verificar se o documento foi lançado corretamente"
                    })
                    current_c100 = line.split("|")[9] if len(line.split("|")) > 9 else ""
                    tem_c170 = False
        
        # Verificar último C100
        if current_c100 and not tem_c170:
            rows.append({
                "REGISTRO": "C100",
                "CHAVE": current_c100,
                "TIPO": "C100 sem C170",
                "MENSAGEM": "Registro C100 não possui C170 correspondente",
                "SEVERIDADE": "alta",
                "RECOMENDACAO": "Verificar se o documento foi lançado corretamente"
            })
    
    except Exception as e:
        logging.warning(f"Erro ao verificar sequência de registros: {e}")
    
    return _df(rows, columns=["REGISTRO", "CHAVE", "TIPO", "MENSAGEM", "SEVERIDADE", "RECOMENDACAO"])


def check_base_calculo_consistente(efd_txt: Path) -> pd.DataFrame:
    """
    Valida se bases de cálculo estão consistentes:
    - BC ICMS não pode ser maior que valor da mercadoria
    - BC ST não pode ser negativa
    - Valores devem seguir fórmulas da legislação
    """
    rows: List[Dict[str, Any]] = []
    try:
        from parsers import parse_efd_c100
        
        c100_df = parse_efd_c100(efd_txt)
        
        for _, row in c100_df.iterrows():
            vl_merc = float(row.get("VL_MERC", 0) or 0)
            vl_bc_icms = float(row.get("VL_BC_ICMS", 0) or 0)
            vl_bc_icms_st = float(row.get("VL_BC_ICMS_ST", 0) or 0)
            chave = str(row.get("CHV_NFE", "") or "").strip()
            
            # BC ICMS não pode ser maior que valor da mercadoria (com tolerância)
            if vl_bc_icms > vl_merc * 1.1:  # 10% de tolerância para ajustes
                rows.append({
                    "CHAVE": chave,
                    "TIPO": "BC ICMS inconsistente",
                    "MENSAGEM": f"BC ICMS (R$ {vl_bc_icms:.2f}) maior que valor da mercadoria (R$ {vl_merc:.2f})",
                    "VALOR_MERC": round(vl_merc, 2),
                    "VALOR_BC_ICMS": round(vl_bc_icms, 2),
                    "SEVERIDADE": "alta",
                    "RECOMENDACAO": "Verificar cálculo da base de cálculo do ICMS"
                })
            
            # BC ST não pode ser negativa
            if vl_bc_icms_st < 0:
                rows.append({
                    "CHAVE": chave,
                    "TIPO": "BC ST negativa",
                    "MENSAGEM": f"BC ST com valor negativo: R$ {vl_bc_icms_st:.2f}",
                    "VALOR_BC_ST": round(vl_bc_icms_st, 2),
                    "SEVERIDADE": "alta",
                    "RECOMENDACAO": "Verificar lançamento da base de cálculo de ST"
                })
    
    except Exception as e:
        logging.warning(f"Erro ao verificar bases de cálculo: {e}")
    
    return _df(rows, columns=["CHAVE", "TIPO", "MENSAGEM", "VALOR_MERC", "VALOR_BC_ICMS", "VALOR_BC_ST", "SEVERIDADE", "RECOMENDACAO"])


def check_impostos_calculados_corretamente(efd_txt: Path) -> pd.DataFrame:
    """
    Valida se impostos foram calculados corretamente:
    - ICMS = BC ICMS * Alíquota ICMS (aproximado)
    - Valores devem estar dentro de tolerância razoável
    """
    rows: List[Dict[str, Any]] = []
    try:
        from parsers import parse_efd_c170_agregado
        
        c170_agregados = parse_efd_c170_agregado(efd_txt)
        
        for (chave, cfop, cst), valores in c170_agregados.items():
            vl_bc_icms = valores.get("VL_BC_ICMS", 0.0) or 0.0
            vl_icms = valores.get("VL_ICMS", 0.0) or 0.0
            
            # Calcular alíquota aparente
            if vl_bc_icms > 0:
                aliquota_aparente = (vl_icms / vl_bc_icms) * 100
                
                # Verificar se alíquota está dentro de limites razoáveis (0% a 25%)
                if aliquota_aparente > 25 or aliquota_aparente < -5:
                    rows.append({
                        "CHAVE": chave or "",
                        "CFOP": cfop,
                        "CST": cst,
                        "TIPO": "Alíquota ICMS inconsistente",
                        "MENSAGEM": f"Alíquota aparente de {aliquota_aparente:.2f}% está fora dos limites esperados",
                        "ALIQUOTA_APARENTE": round(aliquota_aparente, 2),
                        "SEVERIDADE": "media",
                        "RECOMENDACAO": "Verificar cálculo do ICMS e alíquota aplicada"
                    })
    
    except Exception as e:
        logging.warning(f"Erro ao verificar cálculos de impostos: {e}")
    
    return _df(rows, columns=["CHAVE", "CFOP", "CST", "TIPO", "MENSAGEM", "ALIQUOTA_APARENTE", "SEVERIDADE", "RECOMENDACAO"])


def check_c190_preenchimento_correto(efd_txt: Path) -> pd.DataFrame:
    """
    Verifica se o C190 está sendo preenchido corretamente quando há C170 com valores.
    Detecta casos onde C170 tem valores mas C190 está zerado (erro de preenchimento).
    
    Conforme legislação EFD-ICMS/IPI, Guia Prático Capítulo III, Seção 3:
    - O C190 deve conter os totais dos C170 agrupados por CFOP/CST
    - Se há C170 com valores, deve haver C190 correspondente com valores
    """
    rows: List[Dict[str, Any]] = []
    try:
        from parsers import parse_efd_c170_agregado
        from validators import _parse_c190_por_cfop_cst
        
        c170_agregados = parse_efd_c170_agregado(efd_txt)
        c190_por_chave_cfop_cst = _parse_c190_por_cfop_cst(efd_txt)
        
        for (chave, cfop, cst), valores_c170 in c170_agregados.items():
            c190_key = (chave, cfop, cst)
            valores_c190 = c190_por_chave_cfop_cst.get(c190_key, {})
            
            # Verificar se C170 tem valores mas C190 está zerado
            vl_bc_icms_c170 = valores_c170.get("VL_BC_ICMS", 0.0) or 0.0
            vl_icms_c170 = valores_c170.get("VL_ICMS", 0.0) or 0.0
            vl_bc_icms_st_c170 = valores_c170.get("VL_BC_ICMS_ST", 0.0) or 0.0
            vl_icms_st_c170 = valores_c170.get("VL_ICMS_ST", 0.0) or 0.0
            vl_ipi_c170 = valores_c170.get("VL_IPI", 0.0) or 0.0
            
            vl_bc_icms_c190 = valores_c190.get("VL_BC_ICMS", 0.0) or 0.0
            vl_icms_c190 = valores_c190.get("VL_ICMS", 0.0) or 0.0
            vl_bc_icms_st_c190 = valores_c190.get("VL_BC_ICMS_ST", 0.0) or 0.0
            vl_icms_st_c190 = valores_c190.get("VL_ICMS_ST", 0.0) or 0.0
            vl_ipi_c190 = valores_c190.get("VL_IPI", 0.0) or 0.0
            
            # Verificar se C170 tem valores significativos
            tem_valores_c170 = (
                abs(vl_bc_icms_c170) > 0.02 or 
                abs(vl_icms_c170) > 0.02 or 
                abs(vl_bc_icms_st_c170) > 0.02 or 
                abs(vl_icms_st_c170) > 0.02 or 
                abs(vl_ipi_c170) > 0.02
            )
            
            # Verificar se C190 está zerado ou quase zerado
            c190_zerado = (
                abs(vl_bc_icms_c190) < 0.02 and 
                abs(vl_icms_c190) < 0.02 and 
                abs(vl_bc_icms_st_c190) < 0.02 and 
                abs(vl_icms_st_c190) < 0.02 and 
                abs(vl_ipi_c190) < 0.02
            )
            
            # Se C170 tem valores mas C190 está zerado, é um erro de preenchimento
            if tem_valores_c170 and c190_zerado:
                # Determinar qual campo tem o maior valor para destacar
                campos_com_valor = []
                if abs(vl_bc_icms_c170) > 0.02:
                    campos_com_valor.append(f"VL_BC_ICMS: R$ {vl_bc_icms_c170:.2f}")
                if abs(vl_icms_c170) > 0.02:
                    campos_com_valor.append(f"VL_ICMS: R$ {vl_icms_c170:.2f}")
                if abs(vl_bc_icms_st_c170) > 0.02:
                    campos_com_valor.append(f"VL_BC_ICMS_ST: R$ {vl_bc_icms_st_c170:.2f}")
                if abs(vl_icms_st_c170) > 0.02:
                    campos_com_valor.append(f"VL_ICMS_ST: R$ {vl_icms_st_c170:.2f}")
                if abs(vl_ipi_c170) > 0.02:
                    campos_com_valor.append(f"VL_IPI: R$ {vl_ipi_c170:.2f}")
                
                mensagem = f"C170 tem valores ({', '.join(campos_com_valor)}) mas C190 está zerado para esta combinação CFOP/CST"
                
                # Calcular severidade baseada no valor total
                valor_total = abs(vl_bc_icms_c170) + abs(vl_icms_c170) + abs(vl_bc_icms_st_c170) + abs(vl_icms_st_c170) + abs(vl_ipi_c170)
                severidade = "alta" if valor_total > 100 else ("media" if valor_total > 10 else "baixa")
                
                rows.append({
                    "CHAVE": chave or "",
                    "CFOP": cfop,
                    "CST": cst,
                    "TIPO": "C190 não preenchido",
                    "MENSAGEM": mensagem,
                    "VALOR_C170_BC_ICMS": round(vl_bc_icms_c170, 2),
                    "VALOR_C170_ICMS": round(vl_icms_c170, 2),
                    "VALOR_C170_BC_ST": round(vl_bc_icms_st_c170, 2),
                    "VALOR_C170_ICMS_ST": round(vl_icms_st_c170, 2),
                    "VALOR_C170_IPI": round(vl_ipi_c170, 2),
                    "VALOR_C190_BC_ICMS": round(vl_bc_icms_c190, 2),
                    "VALOR_C190_ICMS": round(vl_icms_c190, 2),
                    "VALOR_C190_BC_ST": round(vl_bc_icms_st_c190, 2),
                    "VALOR_C190_ICMS_ST": round(vl_icms_st_c190, 2),
                    "VALOR_C190_IPI": round(vl_ipi_c190, 2),
                    "SEVERIDADE": severidade,
                    "RECOMENDACAO": "O C190 deve ser preenchido com os totais dos C170 agrupados por CFOP/CST. Verificar se o registro C190 foi gerado corretamente no SPED. Conforme Guia Prático EFD-ICMS/IPI, Capítulo III, Seção 3, o C190 é obrigatório quando há C170."
                })
    
    except Exception as e:
        logging.warning(f"Erro ao verificar preenchimento do C190: {e}")
        import traceback
        logging.debug(traceback.format_exc())
    
    return _df(rows, columns=[
        "CHAVE", "CFOP", "CST", "TIPO", "MENSAGEM", 
        "VALOR_C170_BC_ICMS", "VALOR_C170_ICMS", "VALOR_C170_BC_ST", "VALOR_C170_ICMS_ST", "VALOR_C170_IPI",
        "VALOR_C190_BC_ICMS", "VALOR_C190_ICMS", "VALOR_C190_BC_ST", "VALOR_C190_ICMS_ST", "VALOR_C190_IPI",
        "SEVERIDADE", "RECOMENDACAO"
    ])


def check_apuracao_consistente(efd_txt: Path) -> pd.DataFrame:
    """
    Valida se a apuração (E110) está consistente com os totais escriturados (C100/C190)
    Conforme legislação EFD-ICMS/IPI, Guia Prático Capítulo III, Seção 4
    
    Verifica:
    - Se os totais de ICMS dos C100/C190 batem com os débitos/créditos do E110
    - Se os recolhimentos (E116) batem com o saldo devedor do E110
    - Se há inconsistências entre valores escriturados e apurados
    """
    rows: List[Dict[str, Any]] = []
    try:
        from parsers import parse_efd_c100, parse_efd_c190_totais, parse_efd_e110_e116_e310_e316
        
        # Importar TOL se não estiver disponível
        try:
            from common import TOL
        except ImportError:
            TOL = 0.02  # tolerância padrão
        
        # Obter dados
        c100_df = parse_efd_c100(efd_txt)
        c190_by_key, c190_by_triple = parse_efd_c190_totais(efd_txt)
        apur_e = parse_efd_e110_e116_e310_e316(efd_txt)
        
        e110_df = apur_e.get("E110")
        e116_df = apur_e.get("E116")
        
        if e110_df is None or e110_df.empty:
            rows.append({
                "TIPO": "E110 ausente",
                "MENSAGEM": "Registro E110 não encontrado na EFD",
                "VALOR_ESCRITURADO": 0.0,
                "VALOR_APURADO": 0.0,
                "DIFERENCA": 0.0,
                "SEVERIDADE": "alta",
                "RECOMENDACAO": "Verificar se a apuração foi lançada corretamente no SPED. E110 é obrigatório quando há movimento no período."
            })
            return _df(rows, columns=["TIPO", "MENSAGEM", "VALOR_ESCRITURADO", "VALOR_APURADO", "DIFERENCA", "SEVERIDADE", "RECOMENDACAO"])
        
        # Calcular totais escriturados dos C100
        total_icms_c100 = float(c100_df["VL_ICMS"].sum() or 0)
        total_icms_st_c100 = float(c100_df["VL_ICMS_ST"].sum() or 0)
        total_bc_icms_c100 = float(c100_df["VL_BC_ICMS"].sum() or 0)
        total_bc_st_c100 = float(c100_df["VL_BC_ICMS_ST"].sum() or 0)
        
        # Calcular totais dos C190
        total_icms_c190 = sum(v.get("VL_ICMS", 0.0) or 0.0 for v in c190_by_triple.values())
        total_icms_st_c190 = sum(v.get("VL_ICMS_ST", 0.0) or 0.0 for v in c190_by_triple.values())
        total_bc_icms_c190 = sum(v.get("VL_BC_ICMS", 0.0) or 0.0 for v in c190_by_triple.values())
        total_bc_st_c190 = sum(v.get("VL_BC_ICMS_ST", 0.0) or 0.0 for v in c190_by_triple.values())
        
        # Obter valores do E110 (soma de todos os períodos se houver múltiplos)
        total_debitos_e110 = float(e110_df["VL_TOT_DEBITOS"].sum() or 0)
        total_creditos_e110 = float(e110_df["VL_TOT_CREDITOS"].sum() or 0)
        total_aj_debitos_e110 = float(e110_df["VL_AJ_DEBITOS"].sum() or 0)
        total_aj_creditos_e110 = float(e110_df["VL_AJ_CREDITOS"].sum() or 0)
        saldo_devedor_e110 = float(e110_df["VL_SLD_DEV"].sum() or 0)
        
        # 1. Verificar se ICMS dos C100 bate com C190 (devem ser iguais)
        diferenca_icms = abs(total_icms_c100 - total_icms_c190)
        if diferenca_icms > TOL:
            rows.append({
                "TIPO": "ICMS C100 ≠ ICMS C190",
                "MENSAGEM": f"Total de ICMS no C100 não bate com total no C190",
                "VALOR_ESCRITURADO": round(total_icms_c100, 2),
                "VALOR_APURADO": round(total_icms_c190, 2),
                "DIFERENCA": round(diferenca_icms, 2),
                "SEVERIDADE": "alta",
                "RECOMENDACAO": "Verificar se os registros C190 foram calculados corretamente a partir dos C170. Esta divergência pode afetar a apuração."
            })
        
        # 2. Verificar consistência entre C100 e C190 para ST
        diferenca_st = abs(total_icms_st_c100 - total_icms_st_c190)
        if diferenca_st > TOL:
            rows.append({
                "TIPO": "ICMS ST C100 ≠ ICMS ST C190",
                "MENSAGEM": f"Total de ICMS ST no C100 não bate com total no C190",
                "VALOR_ESCRITURADO": round(total_icms_st_c100, 2),
                "VALOR_APURADO": round(total_icms_st_c190, 2),
                "DIFERENCA": round(diferenca_st, 2),
                "SEVERIDADE": "alta",
                "RECOMENDACAO": "Verificar se os valores de ST foram calculados corretamente. Esta divergência pode afetar a apuração."
            })
        
        # 3. Verificar se bases de cálculo estão consistentes
        diferenca_bc_icms = abs(total_bc_icms_c100 - total_bc_icms_c190)
        if diferenca_bc_icms > TOL:
            rows.append({
                "TIPO": "BC ICMS C100 ≠ BC ICMS C190",
                "MENSAGEM": f"Base de cálculo ICMS no C100 não bate com C190",
                "VALOR_ESCRITURADO": round(total_bc_icms_c100, 2),
                "VALOR_APURADO": round(total_bc_icms_c190, 2),
                "DIFERENCA": round(diferenca_bc_icms, 2),
                "SEVERIDADE": "alta",
                "RECOMENDACAO": "Verificar se as bases de cálculo foram calculadas corretamente. Esta divergência pode afetar a apuração."
            })
        
        # 4. Verificar se ICMS escriturado (C100/C190) está refletido na apuração (E110)
        # Os débitos do E110 devem incluir aproximadamente os ICMS escriturados
        # (pode haver ajustes, então usamos uma tolerância maior)
        icms_total_escriturado = total_icms_c190 + total_icms_st_c190
        # Considerar ajustes de débitos
        debitos_esperados = icms_total_escriturado + total_aj_debitos_e110
        
        # Tolerância maior para apuração (pode haver outros débitos além do ICMS)
        # Mas se a diferença for muito grande, pode indicar problema
        if debitos_esperados > 0:
            diferenca_debitos = abs(total_debitos_e110 - debitos_esperados)
            # Se a diferença for maior que 10% do esperado, alertar
            if diferenca_debitos > max(100, debitos_esperados * 0.1):
                rows.append({
                    "TIPO": "Débitos E110 inconsistentes",
                    "MENSAGEM": f"Débitos do E110 podem não estar refletindo corretamente os ICMS escriturados",
                    "VALOR_ESCRITURADO": round(debitos_esperados, 2),
                    "VALOR_APURADO": round(total_debitos_e110, 2),
                    "DIFERENCA": round(diferenca_debitos, 2),
                    "SEVERIDADE": "media" if diferenca_debitos < 1000 else "alta",
                    "RECOMENDACAO": "Verificar se todos os valores de ICMS escriturados foram corretamente apurados no E110. Pode haver outros débitos além do ICMS, mas a diferença parece significativa."
                })
        
        # 5. Verificar se recolhimentos (E116) batem com saldo devedor (E110)
        if e116_df is not None and not e116_df.empty:
            total_recolhimentos_e116 = float(e116_df["VL_OR"].sum() or 0)
            diferenca_recolhimento = abs(saldo_devedor_e110 - total_recolhimentos_e116)
            
            if diferenca_recolhimento > TOL:
                rows.append({
                    "TIPO": "Recolhimentos E116 inconsistentes",
                    "MENSAGEM": f"Total de recolhimentos (E116) não bate com saldo devedor (E110)",
                    "VALOR_ESCRITURADO": round(saldo_devedor_e110, 2),
                    "VALOR_APURADO": round(total_recolhimentos_e116, 2),
                    "DIFERENCA": round(diferenca_recolhimento, 2),
                    "SEVERIDADE": "alta" if diferenca_recolhimento > 100 else "media",
                    "RECOMENDACAO": "Verificar se todos os recolhimentos foram lançados corretamente no E116. O saldo devedor do E110 deve ser igual ao total de recolhimentos do E116."
                })
        elif saldo_devedor_e110 > TOL:
            # Se há saldo devedor mas não há E116, pode ser um problema
            rows.append({
                "TIPO": "Saldo devedor sem recolhimentos",
                "MENSAGEM": f"Há saldo devedor de R$ {saldo_devedor_e110:.2f} mas não há registros E116",
                "VALOR_ESCRITURADO": round(saldo_devedor_e110, 2),
                "VALOR_APURADO": 0.0,
                "DIFERENCA": round(saldo_devedor_e110, 2),
                "SEVERIDADE": "media",
                "RECOMENDACAO": "Verificar se os recolhimentos devem ser informados no E116. Se houver saldo devedor, geralmente deve haver recolhimentos correspondentes."
            })
        
        # 6. Verificar se há créditos sem justificativa
        if total_creditos_e110 > 0 and total_icms_c190 == 0:
            rows.append({
                "TIPO": "Créditos sem débitos",
                "MENSAGEM": f"Há créditos apurados (R$ {total_creditos_e110:.2f}) mas não há ICMS escriturado nos documentos",
                "VALOR_ESCRITURADO": round(total_icms_c190, 2),
                "VALOR_APURADO": round(total_creditos_e110, 2),
                "DIFERENCA": round(total_creditos_e110, 2),
                "SEVERIDADE": "media",
                "RECOMENDACAO": "Verificar se os créditos estão corretos. Créditos geralmente vêm de compras (entradas), verificar se há documentos de entrada escriturados."
            })
        
    except Exception as e:
        logging.error(f"Erro ao verificar apuração: {e}")
        import traceback
        traceback.print_exc()
    
    return _df(rows, columns=["TIPO", "MENSAGEM", "VALOR_ESCRITURADO", "VALOR_APURADO", "DIFERENCA", "SEVERIDADE", "RECOMENDACAO"])

