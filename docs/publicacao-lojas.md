# Publicação nas lojas

Dados para preencher App Store Connect e Google Play Console. Confira as respostas na própria console: os formulários mudam.

## URLs

| Campo | URL |
|---|---|
| Política de Privacidade | https://www.precisari.com.br/privacidade |
| Termos de Uso | https://www.precisari.com.br/termos |
| Exclusão de conta (Play Console) | https://www.precisari.com.br/excluir-conta |
| Site e suporte | https://www.precisari.com.br |

## O que as lojas exigem e onde está

| Exigência | Onde está no produto |
|---|---|
| Link da política dentro do app (Apple 5.1.1(i)) | Tela de boas-vindas e Conta e plano › Privacidade |
| Exclusão de conta dentro do app (Apple 5.1.1(v), Google) | Conta e plano › Privacidade › Excluir conta |
| Exclusão por link na web, sem precisar do app (Google) | `/excluir-conta`, página pública |
| Sem compra nem chamada para comprar no app (Apple 3.1.1) | Removidos: o app só mostra o plano atual |

## Antes de enviar

- [ ] Publicar a razão social, o CNPJ e o endereço na seção "Quem somos" da política (`apps/web/src/i18n/pt-BR.ts`).
- [ ] Fazer `privacidade@precisari.com.br` receber mensagens: a política e a página de exclusão citam esse endereço.
- [ ] Revisão jurídica dos textos de privacidade e termos.
- [ ] Definir como os revisores entram no app: o login é só por código no e-mail, e Apple e Google exigem acesso para revisar.
- [ ] Definir o enquadramento do app na regra de compras da Apple: a venda é feita só no site, e a regra de serviços multiplataforma (3.1.3(b)) cita compra dentro do app. A rejeição continua possível.
- [ ] Confirmar a regra do Google Play para assinaturas vendidas fora do app.
- [ ] Ativar as credenciais reais que ainda estão em adapter falso (push, IA e busca de endereço) ou informar aos revisores o que não está ativo.

## Apple: App Privacy

Rastreamento: **não**. Nenhum dado é usado para publicidade. Dados vinculados à identidade do usuário:

| Tipo na Apple | Dado | Finalidade |
|---|---|---|
| Contact Info › Email Address, Name | E-mail e nome | App Functionality |
| Location › Coarse Location | Localização do imóvel informada pelo usuário | App Functionality |
| User Content › Other | Dados do imóvel, preços e custos, calendário | App Functionality |
| Identifiers › User ID, Device ID | Conta e token de push | App Functionality |
| Purchases › Purchase History | Plano e situação da assinatura | App Functionality |

O app não acessa a localização do aparelho: a localização é o endereço do imóvel, digitado pelo usuário. Avalie com o revisor jurídico se ela deve ser declarada como Location ou como User Content.

## Google Play: Data safety

- Coleta dados: **sim**. Compartilha com terceiros para publicidade: **não**.
- Dados criptografados em trânsito: **sim** (HTTPS).
- O usuário pode pedir a exclusão: **sim**, no app e em `/excluir-conta`.

| Categoria | Dado | Finalidade |
|---|---|---|
| Informações pessoais | E-mail, nome, ID do usuário | Funcionalidade, gerenciamento da conta |
| Local | Localização aproximada do imóvel, se aplicável | Funcionalidade |
| Atividade no app | Aprovação de sugestões de preço | Funcionalidade |
| Informações financeiras | Histórico de compra (plano) | Funcionalidade |
| IDs do dispositivo | Token de push | Funcionalidade |

Os prestadores de serviço listados na política atuam em nosso nome, então confira na console se o envio a eles conta como "compartilhamento" na definição do Google.
