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
import fs from 'fs';
import path from 'path';

// Type definitions for testFasterCache.ts
export interface CacheResult {
    answer: boolean;
    id: string;
    cached?: any;
}

export interface TFCInstance {
    isCached: (fnName: string, args: any) => CacheResult;
    store: (id: string, reply: any) => void;
    hashArg: (arg: any) => string;
    cached: Record<string, any>;
    noCache: (IDs: string[]) => void;
    reCache: (IDs: string[]) => void;
    useFile: (fName: string) => void;
    clearCache: () => void;
    cacheFiles: string[];
    verbose: boolean | string;
}

// Declaring the static property for the singleton pattern
interface TFCConstructor {
    (verbose?: boolean | string, id?: string): TFCInstance;
    s?: TFCInstance;
}

const TFC: TFCConstructor = function(verbose: boolean | string = false, 
    id: string = ''): TFCInstance {
    if (TFC.s) return TFC.s;     // Singleton!!
    
    const base = `TFC${id}`;
    const MUSTCACHE = path.join(base, "cached.json");
    let lastFile = path.join(base, "lastFile.txt");
    const blockFile = path.join(base, "blockFile.json");
    const cacheFiles: string[] = [];
    // The idFile contains a series of JSON objects, {h...: fName+args},
    // as well as the trailing comma. The comma gets stripped to create
    // valid JSON so the cache knows what IDs have already been recorded.
    // ------------------------------------------------------------------
    const callCacheFile = path.join(base, "callCache.json");

    try {
        fs.mkdirSync(base);
    } catch(err: any) {
        if(err && err.code !== 'EEXIST') throw err;
    }

    let cached: Record<string, any> = {}; 
    let callCache: Record<string, any> = {}; 
    const now = new Date(); 
    let slf = MUSTCACHE; 
    let dontCache: string[] = []; 
    let inIDFile: string[] = [];
    
    // We store the filename of the latest file in lastFile.txt
    const lf = path.join(base, `${new Date( // Use local time as filename.
        (now.getTime() - (now.getTimezoneOffset() * 60000)))
        .toJSON().replaceAll(':', '-').slice(0, -5)}.json`);

    function hashArg(arg: any): string {
        let hash = 0; 
        const string = JSON.stringify(arg);
        for (let i = 0; i < string.length; i += 1) {
            const code = string.charCodeAt(i);
            // eslint-disable-next-line no-bitwise
            hash = ((hash << 5) - hash) + code;
            // eslint-disable-next-line no-bitwise
            hash &= hash; // Convert to 32bit integer
        }
        return (`h${hash}`).replace('-', 'h');
    }

    function useFile(fName: string): void {
        try {
            console.log("Trying Cache:", fName); 
            const content = fs.readFileSync(fName, {encoding: "utf8"});
            if(content.length) {
                // console.log("Parsing ", content);
                const nc = JSON.parse(content);
                Object.assign(cached, nc);       // Overwrite with new answers.
                // We may now have properties that can be collapsed because:
                // A) The old property names are hashes and their values
                // are the objects Kraken returned for the call, but those
                // objects don't tell us what the calls are, and
                // B) The new property names are the calls which we can
                // hash to find the old property name (and so remove the old
                // property). This will shrink our file size.
                const hashes = Object.keys(cached).map(hashArg);
                if (verbose) console.log(`Removing ${hashes.length} hashes...`);
                hashes.forEach(h => delete cached[h]);
                inIDFile = Object.keys(cached);
                if (verbose) console.log(`Using ${fName}, with ${inIDFile.length} keys.`);
                if (!cacheFiles.includes(fName)) cacheFiles.push(fName);
                Object.assign(callCache, cached);
            } else {
                console.log("Cache is empty.");
            }
        } catch(err: any) { 
            if (err.code !== 'ENOENT') throw err; 
        }
    }

    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useFile(fs.existsSync(slf)
            ? slf : slf = fs.readFileSync(lastFile).toString().trim());
    } catch(e) { 
        console.log(e); 
    }

    if (slf !== MUSTCACHE) try {
        const bf = JSON.parse(fs.readFileSync(blockFile).toString());
        if (Array.isArray(bf)) dontCache = bf;
    } catch(err: any) {
        if (err && err.code !== 'ENOENT') throw err;
    }

    const cachedKeys = Object.keys(cached);
    if (cachedKeys.length === 0) 
        console.log(`LastFile (${slf}) apparently not found.`);
    console.log("Creating cache:", lf);

    // Pass an array of IDs to prevent calls from being cached.
    // --------------------------------------------------------
    function noCache(IDs: string[]): void { 
        if (slf === MUSTCACHE) {
            console.log("Ignoring call to noCache because of cached.json");
        } else dontCache = dontCache.concat(IDs); 
    }

    // Pass an array of IDS that were sent to noCache so they
    // will be cached again.
    // ------------------------------------------------------
    function reCache(IDs: string[]): void { 
        dontCache = dontCache.filter(x => !IDs.includes(x)); 
    }

    function saveCallCache(): void {
        const asBuffer = Buffer.from(JSON.stringify(callCache, null, 1));
        // eslint-disable-next-line promise/prefer-await-to-callbacks
        try {
            fs.writeFileSync(callCacheFile, asBuffer);
        } catch (err) {
            if (err) throw err;
        };
        if (verbose) console.log("Wrote callCache to", callCacheFile,
            "with", Object.keys(callCache).length, "cached calls.");
    }

    // Returns an object with answer (boolean), id, and cached
    function isCached(fnName: string, args: any): CacheResult {
        const call = JSON.stringify({fnName, args});
        const ri = hashArg(call); // "Response Identifier"
        const blocked = dontCache.includes(ri);
        
        if (callCache[call]) {
            if (callCache[call].inFile) {   // Data stored in separate file.
                const inName = path.join(base, callCache[call].inFile);
                // eslint-disable-next-line react-hooks/rules-of-hooks
                useFile(inName);
                if (callCache[call].inFile) throw Error("Nope!");
            }
            return {answer: true, id: call, cached: callCache[call]};
        } 
        
        if (verbose) console.log(`${call} isn't in ${cacheFiles.join("\n")}.`);

        const ret = (cached && cached[ri] && !dontCache.includes(ri)) 
            ? {answer: true, id: call, cached: cached[ri]}
            : {answer: false, id: call};
        
        // eslint-disable-next-line no-nested-ternary
        if (verbose) console.log(ret.answer ? "Old hit in" 
            : (blocked ? `Blocked by ${blockFile}` 
                : "Miss in"), cacheFiles.join("\n"));

        // If we have it, and it isn't in callCache yet, add it.
        if (ret.answer && !callCache[call]) {
            callCache[call] = ret.cached;
            saveCallCache();
        }
        return ret;
    }

    // store( ID, reply ) will store the result of a call that
    // hashes (see hashArg) to ID in the cache. See isCached to
    // get the ID for a call.
    // --------------------------------------------------------
    function store(call: string, reply: any): void {
        if (!process.TESTING) {
            if (verbose) 
                console.log("Caching requires process.TESTING to evaluate to true.");
            return;
        }
        if (callCache[call]) return;
        callCache[call] = reply;
        console.log("Just added", call, "to callCache.");
        saveCallCache();
        // Now that we've stored something in it, record its name
        // ------------------------------------------------------
        if (lastFile > '') {
            // eslint-disable-next-line promise/prefer-await-to-callbacks
            try { fs.writeFileSync(lastFile, lf); }
            catch (err) { if (err) throw(err); }
            lastFile = '';  // Protect it from being overwritten.
        }
    }

    function clearCache(): void { 
        cached = {}; 
        callCache = {}; 
    }
    
    const instance: TFCInstance = {
        isCached, 
        store, 
        hashArg, 
        cached, 
        noCache, 
        reCache, 
        useFile, 
        clearCache, 
        cacheFiles,
        verbose: verbose
    };
    
    TFC.s = instance;
    return instance;
};

export default TFC;