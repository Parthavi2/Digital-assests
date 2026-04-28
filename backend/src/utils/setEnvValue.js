const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.resolve(process.cwd(), '.env');
const key = process.argv[2];

if (!key) {
  console.error('Usage: node src/utils/setEnvValue.js GEMINI_API_KEY');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question(`Paste value for ${key}: `, (answer) => {
  const value = answer.trim();
  if (!value) {
    console.error('No value provided.');
    rl.close();
    process.exit(1);
  }

  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  let replaced = false;
  const next = existing.map((line) => {
    if (line.match(new RegExp(`^\\s*${key}\\s*=`))) {
      replaced = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!replaced) next.push(`${key}=${value}`);

  fs.writeFileSync(envPath, `${next.filter((line, index) => line || index < next.length - 1).join('\n')}\n`);
  console.log(`${key} saved to ${envPath}`);
  console.log('Restart the backend so the new value is loaded.');
  rl.close();
});
