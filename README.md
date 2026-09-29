# Campanhas promocionais — Landing Pages + CRM no Google Sheets

Cinco landing pages de promoções da clínica, com captura de leads direto numa planilha do Google Sheets que funciona como CRM e dashboard.

```
Visitante → Landing page ──(acesso + formulário)──► Google Apps Script ──► Planilha
                                                                         ├─ Dashboard  (indicadores e gráficos)
                                                                         ├─ Leads      (CRM: Contato → Resgatar → Agendado → Falhou / Concluído)
                                                                         ├─ Acessos    (1 linha por visita)
                                                                         └─ LPs        (cadastro das LPs e investimento)
```

## O que tem aqui

| Caminho | O que é |
|---|---|
| `lp/limpeza-de-pele/` | LP · Limpeza de Pele Profunda |
| `lp/depilacao-laser/` | LP · Depilação a Laser |
| `lp/harmonizacao-facial/` | LP · Avaliação de Harmonização Facial |
| `lp/drenagem-linfatica/` | LP · Drenagem Linfática |
| `lp/tratamento-manchas/` | LP · Tratamento para Manchas |
| `assets/css/lp.css` | Visual compartilhado (cada LP tem sua cor no `<body>`) |
| `assets/js/config.js` | **Único arquivo de configuração**: URL da planilha, GA4, Pixel da Meta |
| `assets/js/lp.js` | Rastreamento de acesso/UTM e envio do formulário |
| `apps-script/Code.gs` | Script da planilha: recebe os dados, monta CRM e dashboard |
| `index.html` | Atalhos internos para as LPs (fora do Google) |
| `privacidade.html` | Política de privacidade (texto-base LGPD) |

Tudo é HTML estático: sem build, sem dependências. Funciona no GitHub Pages, Netlify, Vercel, Hostinger ou qualquer hospedagem.

---

## 1. Criar a planilha (10 minutos, uma vez só)

1. Abra [sheets.new](https://sheets.new) e dê um nome, por exemplo **CRM Landing Pages**.
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo do arquivo `Código.gs` e cole todo o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs). Salve (Ctrl+S).
4. No topo do editor, escolha a função **`setup`** e clique em **Executar**. Autorize o acesso quando o Google pedir (é o seu próprio script).
5. Volte para a planilha: as abas **Dashboard, Leads, Acessos e LPs** estarão prontas, e aparece o menu **CRM LPs**.

## 2. Publicar o receptor de leads

1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Engrenagem → tipo **App da Web**.
3. **Executar como:** Eu · **Quem pode acessar:** Qualquer pessoa.
4. **Implantar** e copie a URL que termina em `/exec`.
5. Cole a URL em [`assets/js/config.js`](assets/js/config.js), no campo `endpoint`.

Para conferir: abrir a URL `/exec` no navegador deve mostrar `{"ok":true,...}`.
Para testar sem a LP: menu **CRM LPs → Inserir lead e acesso de teste** (depois apague as linhas de teste).

> Alterou o `Code.gs` depois? Use **Implantar → Gerenciar implantações → Editar (lápis) → Versão: Nova versão**. Assim a URL continua a mesma.

## 3. Personalizar as LPs

Antes de divulgar, troque os textos de exemplo:

- **"Sua Clínica"**: use "Localizar e substituir" em todos os arquivos `.html`.
- **Rodapé**: endereço, telefone e responsável técnico (nome e registro no conselho) em cada LP.
- **Preços e ofertas**: bloco `class="preco"` de cada LP (os valores atuais são exemplos).
- **Validade**: "Condição válida até 31/10" (topo) e "31/10/2026" (rodapé).
- **Cor**: `--accent` e `--accent-soft` no `<body>` de cada LP.
- **`privacidade.html`**: CNPJ, endereço e e-mail do responsável pelos dados.

> Publicidade na área da saúde segue regras dos conselhos (CFM, CFO, CFBM, COFFITO…). Revise os textos com o responsável técnico: nada de promessa de resultado, e fotos de antes/depois só dentro do que o conselho permite.

### Criar uma LP nova

1. Copie uma pasta de `lp/` com um novo nome, por exemplo `lp/microagulhamento/`.
2. No `<body>`, troque `data-lp="..."` para `microagulhamento`.
3. Na planilha, aba **LPs**, adicione uma linha com o ID `microagulhamento` e o nome.
4. Menu **CRM LPs → Atualizar dashboard**. (O dashboard mostra até 8 LPs.)

