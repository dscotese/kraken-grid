const $ = jQuery;

$(function() {
    $("#assets td").on('click',(data) => {
        let t = data.target,
            acct = t.getAttribute('acct'),
            amt = t.getAttribute('amt'),
            tkr = t.getAttribute('tkr'),
            ask = "Update "+acct+' from '+amt+tkr+ "?";
        if( acct == 'OnExchange' ) {
            alert("These amounts will be updated upon refresh.");
            return;
        }
        let newVal = prompt(ask,amt);
        if(newVal && newVal != amt) {
            botExec("asset "+tkr+' '+newVal+' '+acct+' false',
                (r) => {alert(r); location.reload();});
        }
    });
    
    $("#Diff td").on('click',(data) => {
        let t = data.target,
            cmd = t.getAttribute('title'),
            ask = "Send `"+cmd+"` to bot (y/n)?",
            yn = prompt(ask,'n');
        if(yn && yn.toLowerCase() == 'y') 
            botExec(cmd,r => { alert(r); location.reload(); });
    });

    $("#Prices td").on('click',(data) => {
        let t = data.target,
            cmd = t.getAttribute('title'),
            ask = "Send `"+cmd+"` to bot (y/n)?",
            yn = prompt(ask,'n');
        if(yn && yn.toLowerCase() == 'y') 
            botExec(cmd,r => { alert(r); location.reload(); });
    });

    $("th#tol").on('click',(data) => {
        let tol = Number(data.target.innerHTML);
        newTol = prompt("Set balancing tolerance to:",tol);
        data.target.innerHTML = tol;
        // Update the commands
        $("#Diff td").attr('title',(i,ov) => {
            return ov.replace(/[0-9]+/,tol);
        });
    });
});

function botExec(cmd,cb) {
    $.post('/',{data:cmd},cb);
}
