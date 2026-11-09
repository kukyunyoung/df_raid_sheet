// 로그인 대신 브라우저별 device_id + 사용자가 입력한 이름으로 작업자 식별
const ID_KEY = 'dfl.deviceId'
const NAME_KEY = 'dfl.actorName'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장 불가(시크릿 모드 등)여도 이번 세션 동안은 메모리 값 사용
  }
}

let deviceId = read(ID_KEY)
let actorName = read(NAME_KEY) ?? ''

export function getDeviceId(): string {
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    write(ID_KEY, deviceId)
  }
  return deviceId
}

export function getActorName(): string {
  return actorName
}

export function setActorName(name: string) {
  actorName = name.trim()
  write(NAME_KEY, actorName)
}

// 관리자 비밀번호: 공대표 생성/기수 추가 때 한 번 입력하면 이 브라우저에 기억
const ADMIN_KEY = 'dfl.adminPassword'
let adminPassword = read(ADMIN_KEY) ?? ''

export function getAdminPassword(): string {
  return adminPassword
}

export function setAdminPassword(pw: string) {
  adminPassword = pw
  try {
    if (pw) localStorage.setItem(ADMIN_KEY, pw)
    else localStorage.removeItem(ADMIN_KEY)
  } catch {
    // 저장 불가여도 이번 세션 동안은 메모리 값 사용
  }
}

export function actorHeaders(): Record<string, string> {
  return {
    'X-Device-Id': getDeviceId(),
    // 헤더는 ASCII만 가능하므로 인코딩
    'X-Actor-Name': encodeURIComponent(actorName),
    ...(adminPassword ? { 'X-Admin-Password': adminPassword } : {}),
  }
}
