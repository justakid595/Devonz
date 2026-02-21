import { type ActionFunctionArgs } from '@remix-run/node';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';
import { z } from 'zod';
import { withSecurity } from '~/lib/security';

export const action = withSecurity(enhancerAction, {
  allowedMethods: ['POST'],
  rateLimit: false,
});

const logger = createScopedLogger('api.enhancer');

// Zod schema for enhancer request validation
const providerSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  staticModels: z
    .array(
      z
        .object({ name: z.string(), label: z.string(), provider: z.string(), maxTokenAllowed: z.number() })
        .passthrough(),
    )
    .optional(),
  getApiKeyLink: z.string().optional(),
  labelForGetApiKey: z.string().optional(),
  icon: z.string().optional(),
});

const enhancerRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  model: z.string().min(1, 'Model is required'),
  provider: providerSchema,
  apiKeys: z.record(z.string()).optional(),
});

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  // Parse and validate request body
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = enhancerRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    logger.warn('Enhancer request validation failed:', parsed.error.issues);

    return new Response(
      JSON.stringify({
        error: 'Invalid request',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const { message, model, provider } = parsed.data as {
    message: string;
    model: string;
    provider: ProviderInfo;
    apiKeys?: Record<string, string>;
  };

  const { name: providerName } = provider;

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content:
            `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
            stripIndents`
            You are a prompt engineer specializing in web application development prompts.
            Your task is to enhance the user's prompt so an AI coding assistant can build a complete, working app.

            Improve the prompt wrapped in \`<original_prompt>\` tags:

            Rules:
            - Maintain the core intent — do NOT change what the user wants
            - Add specific UI/UX details (layout, colors, responsive behavior) if vague
            - Specify features explicitly (CRUD operations, filters, navigation)
            - Mention data structure if the app needs it (e.g., "each item has title, description, status")
            - Keep it concise — only add details that help build a better app
            - NEVER add requirements for external APIs, API keys, or third-party services
            - NEVER suggest deployment, hosting, or CI/CD — this is a local dev environment
            - NEVER add testing requirements
            - Output ONLY the enhanced prompt text — no explanations or tags

            <original_prompt>
              ${message}
            </original_prompt>
          `,
        },
      ],
      env: context.cloudflare?.env,
      apiKeys,
      providerSettings,
      options: {
        system:
          'You enhance user prompts for an AI web app builder running in a local Node.js environment. The builder creates complete React/Vue/Svelte apps with Tailwind CSS, supporting Supabase for databases. Apps must use local state or seed data — never external APIs with API keys. Output ONLY the enhanced prompt text, no explanations.',

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Handle streaming errors in a non-blocking way
    (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'error') {
            const error = part.error;
            logger.error('Streaming error:', error);
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing stream:', error);
      }
    })();

    // Return the text stream directly since it's already text data
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    logger.error(error);

    if (error instanceof Error && error.message?.includes('API key')) {
      throw new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
