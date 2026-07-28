export default {
  // -------------------------------------------------------------
  // 1. REQUISIÇÕES HTTP (Voto do Top.gg)
  // -------------------------------------------------------------
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Apenas POST é permitido.", { status: 405 });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || authHeader !== env.TOPGG_WEBHOOK_AUTH) {
      return new Response("Acesso não autorizado.", { status: 401 });
    }

    try {
      const body = await request.json();
      const userId = body.user;
      const isTest = body.type === "test";

      if (!userId) {
        return new Response("ID de usuário não fornecido.", { status: 400 });
      }

      const botToken = env.DISCORD_BOT_TOKEN.trim().startsWith("Bot ")
        ? env.DISCORD_BOT_TOKEN.trim()
        : `Bot ${env.DISCORD_BOT_TOKEN.trim()}`;

      // A. Adiciona os 5k de Moedas no BotGhost (se você configurou a API Key do BotGhost)
      if (env.BOTGHOST_API_KEY && env.BOTGHOST_BOT_ID && !isTest) {
        await adicionarEconomiaBotGhost(userId, 5000, env);
      }

      // B. Abre canal no PV do Usuário
      const dmChannelId = await obterCanalDM(userId, botToken);

      if (dmChannelId) {
        // C. Envia a mensagem no PV na hora do voto
        const embedTitle = isTest ? "🧪 Teste de Webhook" : "🎉 Você recebeu +$5.000 de Economia!";
        const embedDesc = isTest
          ? "Teste do webhook funcionou perfeitamente!"
          : "Muito obrigado por votar no nosso bot no **Top.gg**!\n\n💰 **+$5.000 moedas** foram creditadas na sua conta!\n⏰ Te avisaremos aqui no PV assim que você puder votar novamente.";

        await enviarMensagemDiscord(dmChannelId, {
          embeds: [{
            title: embedTitle,
            description: embedDesc,
            color: 0x2bc472, // Verde dinheiro
            footer: { text: "Você pode votar a cada 12 horas!" }
          }]
        }, botToken);
      }

      // D. Salva o Lembrete de 12 Horas no KV (12h = 43200000 ms)
      if (!isTest && env.VOTES_KV) {
        const tempoProximoVoto = Date.now() + (12 * 60 * 60 * 1000);
        await env.VOTES_KV.put(`reminder:${userId}`, tempoProximoVoto.toString());
      }

      return new Response("Voto processado, recompensa entregue e lembrete agendado!", { status: 200 });

    } catch (err) {
      return new Response(`Erro interno: ${err.message}`, { status: 500 });
    }
  },

  // -------------------------------------------------------------
  // 2. TAREFA AGENDADA (CRON) - Checa a cada 5 minutos quem pode votar
  // -------------------------------------------------------------
  async scheduled(event, env, ctx) {
    if (!env.VOTES_KV) return;

    const botToken = env.DISCORD_BOT_TOKEN.trim().startsWith("Bot ")
      ? env.DISCORD_BOT_TOKEN.trim()
      : `Bot ${env.DISCORD_BOT_TOKEN.trim()}`;

    // Lista todos os lembretes salvos
    const list = await env.VOTES_KV.list({ prefix: "reminder:" });
    const agora = Date.now();

    for (const key of list.keys) {
      const tempoSalvoStr = await env.VOTES_KV.get(key.name);
      if (!tempoSalvoStr) continue;

      const tempoProximoVoto = parseInt(tempoSalvoStr, 10);

      // Se já passaram 12 horas
      if (agora >= tempoProximoVoto) {
        const userId = key.name.replace("reminder:", "");

        // Envia o lembrete no PV
        const dmChannelId = await obterCanalDM(userId, botToken);
        if (dmChannelId) {
          await enviarMensagemDiscord(dmChannelId, {
            embeds: [{
              title: "⏰ Hora de Votar Novamente!",
              description: `Já se passaram 12 horas! Você já pode votar no bot no **Top.gg** novamente para resgatar mais **+$5.000 moedas**!\n\n🔗 [Clique aqui para Votar](https://top.gg/bot/${env.BOTGHOST_BOT_ID || ""}/vote)`,
              color: 0xc084fc,
              footer: { text: "Obrigado por continuar apoiando nosso servidor! ❤️" }
            }]
          }, botToken);
        }

        // Deleta o registro do KV para não enviar a mensagem repetida
        await env.VOTES_KV.delete(key.name);
      }
    }
  }
};

// -------------------------------------------------------------
// FUNÇÕES AUXILIARES DA API DO DISCORD & BOTGHOST
// -------------------------------------------------------------

async function obterCanalDM(userId, botToken) {
  const res = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: { "Authorization": botToken, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient_id: userId })
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id;
}

async function enviarMensagemDiscord(channelId, payload, botToken) {
  return await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Authorization": botToken, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// Atualiza o saldo do usuário na API do BotGhost
async function adicionarEconomiaBotGhost(userId, valor, env) {
  try {
    await fetch(`https://api.botghost.com/v1/bots/${env.BOTGHOST_BOT_ID}/users/${userId}/variables/saldo/add`, {
      method: "POST",
      headers: {
        "Authorization": env.BOTGHOST_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ value: valor })
    });
  } catch (e) {
    console.error("Erro ao adicionar saldo no BotGhost:", e);
  }
}
