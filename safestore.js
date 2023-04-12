function Safestore(pwp = 'abc123', fn = 'keys') {
    console.log(process.TESTING
        ? "Running in TEST mode."
        : "Running in PRODUCTION mode.");

    const fs = require('fs');
    const path = require('path');
    const cryptex = require('cryptex');
    const crypto = require('crypto');
    const prompt = require('prompt-sync')({sigint: true});
    let homeDir = process.env.APPDATA
            || (process.platform == 'darwin'
                ? path.join(process.env.HOME,"Library","Preferences")
                : path.join(process.env.HOME,".local","share")),
        keyFile = path.join(homeDir,(process.TESTING ? 'test' : '') + fn + '.txt');
    const pw = (!process.TESTING || !fs.existsSync(keyFile))
        ? prompt("Enter your password (or a new one): ",{echo:'*'})
        : pwp;

    let file = keyFile,
        persistent;
        
    cryptex.update({
        config: {
            keySource: 'plaintext',
            keySourceEncoding: 'base64',
            keySourceOpts: {
                 key: crypto.createHash('sha256')
                    .update(pw).digest('base64')
                }
    }});
    
    async function replace(obj) {
        // Turn object into a string
        let toWrite = JSON.stringify(obj);
        // Encrypt the string
        return cryptex.encrypt(toWrite)
            // Write the string to the file
            .then((e) => fs.writeFileSync(file, e));
    }

    async function read(f = file) {
	    if(!fs.existsSync(f)) await _update("NoDefault NoDefault");
        // Put the file contents into a string
        let enc64 = fs.readFileSync(f).toString(),
            ret = enc64;
        await cryptex.decrypt(enc64)
            .then(async (r) => {
                try { ret = JSON.parse(r); 
                } catch(e) {
                    ret = await _update(enc64);
            }},async (e) => {
                    ret = await _update(enc64);
                }
            );
        return ret;
    }

    async function _update(old, exitOnFail = true) {
        let [k,s] = old.split(' ');
        if(s) {
            console.log("Your data will now be encrypted using the password you just entered.",
                "\nThe default values were taken from the old file, which will now be replaced...");
        } else {
            console.log("Incorrect password.");
            return false;
        }
        const key = prompt("Enter your API key (Or x to start over) ("+k+"): ",k);
        if(key == 'x') {
            if(exitOnFail) process.exit(); else return;
        }
        const secret = prompt('Enter your API secret ('+s+'): ',s);
        let pw2 = '';
        while( pw2 != pw ) {
            pw2 = process.TESTING ? pw
                : prompt("Enter your password again (Or x to start over): ",{echo:'*'});
            if(pw2 == 'x') {
                if(exitOnFail) process.exit(); else return;
            }
            if(pw2 != pw) {
                if('y' == (process.TESTING ? (console.log("Changing test pw to ",pw),'y')
                    : prompt("That's different.  Update to this password? (y/n)")[0]
                        .toLowerCase())) {
                    pw = pw2;
                    pw2 = pw2+'x';
                }
            }
        }
        let p = {key: key, secret: secret};
        await replace(p);
        persistent = p;
        return p;
    }
    return Object.freeze({persistent, read, replace, _update});
}

module.exports = Safestore;
