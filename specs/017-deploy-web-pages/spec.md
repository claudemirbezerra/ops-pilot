# Feature Specification: Deploy web Pages

**Feature Branch**: `017-deploy-web-pages`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Deploy do web/ no Pages via Actions: upload-pages-artifact + deploy-pages, permissions, README (atualizar)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicar a war room automaticamente (Priority: P1)

Um mantenedor integra mudanças no front-end estático em `web/` na linha principal do repositório. O pipeline de integração contínua gera o artefato publicável e o publica no site hospedado do projeto (Pages), sem passos manuais de upload.

**Why this priority**: Sem publicação automática, a war room não fica acessível de forma confiável para demonstração e plantão remoto; é o valor central desta feature.

**Independent Test**: Alterar (ou simular alteração) em `web/`, disparar o pipeline na linha principal e confirmar que o site Pages passa a servir a versão correspondente do front-end.

**Acceptance Scenarios**:

1. **Given** uma alteração relevante em `web/` na linha principal, **When** o pipeline conclui com sucesso, **Then** o site Pages do projeto passa a servir o front-end estático gerado a partir de `web/`.
2. **Given** um pipeline de publicação bem-sucedido, **When** um visitante abre a URL pública do site, **Then** carrega a war room (HTML/assets) da versão publicada, não um placeholder vazio ou página 404 do host.
3. **Given** o pipeline de publicação, **When** ele executa, **Then** há etapas distintas de (a) preparar/empacotar o artefato do site e (b) publicar esse artefato no Pages, com permissões mínimas necessárias à publicação.

---

### User Story 2 - Falha de build não publica site quebrado (Priority: P1)

Se a geração do front-end estático falhar, o site Pages já publicado permanece intacto; o mantenedor vê falha clara no pipeline.

**Why this priority**: Publicar um artefato inválido quebraria a war room para todos os visitantes.

**Independent Test**: Forçar falha na etapa de geração do site e verificar que a publicação não ocorre e o site anterior continua acessível.

**Acceptance Scenarios**:

1. **Given** falha ao gerar o front-end a partir de `web/`, **When** o pipeline termina, **Then** a etapa de publicação no Pages não promove um artefato novo e o job é marcado como falho.
2. **Given** um site já publicado com sucesso anteriormente, **When** um pipeline posterior falha na geração, **Then** a URL pública continua a servir a última versão boa.

---

### User Story 3 - Documentação do deploy no README (Priority: P2)

Um contribuinte ou plantonista consulta o README do repositório e encontra como a war room é publicada, qual a URL pública (ou como obtê-la) e o que configurar no host do repositório para o Pages via Actions.

**Why this priority**: Sem documentação, o deploy existe mas ninguém sabe ativar Pages, achar a URL ou interpretar o pipeline.

**Independent Test**: Abrir o README na raiz do repositório e localizar a seção de publicação Pages com URL (ou caminho para obtê-la) e pré-requisitos de configuração.

**Acceptance Scenarios**:

1. **Given** o README do repositório atualizado, **When** o leitor procura deploy/Pages da war room, **Then** encontra instruções de que o site é publicado automaticamente a partir de `web/` pelo pipeline, e como apontar a fonte do Pages para Actions (quando aplicável).
2. **Given** o README atualizado, **When** o leitor precisa da URL pública, **Then** encontra a URL documentada ou o procedimento inequívoco para obtê-la nas configurações do repositório.
3. **Given** que ainda não exista README na raiz, **When** esta feature é concluída, **Then** o README na raiz é criado (ou atualizado) com pelo menos a seção de publicação da war room — sem apagar outras seções úteis se o arquivo já existir.

---

### Edge Cases

- O que acontece quando o pipeline roda sem mudanças em `web/`? (Aceitável republicar o mesmo artefato; otimização de path-filter é opcional e fora do MVP se não estiver documentada.)
- Como o sistema trata permissões insuficientes no job de publicação? O pipeline falha de forma explícita; o README aponta as permissões/fonte Pages necessárias.
- O que acontece se Pages ainda não estiver habilitado no repositório? O pipeline pode falhar na publicação até a configuração; o README descreve o pré-requisito.
- Builds parciais ou artefato vazio não devem ser publicados como “sucesso”.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O repositório MUST publicar automaticamente o front-end estático produzido a partir de `web/` no site Pages do projeto quando o pipeline de publicação na linha principal conclui com sucesso.
- **FR-002**: O pipeline de publicação MUST incluir preparação do artefato do site e publicação desse artefato no Pages (fluxo artifact → deploy), sem commit manual em branch de páginas.
- **FR-003**: O job (ou jobs) de publicação MUST declarar apenas as permissões necessárias para ler o código, escrever no Pages e autenticar o deploy (princípio do menor privilégio).
- **FR-004**: Se a geração do front-end a partir de `web/` falhar, o sistema MUST NÃO promover uma nova versão no Pages.
- **FR-005**: O README na raiz do repositório MUST documentar: (a) que a war room em `web/` é publicada no Pages via pipeline; (b) pré-requisito de fonte Pages = Actions (ou equivalente); (c) URL pública ou como obtê-la.
- **FR-006**: Visitantes MUST conseguir abrir a URL pública do Pages e carregar a war room publicada após um deploy bem-sucedido.
- **FR-007**: Segredos de aplicação (chaves de API do OpsPilot, etc.) MUST NÃO ser embutidos no artefato estático publicado; a war room continua a obter a URL da API via configuração do usuário (engrenagem), como já definido na war room.

### Key Entities

- **Artefato do site**: Pacote imutável do front-end estático gerado a partir de `web/`, candidato à publicação.
- **Publicação Pages**: Versão do site servida na URL pública do repositório após um deploy bem-sucedido.
- **Pipeline de publicação**: Processo automatizado na integração contínua que gera o artefato e o promove ao Pages.
- **README do repositório**: Documento na raiz que orienta contribuidores sobre o deploy e a URL.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após merge (ou push) elegível na linha principal com `web/` válido, um mantenedor obtém a war room atualizada na URL Pages em no máximo um ciclo completo de pipeline bem-sucedido, sem upload manual.
- **SC-002**: Em 100% dos casos em que a geração do front-end falha no pipeline, nenhuma nova versão é publicada no Pages (site anterior permanece).
- **SC-003**: Um contribuinte novo encontra no README, em menos de 2 minutos, como a war room é publicada e onde obter a URL pública.
- **SC-004**: Após o primeiro deploy bem-sucedido com Pages habilitado, um visitante carrega a war room pela URL pública na primeira tentativa (página e assets principais disponíveis).

## Assumptions

- O repositório está (ou será) hospedado onde Pages + Actions estão disponíveis; a descrição do usuário fixa o fluxo padrão de artifact upload + deploy Pages com permissões de job.
- A linha principal de publicação é a branch padrão do repositório (ex.: `main`); triggers em outras branches ficam fora do MVP salvo necessidade explícita.
- O conteúdo publicado é só o front-end estático de `web/`; a API OpsPilot não é hospedada no Pages.
- A base de assets do build de produção alinha-se ao caminho público do Pages do repositório (ajustes de `base` do front, se necessários, fazem parte de tornar FR-006 verdadeiro).
- Não existe README na raiz hoje; esta feature cria ou atualiza o README na raiz com a seção de deploy (e pode referenciar `web/README.md` se útil).
- Habilitar Pages “Source: GitHub Actions” nas configurações do repositório é um passo humano de pré-requisito; o README o documenta; o pipeline não substitui essa configuração.
- Path filters (só rodar quando `web/` muda) são desejáveis mas não obrigatórios no MVP.
