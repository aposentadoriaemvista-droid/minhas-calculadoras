import os
import re
import shutil
import gspread
from pypdf import PdfReader
from oauth2client.service_account import ServiceAccountCredentials

# ==========================================
# CONFIGURAÇÕES INICIAIS
# ==========================================
PASTA_ENTRADA = "extratos_entrada"
PASTA_PROCESSADOS = "extratos_processados"
ID_PLANILHA_CONTABILIDADE = "1Nox6XM7jzVh0p4s-EZKNZLlFN-W6odLoDJK0RU9oayA" 
NOME_ABA = "Setembro" 

os.makedirs(PASTA_ENTRADA, exist_ok=True)
os.makedirs(PASTA_PROCESSADOS, exist_ok=True)

# Auto-detectar qual arquivo de credencial existe na pasta
if os.path.exists("credentials.json"):
    ARQUIVO_CREDENCIAIS = "credentials.json"
elif os.path.exists("credentials_2.json"):
    ARQUIVO_CREDENCIAIS = "credentials_2.json"
else:
    print("⚠️ ERRO CRÍTICO: Nenhum arquivo de credenciais (credentials.json) encontrado na pasta!")
    ARQUIVO_CREDENCIAIS = "credentials.json" # Força o nome para gerar o erro original e não quebrar o código do nada

# ==========================================
# CONEXÃO COM GOOGLE SHEETS
# ==========================================
def conectar_planilha():
    escopos = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive"
    ]
    credenciais = ServiceAccountCredentials.from_json_keyfile_name(ARQUIVO_CREDENCIAIS, escopos)
    cliente = gspread.authorize(credenciais)
    return cliente.open_by_key(ID_PLANILHA_CONTABILIDADE).worksheet(NOME_ABA)

# ==========================================
# MÓDULO DE CÁLCULOS
# ==========================================
def realizar_calculos(registro):
    try:
        comissao_str = registro["comissao_bruta"].replace(".", "").replace(",", ".")
        valor_bruto = float(comissao_str)
        # O valor líquido passa sem desconto por enquanto
        valor_liquido = valor_bruto 
        registro["comissao_liquida_calculada"] = f"{valor_liquido:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        registro["comissao_liquida_calculada"] = registro["comissao_bruta"]
    return registro

# ==========================================
# FILTROS ESPECÍFICOS POR SEGURADORA
# ==========================================
def extrair_porto_seguro(texto_completo):
    registros = []
    
    # 1. Limpeza total do texto: removemos quebras de linha e espaços duplos
    texto_limpo = texto_completo.replace("\n", " ")
    texto_limpo = re.sub(r"\|", " ", texto_limpo)
    texto_limpo = re.sub(r"\s+", " ", texto_limpo).strip()
    
    # 2. Pegar a Data de Pagamento Geral (A primeira data que aparece no documento)
    m_data = re.search(r"\b(\d{2}/\d{2}/\d{4})\b", texto_limpo)
    data_pagamento = m_data.group(1) if m_data else "Não identificada"

    # 3. Regex cirúrgica blindada
    padrao_linha = r"([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s\&\-\.]{8,60}?)\s+(?:(Azul|Porto|Ita[uú])\s+)?((?:\d+\s+){3,8})(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4})\s+([\d\.]+,\d{2})\s+([\d\.]+,\d{2})\s+([\d\.]+,\d{2})\s+(\d{1,3}-[A-ZÀ-ÿ\s]+?)\s*(?:(Azul|Porto|Ita[uú])|(?=\s|$))"
    
    matches = re.finditer(padrao_linha, texto_limpo)
    
    for m in matches:
        seq_numeros = m.group(3).strip().split()
        # Na Porto, a apólice costuma ser o 3º número (Sucursal -> Ramo -> Apólice)
        apolice = seq_numeros[2] if len(seq_numeros) >= 3 else "N/A"
        
        # A marca pode aparecer antes dos números ou grudada no final do tipo de comissão
        marca_inicio = m.group(2)
        marca_fim = m.group(9)
        marca = marca_inicio if marca_inicio else (marca_fim if marca_fim else "Porto (Padrão)")
        
        registro = {
            "seguradora": "Porto Seguro",
            "data_pagamento": data_pagamento,
            "segurado": m.group(1).strip(),
            "apolice": apolice,
            "premio": m.group(5).strip(),
            "taxa_percentual": m.group(6).strip(),
            "comissao_bruta": m.group(7).strip(),
            "tipo_comissao": m.group(8).strip(),
            "marca": marca.strip()
        }
        registros.append(registro)
        
    return registros

