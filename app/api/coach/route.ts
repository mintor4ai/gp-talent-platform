import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("id_empleado, rol, coach_habilitado, tokens_consumidos_mes, tokens_limite_mes")
    .eq("id", user.id)
    .single();

  if (!perfil?.coach_habilitado) {
    return NextResponse.json({ error: "Coach IA no habilitado" }, { status: 403 });
  }

  if ((perfil.tokens_consumidos_mes ?? 0) >= (perfil.tokens_limite_mes ?? 10000)) {
    return NextResponse.json({ error: "Límite de tokens alcanzado este mes" }, { status: 429 });
  }

  // Determine prompt tipo by role
  const rol = perfil.rol as string;
  const promptTipo =
    rol === "colaborador" ? "coach_colaborador" :
    rol === "jefe"        ? "coach_jefe" :
                            "coach_admin";

  // Load active prompt + API config from DB
  const [{ data: promptRow }, { data: apiCfg }] = await Promise.all([
    supabase
      .from("configuracion_prompts")
      .select("contenido")
      .eq("tipo", promptTipo)
      .eq("activo", true)
      .single(),
    supabase
      .from("configuracion_api")
      .select("modelo, max_tokens")
      .eq("activo", true)
      .single(),
  ]);

  const body = await req.json();
  const { messages, contexto } = body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    contexto: string;
  };

  if (!messages?.length) {
    return NextResponse.json({ error: "Mensajes requeridos" }, { status: 400 });
  }

  const basePrompt = (promptRow as { contenido?: string } | null)?.contenido
    ?? `Eres el Coach IA de GP Talent Intelligence. Apoya el desarrollo profesional del colaborador de Grupo GP. Responde siempre en español.`;

  const systemPrompt = `${basePrompt}\n\nContexto del colaborador:\n${contexto}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        const cfgModelo = (apiCfg as { modelo?: string; max_tokens?: number } | null)?.modelo ?? "claude-opus-4-8";
        const cfgMaxTokens = (apiCfg as { modelo?: string; max_tokens?: number } | null)?.max_tokens ?? 1024;

        const supportsAdaptiveThinking =
          cfgModelo.includes("opus-4") ||
          cfgModelo.includes("sonnet-4-6") ||
          cfgModelo.includes("sonnet-5");

        const claudeStream = anthropic.messages.stream({
          model: cfgModelo,
          max_tokens: cfgMaxTokens,
          ...(supportsAdaptiveThinking ? { thinking: { type: "adaptive" as const } } : {}),
          system: systemPrompt,
          messages,
        });

        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        const finalMsg = await claudeStream.finalMessage();
        totalInputTokens = finalMsg.usage.input_tokens;
        totalOutputTokens = finalMsg.usage.output_tokens;
        const totalTokens = totalInputTokens + totalOutputTokens;

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, tokens: totalTokens })}\n\n`)
        );

        // Log tokens and update counter (fire-and-forget, don't block stream)
        Promise.all([
          supabase.from("coach_sesiones_log").insert({
            id_empleado: perfil.id_empleado,
            fecha: new Date().toISOString(),
            tokens_consumidos: totalTokens,
            tipo_sesion: "chat",
          }),
          supabase
            .from("usuarios_app")
            .update({
              tokens_consumidos_mes: (perfil.tokens_consumidos_mes ?? 0) + totalTokens,
            })
            .eq("id", user.id),
        ]).catch(console.error);
      } catch (err) {
        console.error("Coach IA error:", err);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Error al contactar el modelo" })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
