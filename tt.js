// process.TESTING = 'findRange';
process.USECACHE = true;
let objInit = require('./init.js');
let [man,bot] = [objInit.man,objInit.bot];
console.log(man);
setTimeout(async()=>{
    await man.init('abc123');
    await man.doCommands(['report false']);
    man.listen();
    }, 0);