# ==========================================
# ROTEADOR DE SEGURADORAS
# ==========================================
def roteador_pdf(caminho_pdf):
    texto_completo = ""
    try:
        reader = PdfReader(caminho_pdf)
        for pagina in reader.pages:
            texto = pagina.extract_text()
            if texto:
                texto_completo += texto + "\n"
    except Exception as e:
        print(f"Erro ao tentar ler o PDF: {e}")
        return []

    # Condição super flexível para achar a Porto Seguro
    if "PORTO SEGURO" in texto_completo.upper() or "ANALÍTICO DE PAGAMENTO" in texto_completo.upper():
        return extrair_porto_seguro(texto_completo), texto_completo
    
    return [], texto_completo

# ==========================================
# ENVIO PARA O GOOGLE SHEETS
# ==========================================
def registrar_na_planilha(sheet, registros):
    for reg in registros:
        reg = realizar_calculos(reg)
        linha = [
            reg["data_pagamento"],
            reg["seguradora"],
            reg["segurado"],
            reg["apolice"],
            reg["premio"],
            reg["taxa_percentual"],
            reg["comissao_bruta"],
            reg["tipo_comissao"],
            reg["comissao_liquida_calculada"],
            reg["marca"] # Coloquei a marca no final para não perder esse dado!
        ]
        
        sheet.append_row(linha, table_range="A1")
        print(f"✅ Contabilidade salva: {reg['segurado']} | R$ {reg['comissao_bruta']} ({reg['tipo_comissao']})")

# ==========================================
# LOOP PRINCIPAL
# ==========================================
def main():
    print("=== INICIANDO LEITURA CONTÁBIL DE EXTRATOS ===")
    try:
        sheet = conectar_planilha()
        print("Conexão com Google Sheets estabelecida com sucesso!")
    except Exception as e:
        print(f"Falha na conexão com o Google Sheets. Erro: {e}")
        input("Pressione ENTER para fechar...")
        return

    arquivos = [arq for arq in os.listdir(PASTA_ENTRADA) if arq.lower().endswith(".pdf")]
    
    if not arquivos:
        print(f"Nenhum PDF encontrado na pasta '{PASTA_ENTRADA}'.")
        input("Pressione ENTER para fechar...")
        return

    for arquivo in arquivos:
        caminho_completo = os.path.join(PASTA_ENTRADA, arquivo)
        print(f"\n📄 Processando extrato: {arquivo}")
        
        # 1. Roteia o PDF e extrai os dados
        registros_extraidos, texto_bruto = roteador_pdf(caminho_completo)
        
        if registros_extraidos:
            # 2. Registra na planilha
            registrar_na_planilha(sheet, registros_extraidos)
            
            # 3. Move para processados
            caminho_destino = os.path.join(PASTA_PROCESSADOS, arquivo)
            shutil.move(caminho_completo, caminho_destino)
            print(f"📁 Arquivo movido para '{PASTA_PROCESSADOS}'.")
        else:
            print(f"⚠️ Nenhum registro encontrado no arquivo {arquivo}.")
            print("\n--- MODO DEBUG: O que o Python está lendo do PDF ---")
            print(texto_bruto[:600]) # Mostra o comecinho do texto para avaliarmos
            print("----------------------------------------------------\n")

if __name__ == "__main__":
    main()