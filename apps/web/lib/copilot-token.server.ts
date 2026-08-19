import type {CopilotTokenResponse} from './copilot-webchat';

const DEFAULT_DIRECT_LINE_DOMAIN =
  'https://directline.botframework.com/v3/directline';
export const COPILOT_PUBLIC_TOKEN_ENDPOINT =
  'https://9324e73acd4ee049b7ba177af6165e.9c.environment.api.powerplatform.com/copilotstudio/agenticruntime/botsbyschema/crbf2_reverse_bmWXjU/directline/token?api-version=2022-03-01-preview';
const TOKEN_TIMEOUT_MS = 10_000;

interface UpstreamTokenPayload {
  token?: unknown;
  expires_in?: unknown;
  expiresIn?: unknown;
  domain?: unknown;
  directLineUrl?: unknown;
  channelUrlsById?: {directline?: unknown};
}

function readBoundedToken(value: unknown): string {
  if (typeof value !== 'string') throw new Error('TOKEN_MISSING');
  const token = value.trim();
  if (!token || token.length > 16_384) throw new Error('TOKEN_INVALID');
  return token;
}

export function normalizeDirectLineDomain(value?: unknown): string {
  const input =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : DEFAULT_DIRECT_LINE_DOMAIN;
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('DIRECT_LINE_DOMAIN_INVALID');
  }
  url.hash = '';
  url.search = '';
  const pathname = url.pathname.replace(/\/+$/u, '');
  url.pathname = pathname.endsWith('/v3/directline')
    ? pathname
    : `${pathname}/v3/directline`.replace(/\/+/gu, '/');
  return url.toString().replace(/\/$/u, '');
}

function readExpiry(payload: UpstreamTokenPayload): number | undefined {
  const raw = payload.expiresIn ?? payload.expires_in;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
    ? raw
    : undefined;
}

async function parseTokenResponse(
  response: Response,
  configuredDomain?: string,
): Promise<CopilotTokenResponse> {
  if (!response.ok) throw new Error('TOKEN_UPSTREAM_REJECTED');
  const payload = (await response.json()) as UpstreamTokenPayload;
  const domain = normalizeDirectLineDomain(
    configuredDomain ??
      payload.domain ??
      payload.directLineUrl ??
      payload.channelUrlsById?.directline,
  );
  return {
    token: readBoundedToken(payload.token),
    domain,
    expiresIn: readExpiry(payload),
  };
}

export function isCopilotTokenConfigured(): boolean {
  const hasEndpoint = Boolean(process.env.COPILOT_STUDIO_TOKEN_ENDPOINT?.trim());
  const hasSecret = Boolean(process.env.COPILOT_DIRECT_LINE_SECRET?.trim());
  return !(hasEndpoint && hasSecret);
}

export async function requestCopilotToken(
  fetcher: typeof fetch = fetch,
): Promise<CopilotTokenResponse> {
  const tokenEndpoint = process.env.COPILOT_STUDIO_TOKEN_ENDPOINT?.trim();
  const directLineSecret = process.env.COPILOT_DIRECT_LINE_SECRET?.trim();
  const configuredDomain = process.env.COPILOT_DIRECT_LINE_DOMAIN?.trim();

  if (tokenEndpoint && directLineSecret) {
    throw new Error('COPILOT_TOKEN_CONFIGURATION_INVALID');
  }

  if (tokenEndpoint) {
    const endpoint = new URL(tokenEndpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
      throw new Error('TOKEN_ENDPOINT_INVALID');
    }
    return parseTokenResponse(
      await fetcher(endpoint, {
        cache: 'no-store',
        headers: {Accept: 'application/json'},
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      }),
      configuredDomain,
    );
  }

  if (directLineSecret) {
    const domain = normalizeDirectLineDomain(configuredDomain);
    return parseTokenResponse(
      await fetcher(`${domain}/tokens/generate`, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${directLineSecret}`,
        },
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      }),
      domain,
    );
  }

  return parseTokenResponse(
    await fetcher(COPILOT_PUBLIC_TOKEN_ENDPOINT, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    }),
    configuredDomain,
  );
}
