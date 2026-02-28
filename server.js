const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT || 8080);
const rootDir = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.class': 'application/java-vm',
  '.jar': 'application/java-archive'
};

const monsters = [
  { name: 'Goblin Raider', hp: 65, attackMin: 6, attackMax: 11, gold: 12 },
  { name: 'Warg', hp: 82, attackMin: 8, attackMax: 13, gold: 16 },
  { name: 'Dark Acolyte', hp: 95, attackMin: 9, attackMax: 15, gold: 19 },
  { name: 'Cave Troll', hp: 120, attackMin: 11, attackMax: 18, gold: 24 }
];

const bosses = [
  { name: 'Ancient Dragon', hp: 190, attackMin: 15, attackMax: 24, gold: 80 },
  { name: 'The Dark Lord', hp: 230, attackMin: 18, attackMax: 28, gold: 110 }
];

const rooms = new Map();

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRoom(roomName) {
  const key = roomName.toLowerCase();
  if (!rooms.has(key)) {
    rooms.set(key, {
      key,
      displayName: roomName,
      players: new Map(),
      clients: new Set(),
      encounter: 0,
      enemy: null,
      log: ['A new party gathers. Join and prepare for battle.']
    });
  }
  return rooms.get(key);
}

function roomSnapshot(room) {
  return {
    room: room.displayName,
    encounter: room.encounter,
    enemy: room.enemy,
    players: Array.from(room.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      level: player.level,
      xp: player.xp,
      xpToNext: player.xpToNext,
      gold: player.gold,
      hp: player.hp,
      maxHp: player.maxHp,
      mana: player.mana,
      maxMana: player.maxMana,
      potions: player.potions,
      alive: player.alive
    })),
    log: room.log.slice(0, 35)
  };
}

function broadcast(room) {
  const data = `event: state\ndata: ${JSON.stringify(roomSnapshot(room))}\n\n`;
  for (const client of room.clients) {
    client.write(data);
  }
}

function addLog(room, message) {
  room.log.unshift(message);
  room.log = room.log.slice(0, 60);
}

function scaleEnemy(template, encounter, boss) {
  const scale = 1 + Math.max(0, encounter - 1) * 0.12;
  return {
    name: template.name,
    hp: Math.floor(template.hp * scale),
    maxHp: Math.floor(template.hp * scale),
    attackMin: Math.floor(template.attackMin * scale),
    attackMax: Math.floor(template.attackMax * scale),
    gold: Math.floor(template.gold * scale),
    boss
  };
}

function spawnEnemy(room) {
  room.encounter += 1;
  const boss = room.encounter % 5 === 0;
  const source = boss ? bosses : monsters;
  const template = source[rand(0, source.length - 1)];
  room.enemy = scaleEnemy(template, room.encounter, boss);
  addLog(room, `${room.enemy.boss ? 'Boss' : 'Enemy'} encounter #${room.encounter}: ${room.enemy.name} appears!`);
}

function allPlayersDead(room) {
  return Array.from(room.players.values()).every((player) => !player.alive);
}

function applyLevelUps(player, room) {
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.floor(player.xpToNext * 1.35);
    player.maxHp += 16;
    player.maxMana += 7;
    player.attackMin += 2;
    player.attackMax += 3;
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    player.alive = true;
    addLog(room, `${player.name} reached level ${player.level}!`);
  }
}

function damageEnemy(room, player, amount, source) {
  if (!room.enemy) return;
  room.enemy.hp = Math.max(0, room.enemy.hp - amount);
  addLog(room, `${player.name} ${source} ${room.enemy.name} for ${amount}.`);

  if (room.enemy.hp <= 0) {
    addLog(room, `${room.enemy.name} is defeated!`);
    for (const teammate of room.players.values()) {
      const goldShare = Math.max(3, Math.floor(room.enemy.gold / Math.max(1, room.players.size)));
      const xpGain = room.enemy.boss ? 45 : 20;
      teammate.gold += goldShare;
      teammate.xp += xpGain;
      if (Math.random() < 0.25) teammate.potions += 1;
      applyLevelUps(teammate, room);
    }
    room.enemy = null;
  }
}

