import os
import io
import re
import json
import pdfplumber
import gspread
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# =======================================================
# CONFIGURAÇÕES E CREDENCIAIS
# =======================================================
# Lógica para ler credenciais (Suporta arquivo local ou ambiente do GitHub Actions)
GOOGLE_CREDENTIALS_JSON = os.environ.get("GOOGLE_CREDENTIALS")

if GOOGLE_CREDENTIALS_JSON:
    creds_dict = json.loads(GOOGLE_CREDENTIALS_JSON)
    creds = service_account.Credentials.from_service_account_info(
        creds_dict,
        scopes=[
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/spreadsheets"
        ]
    )
else:
    # Fallback para desenvolvimento local
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=[
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/spreadsheets"
        ]
    )

drive_service = build("drive", "v3", credentials=creds)
gc = gspread.authorize(creds)

# IDs configurados no Passo 2
FOLDER_ENTRADA_ID = os.environ.get("FOLDER_ENTRADA_ID", "13dEtD5RTWQiyt1INASVqPgaIt9RKudFO")
FOLDER_PROCESSADOS_ID = os.environ.get("FOLDER_PROCESSADOS_ID", "1E1guR7b5jJzfiO3fnbZzoLnnaTBnjGYd")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "14wh7QYAW-m60TxkWugF0Hasd3y6MptyjXE1U7rPSL4E")

