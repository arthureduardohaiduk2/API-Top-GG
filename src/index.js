export default {
  async fetch(request, env) {
    // 1. Apenas requisições POST são aceitas pelo Webhook do Top.gg
    if (request.method !== "POST") {
      return new Response("Apenas POST é permitido.", { status: 405 });
    }

    // 2. Valida a senha secreta do Top.gg para segurança
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== env.TOPGG_WEBHOOK_AUTH) {
      return new Response("Acesso não autorizado.", { status: 401 });
    }

    try {
      const body = await request.json();
      const userId = body.user; // ID do Discord de quem votou
      const isTest = body.type === "test"; // Detecta se é o botão "Test Webhook" do Top.gg

      if (!userId) {
        return new Response("ID de usuário não fornecido.", { status: 400 });
      }

      // 3. Configura os Headers para a API do Discord
      const cleanToken = env.DISCORD_BOT_TOKEN.trim();
      const botToken = cleanToken.startsWith("Bot ") ? cleanToken : `Bot ${cleanToken}`;

      const discordHeaders = {
        "Authorization": botToken,
        "Content-Type": "application/json",
        "User-Agent": "TopGG-Vote-Worker (https://dracons.example, 1.0)"
      };

      // 4. Abre o canal de Mensagem Direta (PV) com o usuário no Discord
      const openDmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
        method: "POST",
        headers: discordHeaders,
        body: JSON.stringify({ recipient_id: userId })
      });

      if (!openDmRes.ok) {
        const errorText = await openDmRes.text();
        return new Response(`Erro ao abrir DM no Discord: ${errorText}`, { status: 500 });
      }

      const dmChannel = await openDmRes.json();
      const dmChannelId = dmChannel.id;

      // 5. Monta o Embed do Banner de Recompensa
      const embedTitle = isTest ? "🧪 Teste de Webhook do Top.gg" : "🎉 Recompensa de Voto Recebida!";
      const embedDesc = isTest
        ? "Este é um disparo de **teste**! Seu webhook do Top.gg está funcionando perfeitamente."
        : "Muito obrigado por votar no nosso bot no **Top.gg**!\n\n🏆 **Sua recompensa de +10 pontos já foi adicionada!**";

      const messagePayload = {
        embeds: [
          {
            title: embedTitle,
            description: embedDesc,
            color: 0xc084fc, // Roxo neon
            fields: [
              {
                name: "⏰ Próximo Voto",
                value: "Você pode votar novamente daqui a **12 horas**!",
                inline: false
              }
            ],
            footer: {
              text: "Obrigado por apoiar nosso servidor! ❤️"
            }
          }
        ]
      };

      // 6. Envia o Embed para o PV do usuário
      const sendDmRes = await fetch(`https://discord.com/api/v10/channels/${dmChannelId}/messages`, {
        method: "POST",
        headers: discordHeaders,
        body: JSON.stringify(messagePayload)
      });

      // Se o usuário estiver com o PV fechado nas configurações de privacidade do Discord
      if (!sendDmRes.ok) {
        return new Response("Voto recebido, mas o usuário está com as DMs fechadas no Discord.", { status: 200 });
      }

      return new Response("Sucesso! DM enviada e voto registrado.", { status: 200 });

    } catch (err) {
      return new Response(`Erro interno na Worker: ${err.message}`, { status: 500 });
    }
  }
};
        