function enemyTurn(room) {
  if (!room.enemy) return;
  const alive = Array.from(room.players.values()).filter((player) => player.alive);
  if (!alive.length) return;

  const target = alive[rand(0, alive.length - 1)];
  const dmg = rand(room.enemy.attackMin, room.enemy.attackMax);
  target.hp = Math.max(0, target.hp - dmg);
  addLog(room, `${room.enemy.name} strikes ${target.name} for ${dmg}.`);

  if (target.hp <= 0) {
    target.alive = false;
    addLog(room, `${target.name} has fallen!`);
  }

  if (allPlayersDead(room)) {
    addLog(room, 'The party was defeated. A fresh expedition begins.');
    room.enemy = null;
    room.encounter = 0;
    for (const player of room.players.values()) {
      player.hp = player.maxHp;
      player.mana = player.maxMana;
      player.alive = true;
      player.gold = Math.max(0, player.gold - 10);
    }
  }
}

function handleAction(room, payload) {
  const player = room.players.get(payload.playerId);
  if (!player || !player.alive) return;

  if (!room.enemy && payload.action !== 'next') return;

  switch (payload.action) {
    case 'attack': {
      const dmg = rand(player.attackMin, player.attackMax);
      damageEnemy(room, player, dmg, 'slashes');
      if (room.enemy) enemyTurn(room);
      break;
    }
    case 'spell': {
      if (player.mana < 10) return;
      player.mana -= 10;
      const dmg = rand(player.attackMax + 5, player.attackMax + 15);
      damageEnemy(room, player, dmg, 'casts arcane blast on');
      if (room.enemy) enemyTurn(room);
      break;
    }
    case 'potion': {
      if (!player.potions || player.hp === player.maxHp) return;
      player.potions -= 1;
      const heal = rand(20, 36);
      player.hp = Math.min(player.maxHp, player.hp + heal);
      addLog(room, `${player.name} drinks a potion and restores ${heal} HP.`);
      if (room.enemy) enemyTurn(room);
      break;
    }
    case 'rest': {
      const mana = rand(5, 11);
      player.mana = Math.min(player.maxMana, player.mana + mana);
      addLog(room, `${player.name} regains ${mana} mana.`);
      if (room.enemy) enemyTurn(room);
      break;
    }
    case 'next': {
      if (room.enemy) return;
      for (const teammate of room.players.values()) {
        teammate.hp = Math.min(teammate.maxHp, teammate.hp + rand(6, 12));
        teammate.mana = Math.min(teammate.maxMana, teammate.mana + rand(4, 8));
        if (teammate.hp > 0) teammate.alive = true;
      }
      spawnEnemy(room);
      break;
    }
    default:
      return;
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function serveFile(req, res) {
  const reqPath = decodeURIComponent(req.url.split('?')[0]);
  const safePath = path.normalize(reqPath === '/' ? '/index.html' : reqPath).replace(/^\.+/, '');
  const absolutePath = path.join(rootDir, safePath);

  if (!absolutePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(absolutePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    fs.createReadStream(absolutePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/events')) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomName = (url.searchParams.get('room') || 'global').trim().slice(0, 24) || 'global';
    const name = (url.searchParams.get('name') || 'Adventurer').trim().slice(0, 24) || 'Adventurer';

    const room = getRoom(roomName);
    const id = crypto.randomUUID();
    const player = {
      id,
      name,
      level: 1,
      xp: 0,
      xpToNext: 45,
      gold: 0,
      maxHp: 100,
      hp: 100,
      maxMana: 35,
      mana: 35,
      attackMin: 8,
      attackMax: 14,
      potions: 2,
      alive: true
    };

    room.players.set(id, player);
    addLog(room, `${name} joined ${room.displayName}.`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ playerId: id, room: room.displayName })}\n\n`);

    room.clients.add(res);
    if (!room.enemy) {
      spawnEnemy(room);
    }
    broadcast(room);

    req.on('close', () => {
      room.clients.delete(res);
      room.players.delete(id);
      addLog(room, `${name} left the realm.`);
      if (!room.players.size) {
        rooms.delete(room.key);
        return;
      }
      broadcast(room);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/action') {
    try {
      const payload = await parseBody(req);
      const roomName = String(payload.room || '').trim();
      const room = rooms.get(roomName.toLowerCase());
      if (!room) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Room not found' }));
        return;
      }
      handleAction(room, payload);
      broadcast(room);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }));
    }
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  serveFile(req, res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Phantasia server listening on ${port}`);
});
