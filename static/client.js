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
    $('#oDiv')[0].innerHTML = OrderTable();
    armOrderTable();
});

var ordSort = '';
function OrderTable() {
    let oo, od, odo, parsed, ret = "<table><tr><th>ID</th><th>Type</th><th>Units</th>"
            + "<th>Pair</th><th>Price</th><th>UserRef</th><th>Close</th></tr>";
    orders.forEach((o,i) => {
        oo = o[1];
        oo['ID'] = oo['ID'] || i+1;
        od = oo.descr;
        odo = od.order;
        parsed = odo.split(' ');
        ret += "\n<tr>" + tag('td',oo['ID'],"title='"+o+"'") + tag('td',parsed[0]) 
            + tag('td',parsed[1])+tag('td',parsed[2]) + tag('td',parsed[5])
            + tag('td',oo.userref) + tag('td',od.close.match(/[0-9.]+$/))
            + tag('th','less') + tag('th','more') + tag('th','kill') 
            + tag('th',(oo.descr.leverage=='none'?'add':'de')+'lev') + '</tr>';
    });
    return ret + "</table>";
}
function tag(t,i,attrs){return '<'+t+(attrs ? ' '+attrs : '')+'>'+i+'</'+t+'>';}

function armOrderTable() {
    $('#oDiv th').on('click',(e) => {
        if(!rowCommand(e)) {
            let neg = e.target.innerHTML == ordSort;
            ordSort = (neg ? '-' : '') + e.target.innerHTML;
            orders.sort((a,b) => {
                let aval = orderCompare(ordSort, a),
                    bval = orderCompare(ordSort, b);
                return (neg ? -1 : 1) * (aval < bval ? -1 :
                    (aval == bval ? 0 : 1));
            });
            $('#oDiv')[0].innerHTML = OrderTable();
            armOrderTable();
        }
    });
}

function rowCommand(e) {
    if(!['less','more','kill','addlev','delev'].includes(e.target.innerHTML)) return false;
    let t = e.target,
        ID = t.parentNode.firstChild.innerHTML,
        cmd = t.innerHTML,
        params = ' ' + ID + ' ' + (['less','more'].includes(cmd)
            ? "(amt) all?" : "");
        t.setAttribute('title',cmd + params);
    t2Command(e);
    return true;
}

function orderCompare(th, order) {
    // ID	Type	Units	Pair	Price	UserRef	Close
    switch(th[0]=='-' ? th.substr(1) : th) {
        case 'ID' : return order[1].opentm;
        case 'Type' : return order[1].descr.type;
        case 'Units' : return Number(order[1].vol);
        case 'Pair' : return order[1].descr.pair;
        case 'Price' : return Number(order[1].descr.price);
        case 'UserRef' : return order[1].userref;
        case 'Close' : return Number(order[1].descr.close.match(/[0-9.]+$/)[0]);
    }
    return 0;
}

function t2Command(e) {
    let t = e.target,
        def = t.getAttribute('title'),
        cmd = prompt("Send command to bot?",def);
    if(cmd) botExec(cmd);
}

function botExec(cmd) {
    $.post('/',{data:cmd},(r) => { alert(r); location.reload();});
}
