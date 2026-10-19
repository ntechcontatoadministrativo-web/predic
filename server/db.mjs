// PREDIC · banco de dados (SQLite nativo do Node): empresas, usuários, sessões, estudos, uso da IA e registro de acessos.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, logo TEXT NOT NULL DEFAULT '', cota_usd REAL, criado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE, nome TEXT NOT NULL, cargo TEXT NOT NULL DEFAULT '',
  senha TEXT NOT NULL, papel TEXT NOT NULL DEFAULT 'membro', ativo INTEGER NOT NULL DEFAULT 1,
  trocar_senha INTEGER NOT NULL DEFAULT 0, termos_em INTEGER, criado INTEGER NOT NULL, ultimo_acesso INTEGER
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado INTEGER NOT NULL, expira INTEGER NOT NULL, ip TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS estudos (
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE, id TEXT NOT NULL,
  dados TEXT NOT NULL, resumo TEXT NOT NULL DEFAULT '{}', versao INTEGER NOT NULL DEFAULT 1,
  criado INTEGER NOT NULL, atualizado INTEGER NOT NULL, atualizado_por TEXT,
  PRIMARY KEY (empresa_id, id)
);
CREATE TABLE IF NOT EXISTS uso_ia (
  id INTEGER PRIMARY KEY, empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE, usuario_id TEXT,
  rota TEXT NOT NULL, modelo TEXT, entrada INTEGER, saida INTEGER, cache_leitura INTEGER, cache_escrita INTEGER,
  buscas INTEGER, custo_usd REAL NOT NULL DEFAULT 0, em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS uso_ia_mes ON uso_ia (empresa_id, em);
CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY, empresa_id TEXT, usuario_id TEXT, acao TEXT NOT NULL, detalhe TEXT, ip TEXT, em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS registros_usuario ON registros (usuario_id, em);
CREATE TABLE IF NOT EXISTS cache_dados (
  url TEXT PRIMARY KEY, corpo TEXT NOT NULL, em INTEGER NOT NULL
);
`;

export function abrirBanco(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'predic.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  const q = {}; const p = (k, sql) => { q[k] = db.prepare(sql); };
  p('contarUsuarios', 'SELECT COUNT(*) AS n FROM usuarios');
  p('novaEmpresa', 'INSERT INTO empresas (id, nome, cota_usd, criado) VALUES (?, ?, ?, ?)');
  p('empresa', 'SELECT * FROM empresas WHERE id = ?');
  p('atualizarEmpresa', 'UPDATE empresas SET nome = ?, logo = ?, cota_usd = ? WHERE id = ?');
  p('excluirEmpresa', 'DELETE FROM empresas WHERE id = ?');
  p('novoUsuario', 'INSERT INTO usuarios (id, empresa_id, email, nome, cargo, senha, papel, trocar_senha, termos_em, criado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  p('usuario', 'SELECT * FROM usuarios WHERE id = ?');
  p('usuarioEmail', 'SELECT * FROM usuarios WHERE email = ?');
  p('usuariosEmpresa', 'SELECT id, email, nome, cargo, papel, ativo, trocar_senha, criado, ultimo_acesso FROM usuarios WHERE empresa_id = ? ORDER BY nome');
  p('adminsAtivos', "SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ? AND papel = 'admin' AND ativo = 1");
  p('atualizarUsuario', 'UPDATE usuarios SET nome = ?, cargo = ?, papel = ?, ativo = ? WHERE id = ?');
  p('senhaUsuario', 'UPDATE usuarios SET senha = ?, trocar_senha = ? WHERE id = ?');
  p('termosUsuario', 'UPDATE usuarios SET termos_em = ? WHERE id = ?');
  p('acessoUsuario', 'UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?');
  p('excluirUsuario', 'DELETE FROM usuarios WHERE id = ?');
  p('novaSessao', 'INSERT INTO sessoes (token, usuario_id, criado, expira, ip, ua) VALUES (?, ?, ?, ?, ?, ?)');
  p('sessao', 'SELECT s.token, s.expira, u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?');
  p('renovarSessao', 'UPDATE sessoes SET expira = ? WHERE token = ?');
  p('excluirSessao', 'DELETE FROM sessoes WHERE token = ?');
  p('excluirSessoesUsuario', 'DELETE FROM sessoes WHERE usuario_id = ?');
  p('excluirOutrasSessoes', 'DELETE FROM sessoes WHERE usuario_id = ? AND token <> ?');
  p('sessoesUsuario', 'SELECT criado, expira, ip, ua FROM sessoes WHERE usuario_id = ?');
  p('limparSessoes', 'DELETE FROM sessoes WHERE expira < ?');
  p('indiceEstudos', 'SELECT e.id, e.resumo, e.versao, e.atualizado, u.nome AS autor FROM estudos e LEFT JOIN usuarios u ON u.id = e.atualizado_por WHERE e.empresa_id = ? ORDER BY e.atualizado DESC');
  p('estudo', 'SELECT e.*, u.nome AS autor FROM estudos e LEFT JOIN usuarios u ON u.id = e.atualizado_por WHERE e.empresa_id = ? AND e.id = ?');
  p('inserirEstudo', 'INSERT INTO estudos (empresa_id, id, dados, resumo, versao, criado, atualizado, atualizado_por) VALUES (?, ?, ?, ?, 1, ?, ?, ?)');
  p('atualizarEstudo', 'UPDATE estudos SET dados = ?, resumo = ?, versao = versao + 1, atualizado = ?, atualizado_por = ? WHERE empresa_id = ? AND id = ? AND versao = ?');
  p('excluirEstudo', 'DELETE FROM estudos WHERE empresa_id = ? AND id = ?');
  p('contarEstudos', 'SELECT COUNT(*) AS n FROM estudos WHERE empresa_id = ?');
  p('registrarUso', 'INSERT INTO uso_ia (empresa_id, usuario_id, rota, modelo, entrada, saida, cache_leitura, cache_escrita, buscas, custo_usd, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  p('gastoDesde', 'SELECT COALESCE(SUM(custo_usd), 0) AS usd, COUNT(*) AS n FROM uso_ia WHERE empresa_id = ? AND em >= ?');
  p('gastoPorUsuario', 'SELECT u.nome, x.usuario_id, SUM(x.custo_usd) AS usd, COUNT(*) AS n FROM uso_ia x LEFT JOIN usuarios u ON u.id = x.usuario_id WHERE x.empresa_id = ? AND x.em >= ? GROUP BY x.usuario_id ORDER BY usd DESC');
  p('gastoPorRota', 'SELECT rota, modelo, SUM(custo_usd) AS usd, COUNT(*) AS n, SUM(entrada) AS entrada, SUM(saida) AS saida, SUM(cache_leitura) AS cache FROM uso_ia WHERE empresa_id = ? AND em >= ? GROUP BY rota, modelo ORDER BY usd DESC');
  p('usoUsuario', 'SELECT rota, modelo, entrada, saida, custo_usd, em FROM uso_ia WHERE usuario_id = ? ORDER BY em DESC');
  p('anonimizarUso', 'UPDATE uso_ia SET usuario_id = NULL WHERE usuario_id = ?');
  p('registrar', 'INSERT INTO registros (empresa_id, usuario_id, acao, detalhe, ip, em) VALUES (?, ?, ?, ?, ?, ?)');
  p('registrosUsuario', 'SELECT acao, detalhe, ip, em FROM registros WHERE usuario_id = ? ORDER BY em DESC LIMIT 1000');
  p('anonimizarRegistros', 'UPDATE registros SET usuario_id = NULL, ip = NULL WHERE usuario_id = ?');
  p('limparRegistros', 'DELETE FROM registros WHERE em < ?');
  p('cacheLer', 'SELECT corpo, em FROM cache_dados WHERE url = ?');
  p('cacheGravar', 'INSERT INTO cache_dados (url, corpo, em) VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET corpo = excluded.corpo, em = excluded.em');
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return { db, q, tx };
}
