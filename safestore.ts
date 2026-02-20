import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PSCon from 'prompt-sync';

// Try to import cryptex for backward compatibility
let cryptex: any = null;
try {
    const cryptexModule = await import('cryptex');
    cryptex = cryptexModule.default;
} catch (e) {
    console.log('cryptex not available - can only read new format files');
}

// Type definitions for safestore.ts
export interface SafestoreInstance {
    persistent: any;
    read: (f?: string) => Promise<any>;
    replace: (obj: any) => Promise<void>;
    _update: (old: string, exitOnFail?: boolean) => Promise<any>;
    getPW: () => string;
}

const prompt = PSCon({sigint: true});

function Safestore(pwp: string = 'abc123'): SafestoreInstance {
    console.log(process.TESTING
        ? "Running in TEST mode."
        : "Running in PRODUCTION mode.");

    function hashArg(arg: any, useNew: boolean = false): string {
        if (useNew) {
            // New: Use crypto.createHash for secure filename
            const string = JSON.stringify(arg);
            return crypto.createHash('sha256')
                .update(string)
                .digest('hex')
                .slice(-16);  // Last 16 chars.
        } else {
            // Old: Original custom hash for backward compatibility
            let hash = 0; 
            const string = JSON.stringify(arg);
            for (let i = 0; i < string.length; i += 1) {
                const code = string.charCodeAt(i);
                // eslint-disable-next-line no-bitwise
                hash = ((hash << 5)-hash)+code;
                // eslint-disable-next-line no-bitwise
                hash &= hash; // Convert to 32bit integer
            }
            return (`h${hash}`).replace('-','h');
        }
    }
    
    let oldFn = hashArg(pwp);
    let fn = `crypto-v1-${hashArg(pwp, true)}`; // New format
    const homeDir = process.env.APPDATA
        || (process.platform === 'darwin'
            ? path.join(process.env.HOME || "", "Library", "Preferences")
            : path.join(process.env.HOME || "", ".local", "share"));
    let keyFile = path.join(homeDir, `${process.TESTING ? 'test' : ''}${fn}.txt`);
    let pw = (!process.TESTING || !fs.existsSync(keyFile))
        ? prompt("Enter your password (or a new one): ", {echo: '*'})
        : pwp;
    if(pw !== pwp) { // New Password means new file.
        fn = `crypto-v1-${hashArg(pw, true)}`;
        keyFile = path.join(homeDir, `${process.TESTING ? 'test' : ''}${fn}.txt`);
    }
    const oldKeyFile = path.join(homeDir, 
        `${process.TESTING ? 'test' : ''}${oldFn}.txt`);
    let persistent: any;

    console.log("Encrypted data stored in", keyFile);
       
    // Configure cryptex if available (for reading old format)
    if (cryptex) { 
        cryptex.update({
            config: {
                keySource: 'plaintext',
                keySourceEncoding: 'base64',
                keySourceOpts: {
                     key: crypto.createHash('sha256')
                        .update(pw).digest('base64')
                    }
            }
        });
    }

    // Create encryption key from password (32 bytes for AES-256)
    const encryptionKey = crypto.createHash('sha256').update(pw).digest();
    
    // Encryption function using AES-256-GCM (new format)
    function encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
        
        let encrypted = cipher.update(text, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const authTag = cipher.getAuthTag();
        
        return JSON.stringify({
            version: 'crypto-v1',
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            data: encrypted
        });
    }
    
    // Decryption function using AES-256-GCM (new format)
    function decrypt(encryptedData: string): string {
        const parts = JSON.parse(encryptedData);
        const iv = Buffer.from(parts.iv, 'base64');
        const authTag = Buffer.from(parts.authTag, 'base64');
        const encrypted = parts.data;
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
    
    // Detect format and decrypt accordingly
    async function smartDecrypt(encryptedData: string): Promise<string> {
        try {
            const parsed = JSON.parse(encryptedData);
            if (parsed.version === 'crypto-v1') {
                return decrypt(encryptedData);
            }
        } catch (e) {
            // Not JSON or different format - likely old cryptex format
        }
        
        // Old format - try cryptex if available
        if (cryptex) {
            try {
                console.log('Detected old format. Migrating to new encryption...');
                const decrypted = await cryptex.decrypt(encryptedData);
                return decrypted;
            } catch (e) {
                throw new Error('Failed to decrypt with old format');
            }
        } else {
            throw new Error('Old format detected but cryptex not available for migration');
        }
    }
    
    async function replace(obj: any): Promise<void> {
        // Turn object into a string
        const toWrite = JSON.stringify(obj);
        // When pw starts with TestPW, we do not encrypt.
        if(/^TestPW/.test(pw)) {
            return fs.writeFileSync(keyFile, toWrite);
        }
        // Always encrypt with new format going forward
        const encrypted = encrypt(toWrite);
        fs.writeFileSync(keyFile, encrypted);
    }

    async function ssUpdate(old: string, exitOnFail: boolean = true): Promise<any> {
        const [k, s] = old.split(' ');
        if(s) {
            console.log("Your data will now be encrypted using the password you just entered.",
                "\nThe default values were taken from the old file, which will now be replaced...");
        } else {
            console.log("Incorrect password.");
            return false;
        }
        const key = prompt(`Enter your API key (Or x to start over) (${k}): `, k);
        if(key === 'x') {
            if(exitOnFail) process.exit(); else return '';
        }
        const secret = prompt(`Enter your API secret (${s}): `, s);
        let pw2 = '';
        while(pw2 !== pw) {
            pw2 = process.TESTING ? pw
                : prompt("Enter your password again (Or x to start over): ", {echo: '*'});
            if(pw2 === 'x') {
                if(exitOnFail) process.exit(); else return '';
            }
            if(pw2 !== pw) {
                if((process.TESTING ? (console.log("Changing test pw to ", pw), 'y')
                    : prompt("That's different. Update to this password? (y/n)")[0]
                        .toLowerCase()) === 'y') {
                    pw = pw2;
                    pw2 +='x';
                }
            }
        }
        const p = {key, secret};
        await replace(p);
        persistent = p;
        return p;
    }

    async function read(f: string = keyFile): Promise<any> {
        // Check if we need to migrate from old format
        if (!fs.existsSync(f) && fs.existsSync(oldKeyFile)) {
            console.log('Migrating from old encryption format...');
            f = oldKeyFile;  // Read from old file
        }
        if(!fs.existsSync(f)) await ssUpdate("NoDefault NoDefault");
        // Put the file contents into a string
        const enc64 = fs.readFileSync(f).toString();
        let ret: any = enc64;
        if(!/^TestPW/.test(pw)) {
            try {
                const decrypted = await smartDecrypt(enc64);
                ret = JSON.parse(decrypted);

               // Auto-migrate if reading from old file or old format
                if (f === oldKeyFile || !enc64.includes('"version":"crypto-v1"')) {
                    console.log('Re-encrypting with new format...');
                    await replace(ret);
                    console.log('Migration complete. New file:', keyFile);
                    // Old file preserved as backup
                    if (f === oldKeyFile && fs.existsSync(keyFile)) {
                        console.log('Old encrypted file preserved as backup:', oldKeyFile);
                    }
                }
            } catch(e) {
                console.error('Decryption failed:', e);
                ret = await ssUpdate(enc64);
            }
        } else {
            ret = JSON.parse(ret);
        }
        return ret;
    }

    function getPW(): string { 
        return pw; 
    }

    return Object.freeze({
        persistent, 
        read, 
        replace, 
        _update: ssUpdate, 
        getPW
    });
}

export default Safestore;
