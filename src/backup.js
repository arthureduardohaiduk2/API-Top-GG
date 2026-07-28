export default {
  // -------------------------------------------------------------
  // 1. REQUISIÇÕES HTTP (Voto vindo do Top.gg)
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

      // A. Dispara o Webhook do BotGhost passando o ID do usuário na tag {voto_user_id}
      if (env.BOTGHOST_API_KEY && env.BOTGHOST_EVENT_ID && !isTest) {
        try {
          await fetch(`https://api.botghost.com/webhook/1476689683588321474/${env.BOTGHOST_EVENT_ID}`, {
            method: "POST",
            headers: {
              "Authorization": env.BOTGHOST_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              variables: [
                {
                  name: "ID do Eleitor",
                  variable: "{voto_user_id}",
                  value: userId
                }
              ]
            })
          });
        } catch (e) {
          console.error("Erro ao enviar Webhook para o BotGhost:", e);
        }
      }

      // B. Abre canal de PV no Discord
      const dmChannelId = await obterCanalDM(userId, botToken);

      if (dmChannelId) {
        // C. MENSAGEM ESTÉTICA NO PV
        const embedTitle = isTest 
          ? "🧪 Teste de Webhook - Sistema 100% OK" 
          : "୨୧ 🗳️ Voto Confirmado! 🗳️ ୨୧";

        const embedDesc = isTest
          ? "A integração entre o **Top.gg**, **Cloudflare Workers** e o **Discord** está funcionando perfeitamente!\n\nNos votos reais, os usuários receberão os $5.000 na economia e o lembrete automático de 12h."
          : "✨ 𓂃 𓈒 ᵔ ܸ ᵔ 𓈒 𓂃 ✨\n\nMuito obrigado por apoiar a nossa comunidade votando no **Top.gg**! 💫\n\n💰 **+$5.000** moedas foram creditadas com sucesso no seu saldo!\n\n⏰ **Próximo Voto:**\nVocê poderá votar novamente daqui a 12 horas. Fique tranquilo(a), te mandaremos um aviso aqui no PV assim que o voto for liberado! 🌸\n\n⋆. ˚₊· ͟͟͞͞➳❥ ₊˚⊹♡ ˚₊· ͟͟͞͞➳❥ ⋆";

        await enviarMensagemDiscord(dmChannelId, {
          embeds: [{
            title: embedTitle,
            description: embedDesc,
            color: isTest ? 0x38bdf8 : 0xf43f5e,
            footer: {
              text: isTest ? "Ambiente de Teste" : "Sua ajuda mantém nosso servidor crescendo! ❤️"
            }
          }]
        }, botToken);
      }

      // D. Salva o Lembrete de 12 Horas no KV
      if (!isTest && env.VOTES_KV) {
        const tempoProximoVoto = Date.now() + (12 * 60 * 60 * 1000);
        await env.VOTES_KV.put(`reminder:${userId}`, tempoProximoVoto.toString());
      }

      return new Response("Voto processado com sucesso!", { status: 200 });

    } catch (err) {
      return new Response(`Erro interno: ${err.message}`, { status: 500 });
    }
  },

  // -------------------------------------------------------------
  // 2. CRON TRIGGER - LEMBRETE APÓS 12 HORAS
  // -------------------------------------------------------------
  async scheduled(event, env, ctx) {
    if (!env.VOTES_KV) return;

    const botToken = env.DISCORD_BOT_TOKEN.trim().startsWith("Bot ")
      ? env.DISCORD_BOT_TOKEN.trim()
      : `Bot ${env.DISCORD_BOT_TOKEN.trim()}`;

    const list = await env.VOTES_KV.list({ prefix: "reminder:" });
    const agora = Date.now();
    const botId = "1476689683588321474";

    for (const key of list.keys) {
      const tempoSalvoStr = await env.VOTES_KV.get(key.name);
      if (!tempoSalvoStr) continue;

      const tempoProximoVoto = parseInt(tempoSalvoStr, 10);

      if (agora >= tempoProximoVoto) {
        const userId = key.name.replace("reminder:", "");

        const dmChannelId = await obterCanalDM(userId, botToken);
        if (dmChannelId) {
          await enviarMensagemDiscord(dmChannelId, {
            embeds: [{
              title: "୨୧ 🔔 Voto Liberado! 🔔 ୨୧",
              description: "✨ 𓂃 𓈒 ᵔ ܸ ᵔ 𓈒 𓂃 ✨\n\nEi, seu voto já está liberado! 🌸\n\nQue tal apoiar a nossa comunidade novamente e ganhar mais recompensas? 💰\n\n⋆. ˚₊· ͟͟͞͞➳❥ ₊˚⊹♡ ˚₊· ͟͟͞͞➳❥ ⋆",
              color: 0xc084fc,
              footer: { text: "Não perca sua recompensa diária! 🚀" }
            }],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "Vote Aqui 🌸",
                    url: `https://top.gg/bot/${botId}/vote`
                  }
                ]
              }
            ]
          }, botToken);
        }

        await env.VOTES_KV.delete(key.name);
      }
    }
  }
};

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
