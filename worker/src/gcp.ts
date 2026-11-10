// Worker → Cloud Run Job 실행 (서비스 계정 JWT → OAuth 토큰 → jobs:run)

export type GcpConfig = {
  /** 서비스 계정 키 JSON 전체 (Secret) */
  GCP_SA_KEY?: string
  GCP_PROJECT?: string
  GCP_REGION?: string
  GCP_JOB?: string
}

export class GcpNotConfigured extends Error {}

type ServiceAccount = { client_email: string; private_key: string }

let cached: { token: string; exp: number } | null = null

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp - 60 > now) return cached.token

  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  })
  if (!res.ok) throw new Error(`GCP 토큰 발급 실패 (${res.status})`)
  const data = await res.json<{ access_token: string; expires_in: number }>()
  cached = { token: data.access_token, exp: now + data.expires_in }
  return data.access_token
}

/** 크롤러 Job 실행. RUN_ID env로 crawl_runs 행을 넘김 */
export async function runCrawlerJob(cfg: GcpConfig, runId: number): Promise<void> {
  if (!cfg.GCP_SA_KEY || !cfg.GCP_PROJECT || !cfg.GCP_REGION || !cfg.GCP_JOB) {
    throw new GcpNotConfigured('갱신 서버(GCP)가 아직 설정되지 않았습니다')
  }
  const token = await accessToken(JSON.parse(cfg.GCP_SA_KEY))
  const url = `https://run.googleapis.com/v2/projects/${cfg.GCP_PROJECT}/locations/${cfg.GCP_REGION}/jobs/${cfg.GCP_JOB}:run`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      overrides: { containerOverrides: [{ env: [{ name: 'RUN_ID', value: String(runId) }] }] },
    }),
  })
  if (!res.ok) throw new Error(`Cloud Run Job 실행 실패 (${res.status}): ${(await res.text()).slice(0, 200)}`)
}
