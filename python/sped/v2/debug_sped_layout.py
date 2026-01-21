#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de diagnóstico para ver o layout real do arquivo SPED
"""

import sys

if len(sys.argv) < 2:
    print("Uso: python debug_sped_layout.py <arquivo_sped>")
    sys.exit(1)

sped_file = sys.argv[1]

# Ler arquivo
encodings = ['latin1', 'windows-1252', 'cp1252', 'utf-8']
content = None

for encoding in encodings:
    try:
        with open(sped_file, 'r', encoding=encoding, errors='ignore') as f:
            content = f.read()
        break
    except:
        continue

if not content:
    print("Erro ao ler arquivo")
    sys.exit(1)

lines = content.split('\n')

print(f"Total de linhas: {len(lines)}")
print("\n" + "="*100)

# Mostrar registro 0000
print("\n🔍 REGISTRO 0000 (Abertura):")
for line in lines[:20]:
    if line.startswith('|0000|'):
        parts = line.split('|')
        print(f"Total de campos: {len(parts)}")
        for i, part in enumerate(parts[:15]):
            print(f"  Posição {i}: [{part}]")
        break

# Mostrar alguns C100
print("\n🔍 PRIMEIROS C100 (Cabeçalho de Documento):")
c100_count = 0
for line in lines:
    if line.startswith('|C100|'):
        parts = line.split('|')
        print(f"\nC100 #{c100_count+1} - Total de campos: {len(parts)}")
        for i, part in enumerate(parts[:12]):
            print(f"  Posição {i}: [{part}]")
        c100_count += 1
        if c100_count >= 3:
            break

# Mostrar alguns C170
print("\n🔍 PRIMEIROS C170 (Itens do Documento):")
c170_count = 0
for line in lines:
    if line.startswith('|C170|'):
        parts = line.split('|')
        print(f"\nC170 #{c170_count+1} - Total de campos: {len(parts)}")
        for i, part in enumerate(parts[:10]):
            print(f"  Posição {i}: [{part}]")
        c170_count += 1
        if c170_count >= 3:
            break

# Mostrar alguns C190
print("\n🔍 PRIMEIROS C190 (Totais):")
c190_count = 0
for line in lines:
    if line.startswith('|C190|'):
        parts = line.split('|')
        print(f"\nC190 #{c190_count+1} - Total de campos: {len(parts)}")
        for i, part in enumerate(parts[:8]):
            print(f"  Posição {i}: [{part}]")
        c190_count += 1
        if c190_count >= 3:
            break

print("\n" + "="*100)

