export default {
  // -------------------------------------------------------------
  // 1. REQUISIÇÃO DO TOP.GG (Quando o usuário vota)
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

      const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : "";
      const tokenFormatado = botToken.startsWith("Bot ") ? botToken : `Bot ${botToken}`;
      const botId = "1476689683588321474";

      // A. Abre PV e envia mensagem no Discord
      const dmChannelId = await obterCanalDM(userId, tokenFormatado);

      if (dmChannelId) {
        const embedTitle = isTest 
          ? "🧪 Teste de Webhook - Voto Recebido!" 
          : "୨୧ 🗳️ Voto Confirmado! 🗳️ ୨୧";

        const embedDesc = isTest
          ? "O teste de integração funcionou perfeitamente! Quando for um voto real, o usuário receberá o agradecimento e o lembrete automático de 12h."
          : "✨ 𓂃 𓈒 ᵔ ܸ ᵔ 𓈒 𓂃 ✨\n\nMuito obrigado por apoiar a nossa comunidade votando no **Top.gg**! 💫\n\n⏰ **Próximo Voto:**\nVocê poderá votar novamente daqui a 12 horas. Fique tranquilo(a), te mandaremos um aviso aqui no PV assim que o voto for liberado! 🌸\n\n⋆. ˚₊· ͟͟͞͞➳❥ ₊˚⊹♡ ˚₊· ͟͟͞͞➳❥ ⋆";

        await enviarMensagemDiscord(dmChannelId, {
          embeds: [{
            title: embedTitle,
            description: embedDesc,
            color: isTest ? 0x38bdf8 : 0xf43f5e,
            footer: {
              text: isTest ? "Ambiente de Teste" : "Sua ajuda mantém nosso servidor crescendo! ❤️"
            }
          }]
        }, tokenFormatado);
      }

      // B. Salva lembrete de 12 horas no KV (apenas em votos reais)
      if (!isTest && env.VOTES_KV) {
        const tempoProximoVoto = Date.now() + (12 * 60 * 60 * 1000);
        await env.VOTES_KV.put(`reminder:${userId}`, tempoProximoVoto.toString());
      }

      if (isTest) {
        return new Response("[TESTE OK] Mensagem enviada com sucesso no PV!", { status: 200 });
      }

      return new Response("Voto processado com sucesso!", { status: 200 });

    } catch (err) {
      return new Response(`Erro interno: ${err.message}`, { status: 500 });
    }
  },

  // -------------------------------------------------------------
  // 2. TAREFA AUTOMÁTICA (Checa quem já completou 12 horas)
  // -------------------------------------------------------------
  async scheduled(event, env, ctx) {
    if (!env.VOTES_KV) return;

    const botToken = env.DISCORD_BOT_TOKEN ? env.DISCORD_BOT_TOKEN.trim() : "";
    const tokenFormatado = botToken.startsWith("Bot ") ? botToken : `Bot ${botToken}`;
    const botId = "1476689683588321474";

    const list = await env.VOTES_KV.list({ prefix: "reminder:" });
    const agora = Date.now();

    for (const key of list.keys) {
      const tempoSalvoStr = await env.VOTES_KV.get(key.name);
      if (!tempoSalvoStr) continue;

      const tempoProximoVoto = parseInt(tempoSalvoStr, 10);

      if (agora >= tempoProximoVoto) {
        const userId = key.name.replace("reminder:", "");

        const dmChannelId = await obterCanalDM(userId, tokenFormatado);
        if (dmChannelId) {
          await enviarMensagemDiscord(dmChannelId, {
            embeds: [{
              title: "୨୧ 🔔 Voto Liberado! 🔔 ୨୧",
              description: "✨ 𓂃 𓈒 ᵔ ܸ ᵔ 𓈒 𓂃 ✨\n\nEi, seu voto já está liberado! 🌸\n\nQue tal apoiar a nossa comunidade novamente? 💫\n\n⋆. ˚₊· ͟͟͞͞➳❥ ₊˚⊹♡ ˚₊· ͟͟͞͞➳❥ ⋆",
              color: 0xc084fc,
              footer: { text: "Obrigado por apoiar nosso servidor! 🚀" }
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
          }, tokenFormatado);
        }

        // Deleta do KV para não mandar a mensagem de novo
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
