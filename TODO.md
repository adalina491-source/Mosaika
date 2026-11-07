# TODO — Mosaika

**Progresso:** Mosaika continua parcial. O fatiador foi implementado e verificado; diversos fluxos do app seguem abertos e a integração Meta aguarda credenciais. Nenhuma publicação real foi feita.

## 1. Marca, splash e temas — concluído

- O ícone do app apresenta dois quadrados de cantos arredondados e bordas finas sobrepostos diagonalmente, com degradê laranja–rosa–roxo.
- A tela de abertura usa fundo branco e a marca, com carregamento inicial enxuto.
- A barra lateral fica à esquerda, tem X para fechar e permite azul pastel, verde pastel, preto/branco e modo noturno.

## 2. Conta profissional Meta e cabeçalho do perfil — aberto (aguarda configuração Meta)

- A tela inicial mostra “Adicionar conta” quando ainda não houver conexão; a conexão é pelo OAuth oficial Meta/Unified Login para uma única conta profissional Criador/Empresa, sem solicitar nem armazenar senha do Instagram.
- Após autorização, mostrar avatar e nickname retornados pela Meta; oferecer edição de nickname de exibição local sem afirmar que isso altera o @ real.
- Usar integração oficial; guardar App Secret/token exclusivamente no servidor com token Meta cifrado em repouso; proteger o retorno OAuth com state e ticket de uso único, PKCE e scheme restrito; manter a sessão do app em armazenamento seguro no aparelho.
- Permitir desconectar/reautorizar. Solicitar somente `instagram_basic`, `instagram_content_publish` e `instagram_manage_insights` para perfil/mídia, publicação e métricas.

## 3. Perfil, destaques e stories em mosaico — aberto

- Mostrar contagem automática dos itens que a pessoa adicionou no app, incluindo posts, Reels e demais tipos.
- Exibir a imagem circular do perfil em aproximadamente 110×110 px, com aro ao redor. Mostrar 10 destaques em linha horizontal: anel de 68×68 px, círculo interno de 52×52 px e 12 px exatos entre as bordas externas dos anéis; manter o título editável 170×30 px centralizado, sem incluir sua largura na distância entre círculos.
- Preparar uma cópia de cada imagem adicionada a Stories em 1080×1920 px (9:16), com corte central quando necessário, sem substituir o original. O visualizador também deve manter a área de mídia em 9:16. Ao abrir um destaque, exibir perfil/avatar, nome escolhido para o círculo, data, botão “Seguir” e sticker de link tipo pílula branca com borda/texto azul-claro, corrente e texto configurável; ações não suportadas pela API devem ser claramente identificadas como link/ação local.
- Incluir ícone de grade 2×2 ou 3×3 no canto inferior esquerdo da visualização do destaque para abrir página mosaico e percorrer rapidamente stories daquele destaque.
- Os destaques e stories editados no app são mantidos como organização local quando a API Meta não permite sincronizá-los.

## 4. Grade, abas e organização da mídia — aberto

