const fs = require('fs');
const cryptex = require('cryptex');
const crypto = require('crypto');
const prompt = require('prompt-sync')({sigint: true});
const pw = prompt("Enter your password (or a new one): ",{echo:'*'});
let homeDir = process.env.APPDATA
        || (process.platform == 'darwin'
            ? process.env.HOME + '/Library/Preferences'
            : process.env.HOME + "/.local/share"),
    keyFile = homeDir+'/keys.txt';

class Safestore {

    constructor(pw,file) {
        this.file = file;
        this.pw = pw;
        cryptex.update({
            config: {
                keySource: 'plaintext',
                keySourceEncoding: 'base64',
                keySourceOpts: {
                     key: crypto.createHash('sha256')
                        .update(pw).digest('base64')
                    }
        }});
    }

    async replace(obj) {
        // Turn object into a string
        let toWrite = JSON.stringify(obj);
        // Encrypt the string
        return cryptex.encrypt(toWrite)
            // Write the string to the file
            .then((e) => fs.writeFileSync(this.file, e));
    }

    async read() {
        // Put the file contents into a string
        let enc64 = fs.readFileSync(this.file).toString(),
            ret = enc64;
//        try {
//            let ret = await cryptex.decrypt(enc64);
//console.log("Decrypted to: "+ret);
        // Parse it into an object and return it
//            return JSON.parse(ret);
        await cryptex.decrypt(enc64)
            .then(async (r) => {
                try { ret = JSON.parse(r); 
                } catch(e) {
                    ret = await this._update(enc64);
            }},async (e) => {
                    ret = await this._update(enc64);
                }
            );
        return ret;
    }

    async _update(old) {
        let [k,s] = old.split(' ');
        console.log("Your data will now be encrypted using the password you just entered.",
            "\nThe default values were taken from the old file, which will now be replaced...");
        const key = prompt("Enter your API key (Or x to start over) ("+k+"): ",k);
        if(key == 'x') process.exit();
        const secret = prompt('Enter your API secret ('+s+'): ',s);
        let pw2 = '';
        while( pw2 != this.pw ) {
            pw2 = prompt("Enter your password again (Or x to start over): ",{echo:'*'});
            if(pw2 == 'x') process.exit();
            if(pw2 != this.pw) {
                if('y' == prompt("That's different.  Update to this password? (y/n)")[0].toLowerCase()) {
                    this.pw = pw2;
                    pw2 = pw2+'x';
                }
            }
        }
        let p = {key: key, secret: secret};
        await this.replace(p);
        this.persistent = p;
        return p;
    }
}

let ss = new Safestore(pw,keyFile);
exports.safestore = ss;
