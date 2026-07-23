/**
 * Write android/local.properties pointing Gradle at the local SDK.
 *
 * Done in Node rather than inline shell because the value is a Windows path in a
 * Java .properties file: backslashes are escape characters there and must be
 * doubled, which is fiddly to get right through several layers of shell quoting.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const sdk = resolve('.toolchain/sdk');
const jdk = resolve('.toolchain/jdk-21.0.11+10');

if (!existsSync(sdk)) {
  console.error(`Android SDK not found at ${sdk}`);
  process.exit(1);
}

const esc = (p) => p.replace(/\\/g, '\\\\');
const body = `sdk.dir=${esc(sdk)}\n`;

writeFileSync('android/local.properties', body);
console.log(body.trim());
console.log(`JAVA_HOME should be: ${jdk}`);