- Apresentar quatro abas horizontais: grade de publicações (selecionada com sublinhado), Reels, publicações compartilhadas/repostadas e fotos marcadas.
- Manter a grade de mídia solicitada, com marcadores no canto superior direito para carrossel (quadrados sobrepostos) e vídeo/Reel (símbolo de reprodução).
- Preparar fotos do feed no formato vertical recomendado 4:5 (1080×1350 px), que ocupa toda a largura útil do celular e mantém essa proporção; continuar oferecendo 3:4 (1080×1440 px), 1:1 (1080×1080 px) e paisagem 1,91:1 (1080×566 px), com ícone de paisagem e corte central. A prévia da grade do perfil tem controle independente entre 3:4 e 1:1. Na grade 3:4, usar três colunas responsivas de largura igual; numa largura de tela de 1080 px, cada miniatura mede aproximadamente 358×477 px, com duas divisórias de 3 px fora das imagens. Reduzir proporcionalmente em telas menores, usando a cor de fundo do tema nas divisórias. Ao mostrar um post original 1080×1350 no grid 3:4, preservar toda a altura de 1350 px e cortar aproximadamente 33,75 px de cada lado (largura visível de 1012,5 px), sem alterar o original. Ao abrir a mídia, usar a proporção do conteúdo, com opção de ajustar/cortar a imagem.
- Não inserir publicações de teste/demonstração. Ao migrar o estado local, remover somente as fixtures antigas `grid-test-*`/`mosaika-test://`, preservando todos os posts reais salvos.
- Nos ícones das abas Grade, Reels, compartilhados e marcados, usar desenho de 32×32 px e área de toque de 48×48 px.
- Pressionar uma publicação abre menu fosco de cantos arredondados com editar/cortar, lembrete, publicar, filtros locais, borda, fixar, apagar, alterar posição, adicionar música local por post e fechar menu.
- Permitir arrastar e soltar para reordenar; os itens vizinhos devem se mover suavemente e a ordem deve persistir ao fechar/reabrir.
- Permitir ocultar e desocultar mídia; itens ocultos permanecem acessíveis na seção correspondente.
- Permitir selecionar múltiplos itens e apagar com confirmação.
- Fixar no máximo 3 posts/carrosséis/Reels. O mais recente fixado fica primeiro; se três já estiverem fixados, pedir substituição do fixado mais antigo e então reorganizar para que o primeiro a ser fixado vá para a terceira posição.

## 5. Criação e edição de conteúdo — aberto

- O botão “+” oferece Adicionar Post, Adicionar Carrossel, Dividir a Imagem, Adicionar Reel e Adicionar Imagem Panorâmica.
- Permitir selecionar/substituir mídia, acrescentar mais imagens a um carrossel, legenda, ajuste/corte, filtros e borda; a música fica associada separadamente a cada post e persiste até remoção.
- A biblioteca contabiliza posts, Reels e outros itens incluídos no app.
- A integração de postagem respeita formatos/permissões da API oficial. Não afirmar que filtros ou música licenciada serão enviados ao Instagram se a API não os suportar; exibir essa limitação antes de publicar.

### Dividir a Imagem — implementado; geometria, TypeScript, lint e Preview web verificados

- A ação “Dividir a Imagem” permite escolher uma imagem do aparelho e uma grade entre 2×1, 1×2, 3×4, 3×3, 3×2, 3×1, 2×2, 1×3 e 2×3 (colunas × linhas).
- Cada bloco é recortado em coordenadas sequenciais e exportado como JPEG 1080×1350; o total de blocos é colunas × linhas e os arquivos recebem numeração ordenada (`foto_1`, `foto_2`, …) para publicação na ordem correta.
- A prévia mostra guias pontilhadas nos limites exatos dos blocos e permite arrastar a imagem para ajustar o enquadramento antes de salvar; o redimensionamento preserva a proporção e não estica a imagem.
- Para imagem panorâmica com altura/aspecto diferente, a prévia permite ajustar o preenchimento/corte para o padrão 4:5 de cada bloco; a divisão não corta por cima de confirmação do usuário.
- Ao confirmar, solicitar permissão quando necessária e salvar todos os blocos na galeria do aparelho em ordem; apresentar progresso/resultado e informar claramente se algum arquivo falhar.
- Detecção automática de rosto/texto só será declarada se houver detector confiável; no MVP, guias visuais e ajuste manual evitam falsos avisos.

## 6. Visualização de publicação — aberto

- Ao abrir um post, mostrar seta para voltar, título central “Posts” e atalho “Seguir” que não finja seguir quando não houver API oficial para isso.
- Mostrar cabeçalho com avatar, nome do perfil e selo azul somente quando o status for fornecido/verificado pela plataforma; incluir menu adicional.
- Exibir mídia em proporção retrato, carrossel deslizado lateralmente com indicador “1/2”, paginação e página atual; carrossel pode conter múltiplas imagens.
- Mostrar ações de curtir, comentar, republicar/compartilhar, enviar e salvar. Distinguir estado local de ação efetivamente enviada ao Instagram; não alegar que ações indisponíveis pela API foram realizadas.
- Mostrar “Curtido por...” quando houver dado oficial disponível, legenda com perfil em negrito e trecho recolhido expansível por “… mais”, além do tempo desde a publicação.

