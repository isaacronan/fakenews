const http = require('http');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const redis = require('redis');

const PORT = process.env.PORT;
const template = fs.readFileSync(path.resolve(__dirname, './template.html')).toString();

const client = redis.createClient({
    host: process.env.STORE_HOST,
    port: process.env.STORE_PORT,
    retry_strategy: () => 1000
});

const server = http.createServer(async (_, res) => {
    const MINWORDS = 500;
    const lengths = await promisify(client.smembers).call(client, 'phrases:lengths');

    const multiPhraseCounts = client.multi();
    lengths.forEach((length) => {
        multiPhraseCounts.zcard(`phrases:${length}`);
    });
    const phraseCounts = await promisify(multiPhraseCounts.exec).call(multiPhraseCounts);

    const multiPhrases = client.multi();
    let wordCount = 0;
    while (wordCount < MINWORDS) {
        const lengthIndex = Math.floor(Math.random() * lengths.length);
        const phraseIndex = Math.floor(Math.random() * phraseCounts[lengthIndex]);
        multiPhrases.zrange(`phrases:${lengths[lengthIndex]}`, phraseIndex, phraseIndex);

        wordCount += Number(lengths[lengthIndex]);
    }
    const phrases = (await promisify(multiPhrases.exec).call(multiPhrases))
        .filter(phrase => phrase.length).map(([phrase]) => phrase);

    const heading = phrases.pop().replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const content = phrases.join(' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

    const html = template
        .replace('<!-- heading -->', heading)
        .replace('<!-- content -->', content);

    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(html);
});

server.listen(PORT, () => {
    console.log(`listening on port ${PORT}...`);
});