# =======================================================
# MOTOR EXTRAÇÃO CIRÚRGICO
# =======================================================
def extrair_dados_pdf(pdf_bytes, nome_arquivo):
    dados = {
        "vencimento": "", "numero_apolice": "", "segurado": "",
        "observacoes": "", "seguradora": "", "premio_total": "",
        "premio_liquido": "", "comissao": "", "comissao_pct": "",
        "placa": "", "email": "", "telefone": "", "pagamento": ""
    }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        texto_completo = "\n".join([page.extract_text() or "" for page in pdf.pages])

    # 1. IDENTIFICAÇÃO DA SEGURADORA
    texto_lower = texto_completo.lower()
    if "bradesco" in texto_lower: dados["seguradora"] = "Bradesco"
    elif "aliro" in texto_lower: dados["seguradora"] = "Aliro"
    elif "yelum" in texto_lower: dados["seguradora"] = "Yelum"
    elif "hdi" in texto_lower: dados["seguradora"] = "HDI"
    elif "zurich" in texto_lower: dados["seguradora"] = "Zurich"
    elif "porto seguro" in texto_lower: dados["seguradora"] = "Porto Seguro"
    elif "tokio marine" in texto_lower: dados["seguradora"] = "Tokio Marine"
    elif "allianz" in texto_lower: dados["seguradora"] = "Allianz"

      # Ajuste da comissão no nome do arquivo
        m_comissao = re.search(r"(\d+(?:,\d+)?)\s*%", nome_arquivo)
        if m_comissao: dados["comissao_pct"] = m_comissao.group(1) + "%"

        # 3. PLACA E CONTATOS (Universal)
        m_placa = re.search(r"\b([A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}-?\d{4})\b", texto_completo)
        if m_placa: dados["placa"] = m_placa.group(1).replace("-", "").upper()

        m_tel = re.search(r"\b\(?\d{2}\)?\s*(?:9\d{4}|\d{4})-?\d{4}\b", texto_completo)
        if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))
        
        emails = re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", texto_completo)
        for e in emails:
            if "capse" not in e.lower():
                dados["email"] = e.lower()
                break

        # =======================================================
        # EXTRATOR CIRÚRGICO: BRADESCO
        # =======================================================
        if dados["seguradora"] == "Bradesco":
            m_apolice = re.search(r"Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Vigência:\s*das\s*24h\s*de\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_seg = re.search(r"DADOS DO PROPONENTE[\s\S]*?Nome:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if not m_seg: m_seg = re.search(r"Nome:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_seg:
                nome_bruto = m_seg.group(1).strip()
                dados["segurado"] = re.sub(r"\s+(?:Vigência|CPF|Tipo).*$", "", nome_bruto, flags=re.IGNORECASE).strip()

            # CORREÇÃO DO MODELO: Pega limpo o Tipo do Veículo (ex: Dolphin Ev (Eletrico))
            m_tipo_veiculo = re.search(r"Tipo do Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_tipo_veiculo:
                modelo_bruto = m_tipo_veiculo.group(1).strip()
                # Remove sujeiras extras caso venham coladas na linha
                dados["modelo_carro"] = re.sub(r"\s+Placa:.*$", "", modelo_bruto, flags=re.IGNORECASE).strip()

            # CORREÇÃO DO CELULAR: Pega cirurgicamente pelo rótulo da Bradesco
            m_tel = re.search(r"Tel\.\s*Celular:\s*([\d\s\(\)\-]+)", texto_completo, re.IGNORECASE)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

            m_liq = re.search(r"LÍQUIDO\s*\(Auto\+RCF\+APP\)\s*:\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            m_tot = re.search(r"TOTAL\s*:\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"Quant\.\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
            if m_parc: dados["parcelas"] = m_parc.group(1).lstrip("0") 

            m_pag = re.search(r"Demais Parcelas:\s*([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()

        # =======================================================
        # EXTRATOR CIRÚRGICO: HDI
        # =======================================================
        elif dados["seguradora"] == "HDI":
            m_apolice = re.search(r"Especificação da Proposta\s*([\d\.]+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Das\s*24\s*h\s*do\s*dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            # Segurado: Captura e converte obrigatoriamente para MAIÚSCULO (.upper())[cite: 18]
            m_seg = re.search(r"Nome de Registro Segurado\s*:\s*([A-ZÀ-ÿ\s]+?)(?=\s+CPF|\r|\n)", texto_completo, re.IGNORECASE)
            if not m_seg: m_seg = re.search(r"Nome de Registro Segurado\s*:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            # Celular: Busca estritamente pelo rótulo da HDI para não pegar o número da proposta[cite: 18]
            m_tel = re.search(r"Celular\s*:\s*([\d\(\)\-]+)", texto_completo, re.IGNORECASE)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

            m_placa = re.search(r"Placa/UF\s*:\s*([A-Z0-9\-]+)", texto_completo, re.IGNORECASE)
            if m_placa: dados["placa"] = m_placa.group(1).split("-")[0].strip().upper()

            m_mod = re.search(r"Modelo\s*:\s*[^\-\s]+\s*-\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if not m_mod: m_mod = re.search(r"Modelo\s*:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

            m_liq = re.search(r"Prêmio Líquido\s*[:]?\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            m_tot = re.search(r"Prêmio Total\s*[:]?\s*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"Forma de Pagamento\s*:\s*(\d{1,2})\s*x", texto_completo, re.IGNORECASE)
            if m_parc: dados["parcelas"] = m_parc.group(1)

            m_pag_forma = re.search(r"Tipo de Cobrança\s*:\s*([A-Za-zÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_pag_forma: dados["forma_pagamento"] = m_pag_forma.group(1).strip()

        # =======================================================
        # EXTRATOR CIRÚRGICO: ZURICH
        # =======================================================
        elif dados["seguradora"] == "Zurich":
            m_apolice = re.search(r"Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Início de vigência:\s*24\s*Horas\s*de\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_seg = re.search(r"Nome completo:\s*([^\n]+)", texto_completo, re.IGNORECASE)
            if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            m_tel = re.search(r"Celular:\s*([\d\s\(\)\-]+)", texto_completo, re.IGNORECASE)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

            m_mod = re.search(r"Veículo:\s*([^\n]+?)\s+Ano/Modelo:", texto_completo, re.IGNORECASE)
            if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

            # Prêmio Líquido (Flexível para acentos)
            m_liq = re.search(r"Pr[êe]mio\s+L[íi]quido[:\s]*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            # Prêmio Total (Flexível para acentos)
            m_tot = re.search(r"Pr[êe]mio\s+Total[:\s]*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"Número de Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
            if m_parc: dados["parcelas"] = m_parc.group(1)

            m_pag = re.search(r"Forma de Pagamento da Entrada:\s*([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()

        # =======================================================
        # EXTRATOR CIRÚRGICO: PORTO SEGURO
        # =======================================================
        elif dados["seguradora"] == "Porto Seguro":
            m_apolice = re.search(r"Nº da Proposta:\s*([A-Z0-9\-]+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            # Vencimento Porto Seguro (Lê o padrão "DAS 24 HORAS DO DIA DD/MM/AAAA")[cite: 14]
            m_venc = re.search(r"DAS\s*24\s*HORAS\s*DO\s*DIA\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_nome_arq = re.search(r"Proposta\s+([A-ZÀ-ÿ\s]+?)(?=\s+\d+(?:,\d+)?\s*%|\.pdf)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq: dados["segurado"] = m_nome_arq.group(1).strip().upper()

            # Celular Porto Seguro: Pega cirurgicamente pelo rótulo CELULAR:
            m_tel = re.search(r"CELULAR:\s*\(?(\d{2})\)?\s*([\d\-]+)", texto_completo, re.IGNORECASE)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

            m_mod = re.search(r"Veículo Ano Fabricação[^\n]*\n(.*?\d{4}\s*/\s*\d{4})", texto_completo, re.IGNORECASE)
            if m_mod:
                modelo_limpo = re.sub(r"^\d+\s*-\s*-\s*|^\d+\s*-\s*", "", m_mod.group(1).strip())
                dados["modelo_carro"] = re.sub(r"\s+\d{4}\s*/\s*\d{4}.*", "", modelo_limpo).strip()

            m_liq = re.search(r"Prêmio Total Líquido:[\s\S]*?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            m_tot = re.search(r"Prêmio Total:[\s\S]*?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"(\d{1,2})x\s+([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_parc: 
                dados["parcelas"] = m_parc.group(1)
                dados["forma_pagamento"] = m_parc.group(2).strip()
       # =======================================================
        # EXTRATOR CIRÚRGICO: YELUM
        # =======================================================
        elif dados["seguradora"] == "Yelum":
            # Número da Proposta: Captura o número logo abaixo de "Proposta N°"
            m_apolice = re.search(r"Proposta\s*N[°º]?\s*[\r\n]+\s*(\d{8,12})", texto_completo, re.IGNORECASE)
            if not m_apolice: 
                m_apolice = re.search(r"Proposta\s*N[°º]?\s*[:\s]*(\d{8,12})", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            # Vencimento Yelum: Pega especificamente a primeira data do formato de vigência
            m_venc = re.search(r"Vigência\s*[:\s]*(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if not m_venc:
                m_venc = re.search(r"(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: 
                dados["vencimento"] = m_venc.group(1)

            # Segurado
            m_seg = re.search(r"Nome do\(a\) Proponente/Segurado\(a\)\s*\n([^\n]+)", texto_completo, re.IGNORECASE)
            if not m_seg: m_seg = re.search(r"(?:CNPJ|CPF)[^\n]*\n([A-Za-zÀ-ÿ\s]{3,50})", texto_completo)
            if m_seg:
                nome_bruto = m_seg.group(1).strip()
                dados["segurado"] = re.sub(r"^(?:CNPJ|CPF|[\d\.\-\/])+\s*", "", nome_bruto, flags=re.IGNORECASE).strip().upper()

            # Celular Yelum: Busca estritamente por um número de celular válido que comece com 9 após o DDD
            m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

            m_mod = re.search(r"\d{6}-\d\s+([A-Za-zÀ-ÿ0-9\s\.\-\(\)]+?)(?=\s+\d{4}/\d{4})", texto_completo)
            if not m_mod: m_mod = re.search(r"Marca/Tipo do Veículo[^\n]*\n\s*\d{6}-\d\s+([^\n]+)", texto_completo, re.IGNORECASE)
            if not m_mod: m_mod = re.search(r"(?:HB20|MARCH|ONIX|KWID|COMPASS|RENEGADE|COROLLA|CIVIC|HRV|FIESTA|KA|FOX|POLO|JETTA|GOL|SAVEIRO|STRADA|TORO|TERRITORY)[^\n]*", texto_completo, re.IGNORECASE)
            if m_mod:
                modelo_bruto = m_mod.group(1).strip() if m_mod.lastindex else m_mod.group(0).strip()
                dados["modelo_carro"] = re.sub(r"\s+\d{4}/\d{4}.*", "", modelo_bruto).strip()

            m_demo = re.search(r"DEMONSTRATIVO DE PRÊMIO[\s\S]*?Prêmio Líquido.*?Juros\(%\)([\s\S]*?)(?=FORMA DE PAGAMENTO)", texto_completo, re.IGNORECASE)
            if m_demo:
                valores_linha = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
                if len(valores_linha) >= 2:
                    dados["premio_liquido"] = valores_linha[0]
                    dados["premio_total"] = valores_linha[-1]

            if not dados["premio_total"]:
                valores_gerais = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
                if len(valores_gerais) >= 5:
                    dados["premio_liquido"] = valores_gerais[0]
                    dados["premio_total"] = valores_gerais[3] 

            m_parc_soma = re.search(r"(\d{1,2})\+(\d{1,2})\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+?)(?=\n|\s\d)", texto_completo, re.IGNORECASE)
            if m_parc_soma:
                dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
                dados["forma_pagamento"] = m_parc_soma.group(3).strip()
            else:
                m_parc = re.search(r"(\d{1,2})\s*x\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+?)(?=\n|\s\d)", texto_completo, re.IGNORECASE)
                if m_parc: 
                    dados["parcelas"] = m_parc.group(1)
                    dados["forma_pagamento"] = m_parc.group(2).strip()

      # =======================================================
        # EXTRATOR CIRÚRGICO: ALIRO
        # =======================================================
        elif dados["seguradora"] == "Aliro":
           # Vencimento Aliro: Busca a PRIMEIRA data que aparece logo abaixo da palavra "Vigência" (Ignora o rodapé)
            m_venc = re.search(r"Vigência[\s\S]{1,80}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: 
                dados["vencimento"] = m_venc.group(1)
            
            # Segurado: Pega direto do nome do arquivo (Estratégia infalível com suporte a hífen)
            m_nome_arq = re.search(r"Proposta\s*[-–]?\s*([A-ZÀ-ÿ\s]+?)(?=\s+\d+(?:,\d+)?\s*%|\.pdf)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq:
                dados["segurado"] = m_nome_arq.group(1).strip().upper()
            else:
                m_seg = re.search(r"Nome do\(a\) Proponente/Segurado\(a\)\s*\n([^\n]+)", texto_completo, re.IGNORECASE)
                if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            # Celular Aliro: Isolado estritamente para capturar números iniciando com 9
            m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

            # Modelo do Carro: Captura o texto exato entre o Código FIPE e o Ano (ex: 003478-9 CARRO 2021/2022)[cite: 17]
            m_mod = re.search(r"\d{6}-\d\s+([A-Za-zÀ-ÿ0-9\s\.\-\(\)]+?)\s+\d{4}/\d{4}", texto_completo)
            if m_mod:
                dados["modelo_carro"] = m_mod.group(1).strip()
            else:
                m_mod_fallback = re.search(r"(?:HB20|MARCH|ONIX|KWID|COMPASS|RENEGADE|COROLLA|CIVIC|HRV|FIESTA|KA|FOX|POLO|JETTA|GOL|SAVEIRO|STRADA|TORO|TERRITORY)[^\n|]*", texto_completo, re.IGNORECASE)
                if m_mod_fallback:
                    dados["modelo_carro"] = m_mod_fallback.group(0).strip()

            # Prêmios Líquido e Total
            m_demo = re.search(r"Juros\(%\)([\s\S]*?)(?=FORMA DE PAGAMENTO)", texto_completo, re.IGNORECASE)
            if m_demo:
                valores_linha = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
                if len(valores_linha) >= 4:
                    dados["premio_liquido"] = valores_linha[0]
                    dados["premio_total"] = valores_linha[-2] 

            if not dados["premio_total"]:
                valores = re.findall(r"(\d{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
                if len(valores) >= 5:
                    dados["premio_liquido"] = valores[0]
                    dados["premio_total"] = valores[3] 

            # Parcelas e Forma de Pagamento[cite: 17]
            m_parc_soma = re.search(r"(\d{1,2})\+(\d{1,2})\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_parc_soma:
                dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
                dados["forma_pagamento"] = m_parc_soma.group(3).strip()
            else:
                m_parc = re.search(r"(\d{1,2})\s*x\s*\([A-Z]+\)\s*-\s*([A-Za-zÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
                if m_parc: 
                    dados["parcelas"] = m_parc.group(1)
                    dados["forma_pagamento"] = m_parc.group(2).strip()
        # =======================================================
        # EXTRATOR CIRÚRGICO: TOKIO MARINE
        # =======================================================
        elif dados["seguradora"] == "Tokio Marine":
            m_apolice = re.search(r"Nº\s*Proposta/Negócio:\s*(\d+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Vigência[^\d]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_seg = re.search(r"([A-Za-zÀ-ÿ\s]{3,50})\s+\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
            if m_seg: dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", m_seg.group(1).strip(), flags=re.IGNORECASE).strip()

            # Celular Tokio Marine: Busca estritamente por um número de celular válido iniciando com 9
            m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
            if m_tel:
                dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

            m_mod = re.search(r"(?:FORD|CHEVROLET|FIAT|VOLKSWAGEN|HYUNDAI|TOYOTA|HONDA|RENAULT|NISSAN|PEUGEOT|CITROEN|JEEP|MITSUBISHI)\s+[A-Za-zÀ-ÿ0-9\s\.\-]+?(?=\n\s*(?:Gasolina|Flex|Diesel|Alcool))", texto_completo, re.IGNORECASE)
            if m_mod: dados["modelo_carro"] = m_mod.group(0).strip()

            m_pag = re.search(r"R\$\s*([\d\.]+,\d{2})\s+R\$\s*[\d\.]+,\d{2}\s+R\$\s*[\d\.]+,\d{2}\s+R\$\s*([\d\.]+,\d{2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{1,2})", texto_completo, re.IGNORECASE)
            if m_pag:
                dados["premio_liquido"] = m_pag.group(1)
                dados["premio_total"] = m_pag.group(2)
                dados["forma_pagamento"] = m_pag.group(3).strip()
                dados["parcelas"] = m_pag.group(4)

        # =======================================================
        # EXTRATOR CIRÚRGICO: ALLIANZ
        # =======================================================
        elif dados["seguradora"] == "Allianz":
            m_apolice = re.search(r"Nº\.?\s*da\s*Proposta:\s*(\d+)", texto_completo)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Vigência[^\d]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_seg = re.search(r"Nome:\s*([A-Za-zÀ-ÿ\s]+)", texto_completo)
            if m_seg: dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", m_seg.group(1).strip(), flags=re.IGNORECASE).strip().split('\n')[0].strip()

            m_mod = re.search(r"Veículo:\s*([^\n]+)", texto_completo)
            if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

          # Prêmio Líquido (Busca por Preço Líquido:)
            m_liq = re.search(r"Preço\s*Líquido:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if not m_liq: m_liq = re.search(r"Prêmio\s*Líquido:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            # Prêmio Total (Busca por Preço Total...)
            m_tot = re.search(r"Preço\s*Total[^\n]*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if not m_tot: m_tot = re.search(r"Prêmio\s*Total[^\n]*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            # Parcelas (Busca o padrão "em X parcelas")
            m_parc = re.search(r"em\s*(\d{1,2})\s*parcelas", texto_completo, re.IGNORECASE)
            if not m_parc: m_parc = re.search(r"Nº\s*de\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
            if m_parc: dados["parcelas"] = m_parc.group(1)

            # Forma de Pagamento
            m_fp = re.search(r"(Cartão\s*de\s*Crédito[^\n]*)", texto_completo, re.IGNORECASE)
            if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()

   except Exception as e:
        print(f"Erro ao aplicar Regex no arquivo {nome_arquivo}: {e}")

    # Fallback universal para vencimento caso necessário
    if not dados["vencimento"]:
        m_univ_venc = re.search(r"(?:vigência|início)[^\d]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_univ_venc: dados["vencimento"] = m_univ_venc.group(1)

    # Filtro de limpeza do Vencimento (Dia apenas)
    if dados["vencimento"] and "/" in dados["vencimento"]:
        dados["vencimento"] = dados["vencimento"].split("/")[0].strip()

    # Regra de Negócio: Observações e Pagamento
    if dados["placa"]:
        dados["observacoes"] = dados["modelo_carro"] if dados["modelo_carro"] else "Modelo não identificado"
    else:
        dados["placa"] = "" 
        dados["observacoes"] = "Seguro Empresarial"

    if dados["parcelas"] and dados["forma_pagamento"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas - {dados['forma_pagamento']}"
    elif dados["parcelas"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas"
    elif dados["forma_pagamento"]:
        dados["pagamento"] = f"{dados['forma_pagamento']}"

    return dados

# =======================================================
# FLUXO DE NUVEM (DRIVE -> SHEETS -> MOVE)
# =======================================================
def processar_fluxo():
    sheet = gc.open_by_key(SPREADSHEET_ID).worksheet("Apolices_Lidas")

    # Listar PDFs na pasta de entrada
    query = f"'{FOLDER_ENTRADA_ID}' in parents and mimeType='application/pdf' and trashed=false"
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    arquivos = results.get("files", [])

    for arq in arquivos:
        file_id = arq["id"]
        file_name = arq["name"]

        # Baixar PDF em memória
        request = drive_service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        pdf_bytes = fh.getvalue()
        dados = extrair_dados_pdf(pdf_bytes, file_name)

        # Mapeamento exato da sua Aba 1
        linha = [
            dados["vencimento"],
            dados["numero_apolice"],
            dados["segurado"],
            dados["observacoes"],
            dados["seguradora"],
            dados["premio_total"],
            dados["premio_liquido"],
            dados["comissao"],
            dados["comissao_pct"],
            dados["placa"],
            dados["email"],
            dados["telefone"],
            dados["pagamento"]
        ]

        sheet.append_row(linha)

        # Mover PDF para a pasta 'Processados'
        drive_service.files().update(
            fileId=file_id,
            addParents=FOLDER_PROCESSADOS_ID,
            removeParents=FOLDER_ENTRADA_ID,
            fields="id, parents"
        ).execute()

if __name__ == "__main__":
    processar_fluxo()