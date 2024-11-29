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
function TFC(verbose = false,id = '') {
    if(TFC.s) return TFC.s;     // Singleton!!
    TFC.s = this;
    const base = "TFC"+id;
    const fs = require('fs');
    const path = require('path');
    const MUSTCACHE = path.join(base,"cached.json");
    let lastFile = path.join(base,"lastFile.txt"),
        file2Read;
    const blockFile = path.join(base,"blockFile.json");
    // The idFile contains a series of JSON objects, {h...: fName+args},
    // as well as the trailing comma. The comma gets stripped to create
    // valid JSON so the cache knows what IDs have already been recorded.
    // ------------------------------------------------------------------
    const idFile = path.join(base,"IDFile.txt"); 
    const callCacheFile = path.join(base,"callCache.json");

    try {
        fs.mkdirSync(base);
    } catch(err) {
        if(err && 'EEXIST' != err.code) throw err;
    };

    let cached={}, callCache = {}, now = new Date, slf, 
        dontCache=[], inIDFile=[],
    // We store the filename of the latest file in lastFile.txt
        lf = path.join(base, new Date( // Use local time as filename.
            (now - (now.getTimezoneOffset()*60000)))
            .toJSON().replaceAll(':','-').slice(0,-5)+".json");

    function useFile(fName) {
        try {
            console.log("Trying Cache:",fName); //path.join(base,slf));
            let content = fs.readFileSync(fName); //path.join(base,slf));
            if(content.toString().length) {
                // console.log("Parsing ",content);
                let nc = JSON.parse(content);
                Object.assign(cached,nc);       // Overwrite with new answers.
                // We may now have properties that can be collapsed because:
                // A) The old property names are hashes and their values
                // are the objects Kraken returned for the call, but those
                // objects don't tell us what the calls are, and
                // B) The new property names are the calls which we can
                // hash to find the old property name (and so remove the old
                // property). This will shrink our file size.
                let hashes = Object.keys(cached).map(hashArg);
                console.log("Removing:",hashes);
                hashes.forEach(h => delete cached[h]);
                inIDFile = Object.keys(cached);
                console.log("Using ",fName,"with keys:\n",
                    inIDFile.join('\n'));
                file2Read = fName;
                Object.assign(callCache, cached);
            } else {
                console.log("Cache is empty.");
            }
        } catch(err) { if('ENOENT' != err.code) throw err; }
    }

    try {
        useFile( fs.existsSync(slf = MUSTCACHE)
            ? slf : slf = fs.readFileSync(lastFile).toString().trim() );
    } catch(e) { console.log(e); }

    try {
        let recorded = JSON.parse('['+fs.readFileSync(idFile).slice(0,-2)+']');
        inIDFile = recorded.map(e => (e.ri));
        // if(verbose) console.log({recorded,inIDFile});
    } catch(err) { 
        console.log("Unable to open record of IDs for cached calls")
        if('ENOENT' != err.code) throw err; 
    }

    if( slf != MUSTCACHE ) try {
        let bf = JSON.parse(fs.readFileSync(blockFile));
        if(Array.isArray(bf)) dontCache = bf;
    } catch(err) {
        if(err && 'ENOENT' != err.code) throw err;
    }

    let cachedKeys = Object.keys(cached);
    if( cachedKeys.length==0 ) 
        console.log("LastFile ("+slf+") apparently not found.");
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


    // Pass an array of IDs to prevent calls from being cached.
    // --------------------------------------------------------
    function noCache(IDs) { 
        if( slf == MUSTCACHE ) {
            console.log("Ignoring call to noCache because of cached.json");
        } else dontCache.concat(IDs); }

    // Pass an array of IDS that were sent to noCache so they
    // will be cached again.
    // ------------------------------------------------------
    function reCache(IDs) { dontCache = dontCache.filter(x => !IDs.includes(x)); }

    function isCached(fnName,args) {
        let call = JSON.stringify({fnName,args}),
            ri = hashArg(call), // "Response Identifier"
            blocked = dontCache.includes(ri);
        console.log("Seeking:",call,'(',ri,')');
        if(callCache[call]) {
            if(verbose) console.log("New hit in",file2Read);
            return {answer:true, id:call, cached:callCache[call]};
        } else {
            console.log(call,"isn't in",Object.keys(callCache));
        }

        let ret = (cached && cached[ri] && !dontCache.includes(ri)) 
            ? {answer:true, id:call, cached:cached[ri]}
            : {answer:false, id:call};
        if(verbose) console.log(ret.answer ? "Old hit in" 
            : (blocked ? "Blocked by" : "Miss in"), file2Read);

        // If we have it, and it isn't in callCache yet, add it.
        if(ret.answer && !callCache[call]) {
            callCache[call] = ret.cached;
            saveCallCache();
        }
        return ret;
    }

    function saveCallCache() {
        let asBuffer = Buffer.from(JSON.stringify(callCache,null,1));
        fs.writeFile(callCacheFile, asBuffer, (err) => {
            if(err) throw err;
        });
        console.log("Wrote callCache to",callCacheFile,"with",Object.keys(callCache).length,
            "cached calls.");
    }

    // store( ID, reply ) will store the result of a call that
    // hashes (see hashArg) to ID in the cache. See isCached to
    // get the ID for a call.
    // --------------------------------------------------------
    function store(call,reply) {
        if(!process.TESTING) {
            if(verbose) 
                console.log("Caching requires process.TESTING to evaluate to true.");
            return;
        }
        if(callCache[call]) return;
        callCache[call] = reply;
console.log("Just added",call,"to callCache.");
        saveCallCache();
        // Now that we've stored something in it, record its name
        // ------------------------------------------------------
        if(lastFile > '') {
            fs.writeFile(lastFile,lf,(err)=>{if(err)throw(err);});
            lastFile = '';  //Protect it from being overwritten.
        }
        if(verbose) console.log("Items in",lf+":",Object.keys(callCache));
    }

    TFC.s = {isCached, store, hashArg, cached, noCache, reCache, useFile};
    TFC.s.verbose = verbose;
    return TFC.s;
}

module.exports = TFC;
