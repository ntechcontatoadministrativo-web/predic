// PREDIC · senhas (scrypt), tokens de sessão e cookies.
import crypto from 'node:crypto';

const N = 16384, R = 8, P = 1, LEN = 64;
const scrypt = (senha, sal) => new Promise((ok, err) => crypto.scrypt(senha, sal, LEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (e, k) => e ? err(e) : ok(k)));

export async function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  return ['scrypt', N, R, P, sal.toString('base64'), (await scrypt(senha, sal)).toString('base64')].join('$');
}
export async function confereSenha(senha, guardado) {
  const [alg, , , , sal, hash] = String(guardado).split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const a = await scrypt(String(senha), Buffer.from(sal, 'base64')), b = Buffer.from(hash, 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar quais contas existem.
export const HASH_FICTICIO = 'scrypt$16384$8$1$' + Buffer.alloc(16).toString('base64') + '$' + Buffer.alloc(64).toString('base64');

export const novoToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = t => crypto.createHash('sha256').update(String(t)).digest('hex');
export const novoId = (pref = '') => pref + crypto.randomBytes(9).toString('base64url');
// Senha provisória legível (sem caracteres ambíguos), entregue uma única vez ao administrador.
export function senhaProvisoria() {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(12); let s = '';
  for (let i = 0; i < 12; i++) s += A[b[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}
export function validaSenha(s) {
  s = String(s || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (s.length > 200) return 'Senha longa demais.';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return 'Use letras e números na senha.';
  return null;
}
export const emailValido = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(e || ''));

export const COOKIE = 'predic_sessao';
export function lerCookie(req, nome = COOKIE) {
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('='); if (i < 0) continue;
    if (p.slice(0, i).trim() === nome) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return '';
}
export const cookieSessao = (token, maxAge, seguro) =>
  `${COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? maxAge : 0}${seguro ? '; Secure' : ''}`;
