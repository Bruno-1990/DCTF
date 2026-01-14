/**
 * Script para verificar e corrigir razões sociais dos clientes
 * Compara com lista fornecida e atualiza quando necessário
 */

// Carregar variáveis de ambiente
import * as dotenv from 'dotenv';
dotenv.config();

import { getConnection } from '../config/mysql';

interface ClienteCorrecao {
  id: string; // ID corresponde ao código SCI
  razaoSocialCorreta: string;
  cnpj: string;
}

// Lista fornecida pelo usuário
const clientesCorrecao: ClienteCorrecao[] = [
  { id: "1", razaoSocialCorreta: "A.C RAUPP SERVICOS ADMINISTRATIVOS", cnpj: "13.845.695/0001-54" },
  { id: "2", razaoSocialCorreta: "ACAI BRASIL INDUSTRIA E COMERCIO DE ALIMENTOS LTDA", cnpj: "11.318.082/0001-33" },
  { id: "3", razaoSocialCorreta: "ADRIA BRASIL IMPORTACAO E EXPORTACAO LTDA", cnpj: "07.799.121/0001-94" },
  { id: "4", razaoSocialCorreta: "ALPHADIGI BRASIL LTDA", cnpj: "05.218.070/0003-04" },
  { id: "13", razaoSocialCorreta: "BELA VISTA INDUSTRIA E COMERCIO DE PRE MOLDADOS LTDA EPP", cnpj: "01.031.119/0002-75" },
  { id: "14", razaoSocialCorreta: "BELA VISTA INDUSTRIA E COMERCIO DE PRE-MOLDADOS LTDA", cnpj: "01.031.119/0001-94" },
  { id: "15", razaoSocialCorreta: "BELL TEC TELECOMUNICACOES LTDA", cnpj: "16.632.622/0002-53" },
  { id: "16", razaoSocialCorreta: "BESSA OFFSHORE FABRICACAO MANUTENCAO & INSPECAO INDUSTRIAL LTDA", cnpj: "36.920.281/0001-48" },
  { id: "18", razaoSocialCorreta: "BIOMUNDO SERRA LTDA", cnpj: "33.521.689/0001-59" },
  { id: "19", razaoSocialCorreta: "BLR REPRESENTACOES LTDA", cnpj: "07.790.078/0001-04" },
  { id: "20", razaoSocialCorreta: "BLUEVIX COMERCIO E SERVICO LTDA", cnpj: "39.272.778/0003-57" },
  { id: "21", razaoSocialCorreta: "BLUEVIX COMERCIO E SERVICO LTDA", cnpj: "39.272.778/0001-95" },
  { id: "22", razaoSocialCorreta: "BORSOINETTO COMERCIO DE ARTEFATOS EM METAL LTDA", cnpj: "35.994.425/0001-48" },
  { id: "25", razaoSocialCorreta: "CARDPACK COMERCIO E SERVICO LTDA", cnpj: "39.247.001/0001-70" },
  { id: "27", razaoSocialCorreta: "CEGONHA TRANSPORTES E SERVICOS LTDA", cnpj: "12.376.888/0001-40" },
  { id: "29", razaoSocialCorreta: "CENTRAL CONTABIL LTDA", cnpj: "32.401.481/0001-33" },
  { id: "31", razaoSocialCorreta: "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD", cnpj: "03.597.050/0002-77" },
  { id: "32", razaoSocialCorreta: "Centro de Ensino Cachoeirense Darwin Ltda", cnpj: "03.597.050/0004-39" },
  { id: "33", razaoSocialCorreta: "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTDA", cnpj: "03.597.050/0001-96" },
  { id: "34", razaoSocialCorreta: "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD", cnpj: "03.597.050/0005-10" },
  { id: "35", razaoSocialCorreta: "CENTRO DE ENSINO CACHOEIRENSE DARWIN LTD", cnpj: "03.597.050/0003-58" },
  { id: "39", razaoSocialCorreta: "CLOSET COLLECTION CONFECCOES EIRELI", cnpj: "22.180.979/0001-60" },
  { id: "40", razaoSocialCorreta: "COMERCIAL LONDRINA LTDA", cnpj: "31.791.726/0001-13" },
  { id: "41", razaoSocialCorreta: "COMERCIAL LUF LTDA", cnpj: "00.212.745/0001-14" },
  { id: "42", razaoSocialCorreta: "COMUNICA ES LTDA", cnpj: "32.747.025/0001-40" },
  { id: "49", razaoSocialCorreta: "CURTUME SILVESTRE LTDA.", cnpj: "39.811.708/0001-68" },
  { id: "50", razaoSocialCorreta: "LOGFLOW LTDA", cnpj: "34.232.956/0001-30" },
  { id: "51", razaoSocialCorreta: "LOGFLOW LTDA", cnpj: "34.232.956/0002-11" },
  { id: "57", razaoSocialCorreta: "ESTACIONE ESTACIONAMENTOS LTDA", cnpj: "00.956.216/0001-25" },
  { id: "58", razaoSocialCorreta: "FAVORITA DO BRASIL MARMORES E GRANITOS LTDA", cnpj: "02.611.161/0001-47" },
  { id: "65", razaoSocialCorreta: "GELDEN EQUIPAMENTOS DE SEGURANCA LTDA", cnpj: "05.125.726/0002-55" },
  { id: "66", razaoSocialCorreta: "GELDEN EQUIPAMENTOS DE SEGURANCA LTDA", cnpj: "05.125.726/0001-74" },
  { id: "67", razaoSocialCorreta: "GERING CLIMATIZACOES LTDA", cnpj: "37.093.638/0001-24" },
  { id: "68", razaoSocialCorreta: "ELETRO MAQUINAS ATACADISTA LTDA", cnpj: "37.092.170/0001-53" },
  { id: "70", razaoSocialCorreta: "GS VIEIRA ADMINISTRACAO DE IMOVEIS LTDA", cnpj: "27.595.407/0001-65" },
  { id: "81", razaoSocialCorreta: "KERNEL IMPORTACAO E EXPORTACAO LTDA", cnpj: "39.311.386/0004-30" },
  { id: "82", razaoSocialCorreta: "KERNEL IMPORTACAO E EXPORTACAO LTDA", cnpj: "39.311.386/0001-98" },
  { id: "83", razaoSocialCorreta: "KNOW HOW IDIOMAS LTDA", cnpj: "07.720.801/0001-70" },
  { id: "84", razaoSocialCorreta: "L GERING ELETRICA E AR CONDICIONADO", cnpj: "17.250.123/0001-83" },
  { id: "85", razaoSocialCorreta: "L & L SERVICOS CONTABEIS LTDA", cnpj: "14.877.030/0001-95" },
  { id: "87", razaoSocialCorreta: "LANGUAGE IDIOMAS LTDA", cnpj: "10.203.600/0001-00" },
  { id: "88", razaoSocialCorreta: "LEAO SCHMIDT CURSOS DE IDIOMAS LTDA", cnpj: "08.248.961/0001-21" },
  { id: "89", razaoSocialCorreta: "LORENA GASPARINO EIRELI", cnpj: "29.948.844/0001-40" },
  { id: "92", razaoSocialCorreta: "LUF EMPREENDIMENTOS LTDA", cnpj: "14.661.519/0001-25" },
  { id: "93", razaoSocialCorreta: "M5 GESTAO LTDA", cnpj: "26.270.543/0001-12" },
  { id: "94", razaoSocialCorreta: "MARCIA SANTOS", cnpj: "10.788.657/0003-80" },
  { id: "96", razaoSocialCorreta: "MEMA ACESSORIOS E BIJUTERIAS LTDA", cnpj: "33.024.708/0001-31" },
  { id: "97", razaoSocialCorreta: "MILANEZ & FALQUETO LTDA", cnpj: "39.377.403/0001-90" },
  { id: "99", razaoSocialCorreta: "MR PARTICIPACOES LTDA", cnpj: "29.315.387/0001-57" },
  { id: "100", razaoSocialCorreta: "MUNDI IDIOMAS LTDA", cnpj: "10.198.105/0001-50" },
  { id: "101", razaoSocialCorreta: "MUSSO & DO VALE LTDA", cnpj: "27.185.211/0001-00" },
  { id: "102", razaoSocialCorreta: "ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA", cnpj: "07.550.459/0002-99" },
  { id: "103", razaoSocialCorreta: "ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA", cnpj: "07.550.459/0003-70" },
  { id: "104", razaoSocialCorreta: "ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA", cnpj: "07.550.459/0001-08" },
  { id: "108", razaoSocialCorreta: "PARANA GRANITOS LTDA", cnpj: "05.595.540/0001-89" },
  { id: "111", razaoSocialCorreta: "PEREIRA & AVILA ADVOGADOS ASSOCIADOS", cnpj: "22.796.449/0001-40" },
  { id: "113", razaoSocialCorreta: "POLYDOMUS INDUSTRIA E COMERCIO DE EMBALAGENS LTDA", cnpj: "27.226.935/0001-47" },
  { id: "114", razaoSocialCorreta: "POWER PRINT COMERCIO E SERVICOS EIRELI", cnpj: "23.234.705/0001-79" },
  { id: "116", razaoSocialCorreta: "PRADO DISTRIBUIDORA DE UTILIDADE DOMESTICA LTDA", cnpj: "34.647.606/0001-35" },
  { id: "117", razaoSocialCorreta: "PRE-MOLDADOS UNIDOS INDUSTRIA E COMERCIO LTDA", cnpj: "04.635.570/0001-09" },
  { id: "118", razaoSocialCorreta: "PREMIUM IDIOMAS LTDA", cnpj: "23.361.130/0001-55" },
  { id: "120", razaoSocialCorreta: "R. VIEIRA - NEGOCIOS IMOBILIARIOS, RURAIS E URBANOS LTDA", cnpj: "05.755.778/0001-24" },
  { id: "121", razaoSocialCorreta: "RAIO SOLDAS INSPECOES SS", cnpj: "39.785.589/0001-16" },
  { id: "125", razaoSocialCorreta: "ROTSEN COMERCIO DE COUROS E PLASTICOS LTDA", cnpj: "35.972.470/0001-00" },
  { id: "126", razaoSocialCorreta: "ROTSEN COMERCIO DE COUROS E PLASTICOS LTDA", cnpj: "35.972.470/0003-63" },
  { id: "128", razaoSocialCorreta: "SEA IDIOMAS LTDA", cnpj: "14.103.512/0001-98" },
  { id: "131", razaoSocialCorreta: "SILVIO REIS ANDREATTA Produtor Rural", cnpj: "054.434.657-24" },
  { id: "132", razaoSocialCorreta: "SOMA SERVICOS ADMINISTRATIVOS LTDA", cnpj: "32.663.680/0001-10" },
  { id: "138", razaoSocialCorreta: "TMT CONSTRUTORA LTDA", cnpj: "13.415.341/0001-70" },
  { id: "142", razaoSocialCorreta: "TRANSEGURO ES CORRETORA DE SEGUROS LTDA", cnpj: "16.750.366/0001-18" },
  { id: "144", razaoSocialCorreta: "UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA", cnpj: "30.691.293/0001-61" },
  { id: "151", razaoSocialCorreta: "AYKO TECNOLOGIA LTDA", cnpj: "05.805.349/0001-14" },
  { id: "153", razaoSocialCorreta: "VITORIA ON-LINE SERVICOS DE INTERNET EIRELI", cnpj: "10.338.682/0001-09" },
  { id: "155", razaoSocialCorreta: "VIXSELL COMERCIO E SERVICO LTDA", cnpj: "37.297.680/0001-67" },
  { id: "156", razaoSocialCorreta: "V. L. B. SERVICOS MEDICOS LTDA", cnpj: "36.243.022/0001-20" },
  { id: "158", razaoSocialCorreta: "ZORZAL GESTAO E TECNOLOGIA LTDA", cnpj: "24.203.997/0001-45" },
  { id: "159", razaoSocialCorreta: "ZORZAL TECNOLOGIA E GEST O LTDA", cnpj: "07.452.963/0001-75" },
  { id: "180", razaoSocialCorreta: "TRACTORBEL EQUIPAMENTOS LTDA", cnpj: "22.873.238/0004-07" },
  { id: "182", razaoSocialCorreta: "DLM SERVICO LTDA", cnpj: "41.496.504/0001-21" },
  { id: "185", razaoSocialCorreta: "LALA KIDS ALUGUEL E VENDA DE PRODUTOS INFANTIS LTDA", cnpj: "42.452.781/0001-03" },
  { id: "186", razaoSocialCorreta: "BRUMAN COMERCIO E SERVICOS DE MAQUINAS E EQUIPAMENTOS LTDA", cnpj: "09.471.676/0001-38" },
  { id: "192", razaoSocialCorreta: "ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA", cnpj: "07.550.459/0004-50" },
  { id: "195", razaoSocialCorreta: "ADISTEC BRASIL INFORMATICA LTDA", cnpj: "15.457.043/0002-59" },
  { id: "196", razaoSocialCorreta: "ADISTEC BRASIL INFORMATICA LTDA", cnpj: "15.457.043/0003-30" },
  { id: "198", razaoSocialCorreta: "BRUCON CONSTRU AO COMERCIO VAREJISTA DE MATERIAL DE CONSTRU AO LTDA", cnpj: "40.891.182/0001-52" },
  { id: "203", razaoSocialCorreta: "THG COMERCIO E DISTRIBUICAO DE ELETRONICOS E ELETRODOMESTICOS LTDA", cnpj: "44.490.805/0001-36" },
  { id: "210", razaoSocialCorreta: "SELF TECNOLOGIA COMERCIO E SERVICOS LTDA", cnpj: "21.181.115/0001-08" },
  { id: "211", razaoSocialCorreta: "WP COMPANY COMERCIO E SERVICOS TECNOLOGIA LTDA", cnpj: "30.393.954/0001-72" },
  { id: "214", razaoSocialCorreta: "SEBASTIAO PEDRO DE FREITAS", cnpj: "28.397.677/0001-24" },
  { id: "215", razaoSocialCorreta: "OPUS IMPORTACAO E COMERCIO DE EQUIPAMENTOS PARA MINERACAO LTDA", cnpj: "33.672.362/0001-88" },
  { id: "221", razaoSocialCorreta: "ACBL INFORMACOES LTDA", cnpj: "43.340.265/0001-41" },
  { id: "237", razaoSocialCorreta: "Prado Distribuidora de Utilidade Domestica Eireli", cnpj: "34.647.606/0002-16" },
  { id: "238", razaoSocialCorreta: "AJ PORT CONSULTORIA LTDA", cnpj: "47.306.185/0001-20" },
  { id: "242", razaoSocialCorreta: "COMERCIAL CT DISTRIBUIDORA LTDA ME", cnpj: "08.843.636/0002-98" },
  { id: "247", razaoSocialCorreta: "ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRU AO LTDA", cnpj: "07.550.459/0005-31" },
  { id: "248", razaoSocialCorreta: "BROTHERS MARMORES E GRANITOS LTDA", cnpj: "11.863.124/0001-17" },
  { id: "257", razaoSocialCorreta: "ELESSANDRA ANDREATTA EWALD Produtor Rural", cnpj: "077.925.437-65" },
  { id: "258", razaoSocialCorreta: "BRIZZ VIX LTDA EPP", cnpj: "49.329.645/0001-61" },
  { id: "259", razaoSocialCorreta: "SOMAR EMPREENDIMENTOS LTDA", cnpj: "49.413.110/0001-74" },
  { id: "260", razaoSocialCorreta: "Wp Company Comercio e Servicos Tecnologia Ltda", cnpj: "30.393.954/0002-53" },
  { id: "261", razaoSocialCorreta: "THG COMERCIO E DISTRIBUI O DE ELETRONICOS E ELETRODOMESTICOS LTDA", cnpj: "44.490.805/0002-17" },
  { id: "265", razaoSocialCorreta: "RESTAURANTE SALSA LTDA", cnpj: "50.116.869/0001-74" },
  { id: "268", razaoSocialCorreta: "PALACE PARTICIPACOES LTDA", cnpj: "46.528.859/0001-79" },
  { id: "271", razaoSocialCorreta: "Up Log Solucoes em Armazens e Logistica Ltda", cnpj: "30.691.293/0003-23" },
  { id: "272", razaoSocialCorreta: "Wp Company Comercio e Servicos Tecnologia Ltda", cnpj: "30.393.954/0003-34" },
  { id: "273", razaoSocialCorreta: "DARWIN CAPIXABA EDITORA LTDA", cnpj: "50.599.076/0001-53" },
  { id: "274", razaoSocialCorreta: "RIZZO COMERCIO DE ROUPAS E ACESSORIOS DE PESCA LTDA", cnpj: "40.142.610/0001-44" },
  { id: "275", razaoSocialCorreta: "BROTHERS MARMORES E GRANITOS LTDA", cnpj: "11.863.124/0003-89" },
  { id: "276", razaoSocialCorreta: "LMD PARTICIPACOES LTDA", cnpj: "46.080.536/0001-65" },
  { id: "277", razaoSocialCorreta: "N J W DUNFORD CONSULTORIA", cnpj: "51.888.058/0001-54" },
  { id: "278", razaoSocialCorreta: "ZEGBOX INDUSTRIA E COMERCIO DE EMBALAGENS LTDA", cnpj: "52.945.020/0001-39" },
  { id: "285", razaoSocialCorreta: "ATENTO GESTAO EM RISCOS E PRODUTIVIDADE LTDA", cnpj: "31.332.375/0001-82" },
  { id: "286", razaoSocialCorreta: "BOX 027 VAREJO DIGITAL LTDA", cnpj: "41.697.567/0001-46" },
  { id: "287", razaoSocialCorreta: "GLOBALSYS SOLUCOES EMPRESARIAIS LTDA", cnpj: "09.389.871/0001-13" },
  { id: "288", razaoSocialCorreta: "MAXPARTNER OUTSOURCING E SERVICOS EM TECNOLOGIA DA INFORMACAO LTDA", cnpj: "33.902.626/0001-42" },
  { id: "289", razaoSocialCorreta: "HOUSE027 INNOVATIVE TECHNOLOGY LTDA", cnpj: "38.711.960/0001-32" },
  { id: "290", razaoSocialCorreta: "GLOBALSYS IT SERVICES LTDA", cnpj: "20.357.765/0001-90" },
  { id: "291", razaoSocialCorreta: "BOX 027 VAREJO DIGITAL LTDA", cnpj: "41.697.567/0002-27" },
  { id: "294", razaoSocialCorreta: "FORMASET INDUSTRIAL LTDA", cnpj: "35.957.760/0001-76" },
  { id: "295", razaoSocialCorreta: "FORMASET PROM COM E IND LTDA EPP", cnpj: "13.257.776/0001-33" },
  { id: "296", razaoSocialCorreta: "HQUIMICA EQUIPAMENTOS E PRODUTOS QUIMICOS LTDA - EPP", cnpj: "05.671.199/0001-01" },
  { id: "297", razaoSocialCorreta: "HIDROQUIMICA TRATAMENTO DE AGUA LTDA", cnpj: "03.395.868/0001-26" },
  { id: "298", razaoSocialCorreta: "JERLAU TECNOLOGIA LTDA", cnpj: "29.080.304/0001-98" },
  { id: "299", razaoSocialCorreta: "K&K IDIOMAS LTDA", cnpj: "50.960.727/0001-99" },
  { id: "301", razaoSocialCorreta: "ARAME NOBRE INDUSTRIA E COMERCIO LTDA", cnpj: "36.578.434/0001-10" },
  { id: "303", razaoSocialCorreta: "SERRAFER SERRA FERRAMENTAS LTDA EPP", cnpj: "04.223.906/0001-26" },
  { id: "304", razaoSocialCorreta: "SVIT MARKETING LTDA", cnpj: "54.837.674/0001-74" },
  { id: "305", razaoSocialCorreta: "PONTUAL MEDIC IMPORTACAO, EXPORTACAO E DISTRIBUICAO LTDA", cnpj: "44.612.586/0002-00" },
  { id: "308", razaoSocialCorreta: "PREST SERV EMPREENDIMENTOS E PARTICIPACOES LTDA", cnpj: "55.402.354/0001-54" },
  { id: "313", razaoSocialCorreta: "H PASSOS LTDA", cnpj: "55.371.144/0001-46" },
  { id: "314", razaoSocialCorreta: "RAIO SOLDAS INSPECOES S/S", cnpj: "39.785.589/0003-88" },
  { id: "315", razaoSocialCorreta: "OPUS IMPORTACAO E COMERCIO DE EQUIPAMENTOS PARA MINERACAO LTDA", cnpj: "33.672.362/0002-69" },
  { id: "316", razaoSocialCorreta: "H.G. RAUPP COMERCIAL S.A", cnpj: "00.490.732/0005-30" },
  { id: "317", razaoSocialCorreta: "LINHARES EPI LTDA", cnpj: "56.158.080/0001-62" },
  { id: "320", razaoSocialCorreta: "ILHA DAS FERRAMENTAS COMERCIO VAREJISTA LTDA", cnpj: "41.424.561/0001-03" },
  { id: "322", razaoSocialCorreta: "JULIA MUNHAO LTDA", cnpj: "56.938.284/0001-16" },
  { id: "324", razaoSocialCorreta: "AYKO HOLDING E PARTICIPACOES LTDA", cnpj: "41.004.473/0001-44" },
  { id: "326", razaoSocialCorreta: "BOX 027 VAREJO DIGITAL LTDA", cnpj: "41.697.567/0003-08" },
  { id: "327", razaoSocialCorreta: "LOGFLOW LTDA", cnpj: "34.232.956/0003-00" },
  { id: "328", razaoSocialCorreta: "CUSTOM BOX LTDA", cnpj: "30.064.795/0001-62" },
  { id: "329", razaoSocialCorreta: "CUSTOM BOX LTDA", cnpj: "30.064.795/0002-43" },
  { id: "330", razaoSocialCorreta: "TELABRASIL INDUSTRIA E COMERCIO LTDA", cnpj: "21.572.757/0001-20" },
  { id: "331", razaoSocialCorreta: "DRAGON ALVES ENGENHARIA LTDA", cnpj: "57.887.103/0001-32" },
  { id: "332", razaoSocialCorreta: "CUSTOM BOX LTDA", cnpj: "30.064.795/0003-24" },
  { id: "333", razaoSocialCorreta: "BRIZZ BAR LTDA", cnpj: "58.458.127/0001-39" },
  { id: "334", razaoSocialCorreta: "DOCE DOCE COMO MEL SORVETES LTDA", cnpj: "47.420.673/0001-64" },
  { id: "335", razaoSocialCorreta: "FAZENDA BOA SORTE COMERCIO DE TECIDOS LTDA", cnpj: "35.112.700/0001-52" },
  { id: "336", razaoSocialCorreta: "FRANCA COMERCIO DE TECIDOS E CONFECCOES LTDA", cnpj: "16.858.996/0001-00" },
  { id: "337", razaoSocialCorreta: "LUCIENE TECIDOS E CONFECCOES LTDA ME", cnpj: "10.999.030/0001-07" },
  { id: "338", razaoSocialCorreta: "LECAPE COMERCIO DE TECIDOS E CONFECCOES LTDA", cnpj: "18.715.515/0001-33" },
  { id: "339", razaoSocialCorreta: "LUIGI SERRA DOURADA 2 LTDA", cnpj: "50.485.794/0001-07" },
  { id: "340", razaoSocialCorreta: "FRANCA COMERCIO DE TECIDOS E CONFECCOES LTDA", cnpj: "16.858.996/0002-91" },
  { id: "341", razaoSocialCorreta: "G DISTRIBUICAO E COMERCIO DE PRODUTOS LTDA", cnpj: "39.336.716/0001-08" },
  { id: "342", razaoSocialCorreta: "G DISTRIBUICAO E COMERCIO DE PRODUTOS LTDA", cnpj: "39.336.716/0002-80" },
  { id: "343", razaoSocialCorreta: "G DISTRIBUICAO E COMERCIO DE PRODUTOS LTDA", cnpj: "39.336.716/0003-61" },
  { id: "344", razaoSocialCorreta: "FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA", cnpj: "33.247.450/0001-32" },
  { id: "345", razaoSocialCorreta: "FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA", cnpj: "33.247.450/0002-13" },
  { id: "346", razaoSocialCorreta: "FULL SERVICE ECOM COMERCIO E LOGISTICA EIRELI", cnpj: "33.247.450/0003-02" },
  { id: "347", razaoSocialCorreta: "FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA", cnpj: "33.247.450/0006-47" },
  { id: "348", razaoSocialCorreta: "FULL SERVICE ECOM COMERCIO E LOGISTICA LTDA", cnpj: "33.247.450/0007-28" },
  { id: "349", razaoSocialCorreta: "METALTELAS INDUSTRIA LTDA. EPP", cnpj: "13.841.087/0001-71" },
  { id: "350", razaoSocialCorreta: "TELAMBRADO IND E COM DE TELAS LTDA ME", cnpj: "31.487.853/0001-23" },
  { id: "351", razaoSocialCorreta: "TELAMBRADO IND E COM DE TELAS LTDA ME", cnpj: "31.487.853/0003-95" },
  { id: "352", razaoSocialCorreta: "JR ATACADO DE ACESSORIOS LTDA", cnpj: "49.994.344/0001-52" },
  { id: "353", razaoSocialCorreta: "RECICLABEM METAIS LTDA", cnpj: "27.930.220/0001-70" },
  { id: "354", razaoSocialCorreta: "ELETRO MAQUINAS ATACADISTA LTDA", cnpj: "37.092.170/0002-34" },
  { id: "355", razaoSocialCorreta: "ORIONES DISTRIBUIDORA DE MATERIAL DE CONSTRUCAO LTDA", cnpj: "07.550.459/0006-12" },
  { id: "356", razaoSocialCorreta: "FULL SOLUTIONS COMERCIO EQUIPAMENTOS INDUSTRIAIS LTDA", cnpj: "33.249.391/0001-31" },
  { id: "357", razaoSocialCorreta: "FULL SOLUTIONS COMERCIO EQUIPAMENTOS INDUSTRIAIS LTDA", cnpj: "33.249.391/0002-12" },
  { id: "358", razaoSocialCorreta: "OPEX TRANSPORTES LTDA", cnpj: "13.792.474/0001-65" },
  { id: "359", razaoSocialCorreta: "ARAUCARIA SERVICOS LTDA", cnpj: "42.532.281/0001-73" },
  { id: "360", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0002-70" },
  { id: "361", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0004-32" },
  { id: "362", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0008-66" },
  { id: "363", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0010-80" },
  { id: "364", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0011-61" },
  { id: "365", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0012-42" },
  { id: "366", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0013-23" },
  { id: "367", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0014-04" },
  { id: "368", razaoSocialCorreta: "OURO PRETO EXPLOSIVOS LTDA", cnpj: "02.184.341/0015-95" },
  { id: "371", razaoSocialCorreta: "FOKUS BRASIL SINALIZACAO VIARIA LTDA", cnpj: "05.534.501/0002-52" },
  { id: "372", razaoSocialCorreta: "BRILUZ.ON COMERCIO LTDA", cnpj: "55.675.547/0002-60" },
  { id: "373", razaoSocialCorreta: "BRILUZ.ON COMERCIO LTDA", cnpj: "55.675.547/0001-89" },
  { id: "374", razaoSocialCorreta: "PRIMETEK LTDA", cnpj: "59.000.165/0001-06" },
  { id: "375", razaoSocialCorreta: "PRIMETEK LTDA", cnpj: "59.000.165/0002-97" },
  { id: "376", razaoSocialCorreta: "MAQUIL MAQUINAS E FERRAMENTAS LTDA", cnpj: "01.561.647/0001-55" },
  { id: "377", razaoSocialCorreta: "BR MAQUIL DISTRIBUIDORA DE MAQUINAS E FERRAMENTAS EIRELI", cnpj: "07.615.692/0001-21" },
  { id: "378", razaoSocialCorreta: "LETFER MAQUINAS E FERRAMENTAS LTDA", cnpj: "48.093.989/0001-51" },
  { id: "379", razaoSocialCorreta: "ZENITH GESTAO EMPRESARIAL LTDA", cnpj: "59.267.356/0001-39" },
  { id: "380", razaoSocialCorreta: "AURORA INFORMATICA COMERCIO IMPORTACAO E EXPORTACAO LTDA", cnpj: "59.160.869/0001-46" },
  { id: "382", razaoSocialCorreta: "INTERPRIME TELECOMUNICACOES LTDA", cnpj: "08.988.238/0001-89" },
  { id: "383", razaoSocialCorreta: "LMS - LAST MILE SERVICES LTDA", cnpj: "11.095.146/0001-84" },
  { id: "384", razaoSocialCorreta: "NUV REDE NEUTRA DE TELECOMUNICACOES LTDA", cnpj: "15.386.439/0001-71" },
  { id: "385", razaoSocialCorreta: "ON SERVICOS DE INTERNET TELECON LTDA", cnpj: "43.556.334/0001-59" },
  { id: "386", razaoSocialCorreta: "MP INFORMATICA TELECOM EIRELI - ME", cnpj: "07.793.479/0001-00" },
  { id: "387", razaoSocialCorreta: "OSI PARTICIPACOES LTDA", cnpj: "05.285.270/0001-00" },
  { id: "388", razaoSocialCorreta: "OPT OPERACOES TELECOM LTDA", cnpj: "17.333.994/0001-60" },
  { id: "389", razaoSocialCorreta: "VLA TELECOMUNICA ES LTDA", cnpj: "09.104.418/0001-13" },
  { id: "390", razaoSocialCorreta: "VOE TELECOMUNICA ES LTDA", cnpj: "22.542.368/0001-14" },
  { id: "391", razaoSocialCorreta: "ZAD COMUNICA LTDA", cnpj: "34.263.516/0001-40" },
  { id: "392", razaoSocialCorreta: "NY RESTAURANTES LTDA", cnpj: "36.082.397/0001-55" },
  { id: "393", razaoSocialCorreta: "SIFRA CONSULTORIA E REPRESENTACAO LTDA", cnpj: "13.785.672/0001-00" },
  { id: "394", razaoSocialCorreta: "NY RESTAURANTES LTDA", cnpj: "36.082.397/0002-36" },
  { id: "395", razaoSocialCorreta: "FULL SOLUTIONS COMERCIO EQUIPAMENTOS INDUSTRIAIS LTDA", cnpj: "33.249.391/0003-01" },
  { id: "396", razaoSocialCorreta: "A G A P LTDA", cnpj: "42.081.159/0001-28" },
  { id: "397", razaoSocialCorreta: "ZENA LRF TRADING LTDA", cnpj: "59.580.750/0001-22" },
  { id: "398", razaoSocialCorreta: "PARIS GUERZET E AZEVEDO ADVOGADOS", cnpj: "29.236.102/0001-92" },
  { id: "399", razaoSocialCorreta: "COLABORAR COMERCIO DE PRODUTOS ELETRONICOS LTDA", cnpj: "08.758.638/0002-89" },
  { id: "400", razaoSocialCorreta: "CENTRO VETERINARIO LUA E FREDDO LTDA ME", cnpj: "21.706.378/0001-85" },
  { id: "402", razaoSocialCorreta: "UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA", cnpj: "30.691.293/0004-04" },
  { id: "403", razaoSocialCorreta: "VIX LONAS LTDA", cnpj: "61.215.139/0001-47" },
  { id: "404", razaoSocialCorreta: "EDLOC LOCACOES E COMERCIO LTDA", cnpj: "31.007.558/0005-56" },
  { id: "405", razaoSocialCorreta: "LEVANTI MAQUINAS E FERRAMENTAS LTDA", cnpj: "35.060.827/0001-75" },
  { id: "406", razaoSocialCorreta: "CEMA HOLDING E PARTICIPACOES LTDA", cnpj: "58.277.834/0001-29" },
  { id: "407", razaoSocialCorreta: "FRATTA HOLDING E PARTICIPACOES LTDA", cnpj: "58.050.244/0001-69" },
  { id: "408", razaoSocialCorreta: "LIDERANCA HOLDING E PARTICIPACOES LTDA", cnpj: "58.071.976/0001-35" },
  { id: "409", razaoSocialCorreta: "HEBROM HOLDING E PARTICIPACOES LTDA", cnpj: "59.161.203/0001-02" },
  { id: "410", razaoSocialCorreta: "NUV REDE NEUTRA DE TELECOMUNICACOES LTDA", cnpj: "15.386.439/0002-52" },
  { id: "411", razaoSocialCorreta: "PRIMETEK LTDA", cnpj: "59.000.165/0003-78" },
  { id: "412", razaoSocialCorreta: "VITAVET-ES DISTRIBUIDORA LTDA", cnpj: "62.771.089/0001-47" },
  { id: "413", razaoSocialCorreta: "CERDTECH DESENVOLVIMENTO LTDA", cnpj: "63.119.645/0001-68" },
  { id: "414", razaoSocialCorreta: "INTERATELL INTEGRACOES E TELECOMUNICACOES LTDA", cnpj: "03.969.530/0002-11" },
  { id: "415", razaoSocialCorreta: "ARCANA DESIGN LTDA", cnpj: "63.231.837/0001-61" },
  { id: "416", razaoSocialCorreta: "CINCO ESTRELAS CONST E INCORP EIRELI", cnpj: "30.686.869/0001-00" },
  { id: "417", razaoSocialCorreta: "CONSORCIO CONSERVA-VITORIA", cnpj: "48.401.933/0001-17" },
  { id: "418", razaoSocialCorreta: "FLORESTAL CONSULTORIA LTDA", cnpj: "43.093.465/0001-47" },
  { id: "419", razaoSocialCorreta: "FLORESTAL CONSULTORIA LTDA", cnpj: "43.093.465/0002-28" },
  { id: "420", razaoSocialCorreta: "UP LOG SOLUCOES EM ARMAZENS E LOGISTICA LTDA", cnpj: "30.691.293/0005-95" },
  { id: "421", razaoSocialCorreta: "JL INVESTIMENTOS E PARTICIPACOES LTDA", cnpj: "63.849.438/0001-69" },
  { id: "422", razaoSocialCorreta: "GNEXUM PLATFORM LTDA", cnpj: "55.399.279/0001-10" },
  { id: "423", razaoSocialCorreta: "TENAX DO BRASIL LTDA", cnpj: "03.080.722/0001-91" },
  { id: "424", razaoSocialCorreta: "TENAX DO BRASIL LTDA", cnpj: "03.080.722/0002-72" },
  { id: "425", razaoSocialCorreta: "TENAX DO BRASIL LTDA", cnpj: "03.080.722/0004-34" },
];

/**
 * Normaliza CNPJ removendo formatação
 */
function normalizarCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

/**
 * Normaliza razão social para comparação (remove espaços extras, converte para maiúsculas)
 */
function normalizarRazaoSocial(razao: string): string {
  return razao.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Compara duas razões sociais (considera variações de maiúsculas/minúsculas e espaços)
 */
function razoesSaoDiferentes(razaoAtual: string, razaoCorreta: string): boolean {
  const atualNormalizada = normalizarRazaoSocial(razaoAtual);
  const corretaNormalizada = normalizarRazaoSocial(razaoCorreta);
  return atualNormalizada !== corretaNormalizada;
}

async function main() {
  console.log('🔍 Verificando e corrigindo razões sociais dos clientes...\n');
  console.log(`📋 Total de clientes para verificar: ${clientesCorrecao.length}\n`);

  const connection = await getConnection();

  try {
    let totalVerificados = 0;
    let totalEncontrados = 0;
    let totalAtualizados = 0;
    let totalNaoEncontrados = 0;
    let totalJaCorretos = 0;
    let totalCodigoSciAtualizados = 0;
    const erros: Array<{ id: string; cnpj: string; erro: string }> = [];
    const cnpjsNaoEncontrados: Array<{ id: string; razaoSocial: string; cnpj: string }> = [];

    for (const clienteCorrecao of clientesCorrecao) {
      totalVerificados++;
      const cnpjLimpo = normalizarCNPJ(clienteCorrecao.cnpj);

      try {
        // Buscar cliente por CNPJ
        const [clientes] = await connection.execute(
          `SELECT id, razao_social, cnpj_limpo, codigo_sci 
           FROM clientes 
           WHERE cnpj_limpo = ? 
           LIMIT 1`,
          [cnpjLimpo]
        );

        const clientesArray = clientes as any[];

        if (clientesArray.length === 0) {
          totalNaoEncontrados++;
          cnpjsNaoEncontrados.push({
            id: clienteCorrecao.id,
            razaoSocial: clienteCorrecao.razaoSocialCorreta,
            cnpj: clienteCorrecao.cnpj
          });
          console.log(`❌ [${clienteCorrecao.id}] CNPJ ${clienteCorrecao.cnpj} não encontrado no banco`);
          continue;
        }

        totalEncontrados++;
        const cliente = clientesArray[0];
        const razaoSocialAtual = cliente.razao_social || '';
        const codigoSciAtual = cliente.codigo_sci ? String(cliente.codigo_sci) : null;
        const codigoSciCorreto = clienteCorrecao.id;

        // Verificar se precisa atualizar razão social
        const precisaAtualizarRazao = razoesSaoDiferentes(razaoSocialAtual, clienteCorrecao.razaoSocialCorreta);
        
        // Verificar se precisa atualizar código SCI
        const precisaAtualizarCodigoSci = codigoSciAtual !== codigoSciCorreto;

        if (!precisaAtualizarRazao && !precisaAtualizarCodigoSci) {
          totalJaCorretos++;
          console.log(`✓ [${clienteCorrecao.id}] ${clienteCorrecao.razaoSocialCorreta.substring(0, 50)}... - Já está correto`);
          continue;
        }

        // Preparar atualizações
        const updates: string[] = [];
        const valores: any[] = [];

        if (precisaAtualizarRazao) {
          updates.push('razao_social = ?');
          valores.push(clienteCorrecao.razaoSocialCorreta);
        }

        if (precisaAtualizarCodigoSci) {
          updates.push('codigo_sci = ?');
          valores.push(codigoSciCorreto);
        }

        updates.push('updated_at = NOW()');
        valores.push(cliente.id);

        // Atualizar
        await connection.execute(
          `UPDATE clientes 
           SET ${updates.join(', ')} 
           WHERE id = ?`,
          valores
        );

        if (precisaAtualizarRazao) {
          totalAtualizados++;
        }
        if (precisaAtualizarCodigoSci) {
          totalCodigoSciAtualizados++;
        }

        console.log(`✅ [${clienteCorrecao.id}] ATUALIZADO:`);
        console.log(`   CNPJ: ${clienteCorrecao.cnpj}`);
        
        if (precisaAtualizarRazao) {
          console.log(`   RAZÃO SOCIAL:`);
          console.log(`     ANTES: ${razaoSocialAtual.substring(0, 80)}...`);
          console.log(`     DEPOIS: ${clienteCorrecao.razaoSocialCorreta.substring(0, 80)}...`);
        }
        
        if (precisaAtualizarCodigoSci) {
          console.log(`   CÓDIGO SCI:`);
          console.log(`     ANTES: ${codigoSciAtual || 'NULL'}`);
          console.log(`     DEPOIS: ${codigoSciCorreto}`);
        }
        
        console.log('');

      } catch (error: any) {
        erros.push({
          id: clienteCorrecao.id,
          cnpj: clienteCorrecao.cnpj,
          erro: error.message || String(error)
        });
        console.error(`❌ [${clienteCorrecao.id}] Erro ao processar CNPJ ${clienteCorrecao.cnpj}:`, error.message);
      }
    }

    // Relatório final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RELATÓRIO FINAL\n');
    console.log(`Total verificados: ${totalVerificados}`);
    console.log(`Total encontrados: ${totalEncontrados}`);
    console.log(`Total atualizados (razão social): ${totalAtualizados}`);
    console.log(`Total atualizados (código SCI): ${totalCodigoSciAtualizados}`);
    console.log(`Total já corretos: ${totalJaCorretos}`);
    console.log(`Total não encontrados: ${totalNaoEncontrados}`);
    console.log(`Total erros: ${erros.length}`);

    if (erros.length > 0) {
      console.log('\n❌ ERROS ENCONTRADOS:\n');
      erros.forEach(erro => {
        console.log(`  - ID ${erro.id} (CNPJ: ${erro.cnpj}): ${erro.erro}`);
      });
    }

    if (cnpjsNaoEncontrados.length > 0) {
      console.log('\n⚠️  CNPJs NÃO ENCONTRADOS NO BANCO DE DADOS:\n');
      cnpjsNaoEncontrados.forEach(item => {
        console.log(`  - ID: ${item.id} | CNPJ: ${item.cnpj} | Razão Social: ${item.razaoSocial.substring(0, 60)}...`);
      });
      console.log('\n   Verifique se os CNPJs estão corretos ou se os registros foram removidos.');
    }

  } catch (error: any) {
    console.error('❌ Erro geral:', error);
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .then(() => {
    console.log('\n✅ Verificação e correção concluídas!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar verificação:', error);
    process.exit(1);
  });

