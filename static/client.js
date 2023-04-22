const $ = jQuery;

function setCookie(cname, cvalue, exdays) {
    const d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    let expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname) {
    let name = cname + "=",
        decodedCookie = decodeURIComponent(document.cookie),
        ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

$(function() {
    let wst=0, docXY = getCookie('DocXY'),
        [docw,doch] = docXY.split('.'),
        jqdd = $('#Doc'),
        docdiv = jqdd[0];
        sw = docdiv.offsetWidth-docdiv.clientWidth,
        sh = docdiv.offsetHeight-docdiv.clientHeight;
    jqdd.width(Number(docw) + sw);
    jqdd.height(Number(doch) + sh);
 
    (new ResizeObserver( (entries) => { 
        window.clearTimeout(wst); 
        wst = window.setTimeout( () => {
            docw = entries[0].contentRect.width;
            doch = entries[0].contentRect.height;
            setCookie("DocXY",docw+'.'+doch,3650);
            },1000);
        })).observe($('#Doc')[0]);

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
    $("#Diff td,#Prices td").on('click',(e)=>t2Command(e));
    $("th#tol").on('click',(data) => {
        let tol = Number(data.target.innerHTML);
        newTol = prompt("Set balancing tolerance to:",tol);
        if(newTol) {
            data.target.innerHTML = newTol;
            // Update the commands
            $("#Prices td").attr('title',(i,ov) => {
                return ov.replace(/[0-9.]+/,newTol);
            });
        }
    });
    $('md-block').on('md-render',() => {
        $('#Doc code').on('click',(data) => {
            let t = data.target,
                txt = t.innerHTML,
                yn = prompt("Send a command to the bot?",txt);
            if(yn) {
                botExec(yn);
            }
        });
    });
});

function t2Command(e) {
    let t = e.target,
        def = t.getAttribute('title'),
        cmd = prompt("Send command to bot?",def);
    if(cmd) botExec(cmd);
}

function botExec(cmd) {
    $.post('/',{data:cmd},(r) => { alert(r); location.reload();});
}
