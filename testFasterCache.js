/* Usage: TFC = require([this file]);
    By adding that to your code, you can skip the wait for async functions.
    The code will read a file from disk in order to have its cache in memory
    and part of your project.  At the beginning of each async function you
    write, you can call TFC.isCached(fnName,arguments) and get back an
    object {answer:true|false,id:X,cached:Previously_returned} where
    Previously_returned is the result of calling JSON.parse on what was
    stored on disk and loaded into memory because of a previous call to
    TFC.store(fnName,arguments,r) in which JSON.stringify was called on r.

    Note that some return values (eg. objects with functions) will not be
    properly stored on disk, so you can't always count on testFasterCache 
    to make things easier.

    If the cached response was created in the same instance as it is
    requested again, it will not have been stringified, so such uses
    are safe from stringify's failures to faithfully represent some JS
    objects.
*/
function TFC(verbose = false) {
    const base = "TFC";
    const fs = require('fs');
    const path = require('path');
    let lastFile = path.join(base,"lastFile.txt");
    const blockFile = path.join(base,"blockFile.json");
    // The idFile contains a series of JSON objects, {h...: fName+args},
    // as well as the trailing comma. The comma gets stripped to create
    // valid JSON so the cache knows what IDs have already been recorded.
    // ------------------------------------------------------------------
    const idFile = path.join(base,"IDFile.txt"); 
    try {
        fs.mkdirSync(base);
    } catch(err) {
        if(err && 'EEXIST' != err.code) throw err;
    };

    let cached={}, now = new Date, lf = "???", slf = '???', 
        dontCache=[], inIDFile=[];
    // We store the filename of the latest file in lastFile.txt
    lf = new Date( // Use local time as filename.
        (now - (now.getTimezoneOffset()*60000)))
        .toJSON().replaceAll(':','-').slice(0,-5)+".json";

    try {
        if( slf = fs.readFileSync(lastFile).toString() ) {
            console.log("Trying Cache:",slf);
            cached = JSON.parse(fs.readFileSync(path.join(base,slf)));
        }
    } catch(err) { if('ENOENT' != err.code) throw err; }

    try {
        let recorded = JSON.parse('['+fs.readFileSync(idFile).slice(0,-2)+']');
        inIDFile = recorded.map(e => (e.ri));
        if(verbose) console.log({recorded,inIDFile});
    } catch(err) { 
        console.log("Unable to open record of IDs for cached calls")
        if('ENOENT' != err.code) throw err; 
    }

    try {
        let bf = JSON.parse(fs.readFileSync(blockFile));
        if(Array.isArray(bf)) dontCache = bf;
    } catch(err) {
        if(err && 'ENOENT' != err.code) throw err;
    }

    if(Object.keys(cached).length>0) 
        console.log("Using Cache:",slf,"with keys",Object.keys(cached));
    else console.log("LastFile ("+slf+") apparently not found.");
    console.log("Creating cache:",lf);

    function hashArg(arg) {
        var hash = 0, string = JSON.stringify(arg);
        for (var i = 0; i < string.length; i++) {
            var code = string.charCodeAt(i);
            hash = ((hash<<5)-hash)+code;
            hash = hash & hash; // Convert to 32bit integer
        }
        return ("h"+hash).replace('-','h');
    }


    function useFile(fName) { throw "Not yet implemented.";
        cached = JSON.parse(fs.readFileSync(path.join(fName)));
        inIDFile = Object.keys(cached);
    }

    // Pass an array of IDs to prevent calls from being cached.
    // --------------------------------------------------------
    function noCache(IDs) { dontCache = IDs; }

    // Pass an array of IDS that were sent to noCache so they
    // will be cached again.
    // ------------------------------------------------------
    function reCache(IDs) { dontCache = dontCache.filter(x => !IDs.includes(x)); }

    function isCached(fnName,args) {
        let call = JSON.stringify({fnName,args}),
            ri = hashArg(call), // "Response Identifier"
            blocked = dontCache.includes(ri);
        if(verbose) console.log("Seeking",ri,call);
        if(!inIDFile.includes(ri)) {
            inIDFile.push(ri);
            let record = {};
            record[ri] = call;
            fs.appendFile(idFile,JSON.stringify({ri,call})+',\n',(err) => {
                if(err) throw err;
            });
        }
        
        let ret = (cached && cached[ri] && !dontCache.includes(ri)) 
            ? {answer:true, id:ri, cached:cached[ri]}
            : {answer:false, id:ri};
        if(verbose) console.log(ret.answer ? "Hit!" : (blocked ? "Blocked" : "Miss"));
        return ret;
    }

    // store( name, args, reply ) will store the result of calling
    // name on args in the cache.
    // store( ID, reply ) will store the result of a call that
    // hashes (see hashArg) to ID in the cache.
    // Use the second version with the id that comes back from
    // isCached if the call changes any of the arguments.
    // -----------------------------------------------------------
    function store(fNameOrID,argsOrReply,reply=false) {
        if(!process.TESTING) {
            console.log("Caching requires procees.TESTING to evaluate to true.");
            return;
        }
        let ri = reply 
            ? hashArg(JSON.stringify({fnName:fNameOrID,args:argsOrReply})) 
            : fNameOrID;
        if(ri[0] != 'h') throw "store called with "
            + JSON.stringify({fNameOrID,argsOrReply,reply})+" created bad ID "+ri;
        cached[ri] = reply ? reply : argsOrReply;
        let asBuffer = Buffer.from(JSON.stringify(cached));
        fs.writeFile(path.join(base, lf), asBuffer, (err) => {
            if(err) throw err;
        });
        // Now that we've stored something in it, record its name
        // ------------------------------------------------------
        if(lastFile > '') {
            fs.writeFile(lastFile,lf,(err)=>{if(err)throw(err);});
            lastFile = '';  //Protect it from being overwritten.
        }
        if(verbose) console.log("Items in cache:",Object.keys(cached));
    }

    if(!TFC.s) TFC.s = {isCached, store, hashArg, cached};
    TFC.s.verbose = verbose;
    return TFC.s;
}

module.exports = TFC;
