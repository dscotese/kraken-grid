import fs from 'fs';
import path from 'path';
import cryptex from 'cryptex';
import crypto from 'crypto';
import PSCon from 'prompt-sync';

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

    function hashArg(arg: any): string {
        let hash = 0; 
        const string = JSON.stringify(arg);
        for (let i = 0; i < string.length; i += 1) {
            const code = string.charCodeAt(i);
            // eslint-disable-next-line no-bitwise
            hash = ((hash<<5)-hash)+code;
            // eslint-disable-next-line no-bitwise
            hash &= hash; // Convert to 32bit integer
        }
        return (`h${hash}`).replace('-','h');
    }
    
    let fn = hashArg(pwp);
    const homeDir = process.env.APPDATA
        || (process.platform === 'darwin'
            ? path.join(process.env.HOME || "", "Library", "Preferences")
            : path.join(process.env.HOME || "", ".local", "share"));
    let keyFile = path.join(homeDir, `${process.TESTING ? 'test' : ''}${fn}.txt`);
    let pw = (!process.TESTING || !fs.existsSync(keyFile))
        ? prompt("Enter your password (or a new one): ", {echo: '*'})
        : pwp;
    if(pw !== pwp) { // New Password means new file.
        fn = hashArg(pw);
        keyFile = path.join(homeDir, `${process.TESTING ? 'test' : ''}${fn}.txt`);
    }

    let persistent: any;

    console.log("Encrypted data stored in", keyFile);
        
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
    
    async function replace(obj: any): Promise<void> {
        // Turn object into a string
        const toWrite = JSON.stringify(obj);
        // When pw starts with TestPW, we do not encrypt.
        if(/^TestPW/.test(pw)) {
            return fs.writeFileSync(keyFile, toWrite);
        }
        // Encrypt the string
        return cryptex.encrypt(toWrite)
            // Write the string to the file
            .then((e: string) => fs.writeFileSync(keyFile, e));
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
        if(!fs.existsSync(f)) await ssUpdate("NoDefault NoDefault");
        // Put the file contents into a string
        const enc64 = fs.readFileSync(f).toString();
        let ret: any = enc64;
        if(!/^TestPW/.test(pw)) {
            ret = await cryptex.decrypt(enc64)
                .then(async (r: string) => {
                    try { 
                        return JSON.parse(r); 
                    } catch(e) {
                        return await ssUpdate(enc64);
                    }
                }, async () => (ssUpdate(enc64)));
        } else ret = JSON.parse(ret); 
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