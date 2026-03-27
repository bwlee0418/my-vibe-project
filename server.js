/**
 * CX Assistant — 백엔드 서버
 *
 * API 키를 .env 파일에서 관리하여 브라우저에 노출되지 않도록 합니다.
 * 프론트엔드(index.html)는 이 서버의 /api/* 엔드포인트를 호출합니다.
 *
 * 실행: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── .env 파일 로드 ──────────────────────────────────────
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        console.error('❌ .env 파일이 없습니다. .env.example을 복사해서 만들어주세요:');
        console.error('   cp .env.example .env');
        process.exit(1);
    }
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
    }
}

loadEnv();

const PORT = process.env.PORT || 3000;
const PROVIDER = process.env.AI_PROVIDER || 'bedrock';

// ── AWS Signature V4 (Bedrock용) ────────────────────────
function hmacSha256(key, msg) {
    return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}
function sha256Hex(msg) {
    return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

function signBedrockRequest(method, urlPath, body, region, accessKey, secretKey) {
    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateOnly = dateStamp.substring(0, 8);
    const service = 'bedrock';
    const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
    const payloadHash = sha256Hex(body);

    const headers = {
        'content-type': 'application/json',
        'host': host,
        'x-amz-date': dateStamp,
        'x-amz-content-sha256': payloadHash,
    };

    const signedHeaderKeys = Object.keys(headers).sort();
    const signedHeaders = signedHeaderKeys.join(';');
    const canonicalHeaders = signedHeaderKeys.map(k => k + ':' + headers[k] + '\n').join('');
    const canonicalRequest = `${method}\n${urlPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const stringToSign = `AWS4-HMAC-SHA256\n${dateStamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

    let signingKey = hmacSha256('AWS4' + secretKey, dateOnly);
    signingKey = hmacSha256(signingKey, region);
    signingKey = hmacSha256(signingKey, service);
    signingKey = hmacSha256(signingKey, 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        url: `https://${host}${urlPath}`,
        headers: { ...headers, 'Authorization': authHeader }
    };
}

// ── AI API 호출 ─────────────────────────────────────────
async function callAI(systemPrompt, userMessage) {
    if (PROVIDER === 'bedrock') return callBedrock(systemPrompt, userMessage);
    if (PROVIDER === 'openai') return callOpenAI(systemPrompt, userMessage);
    if (PROVIDER === 'anthropic') return callAnthropic(systemPrompt, userMessage);
    throw new Error('AI_PROVIDER가 올바르지 않습니다. bedrock, openai, anthropic 중 하나를 설정하세요.');
}

async function callBedrock(systemPrompt, userMessage) {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const model = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514-v1:0';

    if (!accessKey || !secretKey) throw new Error('AWS 자격 증명이 .env에 설정되지 않았습니다.');

    const urlPath = `/model/${encodeURIComponent(model)}/invoke`;
    const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
    });

    const signed = signBedrockRequest('POST', urlPath, body, region, accessKey, secretKey);

    const resp = await fetch(signed.url, {
        method: 'POST',
        headers: signed.headers,
        body: body
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Bedrock API 오류 (${resp.status}): ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    return data.content[0].text;
}

async function callOpenAI(systemPrompt, userMessage) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY가 .env에 설정되지 않았습니다.');

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
            max_tokens: 4096
        })
    });

    if (!resp.ok) throw new Error('OpenAI API 오류: ' + (await resp.text()).substring(0, 300));
    const data = await resp.json();
    return data.choices[0].message.content;
}

async function callAnthropic(systemPrompt, userMessage) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 .env에 설정되지 않았습니다.');

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            max_tokens: 4096
        })
    });

    if (!resp.ok) throw new Error('Anthropic API 오류: ' + (await resp.text()).substring(0, 300));
    const data = await resp.json();
    return data.content[0].text;
}

// ── HTTP 서버 ───────────────────────────────────────────
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    // CORS (개발 편의용)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ── API 엔드포인트 ──
    if (url.pathname === '/api/ai' && req.method === 'POST') {
        try {
            const body = JSON.parse(await readBody(req));
            const { systemPrompt, userMessage } = body;
            if (!systemPrompt || !userMessage) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'systemPrompt와 userMessage가 필요합니다.' }));
                return;
            }
            const result = await callAI(systemPrompt, userMessage);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result }));
        } catch (e) {
            console.error('AI API 오류:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }

    if (url.pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ provider: PROVIDER, status: 'ok' }));
        return;
    }

    // ── 정적 파일 서빙 ──
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, filePath);

    try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(404); res.end('Not Found');
        }
    } catch {
        res.writeHead(404); res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║   🚀 CX Assistant 서버가 시작되었습니다    ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║   주소: http://localhost:${PORT}             ║`);
    console.log(`  ║   AI:   ${PROVIDER.padEnd(33)}║`);
    console.log('  ║   종료: Ctrl + C                         ║');
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
});