## 7. Lembretes, publicação agendada e mídia — aberto

- Permitir lembrete de postagem com data e hora escolhidas, com notificação local no dispositivo.
- Permitir publicação imediata e agendada pelo backend oficial Meta, com confirmação explícita por item; armazenar status/data/hora; cancelar jobs ao desconectar/apagar; aquisição atômica impede envios concorrentes. Se o resultado da Meta for ambíguo, pedir conferência no Instagram antes de novo envio, evitando duplicação.
- Upload e armazenamento da mídia para que a URL esteja acessível à Meta no momento da publicação.
- A publicação automática só executa após a versão com callback agendado estar publicada e o app Meta configurado; respeitar os limites e formatos da API Meta.
- Nunca publicar um post de teste ou conteúdo real durante desenvolvimento.

## 8. Persistência, métricas e operação — aberto

- Manter salvos ao sair/reabrir: perfil de exibição, preferências, posts, carrosséis, mídias, legendas, músicas associadas, destaques, mídias ocultas, pins, ordem, lembretes, agendamentos e métricas disponíveis.
- Mostrar métricas fornecidas pela API Meta e estados claros para falta de permissão ou dados indisponíveis.
- Carregamento inicial leve e tarefas secundárias assíncronas; splash nativa conforme recursos do starter.
- O app oferece tema noturno ou branco e informa limitações da API, conexão, credenciais ou acesso pendentes em linguagem clara.

## 9. Navegação e interação — aberto

- Os menus têm opção de fechar, e itens destrutivos pedem confirmação.
- Links de ação e atalhos para o Instagram usam destinos explícitos; o app não automatiza login por captura de senha nem imita recursos de rede social sem autorização oficial.
- Botões do detalhe e de publicação indicam com clareza quando a ação é local, quando abre o Instagram e quando foi confirmada pela API.

## 10. Ajustes adicionais pedidos — implementado; validar em aparelho

- Manter a barra lateral no lado esquerdo; colocar Insights e o aviso/ação de integração Meta nela, removendo da tela principal o aviso Meta e o texto “Planeje posts, Reels e destaques em um só lugar.” Remover o rodapé “Rascunhos salvos neste aparelho” e o rodapé/aba inferior do perfil (“Perfil” com ícone quadrado).
- O avatar circular do perfil mede 110×110 pixels. Oferecer edição local dos números de seguidores e de pessoas seguindo, deixando claro quando forem valores manuais e não métricas Meta.
- Os círculos de destaque usam miolo entre 48–56 dp (implementar 52 dp) e círculo externo entre 64–72 dp (implementar 68 dp); o texto abaixo mede aproximadamente 170×30 px. Não exibir os rótulos “Destaques” nem “10 espaços”. Pressionar um destaque abre suas configurações.
- Ao tocar num destaque, abrir Stories em 9:16 (1080×1920), mostrar todas as imagens salvas nessa coleção na ordem antiga→nova e avançar tocando no lado direito. Permitir selecionar várias mídias para o destaque; o sticker de link deve aceitar texto/URL configuráveis e posição escolhida em qualquer ponto da imagem.
- Ao criar um Post, permitir selecionar várias imagens; salvar como carrossel quando houver mais de uma. A grade de posts aceita 4:5 e 3:4. Os alvos dos quatro ícones de navegação têm 56×56 px; o ícone de fixação usa silhueta clássica de push-pin.
- Editar a legenda de cada post, associar e manter uma música diferente por post e abrir prévia limpa que mostre apenas a publicação, sem controles de configuração. Carrosséis exibem pontos de paginação azul/cinza e a página ativa muda ao deslizar.
