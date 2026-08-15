import {
  isTeacherStudentProfile,
  type TeacherStudentProfile,
} from './teacher-records';

export const TEACHER_VAULT_STORAGE_KEY = 'reverse_teacher_profile_v1';
const PBKDF2_ITERATIONS = 310_000;

interface TeacherVaultEnvelope {
  ciphertext: string;
  iterations: number;
  iv: string;
  salt: string;
  v: 1;
}

export interface TeacherVaultSession {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
}

export interface OpenTeacherVaultResult {
  profile?: TeacherStudentProfile;
  session: TeacherVaultSession;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', hash: 'SHA-256', salt, iterations},
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt'],
  );
}

function parseEnvelope(serialized: string): TeacherVaultEnvelope {
  const envelope = JSON.parse(serialized) as Partial<TeacherVaultEnvelope>;
  if (
    envelope.v !== 1 ||
    envelope.iterations !== PBKDF2_ITERATIONS ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new Error('INVALID_TEACHER_VAULT');
  }
  return envelope as TeacherVaultEnvelope;
}

export async function openTeacherVault(
  passphrase: string,
  serialized?: string | null,
): Promise<OpenTeacherVaultResult> {
  if (!passphrase) throw new Error('TEACHER_KEY_REQUIRED');
  if (!serialized) {
    const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
    return {
      session: {
        key: await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS),
        salt,
      },
    };
  }

  const envelope = parseEnvelope(serialized);
  const salt = base64ToBytes(envelope.salt);
  const key = await deriveVaultKey(passphrase, salt, envelope.iterations);
  const plaintext = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv: base64ToBytes(envelope.iv)},
    key,
    base64ToBytes(envelope.ciphertext),
  );
  const profile: unknown = JSON.parse(
    new TextDecoder('utf-8', {fatal: true}).decode(plaintext),
  );
  if (!isTeacherStudentProfile(profile)) {
    throw new Error('INVALID_TEACHER_PROFILE');
  }
  return {profile, session: {key, salt}};
}

export async function sealTeacherVault(
  profile: TeacherStudentProfile,
  session: TeacherVaultSession,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const plaintext = new TextEncoder().encode(JSON.stringify(profile));
  const ciphertext = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    session.key,
    plaintext,
  );
  const envelope: TeacherVaultEnvelope = {
    v: 1,
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(session.salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}
