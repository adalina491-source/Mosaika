# Ativar a integração Meta

A integração está preparada, mas permanece desligada até que exista um app Meta configurado. O Mosaika continua funcionando como organizador local; não compartilhe senha do Instagram nem App Secret pelo chat.

1. Em [Meta for Developers](https://developers.facebook.com/apps/), crie um app de negócios e escolha o caso de uso **Gerenciar mensagens e conteúdo no Instagram**.
2. **App ID** e **App Secret**: no painel do app, abra **Configurações do app → Básico**. O App Secret é segredo do aplicativo, não sua senha do Instagram.
3. **Config ID**: no caso de uso do Instagram, abra a configuração de login/API com **Instagram Login (Unified Login)** e copie o ID da configuração criada.
4. Adicione somente a sua conta profissional (Criador/Empresa) e as permissões `instagram_basic` e `instagram_content_publish`. `instagram_manage_insights` é opcional; métricas além do perfil ainda não estão implementadas.
5. A Meta exige uma URL HTTPS de retorno exata. O projeto ainda não foi publicado em um domínio de API permanente; não cadastre o endereço temporário do Preview. Quando houver domínio estável, configure `META_REDIRECT_URI` como `https://<dominio-api>/api/mosaika/meta/callback` e cadastre essa mesma URL na configuração Meta.
6. Quando os três valores e o domínio existirem, insira os segredos somente pelo formulário protegido de configuração do projeto. O callback usa ticket temporário com PKCE; a sessão do app fica no armazenamento seguro do aparelho e o token Meta é cifrado no servidor.

Até essa configuração e um teste no app instalado, login, métricas completas e publicação real permanecem indisponíveis. A autorização e a publicação nunca devem ser simuladas.

Documentação oficial: [Instagram API with Instagram Login — Get started](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started).
