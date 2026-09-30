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
    creds = service_account.Credentials.from_service_account_file(
        "credentials.json",
        scopes=[
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/spreadsheets"
        ]
    )

drive_service = build("drive", "v3", credentials=creds)
gc = gspread.authorize(creds)

FOLDER_ENTRADA_ID = os.environ.get("FOLDER_ENTRADA_ID", "13dEtD5RTWQiyt1INASVqPgaIt9RKudFO")
FOLDER_PROCESSADOS_ID = os.environ.get("FOLDER_PROCESSADOS_ID", "1E1guR7b5jJzfiO3fnbZzoLnnaTBnjGYd")
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "14wh7QYAW-m60TxkWugF0Hasd3y6MptyjXE1U7rPSL4E")

# =======================================================
# MOTOR DE EXTRAÇÃO CIRÚRGICO
# =======================================================
def extrair_dados_pdf(pdf_bytes, nome_arquivo):
    dados = {
        "vencimento": "", "numero_apolice": "", "segurado": "",
        "observacoes": "", "seguradora": "Não Identificada", "premio_total": "",
        "premio_liquido": "", "comissao": "", "comissao_pct": "",
        "placa": "", "email": "", "telefone": "", "pagamento": "",
        "modelo_carro": "", "parcelas": "", "forma_pagamento": ""
    }

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        texto_completo = "\n".join([page.extract_text() or "" for page in pdf.pages])

    try:
        # 1. IDENTIFICAÇÃO DA SEGURADORA (Foco no Cabeçalho)
        cabecalho_lower = texto_completo[:1000].lower()
        
        if "suhai" in cabecalho_lower: dados["seguradora"] = "Suhai"
        elif "zurich" in cabecalho_lower: dados["seguradora"] = "Zurich"
        elif "allianz" in cabecalho_lower: dados["seguradora"] = "Allianz"
        elif "bradesco" in cabecalho_lower: dados["seguradora"] = "Bradesco"
        elif "susep: 1091" in cabecalho_lower or "suíça seguradora" in cabecalho_lower or "suica seguradora" in cabecalho_lower: 
            dados["seguradora"] = "Suíça"
        elif "tokio marine" in cabecalho_lower: dados["seguradora"] = "Tokio Marine"
        elif "aliro" in cabecalho_lower: dados["seguradora"] = "Aliro"
        elif "yelum residencia" in texto_completo.lower() or ("yelum" in cabecalho_lower and "residencia" in texto_completo.lower()):
            dados["seguradora"] = "Yelum Residência"
        elif "yelum" in cabecalho_lower: dados["seguradora"] = "Yelum"
        elif "hdi" in cabecalho_lower: dados["seguradora"] = "HDI"
        elif "azul tradicional" in cabecalho_lower or ("azul" in cabecalho_lower and "operado pela" in cabecalho_lower and "porto seguro" in cabecalho_lower):
            dados["seguradora"] = "Azul"
        elif "porto seguro" in cabecalho_lower: dados["seguradora"] = "Porto Seguro"

        # 2. EXTRAÇÃO DA COMISSÃO (%) PELO NOME DO ARQUIVO
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

            m_tipo_veiculo = re.search(r"Tipo do Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_tipo_veiculo:
                modelo_bruto = m_tipo_veiculo.group(1).strip()
                dados["modelo_carro"] = re.sub(r"\s+Placa:.*$", "", modelo_bruto, flags=re.IGNORECASE).strip()

            m_tel = re.search(r"Tel\.\s*Celular:\s*([\d\s\(\)\-]+)", texto_completo, re.IGNORECASE)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

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

            m_seg = re.search(r"Nome de Registro Segurado\s*:\s*([A-ZÀ-ÿ\s]+?)(?=\s+CPF|\r|\n)", texto_completo, re.IGNORECASE)
            if not m_seg: m_seg = re.search(r"Nome de Registro Segurado\s*:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            m_tel = re.search(r"Celular\s*:\s*([\d\(\)\-]+)", texto_completo, re.IGNORECASE)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

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
        # EXTRATOR CIRÚRGICO: SUÍÇA SEGURADORA
        # =======================================================
        elif dados["seguradora"] == "Suíça":
            m_apolice = re.search(r"Nº\s*da\s*Proposta[\r\n\s]*(\d+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Início\s*às\s*24\s*horas\s*do\s*dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_nome_arq = re.search(r"(?:Proposta|Apólice)\s*[-–]?\s*([A-ZÀ-ÿ\s]+?)(?=\s*\(\d+\)|\s*\d+(?:,\d+)?\s*%|\.pdf|_texto)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq and len(m_nome_arq.group(1).strip()) > 3:
                dados["segurado"] = m_nome_arq.group(1).strip().upper()
            else:
                m_seg = re.search(r"Nome\s*do\(a\)\s*Segurado\(a\)[\r\n]+([A-ZÀ-ÿ\s]{5,60})", texto_completo, re.IGNORECASE)
                if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            m_tel = re.search(r"Celular[\r\n\s]*\(?(\d{2})\)?\s*([\d\-]+)", texto_completo, re.IGNORECASE)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

            m_veic_sec = re.search(r"DADOS DO VEÍCULO([\s\S]+?)(?:LOCAL DE RISCO|DEMONSTRATIVO)", texto_completo, re.IGNORECASE)
            veic_text = m_veic_sec.group(1) if m_veic_sec else texto_completo

            m_mod = re.search(r"(?:Modelo|Modela)\s*:?\s*(.*?)(?=\s*(?:Ano\s*Fab/Mod|Chassi|Código\s*FIPE|CEP\s*Pernoite|Lotação|Tipo\s*de\s*utilização|Nota\s*fiscal)\b|\r?\n|$)", veic_text, re.IGNORECASE)
            if m_mod:
                modelo_bruto = m_mod.group(1).strip()
                modelo_bruto = re.sub(r"\s*/\s*(?:Carro|Moto|Caminh(?:ão|ao)).*$", "", modelo_bruto, flags=re.IGNORECASE).strip()
                modelo_bruto = re.sub(r"^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .&'’-]*\s+-\s+", "", modelo_bruto).strip()
                dados["modelo_carro"] = modelo_bruto

            m_demo = re.search(r"DEMONSTRATIVO DE PR[ÊE]MIO([\s\S]{1,200}?)(?:Placa|FORMA DE PAGAMENTO|DADOS DO VE[ÍI]CULO)", texto_completo, re.IGNORECASE)
            if m_demo:
                valores = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
                if len(valores) >= 3:
                    dados["premio_liquido"] = valores[0]
                    dados["premio_total"] = valores[2]
                elif len(valores) >= 2:
                    dados["premio_liquido"] = valores[0]
                    dados["premio_total"] = valores[-1]
            
            if not dados["premio_liquido"]:
                m_liq = re.search(r"Pr[êe]mio\s*L[íi]quido[\s\S]{1,40}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_liq: dados["premio_liquido"] = m_liq.group(1)
            if not dados["premio_total"]:
                m_tot = re.search(r"Pr[êe]mio\s*Total[\s\S]{1,40}?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_tot: dados["premio_total"] = m_tot.group(1)

            total_parcelas = len(re.findall(r"\b\d{1,2}\s+\d{1,3},\d{2}\b", texto_completo))
            if total_parcelas > 0:
                dados["parcelas"] = str(total_parcelas)
            else:
                dados["parcelas"] = "10"
            dados["forma_pagamento"] = "Cartão de Crédito"

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
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

            m_mod = re.search(r"Veículo:\s*([^\n]+?)\s+Ano/Modelo:", texto_completo, re.IGNORECASE)
            if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

            # Captura o Prêmio Total
            m_tot = re.search(r"Pr[êe]mio\s+Total\s*:\s*R\$\s*([\d\.,]+)", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1).strip()

            # Captura o IOF e calcula Prêmio Líquido
            m_iof = re.search(r"IOF[:\s]*R?\$?[\s\r\n]*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if dados["premio_total"] and m_iof:
                try:
                    val_total = float(dados["premio_total"].replace(".", "").replace(",", "."))
                    val_iof = float(m_iof.group(1).replace(".", "").replace(",", "."))
                    val_liquido = val_total - val_iof
                    dados["premio_liquido"] = f"{val_liquido:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                except Exception:
                    pass
            
            # Fallback caso a matemática falhe
            if not dados["premio_liquido"]:
                m_liq = re.search(r"Pr[êe]mio\s+L[íi]quido[\s\S]{1,200}?(?:Adicional|IOF)", texto_completo, re.IGNORECASE)
                if m_liq:
                    m_val_liq = re.search(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_liq.group(1))
                    if m_val_liq: dados["premio_liquido"] = m_val_liq.group(1)

            m_parc = re.search(r"Número de Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
            if m_parc: dados["parcelas"] = m_parc.group(1)

            m_pag = re.search(r"Forma de Pagamento da Entrada:\s*([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()

        # =======================================================
        # EXTRATOR CIRÚRGICO: AZUL SEGUROS (Proposta e Endosso)
        # =======================================================
        elif dados["seguradora"] == "Azul":
            eh_endosso = False
            if "SUBSTITUICAO" in texto_completo.upper() or "ENDOSSO" in nome_arquivo.upper():
                eh_endosso = True

            m_apolice = re.search(r"N[ºo]?\s*da\s*Proposta[:\s]*([A-Z0-9\-/\.]+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"AT[ÉÉ]\s*AS\s*24\s*HORAS\s*DO\s*DIA\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_nome_arq = re.search(r"(?:Proposta|Endosso)\s*[-–]?\s*([A-ZÀ-ÿ\s]+?)(?=\s*\d+(?:,\d+)?\s*%|\.pdf)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq:
                dados["segurado"] = m_nome_arq.group(1).strip().upper()
            else:
                m_seg = re.search(r"Proponente\s*/\s*Segurado\(a\)\s*\n([A-ZÀ-ÿ\s]{5,50})", texto_completo, re.IGNORECASE)
                if m_seg:
                    nome_candidato = m_seg.group(1).strip()
                    if "PROPONENTE" not in nome_candidato.upper() and "PESSOA" not in nome_candidato.upper():
                        dados["segurado"] = nome_candidato.upper()

            m_tel = re.search(r"CELULAR[:\s]*\(?(\d{2})\)?\s*([\d\-]+)", texto_completo, re.IGNORECASE)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

            m_mod = re.search(r"VEÍCULOS?[^\n]*\n[^\n]*\n\s*\d+\s*(?:-\s*)+([A-ZÀ-ÿ0-9\s\.\-\/\(\)]+?)(?=\s+\d{4}\s*/\s*\d{4})", texto_completo, re.IGNORECASE)
            if not m_mod:
                m_mod = re.search(r"(?:NIVUS|DUSTER|KAIT|SPIN|ONIX|HB20|COMPASS|RENEGADE|COROLLA|CIVIC|HRV|FIESTA|KA|FOX|POLO|JETTA|GOL|SAVEIRO|STRADA|TORO|TERRITORY|TRACKER|CRONOS|MOBI|CRETA|T-CROSS)[A-ZÀ-ÿ0-9\s\.\-\/\(\)]+", texto_completo, re.IGNORECASE)

            if m_mod:
                modelo_limpo = m_mod.group(1).strip() if m_mod.lastindex else m_mod.group(0).strip()
                modelo_limpo = re.sub(r"^[\-\s]+", "", modelo_limpo).strip()
                dados["modelo_carro"] = f"Endosso - {modelo_limpo}" if eh_endosso else modelo_limpo

            m_liq = re.search(r"Prêmio\s*(?:Total\s*)?Líquido[:\s\n\r\|]*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            m_tot = re.search(r"Prêmio\s*Total[:\s\n\r\|]*R?\$?\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"(\d{1,2})\s*x\s*([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
            if m_parc: 
                dados["parcelas"] = m_parc.group(1)
                dados["forma_pagamento"] = m_parc.group(2).strip()

        # =======================================================
        # EXTRATOR CIRÚRGICO: PORTO SEGURO
        # =======================================================
        elif dados["seguradora"] == "Porto Seguro":
            m_apolice = re.search(r"Nº da Proposta:\s*([A-Z0-9\-]+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"DAS\s*24\s*HORAS\s*DO\s*DIA\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_nome_arq = re.search(r"Proposta\s+([A-ZÀ-ÿ\s]+?)(?=\s+\d+(?:,\d+)?\s*%|\.pdf)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq: dados["segurado"] = m_nome_arq.group(1).strip().upper()

            m_tel = re.search(r"CELULAR:\s*\(?(\d{2})\)?\s*([\d\-]+)", texto_completo, re.IGNORECASE)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

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
        # EXTRATOR CIRÚRGICO: YELUM (Auto e Residência)
        # =======================================================
        elif dados["seguradora"] == "Yelum Residência":
            m_apolice = re.search(r"Proposta\s*N[ºo]?\s*[\r\n]+\s*(\d{8,12})", texto_completo, re.IGNORECASE)
            if not m_apolice: m_apolice = re.search(r"Proposta\s*N[ºo]?\s*[:\s]*(\d{8,12})", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Vigência\s*[:\s]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_nome_arq = re.search(r"(?:Proposta)\s*[-–]?\s*(.+?)(?=\s*-\s*RESIDENCIAL|\s*\(\d+\)|\.pdf|$)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq and len(m_nome_arq.group(1).strip()) > 3:
                dados["segurado"] = m_nome_arq.group(1).strip().upper()
            else:
                m_seg = re.search(r"Nome do\(a\) Proponente/Segurado\(a\)[^\n]*[\r\n\s]+([A-ZÀ-ÿ\s]+?)(?=\s*[\r\n]+|\s+CPF)", texto_completo, re.IGNORECASE)
                if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            m_tel = re.search(r"DADOS DO PROPONENTE[\s\S]{1,200}?Telefone\s*([\d\s]+?)(?:RUA|AVENIDA|CEP|E-mail|$)", texto_completo, re.IGNORECASE)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

            m_demo = re.search(r"DEMONSTRATIVO DE PR.MIO([\s\S]{1,200}?)FORMA DE PAGAMENTO", texto_completo, re.IGNORECASE)
            if m_demo:
                valores = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
                if len(valores) >= 2:
                    dados["premio_liquido"] = valores[0]
                    dados["premio_total"] = valores[-1]
            
            if not dados["premio_total"]:
                valores_gerais = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", texto_completo)
                if len(valores_gerais) >= 5:
                    dados["premio_liquido"] = valores_gerais[0]
                    dados["premio_total"] = valores_gerais[4]

            m_pag = re.search(r"Tipo de Cobrança\s*[\r\n]+([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_pag:
                pag_texto = m_pag.group(1).strip()
                dados["forma_pagamento"] = pag_texto
                m_parc_soma = re.search(r"(\d+)\+(\d+)", pag_texto)
                if m_parc_soma:
                    dados["parcelas"] = str(int(m_parc_soma.group(1)) + int(m_parc_soma.group(2)))
                else:
                    m_parc_simples = re.search(r"^(\d+)", pag_texto)
                    if m_parc_simples: dados["parcelas"] = m_parc_simples.group(1) 

        elif dados["seguradora"] == "Yelum":
            m_apolice = re.search(r"Proposta\s*N[°º]?\s*[\r\n]+\s*(\d{8,12})", texto_completo, re.IGNORECASE)
            if not m_apolice: m_apolice = re.search(r"Proposta\s*N[°º]?\s*[:\s]*(\d{8,12})", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Vigência\s*[:\s]*(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if not m_venc: m_venc = re.search(r"(\d{2}/\d{2}/\d{4})\s*a\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_seg = re.search(r"Nome do\(a\) Proponente/Segurado\(a\)\s*\n([^\n]+)", texto_completo, re.IGNORECASE)
            if not m_seg: m_seg = re.search(r"(?:CNPJ|CPF)[^\n]*\n([A-Za-zÀ-ÿ\s]{3,50})", texto_completo)
            if m_seg:
                nome_bruto = m_seg.group(1).strip()
                dados["segurado"] = re.sub(r"^(?:CNPJ|CPF|[\d\.\-\/])+\s*", "", nome_bruto, flags=re.IGNORECASE).strip().upper()

            m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

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
            m_venc = re.search(r"Vigência[\s\S]{1,80}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)
            
            m_nome_arq = re.search(r"Proposta\s*[-–]?\s*([A-ZÀ-ÿ\s]+?)(?=\s*\(\d+\)|\s+\d+(?:,\d+)?\s*%|\.pdf)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq and len(m_nome_arq.group(1).strip()) > 3:
                dados["segurado"] = m_nome_arq.group(1).strip().upper()
            else:
                m_seg = re.search(r"([A-ZÀ-ÿ\s]{3,60})\n\s*\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
                if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            m_mod = re.search(r"([A-Z0-9\s\.\-\/\(\)]+?\((?:Flex|Gasolina|Diesel|Alcool|Eletrico|Híbrido)\))", texto_completo, re.IGNORECASE)
            if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()
            
            if not dados["modelo_carro"]:
                m_mod_fipe = re.search(r"\d{6}-\d\s+([A-Za-z0-9\s\.\-\/\(\)]+?)(?=\s+\d{4}/\d{4}|\n|$)", texto_completo)
                if m_mod_fipe: dados["modelo_carro"] = m_mod_fipe.group(1).strip()

            if not dados["modelo_carro"]:
                m_mod_brand = re.search(r"\b(?:PALIO|COMPASS|ARGO|HB20|MARCH|ONIX|KWID|RENEGADE|COROLLA|CIVIC|HRV|FIESTA|KA|FOX|POLO|JETTA|GOL|SAVEIRO|STRADA|TORO|TERRITORY|TRACKER|CRONOS|MOBI|CRETA|T-CROSS|NIVUS)\b[^\n]+", texto_completo, re.IGNORECASE)
                if m_mod_brand: dados["modelo_carro"] = m_mod_brand.group(0).strip()

            m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
            if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

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
        # EXTRATOR CIRÚRGICO: SUHAI
        # =======================================================
        elif dados["seguradora"] == "Suhai":
            m_proposta = re.search(r"Proposta\s*:\s*(\d+)", texto_completo, re.IGNORECASE)
            if m_proposta: dados["numero_apolice"] = m_proposta.group(1)

            m_venc = re.search(r"Vigência\s*Proposta:[\s\S]{1,50}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_nome_arq = re.search(r"(?:Proposta|Apólice)\s*[-–]?\s*(.+?)(?=\s*\(\d+\)|\s*\d+(?:,\d+)?\s*%|\.pdf|_texto|$)", nome_arquivo, re.IGNORECASE)
            if m_nome_arq:
                dados["segurado"] = m_nome_arq.group(1).strip().upper()
            else:
                m_seg = re.search(r"Nome/Razão Social[\r\n\s]+([A-ZÀ-ÿ\s]+)", texto_completo, re.IGNORECASE)
                if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

            m_placa = re.search(r"Placa[\r\n\s]+([\s\S]+?)Categoria", texto_completo, re.IGNORECASE)
            if m_placa:
                dados["placa"] = re.sub(r"[^A-Za-z0-9]", "", m_placa.group(1)).upper()

            m_modelo = re.search(r"\d{6}-\d[\r\n\s]+([\s\S]+?)[\r\n\s]+20\d{2}\s*/\s*20\d{2}", texto_completo, re.IGNORECASE)
            if m_modelo:
                modelo_bruto = m_modelo.group(1)
                dados["modelo_carro"] = re.sub(r"[\r\n\s]+", " ", modelo_bruto).strip()

            m_demo = re.search(r"DEMONSTRATIVO DO PR[ÊE]MIO([\s\S]{1,150}?)DADOS DE PAGAMENTO", texto_completo, re.IGNORECASE)
            if m_demo:
                valores = re.findall(r"([\d]{1,3}(?:\.\d{3})*,\d{2})", m_demo.group(1))
                if len(valores) >= 2:
                    dados["premio_liquido"] = valores[0]
                    dados["premio_total"] = valores[-1]

            m_pag_block = re.search(r"DADOS DE PAGAMENTO([\s\S]{1,150}?)\(1\)", texto_completo, re.IGNORECASE)
            if not m_pag_block: m_pag_block = re.search(r"DADOS DE PAGAMENTO([\s\S]{1,150}?)Vig[êe]ncia", texto_completo, re.IGNORECASE)
            if m_pag_block:
                block = m_pag_block.group(1)
                m_forma = re.search(r"Forma de Pagamento[\r\n]+([A-Za-zÀ-ÿ\s]+?)(?:[\r\n]+|N[ºo°])", block, re.IGNORECASE)
                if m_forma: dados["forma_pagamento"] = re.sub(r"[\r\n\s]+", " ", m_forma.group(1)).strip()
                m_parc = re.search(r"Parcelas[^\d]+(\d+)", block, re.IGNORECASE)
                if m_parc: dados["parcelas"] = m_parc.group(1)

        # =======================================================
        # EXTRATOR CIRÚRGICO: TOKIO MARINE
        # =======================================================
        elif dados["seguradora"] == "Tokio Marine":
            eh_endosso = "ENDOSSO" in nome_arquivo.upper()

            if eh_endosso:
                m_apolice = re.search(r"Apólice:\s*(\d+)", texto_completo, re.IGNORECASE)
                if not m_apolice: m_apolice = re.search(r"Negócio:\s*(\d+)", texto_completo, re.IGNORECASE)
                if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

                m_venc = re.search(r"Vigência: a partir das 24 horas do dia\s*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
                if m_venc: dados["vencimento"] = m_venc.group(1)

                m_seg = re.search(r"Segurado:\s*([A-ZÀ-ÿ\s]+?)(?:Nome Social:|CPF:)", texto_completo, re.IGNORECASE)
                if m_seg: dados["segurado"] = m_seg.group(1).strip().upper()

                m_tel = re.search(r"Celular:\s*(\(?\d{2}\)?\s*9\d{4}[-\s]?\d{4})", texto_completo, re.IGNORECASE)
                if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(1))

                m_mod = re.search(r"Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
                if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

                m_liq = re.search(r"Prêmio Líquido Total:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_liq: dados["premio_liquido"] = m_liq.group(1)

                m_tot = re.search(r"Prêmio Total:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_tot: dados["premio_total"] = m_tot.group(1)

                m_pag = re.search(r"Cobrança:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
                if m_pag: dados["forma_pagamento"] = m_pag.group(1).strip()
                
                parcelas_endosso = len(re.findall(r"Endosso\s*\|\s*\d{2}\s*\|", texto_completo, re.IGNORECASE))
                if parcelas_endosso > 0:
                    dados["parcelas"] = str(parcelas_endosso)
                else:
                    dados["parcelas"] = "1"

            else:
                m_apolice = re.search(r"Nº\s*Proposta/Negócio:\s*(\d+)", texto_completo, re.IGNORECASE)
                if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

                m_venc = re.search(r"Vigência[^\d]*(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
                if m_venc: dados["vencimento"] = m_venc.group(1)

                m_seg = re.search(r"([A-Za-zÀ-ÿ\s]{3,50})\s+\d{3}\.\d{3}\.\d{3}-\d{2}", texto_completo)
                if m_seg: dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", m_seg.group(1).strip(), flags=re.IGNORECASE).strip()

                m_tel = re.search(r"\(?(\d{2})\)?\s*(9\d{4}[-\s]?\d{4})", texto_completo)
                if m_tel: dados["telefone"] = re.sub(r"[^\d]", "", m_tel.group(0))

                m_mod = re.search(r"(?:FORD|CHEVROLET|FIAT|VOLKSWAGEN|HYUNDAI|TOYOTA|HONDA|RENAULT|NISSAN|PEUGEOT|CITROEN|JEEP|MITSUBISHI)\s+[A-Za-zÀ-ÿ0-9\s\.\-]+?(?=\n\s*(?:Gasolina|Flex|Diesel|Alcool))", texto_completo, re.IGNORECASE)
                if m_mod: 
                    modelo_bruto = m_mod.group(0).strip()
                    dados["modelo_carro"] = re.sub(r"\s*(?:Combustível|Lotação|Zero KM|Código FIPE).*", "", modelo_bruto, flags=re.IGNORECASE).strip()

                m_pag = re.search(r"R\$\s*([\d\.]+,\d{2})\s+R\$\s*[\d\.]+,\d{2}\s+R\$\s*[\d\.]+,\d{2}\s+R\$\s*([\d\.]+,\d{2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{1,2})", texto_completo, re.IGNORECASE)
                if m_pag:
                    dados["premio_liquido"] = m_pag.group(1)
                    dados["premio_total"] = m_pag.group(2)
                    dados["forma_pagamento"] = m_pag.group(3).strip()
                    dados["parcelas"] = m_pag.group(4)

        # =======================================================
        # EXTRATOR CIRÚRGICO: ALLIANZ AUTO (Normal)
        # =======================================================
        elif dados["seguradora"] == "Allianz":
            m_apolice = re.search(r"(?:N[ºo\.]?\s*da\s*Proposta|Proposta\s*N[°º]?):\s*(\d+)", texto_completo, re.IGNORECASE)
            if m_apolice: dados["numero_apolice"] = m_apolice.group(1).strip()

            m_venc = re.search(r"Vigência[\s\S]{1,60}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
            if m_venc: dados["vencimento"] = m_venc.group(1)

            m_seg = re.search(r"Nome:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_seg: 
                nome_bruto = m_seg.group(1).strip()
                dados["segurado"] = re.sub(r"^(?:CNPJ|CPF)[\s\:\-\.]*", "", nome_bruto, flags=re.IGNORECASE).split('\n')[0].strip().upper()

            m_mod = re.search(r"Veículo:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
            if m_mod: dados["modelo_carro"] = m_mod.group(1).strip()

            m_liq = re.search(r"(?:Preço|Prêmio)\s*L[íi]quido[\s\S]{1,40}?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_liq: dados["premio_liquido"] = m_liq.group(1)

            m_tot = re.search(r"(?:Preço|Prêmio)\s*Total[\s\S]{1,60}?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
            if m_tot: dados["premio_total"] = m_tot.group(1)

            m_parc = re.search(r"em\s*(\d{1,2})\s*parcelas", texto_completo, re.IGNORECASE)
            if not m_parc: m_parc = re.search(r"Nº\s*de\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
            if m_parc: dados["parcelas"] = m_parc.group(1)

            m_fp = re.search(r"(Cartão\s*de\s*Crédito|Débito\s*em\s*conta|Boleto)", texto_completo, re.IGNORECASE)
            if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()

    except Exception as e:
        print(f"Erro ao aplicar Regex no arquivo {nome_arquivo}: {e}")

    # Fallback universal para vencimento
    if not dados["vencimento"]:
        m_univ_venc = re.search(r"(?:vigência|início)[\s\S]{1,50}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
        if m_univ_venc: dados["vencimento"] = m_univ_venc.group(1)

    # Limpeza do Vencimento (Apenas o Dia)
    if dados["vencimento"] and "/" in dados["vencimento"]:
        dados["vencimento"] = dados["vencimento"].split("/")[0].strip()

    # =======================================================
    # REGRA DE NEGÓCIO E DESVIO PARA ALLIANZ SEM PLACA
    # =======================================================
    if dados["placa"]:
        dados["observacoes"] = dados["modelo_carro"] if dados["modelo_carro"] else "Modelo não identificado"
    else:
        dados["placa"] = "" 
        
        if dados["seguradora"] == "Yelum Residência":
            dados["observacoes"] = "Seguro Residencial"
            
        elif dados["seguradora"] == "Allianz":
            if not dados["vencimento"]:
                m_venc_res = re.search(r"Vigência[\s\S]{1,60}?(\d{2}/\d{2}/\d{4})", texto_completo, re.IGNORECASE)
                if m_venc_res: dados["vencimento"] = m_venc_res.group(1).split("/")[0].strip()

            if re.search(r"Ramo:\s*14|RESIDÊNCIA|Residencial", texto_completo, re.IGNORECASE):
                dados["observacoes"] = "Seguro Residencial"
                if not dados["numero_apolice"]:
                    m_ap = re.search(r"Proposta\s*N[°º]?:\s*(\d+)", texto_completo, re.IGNORECASE)
                    if m_ap: dados["numero_apolice"] = m_ap.group(1).strip()
                m_liq = re.search(r"Preço\s*líquido:\s*R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_liq: dados["premio_liquido"] = m_liq.group(1)
                m_tot = re.search(r"Total\s*a\s*pagar[\s\S]{1,50}?R\$\s*([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_tot: dados["premio_total"] = m_tot.group(1)
                m_parc = re.search(r"em\s*(\d{1,2})\s*parcelas", texto_completo, re.IGNORECASE)
                if m_parc: dados["parcelas"] = m_parc.group(1)
                m_fp = re.search(r"(Débito\s*em\s*conta|Cartão\s*de\s*Crédito|Boleto)", texto_completo, re.IGNORECASE)
                if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
                
            elif re.search(r"Ramo:\s*18|Empresa\s*PME|Empresarial", texto_completo, re.IGNORECASE):
                dados["observacoes"] = "Seguro Empresarial"
                if not dados["numero_apolice"]:
                    m_ap = re.search(r"Nº\.?\s*da\s*Proposta:\s*(\d+)", texto_completo, re.IGNORECASE)
                    if m_ap: dados["numero_apolice"] = m_ap.group(1).strip()
                m_liq = re.search(r"Prêmio\s*Líquido[^\d]*?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_liq: dados["premio_liquido"] = m_liq.group(1)
                m_tot = re.search(r"Prêmio\s*Total[^\d]*?([\d\.]+,\d{2})", texto_completo, re.IGNORECASE)
                if m_tot: dados["premio_total"] = m_tot.group(1)
                m_parc = re.search(r"N[ºo]?\s*de\s*Parcelas:\s*(\d{1,2})", texto_completo, re.IGNORECASE)
                if m_parc: dados["parcelas"] = m_parc.group(1)
                m_fp = re.search(r"Forma\s*de\s*Pagamento:\s*([^\r\n]+)", texto_completo, re.IGNORECASE)
                if m_fp: dados["forma_pagamento"] = m_fp.group(1).strip()
            else:
                dados["observacoes"] = "Seguro Empresarial"
        else:
            dados["observacoes"] = "Seguro Empresarial"

    # =======================================================
    # REGRA GLOBAL DE ENDOSSO NO NOME DO ARQUIVO
    # =======================================================
    if "ENDOSSO" in nome_arquivo.upper():
        if dados["segurado"] and "ENDOSSO" not in dados["segurado"].upper():
            dados["segurado"] = f"{dados['segurado']} - ENDOSSO"

    # Montagem do campo pagamento
    if dados["parcelas"] and dados["forma_pagamento"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas - {dados['forma_pagamento']}"
    elif dados["parcelas"]:
        dados["pagamento"] = f"{dados['parcelas']} Parcelas"
    elif dados["forma_pagamento"]:
        dados["pagamento"] = f"{dados['forma_pagamento']}"

    return dados

# =======================================================
# FUNÇÃO DE ORDENAÇÃO NA PLANILHA
# =======================================================
def ordenar_planilha_por_vencimento(sheet):
    """
    Baixa os dados da planilha, ordena as linhas pelo Dia do Vencimento (Coluna A) 
    de forma numérica e reenvia para o Google Sheets.
    """
    todos_dados = sheet.get_all_values()
    
    # Se tiver apenas o cabeçalho ou estiver vazia, não há o que ordenar
    if len(todos_dados) <= 1:
        return

    cabecalho = todos_dados[0]
    linhas = todos_dados[1:]

    # Ordena com base na primeira coluna (índice 0). 
    # Usa zfill(2) para garantir que '5' fique antes de '10'. Linhas vazias vão para o final ("99")
    linhas.sort(key=lambda x: str(x[0]).zfill(2) if len(x) > 0 and str(x[0]).strip() else "99")

    # Envia os dados ordenados de volta para a planilha
    sheet.update(range_name=f"A1:M{len(todos_dados)}", values=[cabecalho] + linhas)
    print("Planilha ordenada com sucesso pelo Dia do Vencimento.")

# =======================================================
# FLUXO DE NUVEM (DRIVE -> SHEETS -> MOVE)
# =======================================================
def processar_fluxo():
    sheet = gc.open_by_key(SPREADSHEET_ID).worksheet("Apolices_Lidas")

    query = f"'{FOLDER_ENTRADA_ID}' in parents and mimeType='application/pdf' and trashed=false"
    results = drive_service.files().list(q=query, fields="files(id, name)").execute()
    arquivos = results.get("files", [])

    processou_algum = False

    for arq in arquivos:
        file_id = arq["id"]
        file_name = arq["name"]

        print(f"Processando arquivo: {file_name}")

        request = drive_service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()

        pdf_bytes = fh.getvalue()
        dados = extrair_dados_pdf(pdf_bytes, file_name)

        if not dados["segurado"]:
            print(f"⚠️ Aviso: Segurado não encontrado no arquivo {file_name}. Ignorado.")
            continue

        linha = [
            dados["vencimento"],           # A
            dados["numero_apolice"],       # B
            dados["segurado"],             # C
            dados["observacoes"],          # D
            dados["seguradora"],           # E
            dados["premio_total"],         # F
            dados["premio_liquido"],       # G
            dados["comissao"],             # H
            dados["comissao_pct"],         # I
            dados["placa"],                # J
            dados["email"],                # K
            dados["telefone"],             # L
            dados["pagamento"]             # M
        ]

        sheet.append_row(linha)
        processou_algum = True

        drive_service.files().update(
            fileId=file_id,
            addParents=FOLDER_PROCESSADOS_ID,
            removeParents=FOLDER_ENTRADA_ID,
            fields="id, parents"
        ).execute()

    # Só dispara a ordenação se alguma linha nova foi adicionada para poupar requisições da API
    if processou_algum:
        print("Ordenando os dados na planilha Google Sheets...")
        ordenar_planilha_por_vencimento(sheet)

if __name__ == "__main__":
    processar_fluxo()