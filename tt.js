// process.TESTING = 'findRange';
process.USECACHE = true;
let pw = process.argv[2] || 'abc123';
let objInit = require('./init.js');
let [man,bot] = [objInit.man,objInit.bot];
console.log(man);
setTimeout(async()=>{
    await man.init(pw);
    await man.doCommands(['report false']);
    man.listen();
    }, 0);