## 4. Publicar no GitHub Pages

1. No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, branch principal, pasta `/ (root)`.
2. As LPs ficam em `https://SEU-USUARIO.github.io/NOME-DO-REPO/lp/limpeza-de-pele/`.
3. Domínio próprio: **Settings → Pages → Custom domain**.

## 5. Divulgar com UTMs (essencial para saber de onde vem cada lead)

Sempre divulgue o link com parâmetros de campanha. Exemplos:

```
.../lp/limpeza-de-pele/?utm_source=instagram&utm_medium=pago&utm_campaign=limpeza-out26
.../lp/limpeza-de-pele/?utm_source=instagram&utm_medium=bio&utm_campaign=limpeza-out26
.../lp/depilacao-laser/?utm_source=google&utm_medium=cpc&utm_campaign=laser-out26
.../lp/drenagem-linfatica/?utm_source=whatsapp&utm_medium=lista&utm_campaign=drenagem-out26
```

- `utm_source` vira a coluna **Origem** e a tabela "Leads por origem" do dashboard.
- Sem UTM, a origem é deduzida do site anterior (google, instagram…) ou fica como `direto`.
- A campanha fica guardada por 30 dias no navegador da pessoa: se ela voltar depois digitando o endereço, o lead ainda é atribuído à campanha certa.

Opcional: preencha `ga4` e/ou `metaPixel` no `config.js` para registrar o evento de conversão **Lead** no Google Analytics e na Meta.

---

## Como usar o CRM (aba Leads)

Cada formulário enviado vira uma linha com status **Contato**. A equipe atualiza o status na coluna roxa:

| Status | Quando usar | O que preencher |
|---|---|---|
| **Contato** | Lead novo, ainda sem primeiro contato | — |
| **Resgatar** | Não respondeu, sumiu ou pediu para falar depois | Observações |
| **Agendado** | Horário marcado | Agendado para |
| **Falhou** | Sem interesse, desistiu ou número inválido | Observações (motivo) |
| **Concluído** | Realizou o procedimento | Valor (R$) |

- O número de WhatsApp é um link: um clique abre a conversa.
- **ID e Entrada ficam vermelhos** quando o lead está em Contato há mais de 24 horas.
- **Atualizado em** é preenchido sozinho quando alguém mexe em Status, Responsável, Agendado para, Valor ou Observações.
- **Repetido** mostra o ID do lead anterior com o mesmo WhatsApp.
- Colunas cinza (Origem, Campanha, Página…) são automáticas; não precisa mexer.
- Para ver só um status ou uma LP: **Dados → Criar visualização de filtro**.

## O que o Dashboard mostra

Escolha o **Período** no topo (Tudo, Hoje, 7 dias, 30 dias, Este mês, Mês passado ou Personalizado com datas De/Até).

- **Funil do período:** acessos, leads, conversão da LP, agendados, concluídos e faturamento.
- **Atendimento e custo:** leads em aberto, leads sem contato há +24h, perdidos, taxa de agendamento, ticket médio e custo por lead (use a coluna Investimento da aba LPs).
- **Desempenho por landing page:** acessos, leads, conversão e quantidade em cada status, por LP.
- **Gráficos:** leads por LP e status; leads por dia nos últimos 30 dias do período, por LP.
- **Leads por origem** e lista dos **leads aguardando primeiro contato**.

Tudo é fórmula e atualiza sozinho. Se algo for apagado sem querer: **CRM LPs → Configurar / reparar planilha** reconstrói a estrutura sem apagar os leads.

## Perguntas rápidas

**O que acontece se o `endpoint` estiver vazio?** As LPs funcionam, mas os envios são só simulados (aparecem no console do navegador). Serve para revisar as páginas antes de ligar a planilha.

**Os leads ficam seguros?** A planilha é privada na sua conta Google. O App da Web só aceita gravar linhas; ninguém consegue ler a planilha pela URL.

**Tem limite?** O Google Apps Script gratuito atende com folga o volume típico de campanhas locais. Se o tráfego crescer muito (anúncios com dezenas de milhares de visitas por dia), mantenha a planilha só para os leads e meça os acessos pelo GA4.
